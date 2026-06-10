import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canCreateProject } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
  if (!canCreateProject(user.role)) {
    return NextResponse.json({ error: "Only managers can create projects" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    imageUrl?: string | null;
    description?: string;
    category?: string;
    dueDate?: string;
    clientId?: string;
  };

  if (!body.name?.trim() || !body.description?.trim() || !body.category?.trim() || !body.dueDate) {
    return NextResponse.json({ error: "Missing required project fields" }, { status: 400 });
  }

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

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: body.name.trim(),
      image_url: body.imageUrl?.trim() ? body.imageUrl.trim() : null,
      client_id: body.clientId || null,
      owner_id: user.id,
      description: body.description.trim(),
      category: body.category.trim(),
      stage: "intake",
      status: "active",
      due_date: body.dueDate,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to create project" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
