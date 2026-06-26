"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAppState } from "@/components/app-state";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { getClientBrandStyle } from "@/lib/client-branding";
import type { Role, User } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { AppSidebar } from "@/components/app-sidebar";
import { formatRole } from "@/lib/display";
import StartChatOptions from "@/components/chat/start-chat-options";




type ChatConversationType = "internal_direct" | "organization_group";

type ChatConversation = {
  id: string;
  type: ChatConversationType;
  title: string;
  client_organization_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

type ChatConversationParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  role_snapshot: Role;
  last_read_at: string | null;
  created_at: string;
};

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_message_id?: string | null;
  image_url?: string | null;
  image_name?: string | null;
  image_mime_type?: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

const EMOJIS = ["❤️", "👍", "👀"] as const;
type Emoji = (typeof EMOJIS)[number];

type ChatMessageVM = ChatMessage & {
  sender?: User | null;
  replyTo?: ChatMessageVM | null;
  reactions: Array<{ emoji: Emoji; count: number; reactedByMe: boolean }>;
};

type ConversationScope = "all" | "clients" | "internal";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatScreen() {
  const { user, ready, state } = useAppState();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { activeClientOrganizationId, clientOrganizationIds } = useActiveClientOrganization(
    user,
    state.clientOrganizations,
  );
  const currentClientOrganization = useMemo(
    () =>
      user?.role === "client" && activeClientOrganizationId
        ? state.clientOrganizations.find((organization) => organization.id === activeClientOrganizationId) ?? null
        : null,
    [activeClientOrganizationId, state.clientOrganizations, user?.role],
  );
  const clientBrandStyle = useMemo(
    () => getClientBrandStyle(user?.role === "client" ? currentClientOrganization : null),
    [currentClientOrganization, user?.role],
  );

  const [conversations, setConversations] = useState<ChatConversation[]>([]);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showStartChatModal, setShowStartChatModal] = useState(false);
  const [showDeleteConversationConfirm, setShowDeleteConversationConfirm] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [conversationScope, setConversationScope] = useState<ConversationScope>("all");
  const [isMobileViewport, setIsMobileViewport] = useState<boolean | null>(null);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [startChatLoadingLabel, setStartChatLoadingLabel] = useState("Creating chat...");
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  const [participants, setParticipants] = useState<ChatConversationParticipant[]>([]);
  const [conversationParticipantUserIdsByConversation, setConversationParticipantUserIdsByConversation] = useState<
    Record<string, string[]>
  >({});
  const [messages, setMessages] = useState<ChatMessageVM[]>([]);
  const [conversationPreviewById, setConversationPreviewById] = useState<Record<string, string>>({});
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [activeMessageActionId, setActiveMessageActionId] = useState<string | null>(null);

  // Start-new-chat modal state
  const [startChatMode, setStartChatMode] = useState<"direct" | "org">("direct");


  const [draft, setDraft] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const channelsRef = useRef<Array<{ channelId: string; channel: any }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const pendingReactionTimeoutsRef = useRef<Record<string, number>>({});
  const pendingReactionSelectionsRef = useRef<Record<string, Emoji | null>>({});
  const conversationChannelInstanceIdRef = useRef(`chat-conversation-${Math.random().toString(36).slice(2, 10)}`);
  const inboxChannelInstanceIdRef = useRef(`chat-inbox-${Math.random().toString(36).slice(2, 10)}`);
  const presenceChannelInstanceIdRef = useRef(`chat-presence-${Math.random().toString(36).slice(2, 10)}`);


  const [unreadTotals, setUnreadTotals] = useState<{
    unreadTotal: number;
    unreadByConversation: Record<string, number>;
  }>({
    unreadTotal: 0,
    unreadByConversation: {},
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1099px)");
    const syncViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  const loadConversations = async () => {
    if (!supabase || !user) return;
    setLoadingConversations(true);

    const { data: partRows, error: partError } = await supabase
      .from("chat_conversation_participants")
      .select("conversation_id,last_read_at")
      .eq("user_id", user.id);

    if (partError) {
      console.error("Failed to load participant read states", partError);
      setConversations([]);
      setUnreadTotals({ unreadTotal: 0, unreadByConversation: {} });
      setLoadingConversations(false);
      return;
    }

    const participantConversationIds = Array.from(
      new Set(
        ((partRows ?? []) as Array<{ conversation_id: string; last_read_at: string | null }>).map(
          (row) => row.conversation_id,
        ),
      ),
    );

    if (participantConversationIds.length === 0) {
      setConversations([]);
      setParticipants([]);
      setConversationParticipantUserIdsByConversation({});
      setMessages([]);
      setSelectedConversationId(null);
      setUnreadTotals({ unreadTotal: 0, unreadByConversation: {} });
      setLoadingConversations(false);
      return;
    }

    const { data, error } = await supabase
      .from("chat_conversations")
      .select(
        "id,type,title,client_organization_id,created_by,created_at,updated_at,last_message_at",
      )
      .in("id", participantConversationIds)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Failed to load conversations", {
        message: (error as any).message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      });
      setConversations([]);
      setUnreadTotals({ unreadTotal: 0, unreadByConversation: {} });
      setLoadingConversations(false);
      return;
    }

    const nextConversations = (data ?? []) as ChatConversation[];
    setConversations(nextConversations);
    const nextPreviewById: Record<string, string> = {};
    const { data: allParticipantRows, error: allParticipantRowsError } = await supabase
      .from("chat_conversation_participants")
      .select("conversation_id,user_id")
      .in("conversation_id", participantConversationIds);

    if (allParticipantRowsError) {
      console.error("Failed to load conversation participants", allParticipantRowsError);
      setConversationParticipantUserIdsByConversation({});
    } else {
      const nextParticipantMap: Record<string, string[]> = {};
      for (const row of (allParticipantRows ?? []) as Array<{ conversation_id: string; user_id: string }>) {
        if (!nextParticipantMap[row.conversation_id]) {
          nextParticipantMap[row.conversation_id] = [];
        }
        nextParticipantMap[row.conversation_id].push(row.user_id);
      }
      setConversationParticipantUserIdsByConversation(nextParticipantMap);
    }

    await Promise.all(
      nextConversations.map(async (conversation) => {
        const { data: messageRows, error: messageError } = await supabase
          .from("chat_messages")
          .select("body,image_url")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (messageError) {
          console.error("Failed to load conversation preview", messageError);
          nextPreviewById[conversation.id] = "No messages yet";
          return;
        }

        const latestMessage = ((messageRows ?? []) as Array<{ body: string; image_url: string | null }>)[0];
        nextPreviewById[conversation.id] = latestMessage
          ? latestMessage.body?.trim() || (latestMessage.image_url ? "Sent an image" : "No messages yet")
          : "No messages yet";
      }),
    );

    setConversationPreviewById(nextPreviewById);

    const readMap = new Map<string, string | null>();
    for (const row of (partRows ?? []) as Array<{ conversation_id: string; last_read_at: string | null }>) {
      readMap.set(row.conversation_id, row.last_read_at ?? null);
    }

    // Unread per conversation = messages created_at > last_read_at (or > conversation created_at if null)
    const unreadByConversation: Record<string, number> = {};
    await Promise.all(
      nextConversations.map(async (c) => {
        const lastReadAt = readMap.get(c.id) ?? null;
        const { count, error: countError } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", c.id)
          .neq("sender_id", user.id)
          .gt("created_at", lastReadAt ?? c.created_at);

        if (countError) {
          console.error("Failed unread count", { conversationId: c.id, countError });
          unreadByConversation[c.id] = 0;
        } else {
          unreadByConversation[c.id] = count ?? 0;
        }
      }),
    );

    const unreadTotal = Object.values(unreadByConversation).reduce((acc, v) => acc + v, 0);
    setUnreadTotals({ unreadTotal, unreadByConversation });

    const hasSelectedConversation =
      selectedConversationId &&
      nextConversations.some((conversation) => conversation.id === selectedConversationId);

    if (!hasSelectedConversation && nextConversations.length > 0 && isMobileViewport === false) {
      setSelectedConversationId(nextConversations[0].id);
    }

    setLoadingConversations(false);
  };

  const markConversationAsRead = async (conversationId: string) => {
    if (!supabase || !user) return;

    const nowIso = new Date().toISOString();

    const { error } = await (supabase as any)
      .from("chat_conversation_participants")
      .update({
        last_read_at: nowIso,
      })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed mark conversation read", error);
    }
  };

  const ensureConversationParticipantsLoaded = async (conversationId: string) => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from("chat_conversation_participants")
      .select("id,conversation_id,user_id,role_snapshot,last_read_at,created_at")
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("Failed to load participants", error);
      return;
    }

    setParticipants((data ?? []) as ChatConversationParticipant[]);
  };

  const loadMessages = async (conversationId: string) => {
    if (!supabase || !user) return;
    setLoadingMessages(true);

    await markConversationAsRead(conversationId);

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,conversation_id,sender_id,body,reply_to_message_id,image_url,image_name,image_mime_type,created_at,updated_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("Failed to load messages", error);
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    const nextMessages = (data ?? []) as ChatMessage[];

    // Reactions
    const messageIds = nextMessages.map((m) => m.id);
    const reactionsByMessage = new Map<string, ChatMessageReaction[]>();

    if (messageIds.length > 0) {
      const { data: reactionRows, error: reactionError } = await supabase
        .from("chat_message_reactions")
        .select("id,message_id,user_id,emoji,created_at")
        .in("message_id", messageIds);

      if (reactionError) {
        console.error("Failed to load reactions", reactionError);
      } else {
        for (const r of (reactionRows ?? []) as ChatMessageReaction[]) {
          const list = reactionsByMessage.get(r.message_id) ?? [];
          list.push(r);
          reactionsByMessage.set(r.message_id, list);
        }
      }
    }

    // Sender profiles
    const senderIds = Array.from(new Set(nextMessages.map((m) => m.sender_id)));
    const senders: Record<string, User> = {};


    if (senderIds.length > 0) {
      const { data: senderRows, error: senderError } = await supabase
        .from("profiles")
        .select("id,name,role,avatar_path")
        .in("id", senderIds);

      if (senderError) {
        console.error("Failed load sender profiles", senderError);
      } else {
        for (const row of (senderRows ?? []) as Array<{ id: string; name: string; role: Role; avatar_path: string | null }>) {
          senders[row.id] = {
            id: row.id,
            name: row.name,
            role: row.role,
            avatarPath: row.avatar_path,
          } as User;
        }
      }
    }

    const nextVM: ChatMessageVM[] = nextMessages.map((m) => {
      const rs = reactionsByMessage.get(m.id) ?? [];
      const counts: Record<string, number> = {};
      for (const r of rs) {
        counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
      }

      const reactions = EMOJIS.map((emoji) => ({
        emoji,
        count: (counts[emoji] ?? 0) as number,
        reactedByMe: rs.some((r) => r.emoji === emoji && r.user_id === user.id),
      }));

      return {
        ...m,
        sender: senders[m.sender_id] ?? null,
        replyTo: null,
        reactions,
      };
    });

    const messageById = new Map(nextVM.map((message) => [message.id, message]));
    nextVM.forEach((message) => {
      message.replyTo = message.reply_to_message_id
        ? messageById.get(message.reply_to_message_id) ?? null
        : null;
    });

    nextVM.forEach((message) => {
      const pendingEmoji = pendingReactionSelectionsRef.current[message.id];
      if (pendingEmoji === undefined) {
        return;
      }

      const nextReactions = message.reactions.map((reaction) => {
        let count = reaction.count;
        if (reaction.reactedByMe) {
          count = Math.max(0, count - 1);
        }

        if (pendingEmoji && reaction.emoji === pendingEmoji) {
          count += 1;
        }

        return {
          ...reaction,
          count,
          reactedByMe: pendingEmoji === reaction.emoji,
        };
      });

      message.reactions = nextReactions;
    });

    setMessages(nextVM);
    setLoadingMessages(false);

    await loadConversations();
  };

  const openConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setMessages([]);
    await ensureConversationParticipantsLoaded(conversationId);
    await loadMessages(conversationId);
  };

  const subscribeToConversation = (conversationId: string) => {
    if (!supabase) return;

    channelsRef.current.forEach(({ channel }) => {
      void supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    const channel = supabase.channel(
      `chat:${conversationId}:${conversationChannelInstanceIdRef.current}`,
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        console.log("[chat-realtime] message received", {
          conversationId,
          eventType: payload.eventType,
        });
        void loadMessages(conversationId);
      },
    );

    channel.subscribe((status) => {
      console.log("[chat-realtime] conversation channel status", {
        conversationId,
        status,
      });
    });

    channelsRef.current.push({ channelId: `chat:${conversationId}`, channel });
  };

  useEffect(() => {
    if (!ready || !supabase || !user) return;
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!selectedConversationId) return;
    subscribeToConversation(selectedConversationId);
    void ensureConversationParticipantsLoaded(selectedConversationId);
    void loadMessages(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, ready]);

  useEffect(() => {
    if (!ready || !supabase || !user) return;

    const channel = supabase.channel(
      `chat-inbox:${user.id}:${inboxChannelInstanceIdRef.current}`,
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_conversation_participants",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        console.log("[chat-realtime] participant change", {
          userId: user.id,
          eventType: payload.eventType,
        });
        void loadConversations();
        if (selectedConversationId) {
          void ensureConversationParticipantsLoaded(selectedConversationId);
        }
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_conversations",
      },
      (payload) => {
        console.log("[chat-realtime] conversation change", {
          userId: user.id,
          eventType: payload.eventType,
        });
        void loadConversations();
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      },
      (payload) => {
        const nextConversationId = (payload.new as { conversation_id?: string } | null)?.conversation_id;
        const senderId = (payload.new as { sender_id?: string } | null)?.sender_id;

        console.log("[chat-realtime] inbox message change", {
          userId: user.id,
          conversationId: nextConversationId,
          senderId,
          eventType: payload.eventType,
        });

        if (!nextConversationId) {
          return;
        }

        if (nextConversationId === selectedConversationId) {
          void loadMessages(nextConversationId);
          return;
        }

        if (senderId !== user.id) {
          void loadConversations();
        }
      },
    );

    channel.subscribe((status) => {
      console.log("[chat-realtime] inbox channel status", {
        userId: user.id,
        status,
      });
    });

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedConversationId, supabase, user]);

  useEffect(() => {
    if (!ready || !supabase || !user) {
      return;
    }

    const channel = supabase.channel(`chat-presence:${presenceChannelInstanceIdRef.current}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    const syncPresence = () => {
      const state = channel.presenceState<Record<string, unknown>[]>();
      setOnlineUserIds(Object.keys(state));
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        console.log("[chat-presence] channel status", {
          userId: user.id,
          status,
        });

        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ready, supabase, user]);

  useEffect(() => {
    return () => {
      if (!supabase) return;
      channelsRef.current.forEach(({ channel }) => {
        void supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [supabase]);

  useEffect(() => {
    return () => {
      Object.values(pendingReactionTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      pendingReactionTimeoutsRef.current = {};
      pendingReactionSelectionsRef.current = {};
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

const getCurrentAccessToken = async () => {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Missing session token.");
  }

  return token;
};

const startConversationViaApi = async (
  payload:
    | { type: "direct"; targetUserId: string }
    | { type: "org"; organizationId: string },
) => {
  const token = await getCurrentAccessToken();

  const response = await fetch("/api/chat/conversations/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json().catch(() => null)) as {
    conversationId?: string;
    error?: string;
  } | null;

  if (!response.ok || !result?.conversationId) {
    throw new Error(result?.error ?? "Failed to start conversation.");
  }

  return result.conversationId;
};

  const uploadChatImageViaApi = async (file: File) => {
  const token = await getCurrentAccessToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/chat/upload-image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const result = (await response.json().catch(() => null)) as
    | {
        url?: string;
        name?: string;
        mimeType?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !result?.url) {
    throw new Error(result?.error ?? "Failed to upload image.");
  }

  return {
    url: result.url,
    name: result.name ?? file.name,
    mimeType: result.mimeType ?? file.type,
  };
};

const deleteConversationViaApi = async (conversationId: string) => {
  const token = await getCurrentAccessToken();

  const response = await fetch(`/api/chat/conversations/${conversationId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(result?.error ?? "Failed to delete conversation.");
  }
};
  
const getUserOrgIds = (targetUser: User) =>
  targetUser.clientOrganizationIds ??
  (targetUser.clientOrganizationId ? [targetUser.clientOrganizationId] : []);

const userCanStartDirectChat = (targetUser: User) => {
  if (!user) return false;

  const isManager = user.role === "communication_manager" || user.role === "creative_manager";

  if (isManager) {
    return targetUser.id !== user.id;
  }

  if (user.role === "designer") {
    return (
      targetUser.id !== user.id &&
      (
        targetUser.role === "communication_manager" ||
        targetUser.role === "creative_manager" ||
        targetUser.role === "designer"
      )
    );
  }

  if (user.role === "client") {
    const myOrgIds = activeClientOrganizationId ? [activeClientOrganizationId] : getUserOrgIds(user);
    const targetOrgIds = getUserOrgIds(targetUser);
    const sameOrg = targetOrgIds.some((orgId) => myOrgIds.includes(orgId));

    return (
      targetUser.id !== user.id &&
      (
        targetUser.role === "communication_manager" ||
        targetUser.role === "creative_manager" ||
        (targetUser.role === "client" && sameOrg)
      )
    );
  }

  return false;
};

const userCanStartOrgChat = (organizationId: string) => {
  if (!user) return false;

  const isManager = user.role === "communication_manager" || user.role === "creative_manager";

  if (isManager) {
    return true;
  }

  if (user.role === "client") {
    const myOrgIds = activeClientOrganizationId ? [activeClientOrganizationId] : getUserOrgIds(user);
    return myOrgIds.includes(organizationId);
  }

  return false;
};

const buildDirectConversationTitle = (targetUser: User) => {
  if (!user) return targetUser.name;
  return `${user.name} / ${targetUser.name}`;
};

// const ensureDirectConversation = async (targetUserId: string) => {
//   if (!supabase || !user) return;

//   const targetUser = state.users.find((candidate) => candidate.id === targetUserId);

//   if (!targetUser) {
//     console.error("Target user not found");
//     return;
//   }

//   if (!userCanStartDirectChat(targetUser)) {
//     console.error("Not allowed to start direct chat with this user");
//     return;
//   }

//   const { data: myParticipants, error: myParticipantsError } = await supabase
//     .from("chat_conversation_participants")
//     .select("conversation_id")
//     .eq("user_id", user.id);

//   if (myParticipantsError) {
//     console.error("Failed to check my chat participants", myParticipantsError);
//     return;
//   }

//   const myConversationIds = ((myParticipants ?? []) as Array<{ conversation_id: string }>)
//     .map((row) => row.conversation_id);

//   if (myConversationIds.length > 0) {
//     const { data: targetParticipants, error: targetParticipantsError } = await supabase
//       .from("chat_conversation_participants")
//       .select("conversation_id")
//       .eq("user_id", targetUserId)
//       .in("conversation_id", myConversationIds);

//     if (targetParticipantsError) {
//       console.error("Failed to check target chat participants", targetParticipantsError);
//       return;
//     }

//     const sharedConversationIds = ((targetParticipants ?? []) as Array<{ conversation_id: string }>)
//       .map((row) => row.conversation_id);

//     if (sharedConversationIds.length > 0) {
//       const {
//           data: existingConversationRow,
//           error: existingConversationError,
//         } = await supabase
//           .from("chat_conversations")
//           .select("id,type")
//           .eq("type", "internal_direct")
//           .in("id", sharedConversationIds)
//           .maybeSingle();

//         const existingConversation = existingConversationRow as { id: string; type: ChatConversationType } | null;

//       if (existingConversationError) {
//         console.error("Failed to load existing direct conversation", existingConversationError);
//         return;
//       }

//       if (existingConversation?.id) {
//         setShowStartChatModal(false);
//         await loadConversations();
//         await openConversation(existingConversation.id);
//         return;
//       }
//     }
//   }

//   const { data: createdConversation, error: conversationError } = await supabase
//     .from("chat_conversations")
//     .insert({
//       type: "internal_direct",
//       title: buildDirectConversationTitle(targetUser),
//       client_organization_id: null,
//       created_by: user.id,
//       last_message_at: new Date().toISOString(),
//     } as any)
//     .select("id")
//     .single();

//   if (conversationError || !createdConversation) {
//     console.error("Failed to create direct conversation", conversationError);
//     return;
//   }

//   const conversationId = (createdConversation as { id: string }).id;

//   const { error: participantError } = await supabase
//     .from("chat_conversation_participants")
//     .insert([
//       {
//         conversation_id: conversationId,
//         user_id: user.id,
//         role_snapshot: user.role,
//         last_read_at: new Date().toISOString(),
//       },
//       {
//         conversation_id: conversationId,
//         user_id: targetUser.id,
//         role_snapshot: targetUser.role,
//         last_read_at: null,
//       },
//     ] as any);

//   if (participantError) {
//     console.error("Failed to create direct conversation participants", participantError);
//     return;
//   }

//   setShowStartChatModal(false);
//   await loadConversations();
//   await openConversation(conversationId);
// };
const ensureDirectConversation = async (targetUserId: string) => {
  if (isStartingChat) {
    return;
  }

  try {
    setIsStartingChat(true);
    setStartChatLoadingLabel("Creating chat...");
    const conversationId = await startConversationViaApi({
      type: "direct",
      targetUserId,
    });

    setShowStartChatModal(false);
    await loadConversations();
    await openConversation(conversationId);
  } catch (error) {
    console.error("Failed to create direct conversation", error);
  } finally {
    setIsStartingChat(false);
  }
};
// const ensureOrganizationConversation = async (organizationId: string) => {
//   if (!supabase || !user) return;

//   const organization = state.clientOrganizations.find((candidate) => candidate.id === organizationId);

//   if (!organization) {
//     console.error("Organization not found");
//     return;
//   }

//   if (!userCanStartOrgChat(organizationId)) {
//     console.error("Not allowed to start organization chat");
//     return;
//   }

//   const {
//       data: existingOrganizationConversationRow,
//       error: existingConversationError,
//     } = await supabase
//       .from("chat_conversations")
//       .select("id")
//       .eq("type", "organization_group")
//       .eq("client_organization_id", organizationId)
//       .maybeSingle();

//     const existingConversation = existingOrganizationConversationRow as { id: string } | null;

//   if (existingConversationError) {
//     console.error("Failed to check organization conversation", existingConversationError);
//     return;
//   }

//   if (existingConversation?.id) {
//     setShowStartChatModal(false);
//     await loadConversations();
//     await openConversation(existingConversation.id);
//     return;
//   }

//   const { data: createdConversation, error: conversationError } = await supabase
//     .from("chat_conversations")
//     .insert({
//       type: "organization_group",
//       title: organization.name,
//       client_organization_id: organizationId,
//       created_by: user.id,
//       last_message_at: new Date().toISOString(),
//     } as any)
//     .select("id")
//     .single();

//   if (conversationError || !createdConversation) {
//     console.error("Failed to create organization conversation", conversationError);
//     return;
//   }

//   const conversationId = (createdConversation as unknown as { id: string }).id;

//   const participantUsers = state.users.filter((candidate) => {
//     if (candidate.role === "communication_manager" || candidate.role === "creative_manager") {
//       return true;
//     }

//     if (candidate.role === "client") {
//       return getUserOrgIds(candidate).includes(organizationId);
//     }

//     return false;
//   });

//   const uniqueParticipantUsers = Array.from(
//     new Map(participantUsers.map((participant) => [participant.id, participant])).values(),
//   );

//   const { error: participantError } = await supabase
//     .from("chat_conversation_participants")
//     .insert(
//       uniqueParticipantUsers.map((participant) => ({
//         conversation_id: conversationId,
//         user_id: participant.id,
//         role_snapshot: participant.role,
//         last_read_at: participant.id === user.id ? new Date().toISOString() : null,
//       })) as any,
//     );

//   if (participantError) {
//     console.error("Failed to create organization conversation participants", participantError);
//     return;
//   }

//   setShowStartChatModal(false);
//   await loadConversations();
//   await openConversation(conversationId);
// };
  const ensureOrganizationConversation = async (organizationId: string) => {
  if (isStartingChat) {
    return;
  }

  try {
    setIsStartingChat(true);
    setStartChatLoadingLabel("Creating group chat...");
    const conversationId = await startConversationViaApi({
      type: "org",
      organizationId,
    });

    setShowStartChatModal(false);
    await loadConversations();
    await openConversation(conversationId);
  } catch (error) {
    console.error("Failed to create organization conversation", error);
  } finally {
    setIsStartingChat(false);
  }
};

  const clearAttachment = () => {
    if (attachmentPreviewUrl) {
      URL.revokeObjectURL(attachmentPreviewUrl);
    }
    setAttachmentFile(null);
    setAttachmentPreviewUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversationId) {
      return;
    }

    try {
      setIsDeletingConversation(true);
      await deleteConversationViaApi(selectedConversationId);
      setShowDeleteConversationConfirm(false);
      setSelectedConversationId(null);
      setParticipants([]);
      setMessages([]);
      setActiveMessageActionId(null);
      setReplyTargetId(null);
      await loadConversations();
    } catch (error) {
      console.error("Failed to delete conversation", error);
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const clearReplyTarget = () => {
    setReplyTargetId(null);
  };

  const handleAttachmentSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      console.error("Unsupported chat image type", file.type);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (attachmentPreviewUrl) {
      URL.revokeObjectURL(attachmentPreviewUrl);
    }

    setAttachmentFile(file);
    setAttachmentPreviewUrl(URL.createObjectURL(file));
  };

  const handleMessageTouchStart = (messageId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
    }

    longPressTimeoutRef.current = window.setTimeout(() => {
      setActiveMessageActionId((current) => (current === messageId ? null : messageId));
      longPressTimeoutRef.current = null;
    }, 420);
  };

  const handleMessageTouchEnd = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const sendMessage = async () => {
    if (!supabase || !user || !selectedConversationId) return;

    const conversationId = selectedConversationId;
    const body = draft.trim();
    if (!body && !attachmentFile) return;
    const nowIso = new Date().toISOString();
    const replyToMessageId = replyTargetId;

    setDraft("");

    let imageUrl: string | null = null;
    let imageName: string | null = null;
    let imageMimeType: string | null = null;

    if (attachmentFile) {
      setIsUploadingAttachment(true);
      try {
        const upload = await uploadChatImageViaApi(attachmentFile);
        imageUrl = upload.url;
        imageName = upload.name;
        imageMimeType = upload.mimeType;
      } catch (error) {
        console.error("Failed to upload chat image", error);
        setDraft(body);
        setIsUploadingAttachment(false);
        return;
      }
    }

    const { error } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: selectedConversationId as any,
        sender_id: user.id as any,
        body: body as any,
        reply_to_message_id: replyToMessageId as any,
        image_url: imageUrl as any,
        image_name: imageName as any,
        image_mime_type: imageMimeType as any,
      } as any);

    if (error) {
      console.error("Failed to send message", error);
      setDraft(body);
      setIsUploadingAttachment(false);
      return;
    }

    const { error: updateConversationError } = await (supabase as any)
      .from("chat_conversations")
      .update({
        last_message_at: nowIso,
      })
      .eq("id", conversationId);

    if (updateConversationError) {
      console.error("Failed to update conversation timestamp", updateConversationError);
    }

    clearAttachment();
    clearReplyTarget();
    setActiveMessageActionId(null);
    setIsUploadingAttachment(false);
    await loadConversations();
    await loadMessages(conversationId);
  };

  const syncReactionToDatabase = async (messageId: string, desiredEmoji: Emoji | null) => {
    if (!supabase || !user) {
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("chat_message_reactions")
      .select("id,emoji")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      console.error("Failed to check reaction", existingError);
      return;
    }

    if (!desiredEmoji) {
      if (existing) {
        const { error: deleteError } = await (supabase as any)
          .from("chat_message_reactions")
          .delete()
          .eq("id", (existing as any).id);

        if (deleteError) {
          console.error("Failed delete reaction", deleteError);
        }
      }

      return;
    }

    if (existing) {
      if ((existing as { emoji?: string }).emoji === desiredEmoji) {
        return;
      }

      const { error: updateError } = await (supabase as any)
        .from("chat_message_reactions")
        .update({ emoji: desiredEmoji })
        .eq("id", (existing as any).id);

      if (updateError) {
        console.error("Failed update reaction", updateError);
      }

      return;
    }

    const { error: insertError } = await supabase
      .from("chat_message_reactions")
      .insert({ message_id: messageId as any, user_id: user.id as any, emoji: desiredEmoji } as any);

    if (insertError) {
      console.error("Failed insert reaction", insertError);
    }
  };

  const toggleReaction = (messageId: string, emoji: Emoji) => {
    if (!selectedConversationId) {
      return;
    }

    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage) {
      return;
    }

    const currentMyReaction =
      targetMessage.reactions.find((reaction) => reaction.reactedByMe)?.emoji ?? null;
    const desiredEmoji = currentMyReaction === emoji ? null : emoji;

    pendingReactionSelectionsRef.current[messageId] = desiredEmoji;

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const nextReactions = message.reactions.map((reaction) => {
          let count = reaction.count;
          if (reaction.reactedByMe) {
            count = Math.max(0, count - 1);
          }

          if (desiredEmoji && reaction.emoji === desiredEmoji) {
            count += 1;
          }

          return {
            ...reaction,
            count,
            reactedByMe: desiredEmoji === reaction.emoji,
          };
        });

        return {
          ...message,
          reactions: nextReactions,
        };
      }),
    );

    const existingTimeout = pendingReactionTimeoutsRef.current[messageId];
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    pendingReactionTimeoutsRef.current[messageId] = window.setTimeout(async () => {
      const nextDesiredEmoji = pendingReactionSelectionsRef.current[messageId] ?? null;
      try {
        await syncReactionToDatabase(messageId, nextDesiredEmoji);
      } finally {
        delete pendingReactionSelectionsRef.current[messageId];
        delete pendingReactionTimeoutsRef.current[messageId];
      }
    }, 5000);
  };

  const myUnreadCount = selectedConversationId ? unreadTotals.unreadByConversation[selectedConversationId] ?? 0 : 0;

  const safeUser = user;
  const replyTarget = replyTargetId
    ? messages.find((message) => message.id === replyTargetId) ?? null
    : null;
  const selectedConversation =
    selectedConversationId
      ? conversations.find((conversation) => conversation.id === selectedConversationId) ?? null
      : null;
  const existingDirectUserIds = useMemo(() => {
    if (!user) {
      return [];
    }

    const ids = new Set<string>();
    for (const conversation of conversations) {
      if (conversation.type !== "internal_direct") {
        continue;
      }

      const participantIds = conversationParticipantUserIdsByConversation[conversation.id] ?? [];
      for (const participantId of participantIds) {
        if (participantId !== user.id) {
          ids.add(participantId);
        }
      }
    }

    return Array.from(ids);
  }, [conversationParticipantUserIdsByConversation, conversations, user]);
  const existingOrganizationIds = useMemo(
    () =>
      conversations
        .filter(
          (conversation) =>
            conversation.type === "organization_group" && Boolean(conversation.client_organization_id),
        )
        .filter(
          (conversation) =>
            !user ||
            user.role !== "client" ||
            !activeClientOrganizationId ||
            conversation.client_organization_id === activeClientOrganizationId,
        )
        .map((conversation) => conversation.client_organization_id as string),
    [activeClientOrganizationId, conversations, user],
  );
  const selectedParticipantUsers = participants
    .map((participant) => state.users.find((candidate) => candidate.id === participant.user_id) ?? null)
    .filter((candidate): candidate is User => Boolean(candidate));
  const selectedPeer =
    user && selectedConversation?.type === "internal_direct"
      ? selectedParticipantUsers.find((candidate) => candidate.id !== user.id) ?? null
      : null;
  const selectedConversationTitle =
    selectedPeer?.name ?? selectedConversation?.title ?? "Conversation";
  const selectedConversationSubtitle =
    selectedConversation?.type === "organization_group"
      ? "Organization group"
      : selectedPeer
        ? formatRole(selectedPeer.role)
        : "Direct message";
  const showGroupSenderNames = selectedConversation?.type === "organization_group";
  const onlineUserIdSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  const getDisplayName = (conversation: ChatConversation) => {
    if (!user || conversation.type !== "internal_direct") {
      return conversation.title;
    }

    const parts = conversation.title
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.find((part) => part !== user.name) ?? conversation.title;
  };

  const getConversationTargetUser = (conversation: ChatConversation) => {
    const displayName = getDisplayName(conversation);
    return state.users.find((candidate) => candidate.name === displayName) ?? null;
  };

  const filteredConversations = conversations.filter((conversation) => {
    const displayName = getDisplayName(conversation);
    const targetUser = getConversationTargetUser(conversation);
    const preview = conversationPreviewById[conversation.id] ?? "";
    const searchValue = listSearch.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      displayName.toLowerCase().includes(searchValue) ||
      preview.toLowerCase().includes(searchValue);

    const matchesScope =
      conversationScope === "all"
        ? true
        : conversationScope === "clients"
          ? conversation.type === "organization_group" || targetUser?.role === "client"
          : conversation.type === "internal_direct" && targetUser?.role !== "client";
    const matchesActiveOrganization =
      !user ||
      user.role !== "client" ||
      !activeClientOrganizationId ||
      (conversation.type === "organization_group"
        ? conversation.client_organization_id === activeClientOrganizationId
        : targetUser?.role === "client"
          ? getUserOrgIds(targetUser).includes(activeClientOrganizationId)
          : true);

    return matchesSearch && matchesScope && matchesActiveOrganization;
  });

  const applyConversationSearch = () => {
    setListSearch(searchDraft.trim());
  };

  return (
    <PageShell style={user?.role === "client" ? clientBrandStyle : undefined}>
      {safeUser ? <AppSidebar user={safeUser} activeLabel="Chat" /> : null}

      <Content>
        <ConfirmActionModal
          open={showDeleteConversationConfirm}
          title="Delete conversation?"
          description="This will permanently remove the conversation, messages, and reactions for everyone in it."
          confirmLabel="Delete conversation"
          tone="danger"
          busy={isDeletingConversation}
          onCancel={() => {
            if (!isDeletingConversation) {
              setShowDeleteConversationConfirm(false);
            }
          }}
          onConfirm={handleDeleteConversation}
        />
        <Wrap>
          <Grid>
            <SidebarPanel $hiddenMobile={Boolean(selectedConversationId)}>
              <MobileListHeader>
                <MobileHeaderTitle>Chats</MobileHeaderTitle>
                <CircleIconButton type="button" aria-label="Start new chat" onClick={() => setShowStartChatModal(true)}>
                  <IconPlus />
                </CircleIconButton>
              </MobileListHeader>

              <DesktopListHeader>
                <SidebarTitleGroup>
                  <PanelTitle>Chats</PanelTitle>
                  {unreadTotals.unreadTotal > 0 ? (
                    <Badge aria-label="Unread chat count">{unreadTotals.unreadTotal > 99 ? "99+" : unreadTotals.unreadTotal}</Badge>
                  ) : null}
                </SidebarTitleGroup>
                <NewChatButton type="button" onClick={() => setShowStartChatModal(true)}>
                  <span>+</span>
                  New chat
                </NewChatButton>
              </DesktopListHeader>

              <SearchToolbar>
                <SearchField>
                  <SearchIconWrap>
                    <IconSearch />
                  </SearchIconWrap>
                  <SearchInput
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyConversationSearch();
                      }
                    }}
                    placeholder="Search"
                  />
                </SearchField>
                <CircleIconButton
                  type="button"
                  aria-label="Search conversations"
                  onClick={applyConversationSearch}
                >
                  <IconSearch />
                </CircleIconButton>
              </SearchToolbar>

              <ScopeTabs>
                {(["all", "clients", "internal"] as ConversationScope[]).map((scope) => (
                  <ScopeTab
                    key={scope}
                    type="button"
                    $active={conversationScope === scope}
                    onClick={() => setConversationScope(scope)}
                  >
                    {scope === "all" ? "All" : scope === "clients" ? "Clients" : "Internal"}
                  </ScopeTab>
                ))}
              </ScopeTabs>

              <ConversationList aria-busy={loadingConversations}>
                {filteredConversations.length === 0 && !loadingConversations ? (
                  <EmptyState>
                    <div>No conversations yet.</div>
                    <div className="muted">Start a new chat to begin messaging.</div>
                  </EmptyState>
                ) : null}

                {filteredConversations.map((conversation) => {
                  const isActive = conversation.id === selectedConversationId;
                  const unread = unreadTotals.unreadByConversation[conversation.id] ?? 0;
                  const displayName = getDisplayName(conversation);
                  const targetUser = getConversationTargetUser(conversation);
                  const preview = conversationPreviewById[conversation.id] ?? "No messages yet";
                  const isOnline =
                    conversation.type === "internal_direct" && targetUser
                      ? onlineUserIdSet.has(targetUser.id)
                      : false;

                  return (
                    <ConversationRow
                      key={conversation.id}
                      $active={isActive}
                      onClick={() => void openConversation(conversation.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <ConversationAvatar>
                        {targetUser ? (
                          <UserAvatar user={targetUser} />
                        ) : (
                          <OrgAvatar>{displayName.slice(0, 1).toUpperCase()}</OrgAvatar>
                        )}
                      </ConversationAvatar>
                      <ConversationCardBody>
                        <ConversationTop>
                          <ConversationTitleRow>
                            <ConversationTitle>{displayName}</ConversationTitle>
                            {conversation.type === "internal_direct" ? <OnlineDot $active={isOnline} /> : null}
                          </ConversationTitleRow>
                          <ConversationMeta>
                            {conversation.last_message_at
                              ? formatTime(conversation.last_message_at)
                              : ""}
                          </ConversationMeta>
                        </ConversationTop>
                        <ConversationBottom>
                          <ConversationPreview>{preview}</ConversationPreview>
                          {unread > 0 ? <UnreadPill>{unread > 99 ? "99+" : unread}</UnreadPill> : null}
                        </ConversationBottom>
                      </ConversationCardBody>
                    </ConversationRow>
                  );
                })}
              </ConversationList>
            </SidebarPanel>

            <MainPanel $visibleMobile={Boolean(selectedConversationId)}>
              {!selectedConversationId ? (
                <EmptyMain>
                  <div className="big">Select a conversation</div>
                  <div className="muted">Your messages will appear here.</div>
                </EmptyMain>
              ) : (
                <>
                  <MainHeader>
                    <MainHeaderIdentity>
                      <MobileBackButton type="button" aria-label="Back to chats" onClick={() => setSelectedConversationId(null)}>
                        <IconChevronLeft />
                      </MobileBackButton>
                      <MainAvatar>
                        {selectedPeer ? (
                          <UserAvatar user={selectedPeer} />
                        ) : (
                          <OrgAvatar>{selectedConversationTitle.slice(0, 1).toUpperCase()}</OrgAvatar>
                        )}
                      </MainAvatar>
                      <MainIdentityCopy>
                        <MainTitle>{selectedConversationTitle}</MainTitle>
                        <MainStatusRow>
                          {selectedConversation?.type === "internal_direct" && selectedPeer ? (
                            <>
                              <OnlineDot $active={onlineUserIdSet.has(selectedPeer.id)} />
                              <ReadHint>
                                {myUnreadCount > 0
                                  ? `${myUnreadCount} unread`
                                  : onlineUserIdSet.has(selectedPeer.id)
                                    ? "Online"
                                    : "Offline"}
                              </ReadHint>
                            </>
                          ) : (
                            <ReadHint>{myUnreadCount > 0 ? `${myUnreadCount} unread` : selectedConversationSubtitle}</ReadHint>
                          )}
                        </MainStatusRow>
                      </MainIdentityCopy>
                    </MainHeaderIdentity>
                    <MainHeaderActions>
                      <CircleIconButton
                        type="button"
                        aria-label="Delete conversation"
                        $danger
                        onClick={() => {
                          setShowDeleteConversationConfirm(true);
                        }}
                      >
                        <IconTrash />
                      </CircleIconButton>
                    </MainHeaderActions>
                  </MainHeader>

                  <MessageList aria-busy={loadingMessages}>
                    <DayMarker>Today</DayMarker>
                    {messages.length === 0 && !loadingMessages ? (
                      <EmptyMain>
                        <div className="big">No messages yet</div>
                        <div className="muted">Start the conversation.</div>
                      </EmptyMain>
                    ) : null}

                    {messages.map((message) => {
                      const isMine = message.sender_id === user?.id;
                      const isActionMenuOpen = activeMessageActionId === message.id;

                      return (
                        <MessageRow
                          key={message.id}
                          $mine={isMine}
                          onTouchStart={() => handleMessageTouchStart(message.id)}
                          onTouchEnd={handleMessageTouchEnd}
                          onTouchCancel={handleMessageTouchEnd}
                          onClick={() => {
                            setActiveMessageActionId((current) =>
                              current === message.id ? null : message.id,
                            );
                          }}
                        >
                          {!isMine ? (
                            <AvatarCol>
                              {message.sender ? (
                                <UserAvatar user={message.sender} />
                              ) : (
                                <UserAvatar user={{ name: "Unknown", avatarPath: null }} />
                              )}
                            </AvatarCol>
                          ) : null}
                          <BubbleCol $mine={isMine}>
                            <MessageActionRail $mine={isMine} $active={isActionMenuOpen}>
                              <MessageActionButton
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReplyTargetId(message.id);
                                  setActiveMessageActionId(null);
                                }}
                              >
                                <IconReply />
                                Reply
                              </MessageActionButton>
                              {EMOJIS.map((emoji) => (
                                <MessageReactionQuickButton
                                  key={`${message.id}:${emoji}`}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void toggleReaction(message.id, emoji);
                                    setActiveMessageActionId(null);
                                  }}
                                >
                                  {emoji}
                                </MessageReactionQuickButton>
                              ))}
                            </MessageActionRail>
                            <Bubble $mine={isMine}>
                              {showGroupSenderNames ? (
                                <MessageSenderName $mine={isMine}>
                                  {isMine ? "You" : message.sender?.name ?? "Unknown"}
                                </MessageSenderName>
                              ) : null}
                              {message.replyTo ? (
                                <ReplyQuotePreview $mine={isMine}>
                                  <strong>{message.replyTo.sender?.name ?? "Reply"}</strong>
                                  <span>
                                    {message.replyTo.body?.trim() ||
                                      (message.replyTo.image_url ? "Image attachment" : "Message")}
                                  </span>
                                </ReplyQuotePreview>
                              ) : null}
                              {message.image_url ? (
                                <MessageImage
                                  src={message.image_url}
                                  alt={message.image_name ?? "Chat attachment"}
                                />
                              ) : null}
                              {message.body ? <MessageBody>{message.body}</MessageBody> : null}
                              <MessageFooter $mine={isMine}>
                                <MessageTime>{formatTime(message.created_at)}</MessageTime>
                                {isMine ? (
                                  <DeliveredMark aria-label="Delivered">
                                    <IconDoubleCheck />
                                  </DeliveredMark>
                                ) : null}
                              </MessageFooter>
                            </Bubble>
                            {message.reactions.some((reaction) => reaction.count > 0) ? (
                              <ReactionDock $mine={isMine}>
                                {message.reactions.map((reaction) =>
                                  reaction.count > 0 ? (
                                    <ReactionButton
                                      key={reaction.emoji}
                                      type="button"
                                      aria-pressed={reaction.reactedByMe}
                                      $active={reaction.reactedByMe}
                                      onClick={() => void toggleReaction(message.id, reaction.emoji)}
                                    >
                                      <span>{reaction.emoji}</span>
                                      <span className="count">{reaction.count}</span>
                                    </ReactionButton>
                                  ) : null,
                                )}
                              </ReactionDock>
                            ) : null}
                          </BubbleCol>
                          {isMine ? (
                            <AvatarCol>
                              <UserAvatar user={user} />
                            </AvatarCol>
                          ) : null}
                        </MessageRow>
                      );
                    })}
                  </MessageList>

                  <Composer
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMessage();
                    }}
                  >
                    <ComposerHiddenInput
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleAttachmentSelect}
                    />
                    {attachmentPreviewUrl ? (
                      <AttachmentPreviewBar>
                        <AttachmentPreviewThumb src={attachmentPreviewUrl} alt={attachmentFile?.name ?? "Selected image"} />
                        <AttachmentPreviewMeta>
                          <strong>{attachmentFile?.name ?? "Image selected"}</strong>
                          <span>{isUploadingAttachment ? "Uploading..." : "Ready to send"}</span>
                        </AttachmentPreviewMeta>
                        <AttachmentRemoveButton
                          type="button"
                          onClick={clearAttachment}
                          disabled={isUploadingAttachment}
                          aria-label="Remove selected image"
                        >
                          <IconClose />
                        </AttachmentRemoveButton>
                      </AttachmentPreviewBar>
                    ) : null}
                    {replyTarget ? (
                      <ReplyComposerBar>
                        <ReplyComposerMeta>
                          <strong>{replyTarget.sender?.name ?? "Replying"}</strong>
                          <span>
                            {replyTarget.body?.trim() ||
                              (replyTarget.image_url ? "Image attachment" : "Message")}
                          </span>
                        </ReplyComposerMeta>
                        <AttachmentRemoveButton
                          type="button"
                          onClick={clearReplyTarget}
                          disabled={isUploadingAttachment}
                          aria-label="Cancel reply"
                        >
                          <IconClose />
                        </AttachmentRemoveButton>
                      </ReplyComposerBar>
                    ) : null}
                    <ComposerAction
                      type="button"
                      aria-label="Attach file"
                      onClick={() => {
                        if (!isUploadingAttachment) {
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      <IconPaperclip />
                    </ComposerAction>
                    <ComposerInput
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Type a message"
                      rows={1}
                    />
                    <ComposerAction type="button" aria-label="Emoji">
                      <IconSmile />
                    </ComposerAction>
                    <ComposerSend
                      type="submit"
                      disabled={(!draft.trim() && !attachmentFile) || isUploadingAttachment}
                      aria-label="Send message"
                    >
                      <IconSend />
                    </ComposerSend>
                  </Composer>
                </>
              )}
            </MainPanel>
          </Grid>
        </Wrap>
    {showStartChatModal ? (
      <StartChatOverlay onClick={() => (isStartingChat ? null : setShowStartChatModal(false))}>
        <StartChatCard onClick={(event) => event.stopPropagation()}>
          {isStartingChat ? (
            <StartChatLoadingOverlay>
              <StartChatLoadingCard role="status" aria-live="polite">
                <StartChatSpinner />
                <strong>{startChatLoadingLabel}</strong>
              </StartChatLoadingCard>
            </StartChatLoadingOverlay>
          ) : null}
          <StartChatHeader>
            <div>
              <StartChatTitle>Start new chat</StartChatTitle>
              {/* <StartChatText>Select an internal user or client organization to start a conversation.</StartChatText> */}
            </div>
            <StartChatClose type="button" disabled={isStartingChat} onClick={() => setShowStartChatModal(false)}>
              ×
            </StartChatClose>
          </StartChatHeader>

          <StartChatEmpty>
            {user ? (
              <StartChatOptions
                currentUser={user}
                users={state.users}
                clientOrganizations={state.clientOrganizations}
                clientOrganizationIds={
                  user.role === "client"
                    ? activeClientOrganizationId
                      ? [activeClientOrganizationId]
                      : clientOrganizationIds
                    : user.clientOrganizationIds ?? (user.clientOrganizationId ? [user.clientOrganizationId] : [])
                }
                existingDirectUserIds={existingDirectUserIds}
                existingOrganizationIds={existingOrganizationIds}
                disabled={isStartingChat}
                mode={startChatMode}
                onModeChange={setStartChatMode}
                onStartDirectChat={(targetUserId) => {
                  void ensureDirectConversation(targetUserId);
                }}
                onStartOrganizationChat={(organizationId) => {
                  void ensureOrganizationConversation(organizationId);
                }}
              />
            ) : (
              "Loading options…"
            )}
          </StartChatEmpty>

        </StartChatCard>
      </StartChatOverlay>
    ) : null}
    <FloatingChatButton
      type="button"
      aria-label="Start new chat"
      onClick={() => setShowStartChatModal(true)}
    >
      +
    </FloatingChatButton>
      </Content>
    </PageShell>
  );
}


const desktop = "@media (min-width: 1100px)";
const mobileOnly = "@media (max-width: 1099px)";
const mobileBottomNavHeight = "76px";

const PageShell = styled.main`
  display: block;
  height: calc(100dvh - ${mobileBottomNavHeight} - env(safe-area-inset-bottom));
  max-height: calc(100dvh - ${mobileBottomNavHeight} - env(safe-area-inset-bottom));
  min-height: calc(100dvh - ${mobileBottomNavHeight} - env(safe-area-inset-bottom));
  padding: 8px 8px 0;
  overflow: hidden;
  background:
    radial-gradient(circle at top center, rgba(255, 255, 255, 0.72), transparent 24%),
    var(--client-brand-soft, linear-gradient(180deg, #f8f3eb 0%, #f6f0e6 100%));

  ${desktop} {
    display: flex;
    align-items: stretch;
    min-height: 100vh;
    height: auto;
    max-height: none;
    padding: 8px;
  }
`;

const Content = styled.section`
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;

  ${desktop} {
    flex: 1;
    height: calc(100vh - 16px);
    padding: 22px;
    border-radius: 0 30px 30px 0;
    background: var(--client-brand-soft-panel, rgba(255, 255, 255, 0.36));
  }
`;

const Wrap = styled.main`
  height: 100%;
  min-height: 0;
  overflow: hidden;

  ${desktop} {
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    border: 1px solid rgba(230, 224, 215, 0.92);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 26px 60px rgba(94, 76, 55, 0.1);
    padding: 24px;
  }
`;

const Grid = styled.section`
  display: grid;
  height: 100%;
  min-height: 0;

  ${desktop} {
    grid-template-columns: minmax(340px, 380px) minmax(0, 1fr);
    gap: 18px;
    align-items: stretch;
  }
`;

const SidebarPanel = styled.aside<{ $hiddenMobile?: boolean }>`
  display: ${({ $hiddenMobile }) => ($hiddenMobile ? "none" : "flex")};
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0 8px;

  ${desktop} {
    display: flex;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(230, 224, 215, 0.96);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.94);
    padding: 22px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  }
`;

const MainPanel = styled.section<{ $visibleMobile?: boolean }>`
  display: ${({ $visibleMobile }) => ($visibleMobile ? "flex" : "none")};
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid rgba(230, 224, 215, 0.96);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  overflow: hidden;

  ${desktop} {
    display: flex;
    height: 100%;
    min-height: 0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  }
`;

const DesktopListHeader = styled.header`
  display: none;

  ${desktop} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
`;

const SidebarTitleGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const PanelTitle = styled.h1`
  margin: 0;
  font-size: clamp(2rem, 2.4vw, 2.5rem);
  letter-spacing: -0.05em;
  color: var(--color-text);
`;

const MobileListHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 0;

  ${desktop} {
    display: none;
  }
`;

const MobileHeaderTitle = styled.h1`
  margin: 0;
  font-size: 1.12rem;
  font-weight: 800;
  color: var(--color-text);
`;

const Badge = styled.span`
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #c4a26d;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
`;

const NewChatButton = styled.button`
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  background: linear-gradient(180deg, #f5ead8, #ead7b5);
  color: #2a2a2a;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 12px 22px rgba(208, 183, 144, 0.18);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  span {
    font-size: 1.1rem;
    line-height: 1;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 26px rgba(208, 183, 144, 0.24);
  }

  ${mobileOnly} {
    display: none;
  }
`;

const SearchToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SearchField = styled.label`
  flex: 1;
  min-width: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
`;

const SearchIconWrap = styled.span`
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9b8e7b;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
  outline: none;

  &::placeholder {
    color: #a69a89;
  }

  ${mobileOnly} {
    font-size: 16px;
  }
`;

const ScopeTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ScopeTab = styled.button<{ $active?: boolean }>`
  min-height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  border: 0;
  background: ${({ $active }) => ($active ? "#f1e3cc" : "transparent")};
  color: ${({ $active }) => ($active ? "#2d261f" : "#6c6356")};
  font-size: 0.88rem;
  font-weight: ${({ $active }) => ($active ? 800 : 600)};
  cursor: pointer;
`;

const ConversationList = styled.div`
  display: grid;
  gap: 10px;
  align-content: start;
  grid-auto-rows: max-content;
  overflow: auto;
  padding-right: 4px;
  min-height: 0;
  flex: 1;

  ${desktop} {
    max-height: none;
  }
`;

const ConversationRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  align-items: center;
  align-self: start;
  gap: 12px;
  min-height: 78px;
  padding: 10px 12px;
  border: 1px solid ${({ $active }) => ($active ? "rgba(228, 214, 188, 0.98)" : "rgba(239, 233, 224, 0.96)")};
  border-radius: 20px;
  background: ${({ $active }) => ($active ? "linear-gradient(180deg, #f8efdf, #f3ead9)" : "rgba(255, 255, 255, 0.92)")};
  box-shadow: ${({ $active }) =>
    $active ? "0 16px 32px rgba(210, 186, 146, 0.18)" : "0 6px 14px rgba(94, 76, 55, 0.04)"};
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;

  &:hover {
    background: ${({ $active }) =>
      $active ? "linear-gradient(180deg, #f8efdf, #f3ead9)" : "linear-gradient(180deg, #fbf4e8, #f5ebda)"};
    border-color: rgba(219, 194, 155, 0.96);
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(94, 76, 55, 0.08);
  }
`;

const ConversationAvatar = styled.div`
  width: 54px;
  height: 54px;
  border-radius: 18px;
  overflow: hidden;
  background: #f2e4d2;
`;

const ConversationCardBody = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;
`;

const ConversationTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const ConversationTitleRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const ConversationTitle = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.96rem;
  font-weight: 800;
  color: var(--color-text);
`;

const OnlineDot = styled.span<{ $active?: boolean }>`
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "#3da35d" : "#bfb4a4")};
  box-shadow: ${({ $active }) =>
    $active ? "0 0 0 3px rgba(61, 163, 93, 0.12)" : "0 0 0 3px rgba(191, 180, 164, 0.18)"};
`;

const ConversationMeta = styled.span`
  flex: 0 0 auto;
  color: #7f7465;
  font-size: 0.72rem;
  white-space: nowrap;
`;

const ConversationBottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const ConversationPreview = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #695f53;
  font-size: 0.84rem;
`;

const UnreadPill = styled.span`
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: #c3a06b;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.74rem;
  font-weight: 900;
`;

const MainHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(230, 224, 215, 0.8);

  ${mobileOnly} {
    gap: 10px;
    padding: 14px 14px 12px;
  }
`;

const MainHeaderIdentity = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MobileBackButton = styled.button`
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  background: rgba(255, 255, 255, 0.96);
  color: #5d5347;
  cursor: pointer;

  ${desktop} {
    display: none;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MainAvatar = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 16px;
  overflow: hidden;
  background: #f2e4d2;

  ${mobileOnly} {
    width: 38px;
    height: 38px;
    border-radius: 14px;
  }
`;

const MainIdentityCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;
`;

const MainTitle = styled.h2`
  margin: 0;
  font-size: 1.18rem;
  letter-spacing: -0.02em;
  color: var(--color-text);

  ${mobileOnly} {
    font-size: 0.98rem;
  }
`;

const MainStatusRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const ReadHint = styled.span`
  color: #7f7465;
  font-size: 0.84rem;

  ${mobileOnly} {
    font-size: 0.76rem;
  }
`;

const MainHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const CircleIconButton = styled.button<{ $danger?: boolean }>`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid
    ${({ $danger }) => ($danger ? "rgba(225, 109, 100, 0.35)" : "rgba(230, 224, 215, 0.96)")};
  background: ${({ $danger }) => ($danger ? "rgba(255, 239, 238, 0.96)" : "rgba(255, 255, 255, 0.96)")};
  color: ${({ $danger }) => ($danger ? "#c34b41" : "#6f6558")};
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(94, 76, 55, 0.08);
    color: ${({ $danger }) => ($danger ? "#af342a" : "var(--color-text)")};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MessageList = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 12px 16px;

  ${mobileOnly} {
    gap: 16px;
    padding: 10px 12px;
  }
`;

const DayMarker = styled.div`
  justify-self: center;
  color: #897e71;
  font-size: 0.82rem;
  font-weight: 600;
`;

const MessageRow = styled.div<{ $mine?: boolean }>`
  display: grid;
  width: 100%;
  grid-template-columns: ${({ $mine }) => ($mine ? "1fr 40px" : "40px 1fr")};
  justify-items: ${({ $mine }) => ($mine ? "end" : "start")};
  align-items: end;
  gap: 10px;

  ${mobileOnly} {
    grid-template-columns: ${({ $mine }) => ($mine ? "1fr 34px" : "34px 1fr")};
    gap: 8px;
  }

  min-height: fit-content;
  align-self: start;
`;

const AvatarCol = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  overflow: hidden;

  ${mobileOnly} {
    width: 34px;
    height: 34px;
    border-radius: 12px;
  }
`;

const BubbleCol = styled.div<{ $mine?: boolean }>`
  max-width: min(100%, 420px);
  display: grid;
  gap: 12px;
  justify-items: ${({ $mine }) => ($mine ? "end" : "start")};

  ${mobileOnly} {
    max-width: min(100%, 320px);
    gap: 8px;
  }
`;

const MessageActionRail = styled.div<{ $mine?: boolean; $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $mine }) => ($mine ? "flex-end" : "flex-start")};
  gap: 8px;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    max-height 0.18s ease,
    margin-bottom 0.18s ease;

  ${desktop} {
    ${BubbleCol}:hover & {
      max-height: 34px;
      opacity: 1;
      pointer-events: auto;
      margin-bottom: 6px;
    }
  }

  ${mobileOnly} {
    display: ${({ $active }) => ($active ? "flex" : "none")};
    max-height: ${({ $active }) => ($active ? "34px" : "0")};
    opacity: 1;
    pointer-events: auto;
    margin-bottom: ${({ $active }) => ($active ? "6px" : "0")};
  }
`;

const MessageActionButton = styled.button`
  min-height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(230, 224, 215, 0.92);
  border-radius: 999px;
  background: rgba(249, 244, 236, 0.98);
  color: #6a604f;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  ${BubbleCol}:hover & {
    border-color: rgba(219, 194, 155, 0.96);
    background: rgba(243, 231, 210, 0.98);
    color: #4e4335;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const MessageReactionQuickButton = styled.button`
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.92);
  border-radius: 999px;
  background: rgba(249, 244, 236, 0.98);
  cursor: pointer;
  font-size: 0.9rem;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;

  ${BubbleCol}:hover & {
    border-color: rgba(219, 194, 155, 0.96);
    background: rgba(243, 231, 210, 0.98);
    transform: translateY(-1px);
  }
`;

const Bubble = styled.div<{ $mine?: boolean }>`
  position: relative;
  min-width: 0;
  display: grid;
  gap: 8px;
  padding: 14px 12px 10px;
  border-radius: 20px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  background: ${({ $mine }) =>
    $mine ? "linear-gradient(180deg, #f6eddf, #efe4d2)" : "rgba(255, 255, 255, 0.96)"};
  box-shadow: 0 10px 22px rgba(94, 76, 55, 0.05);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  ${BubbleCol}:hover & {
    border-color: rgba(219, 194, 155, 0.92);
    box-shadow: 0 12px 24px rgba(94, 76, 55, 0.08);
  }

  ${mobileOnly} {
    padding: 13px 11px 9px;
    border-radius: 18px;
  }
`;

const ReplyQuotePreview = styled.div<{ $mine?: boolean }>`
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(230, 224, 215, 0.88);
  background: ${({ $mine }) =>
    $mine ? "rgba(255, 255, 255, 0.48)" : "rgba(247, 241, 232, 0.9)"};
  display: grid;
  gap: 4px;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.8rem;
    color: #594d3f;
  }

  span {
    font-size: 0.82rem;
    color: #7e7467;
  }

  ${mobileOnly} {
    strong {
      font-size: 0.74rem;
    }

    span {
      font-size: 0.76rem;
    }
  }
`;

const MessageImage = styled.img`
  width: min(100%, 280px);
  max-height: 320px;
  display: block;
  object-fit: cover;
  border-radius: 14px;
  background: #f3ecdf;

  ${mobileOnly} {
    width: min(100%, 240px);
    max-height: 260px;
  }
`;

const MessageBody = styled.div`
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.98rem;
  line-height: 1.42;
  color: #3a342d;

  ${mobileOnly} {
    font-size: 0.9rem;
    line-height: 1.34;
  }
`;

const MessageSenderName = styled.div<{ $mine?: boolean }>`
  position: absolute;
  top: 0;
  left: ${({ $mine }) => ($mine ? "auto" : "14px")};
  right: ${({ $mine }) => ($mine ? "14px" : "auto")};
  transform: translateY(-50%);
  padding: 0 8px;
  border-radius: 999px;
  background: ${({ $mine }) => ($mine ? "#e6dcc8" : "#efe5d3")};
  font-size: 0.78rem;
  line-height: 1.2;
  font-weight: 800;
  color: ${({ $mine }) => ($mine ? "#5f5443" : "#6f5f4c")};
  z-index: 1;

  ${mobileOnly} {
    left: ${({ $mine }) => ($mine ? "auto" : "12px")};
    right: ${({ $mine }) => ($mine ? "12px" : "auto")};
    padding: 0 7px;
    font-size: 0.72rem;
  }
`;

const MessageFooter = styled.div<{ $mine?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: ${({ $mine }) => ($mine ? "flex-end" : "flex-start")};
  gap: 4px;
`;

const MessageTime = styled.div`
  color: #918676;
  font-size: 0.76rem;

  ${mobileOnly} {
    font-size: 0.7rem;
  }
`;

const DeliveredMark = styled.span`
  color: #8d857a;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 15px;
    height: 15px;
    display: block;
  }

  ${mobileOnly} {
    svg {
      width: 13px;
      height: 13px;
    }
  }
`;

const ReactionDock = styled.div<{ $mine?: boolean }>`
  display: flex;
  justify-content: ${({ $mine }) => ($mine ? "flex-end" : "flex-start")};
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
`;

const ReactionButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  background: ${({ $active }) => ($active ? "rgba(245, 239, 229, 0.95)" : "rgba(255, 255, 255, 0.94)")};
  color: var(--color-text);
  font-size: 0.84rem;
  cursor: pointer;

  .count {
    color: #8c8071;
    font-size: 0.76rem;
  }
`;

const EmptyState = styled.div`
  padding: 14px 6px;
  color: #7c7164;
  display: grid;
  gap: 6px;

  .muted {
    color: #9a907f;
    font-size: 0.84rem;
  }
`;

const EmptyMain = styled.div`
  padding: 28px 20px;
  display: grid;
  gap: 8px;
  justify-items: center;
  align-content: center;
  min-height: 100%;
  text-align: center;

  .big {
    font-size: 1.08rem;
    font-weight: 800;
    color: var(--color-text);
  }

  .muted {
    color: #8f8477;
    font-size: 0.92rem;
  }
`;

const Composer = styled.form`
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: 10px 14px 10px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);

  ${mobileOnly} {
    padding-bottom: max(4px, env(safe-area-inset-bottom));
  }
`;

const ComposerHiddenInput = styled.input`
  display: none;
`;

const AttachmentPreviewBar = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(230, 224, 215, 0.92);
  border-radius: 18px;
  background: rgba(249, 245, 239, 0.92);
`;

const ReplyComposerBar = styled(AttachmentPreviewBar)`
  background: rgba(246, 239, 229, 0.96);
`;

const AttachmentPreviewThumb = styled.img`
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: cover;
  background: #f3ecdf;
`;

const AttachmentPreviewMeta = styled.div`
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.92rem;
    color: var(--color-text);
  }

  span {
    font-size: 0.8rem;
    color: #8a7e70;
  }
`;

const ReplyComposerMeta = styled(AttachmentPreviewMeta)``;

const AttachmentRemoveButton = styled.button`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(230, 224, 215, 0.92);
  background: rgba(255, 255, 255, 0.96);
  color: #6f6558;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ComposerAction = styled.button`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: #7f7465;
  cursor: pointer;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ComposerInput = styled.textarea`
  width: 100%;
  min-height: 40px;
  max-height: 108px;
  padding: 10px 2px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 0.94rem;
  line-height: 1.32;
  resize: none;
  outline: none;

  &::placeholder {
    color: #a69a89;
  }

  ${mobileOnly} {
    min-height: 36px;
    max-height: 92px;
    padding: 8px 2px;
    font-size: 16px;
  }
`;

const ComposerSend = styled.button`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 0;
  background: #7b8c67;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 14px 24px rgba(123, 140, 103, 0.26);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const FloatingChatButton = styled.button`
  display: none;
`;

const OrgAvatar = styled.span`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #5e4c37;
  font-weight: 800;
`;

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9.5 4.5h5" />
      <path d="M7 7l.8 11a2 2 0 0 0 2 1.8h4.4a2 2 0 0 0 2-1.8L17 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function IconPaperclip() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.4 11-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5L10.3 18a2 2 0 0 1-2.8-2.8l8.4-8.4" />
    </svg>
  );
}

function IconSmile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
    </svg>
  );
}

function IconReply() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 17-5-5 5-5" />
      <path d="M4 12h9a7 7 0 0 1 7 7" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.6 3.4a1 1 0 0 0-1-.2L4 9.3a1 1 0 0 0 .1 1.9l6.8 1.9 1.9 6.8a1 1 0 0 0 1.9.1l6.1-15.6a1 1 0 0 0-.2-1Z" />
    </svg>
  );
}

function IconDoubleCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m1.5 8 2.4 2.4 4-4.7" />
      <path d="m6.6 8 2.4 2.4 5-5.8" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

const StartChatOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(31, 31, 31, 0.32);
  backdrop-filter: blur(8px);

  ${mobileOnly} {
    align-items: flex-start;
    padding: 12px 12px 0;
  }
`;

const StartChatCard = styled.section`
  position: relative;
  width: min(100%, 520px);
  height: 80vh;
  border: 1px solid var(--color-border);
  border-radius: 26px;
  background: var(--color-surface);
  box-shadow: 0 24px 70px rgba(31, 31, 31, 0.16);
  padding: 22px;
  overflow: hidden;

  ${mobileOnly} {
    width: 100%;
    height: min(82dvh, 760px);
    border-radius: 24px;
    padding: 16px 14px 12px;
  }
`;

const StartChatLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  border-radius: inherit;
  background: rgba(248, 243, 235, 0.82);
  backdrop-filter: blur(6px);
`;

const StartChatLoadingCard = styled.div`
  min-width: min(100%, 220px);
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(94, 76, 55, 0.12);
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
  color: var(--color-text);
  font-size: 0.92rem;

  strong {
    font-size: 0.96rem;
  }
`;

const StartChatSpinner = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 2px solid rgba(94, 76, 55, 0.16);
  border-top-color: #7b8c67;
  animation: start-chat-spin 0.8s linear infinite;

  @keyframes start-chat-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const StartChatHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  ${mobileOnly} {
    gap: 10px;
    font-size: 0.92rem;
  }
`;

const StartChatTitle = styled.h2`
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: -0.03em;
`;

const StartChatText = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  line-height: 1.5;
`;

const StartChatClose = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  cursor: pointer;
  font-size: 1.3rem;

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  ${mobileOnly} {
    width: 32px;
    height: 32px;
    font-size: 1.05rem;
  }
`;

const StartChatEmpty = styled.div`
  margin-top: 18px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 18px;
  padding: 22px;
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
  height: calc(100% - 54px);
  min-height: 0;
  overflow: hidden;

  ${mobileOnly} {
    margin-top: 12px;
    padding: 0px;
    border:none;
    height: calc(100% - 42px);
    background: none;
  }
`;
