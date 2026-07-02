type ConversationRow = {
  id: string;
  type: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
};

async function deleteConversationSet(supabase: any, conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return;
  }

  const { data: messageRows, error: messageRowsError } = await supabase
    .from("chat_messages")
    .select("id")
    .in("conversation_id", conversationIds);

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
      .in("conversation_id", conversationIds);

    if (messageDeleteError) {
      throw new Error(messageDeleteError.message);
    }
  }

  const { error: participantDeleteError } = await supabase
    .from("chat_conversation_participants")
    .delete()
    .in("conversation_id", conversationIds);

  if (participantDeleteError) {
    throw new Error(participantDeleteError.message);
  }

  const { error: conversationDeleteError } = await supabase
    .from("chat_conversations")
    .delete()
    .in("id", conversationIds);

  if (conversationDeleteError) {
    throw new Error(conversationDeleteError.message);
  }
}

export async function cleanupChatReferencesForProfile(
  supabase: any,
  profileId: string,
  fallbackCreatedById: string,
) {
  const { data: participantRows, error: participantRowsError } = await supabase
    .from("chat_conversation_participants")
    .select("conversation_id")
    .eq("user_id", profileId);

  if (participantRowsError) {
    throw new Error(participantRowsError.message);
  }

  const participantConversationIds = Array.from(
    new Set(
      ((participantRows ?? []) as Array<{ conversation_id: string }>).map((row) => row.conversation_id),
    ),
  );

  const { data: conversationRows, error: conversationRowsError } = participantConversationIds.length
    ? await supabase
        .from("chat_conversations")
        .select("id,type")
        .in("id", participantConversationIds)
    : { data: [], error: null };

  if (conversationRowsError) {
    throw new Error(conversationRowsError.message);
  }

  const directConversationIds = ((conversationRows ?? []) as ConversationRow[])
    .filter((conversation) => conversation.type === "internal_direct")
    .map((conversation) => conversation.id);

  await deleteConversationSet(supabase, directConversationIds);

  const preservedConversationIds = participantConversationIds.filter(
    (conversationId) => !directConversationIds.includes(conversationId),
  );

  const { data: sentMessages, error: sentMessagesError } = preservedConversationIds.length
    ? await supabase
        .from("chat_messages")
        .select("id,conversation_id")
        .eq("sender_id", profileId)
        .in("conversation_id", preservedConversationIds)
    : { data: [], error: null };

  if (sentMessagesError) {
    throw new Error(sentMessagesError.message);
  }

  const sentMessageIds = ((sentMessages ?? []) as MessageRow[]).map((message) => message.id);

  if (sentMessageIds.length > 0) {
    const { error: deleteSentMessageReactionsError } = await supabase
      .from("chat_message_reactions")
      .delete()
      .in("message_id", sentMessageIds);

    if (deleteSentMessageReactionsError) {
      throw new Error(deleteSentMessageReactionsError.message);
    }

    const { error: deleteSentMessagesError } = await supabase
      .from("chat_messages")
      .delete()
      .in("id", sentMessageIds);

    if (deleteSentMessagesError) {
      throw new Error(deleteSentMessagesError.message);
    }
  }

  const operations = await Promise.all([
    supabase.from("chat_message_reactions").delete().eq("user_id", profileId),
    supabase.from("chat_conversation_participants").delete().eq("user_id", profileId),
    preservedConversationIds.length > 0
      ? supabase
          .from("chat_conversations")
          .update({ created_by: fallbackCreatedById })
          .eq("created_by", profileId)
          .in("id", preservedConversationIds)
      : Promise.resolve({ error: null }),
  ]);

  const error = operations.find((operation) => operation.error)?.error;
  if (error) {
    throw new Error(error.message);
  }
}
