import { cleanupChatReferencesForProfile } from "@/lib/chat-profile-cleanup";

type AuthUserListEntry = {
  id: string;
  email?: string | null;
};

export async function deleteQueuedStorage(supabase: any, entityTable: string, entityId: string) {
  const { data: queueRows, error: queueError } = await supabase
    .from("storage_cleanup_queue")
    .select("id, bucket_name, file_path")
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);

  if (queueError) {
    throw new Error(queueError.message);
  }

  const rows = queueRows ?? [];
  if (rows.length > 0) {
    const rowsByBucket = new Map<string, string[]>();
    for (const row of rows) {
      const current = rowsByBucket.get(row.bucket_name) ?? [];
      current.push(row.file_path);
      rowsByBucket.set(row.bucket_name, current);
    }

    for (const [bucketName, filePaths] of rowsByBucket.entries()) {
      const { error: storageError } = await supabase.storage.from(bucketName).remove(filePaths);
      if (storageError) {
        throw new Error(storageError.message);
      }
    }
  }

  const { error: deleteQueueError } = await supabase
    .from("storage_cleanup_queue")
    .delete()
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);

  if (deleteQueueError) {
    throw new Error(deleteQueueError.message);
  }
}

export async function deleteAuthUserIfPresent(supabase: any, userId: string) {
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error && !error.message.toLowerCase().includes("not found")) {
    throw new Error(error.message);
  }
}

export async function findAuthUserByEmail(supabase: any, email: string) {
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const users = (data?.users ?? []) as AuthUserListEntry[];
    const match = users.find((user) => user.email?.trim().toLowerCase() === email);
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function purgeArchivedProfile(
  supabase: any,
  {
    profileId,
    actingUserId,
    deleteReason,
    email,
  }: {
    profileId: string;
    actingUserId: string;
    deleteReason: "liaison_deleted" | "team_member_deleted";
    email?: string | null;
  },
) {
  await cleanupChatReferencesForProfile(supabase, profileId, actingUserId);

  if (deleteReason === "liaison_deleted") {
    const operations = await Promise.all([
      supabase
        .from("client_organization_liaisons")
        .delete()
        .eq("profile_id", profileId)
        .eq("delete_reason", "liaison_deleted"),
      email
        ? supabase.from("invitations").delete().eq("email", email).eq("delete_reason", "liaison_deleted")
        : Promise.resolve({ error: null }),
      supabase.from("profiles").delete().eq("id", profileId).eq("delete_reason", "liaison_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      throw new Error(error.message);
    }

    await deleteAuthUserIfPresent(supabase, profileId);
    return;
  }

  const { data: taskRows, error: taskRowsError } = await supabase
    .from("tasks")
    .select("id")
    .eq("assignee_id", profileId)
    .eq("delete_reason", "team_member_deleted");

  if (taskRowsError) {
    throw new Error(taskRowsError.message);
  }

  await deleteQueuedStorage(supabase, "profiles", profileId);

  const taskIds = ((taskRows ?? []) as Array<{ id: string }>).map((task) => task.id);

  if (taskIds.length > 0) {
    const secondaryOperations = await Promise.all([
      supabase.from("project_comments").delete().in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_feedback").delete().in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_activity").delete().in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
    ]);

    const secondaryError = secondaryOperations.find((operation) => operation.error)?.error;
    if (secondaryError) {
      throw new Error(secondaryError.message);
    }
  }

  const primaryOperations = await Promise.all([
    supabase.from("project_members").delete().eq("profile_id", profileId).eq("delete_reason", "team_member_deleted"),
    supabase.from("tasks").delete().eq("assignee_id", profileId).eq("delete_reason", "team_member_deleted"),
    supabase.from("project_files").delete().eq("uploaded_by", profileId).eq("delete_reason", "team_member_deleted"),
    supabase.from("project_comments").delete().eq("author_id", profileId).eq("delete_reason", "team_member_deleted"),
    supabase.from("project_feedback").delete().eq("author_id", profileId).eq("delete_reason", "team_member_deleted"),
    email
      ? supabase.from("invitations").delete().eq("email", email).eq("delete_reason", "team_member_deleted")
      : Promise.resolve({ error: null }),
    supabase.from("profiles").delete().eq("id", profileId).eq("delete_reason", "team_member_deleted"),
  ]);

  const primaryError = primaryOperations.find((operation) => operation.error)?.error;
  if (primaryError) {
    throw new Error(primaryError.message);
  }

  await deleteAuthUserIfPresent(supabase, profileId);
}
