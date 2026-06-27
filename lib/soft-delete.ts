import { appConfig } from "@/lib/config";

export function getStoragePathFromPublicUrl(value: string, bucket: string) {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return null;
  }

  const supabaseUrl = appConfig.supabaseUrl;
  if (!supabaseUrl) {
    return null;
  }

  try {
    const assetUrl = new URL(value);
    const projectUrl = new URL(supabaseUrl);
    if (assetUrl.origin !== projectUrl.origin) {
      return null;
    }

    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    if (!assetUrl.pathname.startsWith(publicPrefix)) {
      return null;
    }

    return decodeURIComponent(assetUrl.pathname.slice(publicPrefix.length));
  } catch {
    return null;
  }
}

export function buildSoftDeletePatch(userId: string, reason: string) {
  return {
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
    delete_reason: reason,
  };
}

export function buildRestorePatch() {
  return {
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  };
}

export function buildPurgeAfterDate(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function queueStorageCleanup(
  supabase: any,
  entries: Array<{
    bucketName: string;
    filePath: string;
    entityTable: string;
    entityId: string;
    purgeAfter?: string;
  }>,
) {
  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from("storage_cleanup_queue").insert(
    entries.map((entry) => ({
      bucket_name: entry.bucketName,
      file_path: entry.filePath,
      entity_table: entry.entityTable,
      entity_id: entry.entityId,
      purge_after: entry.purgeAfter ?? buildPurgeAfterDate(),
    })),
  );

  if (error) {
    throw new Error(error.message);
  }
}
