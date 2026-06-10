import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canDeleteProject, canEditProject } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;
  if (!canEditProject(user.role)) {
    return NextResponse.json({ error: "Only managers can edit projects" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    imageUrl?: string | null;
    description?: string;
    category?: string;
    dueDate?: string;
    clientId?: string;
  };

  if (body.clientId) {
    const { data: client } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", body.clientId)
      .maybeSingle();
    if (!client || client.role !== "client") {
      return NextResponse.json({ error: "Project client must be a client user" }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({
      name: body.name?.trim(),
      image_url: body.imageUrl?.trim() ? body.imageUrl.trim() : null,
      description: body.description?.trim(),
      category: body.category?.trim(),
      due_date: body.dueDate,
      client_id: body.clientId || null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;
  if (!canDeleteProject(user.role)) {
    return NextResponse.json({ error: "Only managers can delete projects" }, { status: 403 });
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
