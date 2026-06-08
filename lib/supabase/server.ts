import { createClient } from "@supabase/supabase-js";
import { appConfig, isSupabaseConfigured } from "@/lib/config";

export function getSupabaseServerClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  return createClient(appConfig.supabaseUrl!, appConfig.supabaseAnonKey!);
}
