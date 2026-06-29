import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canManageProjects } from "@/lib/permissions";

function isIgnorableProjectActivityError(message: string | undefined) {
  return Boolean(
    message &&
      (message.includes('relation "project_activity" does not exist') ||
        message.includes('violates check constraint "project_activity_action_check"')),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;

  if (!canManageProjects(user.role)) {
    return NextResponse.json({ error: "Only managers can acknowledge project requests" }, { status: 403 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: owner, error: ownerError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", project.owner_id)
    .maybeSingle();

  if (ownerError) {
    return NextResponse.json({ error: ownerError.message }, { status: 500 });
  }

  if (!owner || owner.role !== "client") {
    return NextResponse.json({ ok: true });
  }

  const { data: activities, error: activityError } = await supabase
    .from("project_activity")
    .select("action, created_at")
    .eq("project_id", id)
    .in("action", ["project_created", "project_attention_acknowledged"])
    .order("created_at", { ascending: false });

  if (activityError && !isIgnorableProjectActivityError(activityError.message)) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

  const latestProjectCreatedAt =
    (activities ?? []).find((activity) => activity.action === "project_created")?.created_at ?? null;
  const latestAcknowledgedAt =
    (activities ?? []).find((activity) => activity.action === "project_attention_acknowledged")?.created_at ?? null;

  if (!latestProjectCreatedAt) {
    return NextResponse.json({ ok: true });
  }

  if (
    latestAcknowledgedAt &&
    new Date(latestAcknowledgedAt).getTime() >= new Date(latestProjectCreatedAt).getTime()
  ) {
    return NextResponse.json({ ok: true });
  }

  const { error: insertError } = await supabase.from("project_activity").insert({
    project_id: id,
    actor_id: user.id,
    action: "project_attention_acknowledged",
    message: "opened the new client project request",
  });

  if (insertError && !isIgnorableProjectActivityError(insertError.message)) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (insertError && isIgnorableProjectActivityError(insertError.message)) {
    console.warn("[projects:attention] skipped project activity log", {
      projectId: id,
      message: insertError.message,
    });
  }

  return NextResponse.json({ ok: true });
}
