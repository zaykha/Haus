import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import {
  canInviteUsers,
  canViewProject,
  getVisibleTasksForUser,
} from "@/lib/permissions";
import {
  ClientOrganization,
  Comment,
  Department,
  DemoState,
  FeedbackAction,
  FileVisibility,
  Invitation,
  InvitationStatus,
  Project,
  ProjectActivity,
  ProjectActivityAction,
  ProjectStage,
  ProjectStatus,
  Role,
  TaskManagerReviewStatus,
  TaskPriority,
  TaskStatus,
  User,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProfileRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar_path: string | null;
  company: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  created_at: string;
};

type ClientOrganizationLiaisonRecord = {
  profile_id: string;
  client_organization_id: string;
  is_primary: boolean;
};

type ClientOrganizationRecord = {
  id: string;
  name: string;
  type: "internal" | "external" | null;
  status: "active" | "inactive" | null;
  logo_url: string | null;
  brand_color: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
};

type DepartmentRecord = {
  id: string;
  name: string;
  created_at: string;
};

type InvitationRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  project_id: string | null;
  client_organization_id: string | null;
  token_hash: string | null;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_organizations?: { name: string } | { name: string }[] | null;
};

type ProjectRecord = {
  id: string;
  name: string;
  project_code: string | null;
  requested_date: string | null;
  department_name: string | null;
  project_request_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  project_type: string | null;
  priority_level: string | null;
  first_draft_date: string | null;
  final_deliverable_date: string | null;
  project_objective: string | null;
  project_brief: string | null;
  creative_advice: string | null;
  reference_attachment_url: string | null;
  client_organization_id: string | null;
  owner_id: string | null;
  description: string | null;
  category: string | null;
  stage: string | null;
  due_date: string | null;
  created_at: string;
};

type ProjectMemberRecord = {
  project_id: string;
  profile_id: string;
  role: Role;
};

type TaskRecord = {
  id: string;
  project_id: string;
  title: string;
  assignee_id: string | null;
  status: TaskStatus;
  due_date: string;
  priority: TaskPriority;
  completion_screenshot_url: string | null;
  client_visible: boolean;
  manager_review_status: TaskManagerReviewStatus;
  created_at: string;
};

type ProjectFileRecord = {
  id: string;
  project_id: string;
  title: string;
  version: string;
  file_url: string | null;
  uploaded_by: string;
  created_at: string;
  visibility: FileVisibility;
  notes: string;
};

type ProjectCommentRecord = {
  id: string;
  project_id: string;
  author_id: string;
  task_id: string | null;
  body: string;
  internal_only: boolean;
  created_at: string;
};

type ProjectFeedbackRecord = {
  id: string;
  project_id: string;
  author_id: string;
  task_id: string | null;
  action: FeedbackAction;
  body: string;
  rating: number | null;
  created_at: string;
};

type ProjectActivityRecord = {
  id: string;
  project_id: string;
  actor_id: string | null;
  task_id: string | null;
  action: ProjectActivityAction;
  message: string;
  created_at: string;
};

const defaultDepartments = [
  "Admin",
  "Audit",
  "Commercial",
  "Executive Office",
  "Finance",
  "Human Resource",
  "IT",
  "Legal",
  "Marketing",
  "Procurement",
  "R&D and Technical",
  "Sales",
  "Warehouse",
];

function toAppUser(profile: ProfileRecord, clientOrganizationIds: string[] = []): User {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    avatarPath: profile.avatar_path ?? null,
    company: profile.company ?? undefined,
    phone: profile.phone ?? undefined,
    jobTitle: profile.job_title ?? undefined,
    department: profile.department ?? undefined,
    clientOrganizationId: clientOrganizationIds[0] ?? null,
    clientOrganizationIds,
    createdAt: profile.created_at,
  };
}

function normalizeProjectStage(stage: string | null | undefined): ProjectStage {
  switch (stage) {
    case "Waiting List":
    case "WIP":
    case "Pending Review":
    case "Complete":
    case "Completed":
    case "On Hold":
      return stage === "Completed" ? "Complete" : stage;
    case "intake":
      return "Waiting List";
    case "concept":
    case "design":
      return "WIP";
    case "review":
      return "Pending Review";
    case "delivery":
      return "Complete";
    default:
      return "Waiting List";
  }
}

function normalizeProjectStatus(status: string | null | undefined): ProjectStatus {
  switch (status) {
    case "Waiting List":
    case "WIP":
      return "active";
    case "Pending Review":
      return "review";
    case "Complete":
      return "done";
    case "On Hold":
      return "revision";
    case "review":
      return "review";
    case "approved":
    case "done":
      return "done";
    case "revision":
      return "revision";
    case "active":
      return "active";
    default:
      return "active";
  }
}

function deriveProjectStageFromTasks(
  tasks: Project["tasks"],
  currentStage: string | null | undefined,
): ProjectStage {
  const normalizedCurrentStage = normalizeProjectStage(currentStage);

  if (normalizedCurrentStage === "On Hold") {
    return "On Hold";
  }

  if (tasks.length === 0) {
    return normalizedCurrentStage;
  }

  const allTodo = tasks.every((task) => task.status === "todo");
  if (allTodo) {
    return normalizedCurrentStage;
  }

  const allComplete = tasks.every((task) => task.status === "approved");
  if (allComplete) {
    return "Complete";
  }

  const hasPendingReviewTask = tasks.some(
    (task) =>
      task.status === "review" ||
      (task.status === "done" && task.managerReviewStatus === "internal"),
  );
  if (hasPendingReviewTask) {
    return "Pending Review";
  }

  return "WIP";
}

function isMissingRelationError(message: string | undefined) {
  return Boolean(message && message.includes('relation "project_activity" does not exist'));
}

function isMissingTaskIdColumnError(message: string | undefined) {
  return Boolean(
    message &&
      (message.includes("column project_comments.task_id does not exist") ||
        message.includes("column project_feedback.task_id does not exist") ||
        message.includes("column project_activity.task_id does not exist")),
  );
}

function isMissingDepartmentsTableError(message: string | undefined) {
  return Boolean(message && message.includes('relation "departments" does not exist'));
}

function isMissingClientOrganizationLiaisonsTableError(message: string | undefined) {
  return Boolean(message && message.includes('relation "client_organization_liaisons" does not exist'));
}

function getClientOrganizationName(
  organizationRelation: { name: string } | { name: string }[] | null | undefined,
) {
  if (Array.isArray(organizationRelation)) {
    return organizationRelation[0]?.name ?? null;
  }

  return organizationRelation?.name ?? null;
}

function toCurrentUser(authUser: User, profiles: User[]) {
  return profiles.find((profile) => profile.id === authUser.id) ?? authUser;
}

export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;

  const [
    departmentsResult,
    clientOrganizationsResult,
    profilesResult,
    projectsResult,
    clientLiaisonsResult,
  ] = await Promise.all([
    supabase.from("departments").select("id, name, created_at").order("name", { ascending: true }),
    supabase
      .from("client_organizations")
      .select("id, name, type, status, logo_url, brand_color, phone, address, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, email, name, role, avatar_path, company, phone, job_title, department, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select(
        "id, name, project_code, requested_date, department_name, project_request_name, contact_person, contact_number, project_type, priority_level, first_draft_date, final_deliverable_date, project_objective, project_brief, creative_advice, reference_attachment_url, client_organization_id, owner_id, description, category, stage, due_date, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_organization_liaisons")
      .select("profile_id, client_organization_id, is_primary")
      .is("deleted_at", null),
  ]);

  if (departmentsResult.error && !isMissingDepartmentsTableError(departmentsResult.error.message)) {
    return NextResponse.json({ error: departmentsResult.error.message }, { status: 500 });
  }

  if (clientOrganizationsResult.error) {
    return NextResponse.json({ error: clientOrganizationsResult.error.message }, { status: 500 });
  }

  if (profilesResult.error) {
    return NextResponse.json({ error: profilesResult.error.message }, { status: 500 });
  }

  if (projectsResult.error) {
    return NextResponse.json({ error: projectsResult.error.message }, { status: 500 });
  }

  if (
    clientLiaisonsResult.error &&
    !isMissingClientOrganizationLiaisonsTableError(clientLiaisonsResult.error.message)
  ) {
    return NextResponse.json({ error: clientLiaisonsResult.error.message }, { status: 500 });
  }

  const departments = isMissingDepartmentsTableError(departmentsResult.error?.message)
    ? defaultDepartments.map((name, index) => ({
        id: `default-${index + 1}`,
        name,
        created_at: new Date(0).toISOString(),
      }))
    : ((departmentsResult.data ?? []) as DepartmentRecord[]);
  const clientOrganizations = (clientOrganizationsResult.data ?? []) as ClientOrganizationRecord[];
  const profiles = (profilesResult.data ?? []) as ProfileRecord[];
  const projects = (projectsResult.data ?? []) as ProjectRecord[];
  const clientLiaisons = isMissingClientOrganizationLiaisonsTableError(clientLiaisonsResult.error?.message)
    ? []
    : ((clientLiaisonsResult.data ?? []) as ClientOrganizationLiaisonRecord[]);
  clientLiaisons.sort((left, right) => Number(right.is_primary) - Number(left.is_primary));
  const clientOrganizationIdsByProfileId = new Map<string, string[]>();
  for (const membership of clientLiaisons) {
    const current = clientOrganizationIdsByProfileId.get(membership.profile_id) ?? [];
    current.push(membership.client_organization_id);
    clientOrganizationIdsByProfileId.set(membership.profile_id, current);
  }
  const invitationsResult = canInviteUsers(user.role)
    ? await supabase
        .from("invitations")
        .select(
          "id, email, name, role, project_id, client_organization_id, token_hash, status, expires_at, accepted_at, created_by, created_at, updated_at, client_organizations(name)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (invitationsResult.error) {
    return NextResponse.json({ error: invitationsResult.error.message }, { status: 500 });
  }

  const invitations = (invitationsResult.data ?? []) as InvitationRecord[];
  const projectIds = projects.map((project) => project.id);

  const [membersResult, tasksResult, filesResult] = projectIds.length
    ? await Promise.all([
        supabase.from("project_members").select("project_id, profile_id, role").in("project_id", projectIds).is("deleted_at", null),
        supabase
          .from("tasks")
          .select(
            "id, project_id, title, assignee_id, status, due_date, priority, completion_screenshot_url, client_visible, manager_review_status, created_at",
          )
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_files")
          .select("id, project_id, title, version, file_url, uploaded_by, created_at, visibility, notes")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const commentsResult = projectIds.length
    ? await supabase
        .from("project_comments")
        .select("id, project_id, author_id, task_id, body, internal_only, created_at")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const fallbackCommentsResult =
    commentsResult.error && isMissingTaskIdColumnError(commentsResult.error.message) && projectIds.length
      ? await supabase
          .from("project_comments")
          .select("id, project_id, author_id, body, internal_only, created_at")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : null;

  const feedbackResult = projectIds.length
    ? await supabase
        .from("project_feedback")
        .select("id, project_id, author_id, task_id, action, body, rating, created_at")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const fallbackFeedbackResult =
    feedbackResult.error && isMissingTaskIdColumnError(feedbackResult.error.message) && projectIds.length
      ? await supabase
          .from("project_feedback")
          .select("id, project_id, author_id, action, body, rating, created_at")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : null;

  const activityResult = projectIds.length
    ? await supabase
        .from("project_activity")
        .select("id, project_id, actor_id, task_id, action, message, created_at")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const fallbackActivityResult =
    activityResult.error && isMissingTaskIdColumnError(activityResult.error.message) && projectIds.length
      ? await supabase
          .from("project_activity")
          .select("id, project_id, actor_id, action, message, created_at")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : null;

  if (membersResult.error) {
    return NextResponse.json({ error: membersResult.error.message }, { status: 500 });
  }

  if (tasksResult.error) {
    return NextResponse.json({ error: tasksResult.error.message }, { status: 500 });
  }

  if (filesResult.error) {
    return NextResponse.json({ error: filesResult.error.message }, { status: 500 });
  }

  if (commentsResult.error && !fallbackCommentsResult) {
    return NextResponse.json({ error: commentsResult.error.message }, { status: 500 });
  }

  if (fallbackCommentsResult?.error) {
    return NextResponse.json({ error: fallbackCommentsResult.error.message }, { status: 500 });
  }

  if (feedbackResult.error && !fallbackFeedbackResult) {
    return NextResponse.json({ error: feedbackResult.error.message }, { status: 500 });
  }

  if (fallbackFeedbackResult?.error) {
    return NextResponse.json({ error: fallbackFeedbackResult.error.message }, { status: 500 });
  }

  if (
    activityResult.error &&
    !fallbackActivityResult &&
    !isMissingRelationError(activityResult.error.message)
  ) {
    return NextResponse.json({ error: activityResult.error.message }, { status: 500 });
  }

  if (fallbackActivityResult?.error && !isMissingRelationError(fallbackActivityResult.error.message)) {
    return NextResponse.json({ error: fallbackActivityResult.error.message }, { status: 500 });
  }

  const members = (membersResult.data ?? []) as ProjectMemberRecord[];
  const tasks = (tasksResult.data ?? []) as TaskRecord[];
  const files = (filesResult.data ?? []) as ProjectFileRecord[];
  const comments = (
    fallbackCommentsResult?.data ??
    commentsResult.data ??
    []
  ) as ProjectCommentRecord[];
  const feedback = (
    fallbackFeedbackResult?.data ??
    feedbackResult.data ??
    []
  ) as ProjectFeedbackRecord[];
  const resolvedActivityError = fallbackActivityResult?.error ?? activityResult.error;
  const activities = isMissingRelationError(resolvedActivityError?.message)
    ? []
    : (((fallbackActivityResult?.data ?? activityResult.data) ?? []) as ProjectActivityRecord[]);

  const staffIdsByProject = new Map<string, string[]>();
  const tasksByProject = new Map<string, Project["tasks"]>();
  const filesByProject = new Map<string, Project["files"]>();
  const commentsByProject = new Map<string, Project["comments"]>();
  const feedbackByProject = new Map<string, Project["feedback"]>();
  const activityByProject = new Map<string, Project["activities"]>();

  for (const membership of members) {
    if (membership.role === "client") {
      continue;
    }

    const current = staffIdsByProject.get(membership.project_id) ?? [];
    current.push(membership.profile_id);
    staffIdsByProject.set(membership.project_id, current);
  }

  for (const task of tasks) {
    const current = tasksByProject.get(task.project_id) ?? [];
    current.push({
      id: task.id,
      title: task.title,
      assigneeId: task.assignee_id,
      status: task.status,
      dueDate: task.due_date,
      createdAt: task.created_at,
      priority: task.priority,
      completionScreenshotUrl: task.completion_screenshot_url,
      clientVisible: task.client_visible,
      managerReviewStatus: task.manager_review_status,
    });
    tasksByProject.set(task.project_id, current);
  }

  for (const file of files) {
    const current = filesByProject.get(file.project_id) ?? [];
    current.push({
      id: file.id,
      title: file.title,
      version: file.version,
      uploadedBy: file.uploaded_by,
      createdAt: file.created_at,
      visibility: file.visibility,
      notes: file.notes,
    });
    filesByProject.set(file.project_id, current);
  }

  for (const comment of comments) {
    const current = commentsByProject.get(comment.project_id) ?? [];
    current.push({
      id: comment.id,
      authorId: comment.author_id,
      taskId: comment.task_id,
      body: comment.body,
      internalOnly: comment.internal_only,
      createdAt: comment.created_at,
    } satisfies Comment);
    commentsByProject.set(comment.project_id, current);
  }

  for (const item of feedback) {
    const current = feedbackByProject.get(item.project_id) ?? [];
    current.push({
      id: item.id,
      authorId: item.author_id,
      taskId: item.task_id,
      action: item.action,
      body: item.body,
      rating: item.rating,
      createdAt: item.created_at,
    });
    feedbackByProject.set(item.project_id, current);
  }

  for (const item of activities) {
    const current = activityByProject.get(item.project_id) ?? [];
    current.push({
      id: item.id,
      actorId: item.actor_id,
      taskId: item.task_id,
      action: item.action,
      message: item.message,
      createdAt: item.created_at,
    } satisfies ProjectActivity);
    activityByProject.set(item.project_id, current);
  }

  const users = profiles.map((profile) =>
    toAppUser(profile, clientOrganizationIdsByProfileId.get(profile.id) ?? []),
  );
  const currentUser = toCurrentUser(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company ?? undefined,
      phone: user.phone ?? undefined,
      jobTitle: user.jobTitle ?? undefined,
      department: user.department ?? undefined,
      clientOrganizationId: user.clientOrganizationId ?? null,
      clientOrganizationIds: user.clientOrganizationIds,
    },
    users,
  );

  const allProjects: Project[] = projects.map((project) => {
    const projectTasks = tasksByProject.get(project.id) ?? [];
    const workflowStage = deriveProjectStageFromTasks(projectTasks, project.stage);
    const workflowStatus = normalizeProjectStatus(workflowStage);

    return {
    id: project.id,
    name: project.name,
    createdAt: project.created_at,
    projectCode: project.project_code ?? null,
    requestedDate: project.requested_date ?? null,
    requestStatus: workflowStage,
    departmentName: project.department_name ?? null,
    projectRequestName: project.project_request_name ?? project.name,
    contactPerson: project.contact_person ?? null,
    contactNumber: project.contact_number ?? null,
    projectType: project.project_type ?? project.category ?? "",
    priorityLevel: project.priority_level ?? null,
    firstDraftDate: project.first_draft_date ?? null,
    finalDeliverableDate: project.final_deliverable_date ?? project.due_date ?? null,
    projectObjective: project.project_objective ?? null,
    projectBrief: project.project_brief ?? null,
    creativeAdvice: project.creative_advice ?? null,
    referenceAttachmentUrl: project.reference_attachment_url ?? null,
    clientOrganizationId: project.client_organization_id,
    primaryClientContactId: null,
    ownerId: project.owner_id ?? user.id,
    description: project.description ?? "",
    category: project.category ?? "",
    stage: workflowStage,
    status: workflowStatus,
    dueDate: project.due_date ?? "",
    staffIds: staffIdsByProject.get(project.id) ?? [],
    tasks: projectTasks,
    files: filesByProject.get(project.id) ?? [],
    comments: commentsByProject.get(project.id) ?? [],
    feedback: feedbackByProject.get(project.id) ?? [],
    activities: activityByProject.get(project.id) ?? [],
  };
  });

  const visibleProjects = allProjects
    .filter((project) => canViewProject(currentUser, project))
    .map((project) => ({
      ...project,
      tasks: getVisibleTasksForUser(currentUser, project),
      files:
        currentUser.role === "client"
          ? project.files.filter((file) => file.visibility === "client")
          : project.files,
      comments:
        currentUser.role === "client"
          ? project.comments.filter((comment) => !comment.internalOnly)
          : project.comments,
    }));

  const nextState: DemoState = {
    departments: departments.map(
      (department): Department => ({
        id: department.id,
        name: department.name,
        createdAt: department.created_at,
      }),
    ),
    clientOrganizations: clientOrganizations.map(
      (organization): ClientOrganization => ({
        id: organization.id,
        name: organization.name,
        type: organization.type ?? undefined,
        status: organization.status ?? undefined,
        logoUrl: organization.logo_url ?? undefined,
        brandColor: organization.brand_color ?? undefined,
        phone: organization.phone ?? undefined,
        address: organization.address ?? undefined,
        createdAt: organization.created_at,
      }),
    ),
    users,
    invitations: invitations.map(
      (invitation): Invitation => ({
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        projectId: invitation.project_id,
        clientOrganizationId: invitation.client_organization_id,
        clientOrganizationName: getClientOrganizationName(invitation.client_organizations),
        tokenHash: invitation.token_hash ?? "",
        status: invitation.status,
        expiresAt: invitation.expires_at,
        acceptedAt: invitation.accepted_at,
        createdBy: invitation.created_by,
        createdAt: invitation.created_at,
        updatedAt: invitation.updated_at,
      }),
    ),
    projects: visibleProjects,
  };

  return NextResponse.json(nextState, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
