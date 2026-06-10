import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canAssignTask, canDeleteTask, canEditTask } from "@/lib/permissions";
import { TaskManagerReviewStatus, TaskPriority, TaskStatus } from "@/lib/types";

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "review", "approved"];
const TASK_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const TASK_REVIEW_STATUSES: TaskManagerReviewStatus[] = [
  "internal",
  "ready_for_client",
  "revision_requested",
];

function formatTaskStatus(status: TaskStatus) {
  switch (status) {
    case "todo":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "done":
      return "Done";
    case "review":
      return "Review";
    case "approved":
      return "Approved";
    default:
      return status;
  }
}

async function logProjectActivity(supabase: any, projectId: string, actorId: string, action: string, message: string) {
  const { error } = await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: actorId,
    action,
    message,
  });

  if (error && !error.message.includes('relation "project_activity" does not exist')) {
    throw error;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id, taskId } = await params;
  const { supabase, user } = auth;

  const body = (await request.json()) as {
    title?: string;
    assigneeId?: string;
    status?: string;
    dueDate?: string;
    priority?: string;
    completionScreenshotUrl?: string | null;
    clientVisible?: boolean;
    managerReviewStatus?: TaskManagerReviewStatus;
    activityNote?: string;
  };

  const { data: existingTask, error: existingTaskError } = await supabase
    .from("tasks")
    .select("id, project_id, title, status, assignee_id, completion_screenshot_url, client_visible, manager_review_status")
    .eq("id", taskId)
    .eq("project_id", id)
    .maybeSingle();

  if (existingTaskError) {
    return NextResponse.json({ error: existingTaskError.message }, { status: 500 });
  }

  if (!existingTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const canManageTask = canEditTask(user.role) && canAssignTask(user.role);
  const canUpdateOwnTask = user.role === "designer" && existingTask.assignee_id === user.id;

  if (!canManageTask && !canUpdateOwnTask) {
    return NextResponse.json({ error: "You do not have permission to update this task" }, { status: 403 });
  }

  if (canManageTask && body.title && body.assigneeId && body.status && body.dueDate && body.priority) {
    if (
      !TASK_STATUSES.includes(body.status as TaskStatus) ||
      !TASK_PRIORITIES.includes(body.priority as TaskPriority) ||
      (body.managerReviewStatus && !TASK_REVIEW_STATUSES.includes(body.managerReviewStatus))
    ) {
      return NextResponse.json({ error: "Invalid task values" }, { status: 400 });
    }

    const { data: assignee } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", body.assigneeId)
      .maybeSingle();
    if (!assignee || assignee.role === "client") {
      return NextResponse.json({ error: "Tasks can only be assigned to internal staff" }, { status: 400 });
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        title: body.title.trim(),
        assignee_id: body.assigneeId,
        status: body.status,
        due_date: body.dueDate,
        priority: body.priority,
        completion_screenshot_url:
          body.status === "done"
            ? body.completionScreenshotUrl ?? existingTask.completion_screenshot_url
            : null,
        client_visible: body.clientVisible ?? existingTask.client_visible,
        manager_review_status: body.managerReviewStatus ?? existingTask.manager_review_status,
      })
      .eq("id", taskId)
      .eq("project_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nextStatus = body.status as TaskStatus;
    const nextReviewStatus = body.managerReviewStatus ?? existingTask.manager_review_status;
    const revisionNote = body.activityNote?.trim();

    if (
      existingTask.manager_review_status !== "ready_for_client" &&
      nextReviewStatus === "ready_for_client" &&
      nextStatus === "review"
    ) {
      await logProjectActivity(
        supabase,
        id,
        user.id,
        "task_submitted",
        `submitted task "${body.title.trim()}" to client review`,
      );
    } else if (
      existingTask.manager_review_status !== "revision_requested" &&
      nextReviewStatus === "revision_requested"
    ) {
      await logProjectActivity(
        supabase,
        id,
        user.id,
        "task_revision_requested",
        revisionNote
          ? `requested revision on task "${body.title.trim()}": ${revisionNote}`
          : `requested revision on task "${body.title.trim()}"`,
      );
    } else if (existingTask.status !== "approved" && nextStatus === "approved") {
      await logProjectActivity(
        supabase,
        id,
        user.id,
        "task_approved",
        `approved task "${body.title.trim()}"`,
      );
    } else if (existingTask.status !== nextStatus) {
      await logProjectActivity(
        supabase,
        id,
        user.id,
        "task_status_changed",
        `changed task "${body.title.trim()}" to ${formatTaskStatus(nextStatus)}`,
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (!body.status || !TASK_STATUSES.includes(body.status as TaskStatus)) {
    return NextResponse.json({ error: "Task status is required" }, { status: 400 });
  }

  const nextScreenshotUrl =
    body.status === "done"
      ? (body.completionScreenshotUrl ?? existingTask.completion_screenshot_url)
      : null;

  if (body.status === "done" && !nextScreenshotUrl) {
    return NextResponse.json(
      { error: "A completion screenshot is required before marking this task complete" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: body.status,
      completion_screenshot_url: nextScreenshotUrl,
    })
    .eq("id", taskId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextStatus = body.status as TaskStatus;
  if (existingTask.status !== nextStatus) {
    await logProjectActivity(
      supabase,
      id,
      user.id,
      "task_status_changed",
      `changed task "${existingTask.title}" to ${formatTaskStatus(nextStatus)}`,
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { taskId } = await params;
  const { supabase, user } = auth;
  if (!canDeleteTask(user.role)) {
    return NextResponse.json({ error: "Only managers can delete tasks" }, { status: 403 });
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
