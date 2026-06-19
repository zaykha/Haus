import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canUpdateProjectWorkflow } from "@/lib/permissions";

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

  const body = (await request.json()) as { stage?: string };
  if (!body.stage) {
    return NextResponse.json({ error: "Stage is required" }, { status: 400 });
  }

  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("stage")
    .eq("id", id)
    .maybeSingle();

  if (existingProjectError) {
    return NextResponse.json({ error: existingProjectError.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("projects")
    .update({ stage: body.stage })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existingProject && existingProject.stage !== body.stage) {
    const { error: activityError } = await supabase.from("project_activity").insert({
      project_id: id,
      actor_id: user.id,
      action: "workflow_updated",
      message: `updated project status to ${body.stage}`,
    });

    if (activityError && !activityError.message.includes('relation "project_activity" does not exist')) {
      return NextResponse.json({ error: activityError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
