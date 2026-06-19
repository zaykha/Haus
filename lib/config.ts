function normalizeSupabaseUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

export const appConfig = {
  name: "Haus",
  supabaseUrl: normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  projectReferencesBucket:
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REFERENCES_BUCKET || "project-references",
  taskDeliverablesBucket:
    process.env.NEXT_PUBLIC_SUPABASE_TASK_DELIVERABLES_BUCKET || "task-deliverables",
  userProfileImagesBucket:
    process.env.NEXT_PUBLIC_SUPABASE_USER_PROFILE_IMAGES_BUCKET || "user-profile-images",
  organizationProfileImagesBucket:
    process.env.NEXT_PUBLIC_SUPABASE_ORGANIZATION_PROFILE_IMAGES_BUCKET || "organization-profile-images",
};

export const isSupabaseConfigured = Boolean(
  appConfig.supabaseUrl && appConfig.supabaseAnonKey,
);

export const appMode = isSupabaseConfigured ? "supabase" : "mock";
