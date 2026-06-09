import { createClient } from "@supabase/supabase-js";
import { appConfig, isSupabaseConfigured } from "@/lib/config";

let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(appConfig.supabaseUrl!, appConfig.supabaseAnonKey!);
  }

  return browserClient;
}
