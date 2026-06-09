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
  projectImagesBucket: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_IMAGES_BUCKET || "project-images",
};

export const isSupabaseConfigured = Boolean(
  appConfig.supabaseUrl && appConfig.supabaseAnonKey,
);

export const appMode = isSupabaseConfigured ? "supabase" : "mock";
