export async function cleanupChatReferencesForProfile(
  supabase: any,
  profileId: string,
  fallbackCreatedById: string,
) {
  const { data: sentMessages, error: sentMessagesError } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("sender_id", profileId);

  if (sentMessagesError) {
    throw new Error(sentMessagesError.message);
  }

  const sentMessageIds = ((sentMessages ?? []) as Array<{ id: string }>).map((message) => message.id);

  if (sentMessageIds.length > 0) {
    const { error: deleteSentMessageReactionsError } = await supabase
      .from("chat_message_reactions")
      .delete()
      .in("message_id", sentMessageIds);

    if (deleteSentMessageReactionsError) {
      throw new Error(deleteSentMessageReactionsError.message);
    }
  }

  const operations = await Promise.all([
    sentMessageIds.length > 0
      ? supabase.from("chat_messages").delete().in("id", sentMessageIds)
      : Promise.resolve({ error: null }),
    supabase.from("chat_message_reactions").delete().eq("user_id", profileId),
    supabase.from("chat_conversation_participants").delete().eq("user_id", profileId),
    supabase.from("chat_conversations").update({ created_by: fallbackCreatedById }).eq("created_by", profileId),
  ]);

  const error = operations.find((operation) => operation.error)?.error;
  if (error) {
    throw new Error(error.message);
  }
}
