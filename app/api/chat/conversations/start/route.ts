import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser, type WorkspaceProfile } from "@/app/api/workspace/_auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

type StartChatPayload =
  | {
      type: "direct";
      targetUserId: string;
    }
  | {
      type: "org";
      organizationId: string;
    };

type ProfileRow = Pick<WorkspaceProfile, "id" | "email" | "name" | "role">;
type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const INTERNAL_ROLES: Role[] = ["communication_manager", "creative_manager", "designer"];
const MANAGER_ROLES: Role[] = ["communication_manager", "creative_manager"];

async function getUserOrgIds(supabase: SupabaseAdminClient, userId: string) {
  const { data, error } = await supabase
    .from("client_organization_liaisons")
    .select("client_organization_id")
    .eq("profile_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ client_organization_id: string }>).map(
    (row) => row.client_organization_id,
  );
}

async function canStartDirectChat(
  supabase: SupabaseAdminClient,
  currentUser: ProfileRow,
  targetUser: ProfileRow,
) {
  if (currentUser.id === targetUser.id) {
    return false;
  }

  if (MANAGER_ROLES.includes(currentUser.role)) {
    return true;
  }

  if (currentUser.role === "designer") {
    return INTERNAL_ROLES.includes(targetUser.role);
  }

  if (currentUser.role === "client") {
    if (MANAGER_ROLES.includes(targetUser.role)) {
      return true;
    }

    if (targetUser.role !== "client") {
      return false;
    }

    const currentOrgIds = await getUserOrgIds(supabase, currentUser.id);
    const targetOrgIds = await getUserOrgIds(supabase, targetUser.id);

    return targetOrgIds.some((orgId) => currentOrgIds.includes(orgId));
  }

  return false;
}

async function canStartOrgChat(
  supabase: SupabaseAdminClient,
  currentUser: ProfileRow,
  organizationId: string,
) {
  if (MANAGER_ROLES.includes(currentUser.role)) {
    return true;
  }

  if (currentUser.role === "client") {
    const currentOrgIds = await getUserOrgIds(supabase, currentUser.id);
    return currentOrgIds.includes(organizationId);
  }

  return false;
}

async function findExistingDirectConversation(
  supabase: SupabaseAdminClient,
  currentUserId: string,
  targetUserId: string,
) {
  const { data: myRows, error: myRowsError } = await supabase
    .from("chat_conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId);

  if (myRowsError) {
    throw new Error(myRowsError.message);
  }

  const myConversationIds = ((myRows ?? []) as Array<{ conversation_id: string }>).map(
    (row) => row.conversation_id,
  );

  if (myConversationIds.length === 0) {
    return null;
  }

  const { data: targetRows, error: targetRowsError } = await supabase
    .from("chat_conversation_participants")
    .select("conversation_id")
    .eq("user_id", targetUserId)
    .in("conversation_id", myConversationIds);

  if (targetRowsError) {
    throw new Error(targetRowsError.message);
  }

  const sharedIds = ((targetRows ?? []) as Array<{ conversation_id: string }>).map(
    (row) => row.conversation_id,
  );

  if (sharedIds.length === 0) {
    return null;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("type", "internal_direct")
    .in("id", sharedIds)
    .maybeSingle();

  if (conversationError) {
    throw new Error(conversationError.message);
  }

  return conversation as { id: string } | null;
}

async function startDirectConversation(
  supabase: SupabaseAdminClient,
  currentUser: ProfileRow,
  targetUserId: string,
) {
  const { data: targetUser, error: targetUserError } = await supabase
    .from("profiles")
    .select("id,email,name,role")
    .eq("id", targetUserId)
    .single();

  if (targetUserError || !targetUser) {
    throw new Error("Target user not found");
  }

  const typedTargetUser = targetUser as ProfileRow;

  const allowed = await canStartDirectChat(supabase, currentUser, typedTargetUser);

  if (!allowed) {
    throw new Error("You are not allowed to start this chat.");
  }

  const existing = await findExistingDirectConversation(
    supabase,
    currentUser.id,
    typedTargetUser.id,
  );

  if (existing?.id) {
    return existing.id;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("chat_conversations")
    .insert({
      type: "internal_direct",
      title: `${currentUser.name} / ${typedTargetUser.name}`,
      client_organization_id: null,
      created_by: currentUser.id,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? "Failed to create conversation.");
  }

  const conversationId = (conversation as { id: string }).id;

  const { error: participantError } = await supabase
    .from("chat_conversation_participants")
    .insert([
      {
        conversation_id: conversationId,
        user_id: currentUser.id,
        role_snapshot: currentUser.role,
        last_read_at: new Date().toISOString(),
      },
      {
        conversation_id: conversationId,
        user_id: typedTargetUser.id,
        role_snapshot: typedTargetUser.role,
        last_read_at: null,
      },
    ]);

  if (participantError) {
    throw new Error(participantError.message);
  }

  return conversationId;
}

async function startOrganizationConversation(
  supabase: SupabaseAdminClient,
  currentUser: ProfileRow,
  organizationId: string,
) {
  const allowed = await canStartOrgChat(supabase, currentUser, organizationId);

  if (!allowed) {
    throw new Error("You are not allowed to start this organization chat.");
  }

  const { data: organization, error: organizationError } = await supabase
    .from("client_organizations")
    .select("id,name")
    .eq("id", organizationId)
    .single();

  if (organizationError || !organization) {
    throw new Error("Organization not found.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("type", "organization_group")
    .eq("client_organization_id", organizationId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return (existing as { id: string }).id;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("chat_conversations")
    .insert({
      type: "organization_group",
      title: organization.name,
      client_organization_id: organizationId,
      created_by: currentUser.id,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? "Failed to create organization chat.");
  }

  const conversationId = (conversation as { id: string }).id;

  const { data: managers, error: managersError } = await supabase
    .from("profiles")
    .select("id,email,name,role")
    .in("role", MANAGER_ROLES);

  if (managersError) {
    throw new Error(managersError.message);
  }

  const { data: liaisonRows, error: liaisonError } = await supabase
    .from("client_organization_liaisons")
    .select("profile_id")
    .eq("client_organization_id", organizationId);

  if (liaisonError) {
    throw new Error(liaisonError.message);
  }

  const liaisonIds = ((liaisonRows ?? []) as Array<{ profile_id: string }>).map(
    (row) => row.profile_id,
  );

  let liaisons: ProfileRow[] = [];

  if (liaisonIds.length > 0) {
    const { data: liaisonProfiles, error: liaisonProfilesError } = await supabase
      .from("profiles")
      .select("id,email,name,role")
      .in("id", liaisonIds);

    if (liaisonProfilesError) {
      throw new Error(liaisonProfilesError.message);
    }

    liaisons = (liaisonProfiles ?? []) as ProfileRow[];
  }

  const participants = Array.from(
    new Map(
      ([...((managers ?? []) as ProfileRow[]), ...liaisons] as ProfileRow[]).map((participant) => [
        participant.id,
        participant,
      ]),
    ).values(),
  );

  const { error: participantError } = await supabase
    .from("chat_conversation_participants")
    .insert(
      participants.map((participant) => ({
        conversation_id: conversationId,
        user_id: participant.id,
        role_snapshot: participant.role,
        last_read_at: participant.id === currentUser.id ? new Date().toISOString() : null,
      })),
    );

  if (participantError) {
    throw new Error(participantError.message);
  }

  return conversationId;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireWorkspaceUser(request);
    if (auth instanceof Response) {
      return auth;
    }

    const { supabase, user: currentUser } = auth;
    const payload = (await request.json()) as StartChatPayload;

    let conversationId: string;

    if (payload.type === "direct") {
      conversationId = await startDirectConversation(supabase, currentUser, payload.targetUserId);
    } else {
      conversationId = await startOrganizationConversation(
        supabase,
        currentUser,
        payload.organizationId,
      );
    }

    return NextResponse.json({ conversationId });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to start conversation.",
      },
      { status: 400 },
    );
  }
}
