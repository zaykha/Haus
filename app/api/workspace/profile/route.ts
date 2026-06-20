import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";

export async function PATCH(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
  const body = (await request.json()) as {
    avatarPath?: string | null;
  };

  const avatarPath = body.avatarPath?.trim() || null;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: avatarPath })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
