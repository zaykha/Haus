import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canAssignTask, canCreateTask } from "@/lib/permissions";
import { TaskManagerReviewStatus } from "@/lib/types";

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

async function updateProjectRequestStatusIfAllowed(
  supabase: any,
  projectId: string,
  nextStatus: "Waiting List" | "WIP" | "Pending Review" | "Complete",
) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, stage")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    return;
  }

  if (project.stage === "On Hold" || project.stage === nextStatus) {
    return;
  }

  await supabase
    .from("projects")
    .update({ stage: nextStatus })
    .eq("id", projectId);
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
  if (!canCreateTask(user.role) || !canAssignTask(user.role)) {
    return NextResponse.json({ error: "Only managers can create tasks" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    assigneeId?: string;
    status?: string;
    dueDate?: string;
    priority?: string;
    clientVisible?: boolean;
    managerReviewStatus?: TaskManagerReviewStatus;
  };

  if (!body.title?.trim() || !body.assigneeId || !body.dueDate || !body.priority) {
    return NextResponse.json({ error: "Missing required task fields" }, { status: 400 });
  }

  const { data: assignee } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", body.assigneeId)
    .maybeSingle();
  if (!assignee || assignee.role === "client") {
    return NextResponse.json({ error: "Tasks can only be assigned to internal staff" }, { status: 400 });
  }

  const { data: createdTask, error } = await supabase
    .from("tasks")
    .insert({
    project_id: id,
    title: body.title.trim(),
    assignee_id: body.assigneeId,
    status: body.status ?? "todo",
    due_date: body.dueDate,
    priority: body.priority,
    client_visible: body.clientVisible ?? false,
    manager_review_status: body.managerReviewStatus ?? "internal",
    })
    .select("id, title")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (createdTask) {
    await updateProjectRequestStatusIfAllowed(supabase, id, "WIP");
    await logProjectActivity(supabase, id, user.id, "task_created", `created task "${createdTask.title}"`);
  }

  return NextResponse.json({ ok: true });
}
