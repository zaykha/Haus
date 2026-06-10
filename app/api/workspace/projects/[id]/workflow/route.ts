import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canUpdateProjectWorkflow } from "@/lib/permissions";

function formatStatus(value: string) {
  switch (value) {
    case "active":
      return "Active";
    case "review":
      return "Review";
    case "approved":
      return "Approved";
    case "revision":
      return "Revision";
    case "done":
      return "Done";
    default:
      return value;
  }
}

function formatStage(value: string) {
  switch (value) {
    case "intake":
      return "Intake";
    case "concept":
      return "Concept";
    case "design":
      return "Design";
    case "review":
      return "Review";
    case "delivery":
      return "Delivery";
    default:
      return value;
  }
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
  if (!canUpdateProjectWorkflow(user.role)) {
    return NextResponse.json({ error: "Only managers can update project workflow" }, { status: 403 });
  }

  const body = (await request.json()) as { status?: string; stage?: string };
  if (!body.status || !body.stage) {
    return NextResponse.json({ error: "Status and stage are required" }, { status: 400 });
  }

  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("status, stage")
    .eq("id", id)
    .maybeSingle();

  if (existingProjectError) {
    return NextResponse.json({ error: existingProjectError.message }, { status: 500 });
  }

  const { error } = await supabase.from("projects").update({ status: body.status, stage: body.stage }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existingProject && (existingProject.status !== body.status || existingProject.stage !== body.stage)) {
    const { error: activityError } = await supabase.from("project_activity").insert({
      project_id: id,
      actor_id: user.id,
      action: "workflow_updated",
      message: `updated workflow to ${formatStatus(body.status)} / ${formatStage(body.stage)}`,
    });

    if (activityError && !activityError.message.includes('relation "project_activity" does not exist')) {
      return NextResponse.json({ error: activityError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
