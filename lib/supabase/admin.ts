import "server-only";
import { createClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/config";

export function getSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!appConfig.supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(appConfig.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
