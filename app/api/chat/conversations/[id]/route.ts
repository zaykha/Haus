import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireWorkspaceUser(request);
    if (auth instanceof Response) {
      return auth;
    }

    const { supabase, user } = auth;
    const { id } = await context.params;

    const { data: participantRow, error: participantError } = await supabase
      .from("chat_conversation_participants")
      .select("id")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (participantError) {
      throw new Error(participantError.message);
    }

    if (!participantRow) {
      return NextResponse.json({ error: "Not allowed to delete this conversation." }, { status: 403 });
    }

    const { data: messageRows, error: messageRowsError } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", id);

    if (messageRowsError) {
      throw new Error(messageRowsError.message);
    }

    const messageIds = ((messageRows ?? []) as Array<{ id: string }>).map((row) => row.id);

    if (messageIds.length > 0) {
      const { error: reactionDeleteError } = await supabase
        .from("chat_message_reactions")
        .delete()
        .in("message_id", messageIds);

      if (reactionDeleteError) {
        throw new Error(reactionDeleteError.message);
      }

      const { error: messageDeleteError } = await supabase
        .from("chat_messages")
        .delete()
        .eq("conversation_id", id);

      if (messageDeleteError) {
        throw new Error(messageDeleteError.message);
      }
    }

    const { error: participantDeleteError } = await supabase
      .from("chat_conversation_participants")
      .delete()
      .eq("conversation_id", id);

    if (participantDeleteError) {
      throw new Error(participantDeleteError.message);
    }

    const { error: conversationDeleteError } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", id);

    if (conversationDeleteError) {
      throw new Error(conversationDeleteError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete conversation.",
      },
      { status: 400 },
    );
  }
}
