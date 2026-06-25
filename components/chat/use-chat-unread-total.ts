"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { User } from "@/lib/types";

export function useChatUnreadTotal(user: User | null | undefined) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const channelInstanceIdRef = useRef(`chat-unread-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!supabase || !user) {
      setUnreadTotal(0);
      return;
    }

    let cancelled = false;

    const loadUnreadTotal = async () => {
      const { data: participantRows, error: participantError } = await supabase
        .from("chat_conversation_participants")
        .select("conversation_id,last_read_at")
        .eq("user_id", user.id);

      if (participantError) {
        console.error("Failed to load chat unread participants", participantError);
        if (!cancelled) {
          setUnreadTotal(0);
        }
        return;
      }

      const rows = (participantRows ?? []) as Array<{
        conversation_id: string;
        last_read_at: string | null;
      }>;

      if (!rows.length) {
        if (!cancelled) {
          setUnreadTotal(0);
        }
        return;
      }

      const conversationIds = rows.map((row) => row.conversation_id);
      const { data: conversations, error: conversationError } = await supabase
        .from("chat_conversations")
        .select("id,created_at")
        .in("id", conversationIds);

      if (conversationError) {
        console.error("Failed to load chat unread conversations", conversationError);
        if (!cancelled) {
          setUnreadTotal(0);
        }
        return;
      }

      const conversationCreatedAt = new Map(
        ((conversations ?? []) as Array<{ id: string; created_at: string }>).map((conversation) => [
          conversation.id,
          conversation.created_at,
        ]),
      );

      let nextUnreadTotal = 0;

      await Promise.all(
        rows.map(async (row) => {
          const { count, error: countError } = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", row.conversation_id)
            .neq("sender_id", user.id)
            .gt(
              "created_at",
              row.last_read_at ?? conversationCreatedAt.get(row.conversation_id) ?? "1970-01-01T00:00:00.000Z",
            );

          if (countError) {
            console.error("Failed to load chat unread count", countError);
            return;
          }

          nextUnreadTotal += count ?? 0;
        }),
      );

      if (!cancelled) {
        setUnreadTotal(nextUnreadTotal);
      }
    };

    void loadUnreadTotal();

    const channel = supabase.channel(
      `chat-unread-badge:${user.id}:${channelInstanceIdRef.current}`,
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_conversation_participants",
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        void loadUnreadTotal();
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      },
      () => {
        void loadUnreadTotal();
      },
    );

    channel.subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  return unreadTotal;
}
