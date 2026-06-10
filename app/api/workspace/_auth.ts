import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role } from "@/lib/types";

export type WorkspaceProfile = {
  id: string;
  email: string;
  name: string;
  role: Role;
  company: string | null;
};

export async function requireWorkspaceUser(request: NextRequest): Promise<
  { supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>; user: WorkspaceProfile } | Response
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, name, role, company")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  return { supabase, user: profile as WorkspaceProfile };
}
