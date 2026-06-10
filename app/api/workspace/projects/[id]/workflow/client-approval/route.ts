import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";

/**
 * Client -> server workflow transition endpoint.
 * Called by the client review popup *before* closing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id: projectId } = await params;
  const { supabase, user } = auth;

  if (user.role !== "client") {
    return NextResponse.json({ error: "Only clients can submit review decisions" }, { status: 403 });
  }

  const body = (await request.json()) as {
    taskId?: string;
    decision?: "approve" | "request_revision";
    revisionComment?: string;
  };

  if (!body.taskId || !body.decision) {
    return NextResponse.json({ error: "taskId and decision are required" }, { status: 400 });
  }

  const taskId = body.taskId;
  const decision = body.decision;
  const revisionComment = body.revisionComment?.trim();
  if (decision !== "approve" && decision !== "request_revision") {
  return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
  }

  if (decision === "request_revision" && !revisionComment) {
    return NextResponse.json(
        { error: "Please explain what needs to be revised." },
        { status: 400 },
    );
    }
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, project_id, title, status, client_visible, manager_review_status")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Enforce that the task is currently in a client-reviewable state.
  if (task.status !== "review") {
    return NextResponse.json(
        { error: "Task is not available for client review" },
        { status: 400 },
    );
    }

    if (!task.client_visible) {
    return NextResponse.json(
        { error: "Task is not visible to the client" },
        { status: 403 },
    );
    }

 const nextTaskStatus = decision === "approve" ? "approved" : "in_progress";

    const nextManagerReviewStatus =
    decision === "approve" ? "internal" : ("revision_requested" as const);

    const { error: taskUpdateError } = await supabase
    .from("tasks")
    .update({
        status: nextTaskStatus,
        manager_review_status: nextManagerReviewStatus,
    })
    .eq("id", taskId)
    .eq("project_id", projectId);

  if (taskUpdateError) {
    return NextResponse.json({ error: taskUpdateError.message }, { status: 500 });
  }

  // Update project workflow status to reflect the decision.
  const nextProjectStatus = decision === "approve" ? "approved" : "revision";
  const nextProjectStage = decision === "approve" ? "review" : "review";

  const { error: projectUpdateError } = await supabase
    .from("projects")
    .update({ status: nextProjectStatus, stage: nextProjectStage })
    .eq("id", projectId);

  if (projectUpdateError) {
    return NextResponse.json({ error: projectUpdateError.message }, { status: 500 });
  }

  // Activity logging (best-effort; do not fail the whole request if activity table isn't ready).
  const action = decision === "approve" ? "client_approved" : "client_requested_revision";
  const message =
    decision === "approve"
      ? `client approved task "${task.title}"`
      : `client requested revision on task "${task.title}"${revisionComment ? `: ${revisionComment}` : ""}`;

  const { error: activityError } = await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: user.id,
    action,
    message,
  });

  if (activityError && !activityError.message?.includes('relation "project_activity" does not exist')) {
    // Keep parity with other endpoints.
  }

  return NextResponse.json({ ok: true });
}

