"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SupabaseClient, User as AuthUser } from "@supabase/supabase-js";
import { initialAppState } from "@/lib/mock-data";
import { appMode } from "@/lib/config";
import {
  Comment,
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
  TaskPriority,
  TaskManagerReviewStatus,
  Role,
  TaskStatus,
  User,
} from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canAssignTask,
  canCreateProject,
  canCreateTask,
  canDeleteClient,
  canDeleteProject,
  canDeleteTask,
  canDeleteTeamMember,
  canEditProject,
  canEditTask,
  canInviteUsers,
  canUpdateTeamRole,
  canUpdateTaskStatus as canUserUpdateTaskStatus,
  canUpdateProjectWorkflow,
} from "@/lib/permissions";

interface AppStateContextValue {
  mode: "mock" | "supabase";
  ready: boolean;
  state: DemoState;
  user: User | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  createProject: (project: {
    name: string;
    imageUrl?: string | null;
    description: string;
    category: string;
    dueDate: string;
    clientId: string;
  }) => Promise<Project>;
  updateProject: (
    projectId: string,
    project: {
      name: string;
      imageUrl?: string | null;
      description: string;
      category: string;
      dueDate: string;
      clientId: string;
    },
  ) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  updateTeamMemberRole: (memberId: string, role: Exclude<Role, "client">) => Promise<void>;
  deleteTeamMember: (memberId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  updateProjectWorkflow: (
    projectId: string,
    status: ProjectStatus,
    stage: ProjectStage,
  ) => Promise<void>;
  createTask: (
    projectId: string,
    task: {
      title: string;
      assigneeId: string;
      status?: TaskStatus;
      dueDate: string;
      priority: TaskPriority;
      clientVisible?: boolean;
      managerReviewStatus?: TaskManagerReviewStatus;
    },
  ) => Promise<void>;
  updateTask: (
    projectId: string,
    taskId: string,
    task: {
      title: string;
      assigneeId: string;
      status: TaskStatus;
      dueDate: string;
      priority: TaskPriority;
      clientVisible?: boolean;
      managerReviewStatus?: TaskManagerReviewStatus;
      activityNote?: string;
    },
  ) => Promise<void>;
  deleteTask: (projectId: string, taskId: string) => Promise<void>;
  addFile: (
    projectId: string,
    payload: { title: string; version: string; visibility: FileVisibility; notes: string },
  ) => Promise<void>;
  addComment: (projectId: string, payload: { body: string; internalOnly: boolean }) => Promise<void>;
  addFeedback: (
    projectId: string,
    payload: { action: FeedbackAction; body: string; rating?: number | null },
  ) => Promise<void>;
  updateTaskStatus: (
    projectId: string,
    taskId: string,
    payload: {
      status: "todo" | "in_progress" | "done" | "review" | "approved";
      completionScreenshotUrl?: string | null;
    },
  ) => Promise<void>;
  createInvitation: (payload: {
    name?: string;
    email: string;
    role: Role;
    projectId: string | null;
    expiresAt: string;
  }) => Promise<{ inviteLink: string; invitation: Invitation }>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  getInvitationByToken: (token: string) => Invitation | null;
  acceptInvitation: (payload: {
    token: string;
    name: string;
    password: string;
  }) => Promise<{ user: User | null }>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

type ProfileRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  company: string | null;
  created_at: string;
};

type ProjectRecord = {
  id: string;
  name: string;
  image_url: string | null;
  client_id: string | null;
  owner_id: string | null;
  description: string | null;
  category: string | null;
  stage: string | null;
  status: string | null;
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
  assignee_id: string;
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
  body: string;
  internal_only: boolean;
  created_at: string;
};

type ProjectFeedbackRecord = {
  id: string;
  project_id: string;
  author_id: string;
  action: FeedbackAction;
  body: string;
  rating: number | null;
  created_at: string;
};

type ProjectActivityRecord = {
  id: string;
  project_id: string;
  actor_id: string | null;
  action: ProjectActivityAction;
  message: string;
  created_at: string;
};

function generateToken() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll("-", "");
  }

  return `${Date.now()}${Math.random().toString(36).slice(2, 18)}`;
}

function deriveInviteName(email: string, providedName?: string) {
  const trimmed = providedName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const localPart = email.split("@")[0] ?? "User";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function deriveInvitationStatus(invitation: Invitation): InvitationStatus {
  if (invitation.status !== "pending") {
    return invitation.status;
  }

  return new Date(invitation.expiresAt).getTime() < Date.now() ? "expired" : "pending";
}

function ensureAuthorized(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
function getWorkspaceSupabase(): SupabaseClient {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  return supabase as unknown as SupabaseClient;
}
function ensureInternalAssignee(users: User[], assigneeId: string) {
  return users.some((candidate) => candidate.id === assigneeId && candidate.role !== "client");
}

function ensureClientUser(users: User[], clientId: string) {
  if (!clientId) {
    return true;
  }

  return users.some((candidate) => candidate.id === clientId && candidate.role === "client");
}

function isMissingRelationError(message: string | undefined) {
  return Boolean(message && message.includes('relation "project_activity" does not exist'));
}

function normalizeProjectStage(stage: string | null | undefined): ProjectStage {
  switch (stage) {
    case "concept":
    case "design":
    case "review":
    case "delivery":
      return stage;
    default:
      return "intake";
  }
}

function normalizeProjectStatus(status: string | null | undefined): ProjectStatus {
  switch (status) {
    case "review":
    case "approved":
    case "revision":
    case "done":
      return status;
    default:
      return "active";
  }
}

function toAppUser(profile: ProfileRecord): User {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    company: profile.company ?? undefined,
    createdAt: profile.created_at,
  };
}

async function fetchAuthUserProfile(authUser: AuthUser): Promise<User> {
  const supabase = getWorkspaceSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, company, created_at")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const profile = data as ProfileRecord | null;

  return {
    id: authUser.id,
    email: profile?.email ?? authUser.email ?? "",
    name:
      profile?.name ??
      ((authUser.user_metadata.name as string | undefined) ??
        authUser.email?.split("@")[0] ??
        "User"),
    role: profile?.role ?? ((authUser.user_metadata.role as Role | undefined) ?? "client"),
    company: profile?.company ?? undefined,
    createdAt: profile?.created_at,
  };
}

async function fetchRemoteInvitations(currentUser: User) {
  if (!canInviteUsers(currentUser.role)) {
    return [] as Invitation[];
  }

  const response = await fetch("/api/invitations/list", {
    headers: {
      "x-haus-user-id": currentUser.id,
      "x-haus-user-role": currentUser.role,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load invitations");
  }

  const payload = (await response.json()) as { invitations?: Invitation[] };
  return payload.invitations ?? [];
}

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Missing authenticated session");
  }

  return token;
}

async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

async function fetchWorkspaceState(currentUser: User): Promise<DemoState> {
  const supabase = getWorkspaceSupabase();

  const [
    profilesResult,
    projectsResult,
    invitations,
  ] = await Promise.all([
    supabase.from("profiles").select("id, email, name, role, company, created_at").order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, image_url, client_id, owner_id, description, category, stage, status, due_date, created_at")
      .order("created_at", { ascending: false }),
    fetchRemoteInvitations(currentUser),
  ]);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (projectsResult.error) {
    throw new Error(projectsResult.error.message);
  }

  const profiles = (profilesResult.data ?? []) as ProfileRecord[];
  const projects = (projectsResult.data ?? []) as ProjectRecord[];
  const projectIds = projects.map((project) => project.id);

  const [
    membersResult,
    tasksResult,
    filesResult,
    commentsResult,
    feedbackResult,
    activityResult,
  ] = projectIds.length
    ? await Promise.all([
        supabase
          .from("project_members")
          .select("project_id, profile_id, role")
          .in("project_id", projectIds),
        supabase
          .from("tasks")
          .select("id, project_id, title, assignee_id, status, due_date, priority, completion_screenshot_url, client_visible, manager_review_status, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_files")
          .select("id, project_id, title, version, file_url, uploaded_by, created_at, visibility, notes")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_comments")
          .select("id, project_id, author_id, body, internal_only, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_feedback")
          .select("id, project_id, author_id, action, body, rating, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_activity")
          .select("id, project_id, actor_id, action, message, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  if (tasksResult.error) {
    throw new Error(tasksResult.error.message);
  }

  if (filesResult.error) {
    throw new Error(filesResult.error.message);
  }

  if (commentsResult.error) {
    throw new Error(commentsResult.error.message);
  }

  if (feedbackResult.error) {
    throw new Error(feedbackResult.error.message);
  }

  if (activityResult.error && !isMissingRelationError(activityResult.error.message)) {
    throw new Error(activityResult.error.message);
  }

  const members = (membersResult.data ?? []) as ProjectMemberRecord[];
  const tasks = (tasksResult.data ?? []) as TaskRecord[];
  const files = (filesResult.data ?? []) as ProjectFileRecord[];
  const comments = (commentsResult.data ?? []) as ProjectCommentRecord[];
  const feedback = (feedbackResult.data ?? []) as ProjectFeedbackRecord[];
  const activities = isMissingRelationError(activityResult.error?.message)
    ? []
    : ((activityResult.data ?? []) as ProjectActivityRecord[]);

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
      action: item.action,
      message: item.message,
      createdAt: item.created_at,
    } satisfies ProjectActivity);
    activityByProject.set(item.project_id, current);
  }

  return {
    users: profiles.map(toAppUser),
    invitations,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      imageUrl: project.image_url ?? null,
      clientId: project.client_id ?? "",
      ownerId: project.owner_id ?? currentUser.id,
      description: project.description ?? "",
      category: project.category ?? "",
      stage: normalizeProjectStage(project.stage),
      status: normalizeProjectStatus(project.status),
      dueDate: project.due_date ?? "",
      staffIds: staffIdsByProject.get(project.id) ?? [],
      tasks: tasksByProject.get(project.id) ?? [],
      files: filesByProject.get(project.id) ?? [],
      comments: commentsByProject.get(project.id) ?? [],
      feedback: feedbackByProject.get(project.id) ?? [],
      activities: activityByProject.get(project.id) ?? [],
    })),
  };
}

async function insertProjectActivity(
  projectId: string,
  actorId: string,
  action: ProjectActivityAction,
  message: string,
) {
  const supabase = getWorkspaceSupabase();

  const { error } = await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: actorId,
    action,
    message,
  });

  if (error) {
    if (isMissingRelationError(error.message)) {
      return;
    }

    throw new Error(error.message);
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialAppState);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (appMode !== "supabase") {
      setReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;

    async function syncAuth(nextAuthUser: AuthUser | null) {
      if (!nextAuthUser) {
        if (!cancelled) {
          setUser(null);
          setState(initialAppState);
          setReady(true);
        }
        return;
      }

      try {
        const nextUser = await fetchAuthUserProfile(nextAuthUser);
        if (!cancelled) {
          setUser(nextUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setState(initialAppState);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void supabase.auth.getUser().then(({ data }) => syncAuth(data.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncAuth(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || appMode !== "supabase") {
      return;
    }

    if (!user) {
      setState(initialAppState);
      return;
    }

    const currentUser = user;
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const nextState = await fetchWorkspaceState(currentUser);
        if (!cancelled) {
          setState(nextState);
        }
      } catch {
        if (!cancelled) {
          setState(initialAppState);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const refreshWorkspace = async (currentUser: User) => {
    if (appMode !== "supabase") {
      return;
    }

    const nextState = await fetchWorkspaceState(currentUser);
    setState(nextState);
  };

  const login = async (email: string, password?: string) => {
    if (appMode === "supabase") {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password: password ?? "",
      });

      if (error || !data.user) {
        throw new Error(error?.message ?? "Unable to sign in.");
      }

      const nextUser = await fetchAuthUserProfile(data.user);
      setUser(nextUser);
      await refreshWorkspace(nextUser);
      return;
    }

    throw new Error("Mock mode is not enabled.");
  };

  const logout = async () => {
    setUser(null);
    setState(initialAppState);

    if (appMode === "supabase") {
      const supabase = getWorkspaceSupabase();
      await supabase?.auth.signOut().catch(() => null);
    }
  };

  const createProject: AppStateContextValue["createProject"] = async (project) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canCreateProject(user.role), "Only managers can create projects");
    ensureAuthorized(ensureClientUser(state.users, project.clientId), "Project client must be a client user");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const data = await apiRequest<{ id: string }>("/api/workspace/projects", {
      method: "POST",
      body: JSON.stringify(project),
    });

    const createdProject: Project = {
      id: data.id,
      name: project.name,
      imageUrl: project.imageUrl?.trim() ? project.imageUrl.trim() : null,
      clientId: project.clientId,
      ownerId: user.id,
      description: project.description,
      category: project.category,
      stage: "intake",
      status: "active",
      dueDate: project.dueDate,
      staffIds: [],
      tasks: [],
      files: [],
      comments: [],
      feedback: [],
      activities: [],
    };

    await refreshWorkspace(user);
    return createdProject;
  };

  const updateProject: AppStateContextValue["updateProject"] = async (projectId, project) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canEditProject(user.role), "Only managers can edit projects");
    ensureAuthorized(ensureClientUser(state.users, project.clientId), "Project client must be a client user");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(project),
    });

    await refreshWorkspace(user);
  };

  const deleteClient: AppStateContextValue["deleteClient"] = async (clientId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canDeleteClient(user.role), "Only managers can delete clients");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/clients/${clientId}`, {
      method: "DELETE",
    });

    await refreshWorkspace(user);
  };

  const updateTeamMemberRole: AppStateContextValue["updateTeamMemberRole"] = async (memberId, role) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canUpdateTeamRole(user.role), "Only managers can update team roles");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });

    await refreshWorkspace(user);
  };

  const deleteTeamMember: AppStateContextValue["deleteTeamMember"] = async (memberId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canDeleteTeamMember(user.role), "Only managers can delete team members");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/team/${memberId}`, {
      method: "DELETE",
    });

    await refreshWorkspace(user);
  };

  const deleteProject: AppStateContextValue["deleteProject"] = async (projectId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canDeleteProject(user.role), "Only managers can delete projects");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}`, {
      method: "DELETE",
    });

    await refreshWorkspace(user);
  };

  const updateProjectWorkflow: AppStateContextValue["updateProjectWorkflow"] = async (
    projectId,
    status,
    stage,
  ) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(
      canUpdateProjectWorkflow(user.role),
      "Only managers can update project workflow",
    );

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}/workflow`, {
      method: "POST",
      body: JSON.stringify({ status, stage }),
    });

    await refreshWorkspace(user);
  };

  const createTask: AppStateContextValue["createTask"] = async (projectId, task) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canCreateTask(user.role), "Only managers can create tasks");
    ensureAuthorized(canAssignTask(user.role), "Only managers can assign tasks");
    ensureAuthorized(
      ensureInternalAssignee(state.users, task.assigneeId),
      "Tasks can only be assigned to internal staff",
    );

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(task),
    });

    await refreshWorkspace(user);
  };

  const updateTask: AppStateContextValue["updateTask"] = async (projectId, taskId, task) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canEditTask(user.role), "Only managers can edit tasks");
    ensureAuthorized(canAssignTask(user.role), "Only managers can assign tasks");
    ensureAuthorized(
      ensureInternalAssignee(state.users, task.assigneeId),
      "Tasks can only be assigned to internal staff",
    );

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(task),
    });

    await refreshWorkspace(user);
  };

  const deleteTask: AppStateContextValue["deleteTask"] = async (projectId, taskId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canDeleteTask(user.role), "Only managers can delete tasks");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE",
    });

    await refreshWorkspace(user);
  };

  const addFile: AppStateContextValue["addFile"] = async (projectId, payload) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const supabase = getWorkspaceSupabase();
    const { error } = await supabase!.from("project_files").insert({
      project_id: projectId,
      title: payload.title,
      version: payload.version,
      file_url: null,
      uploaded_by: user.id,
      visibility: payload.visibility,
      notes: payload.notes,
    });

    if (error) {
      throw new Error(error.message);
    }

    await insertProjectActivity(projectId, user.id, "file_uploaded", `uploaded ${payload.title}`);

    await refreshWorkspace(user);
  };

  const addComment: AppStateContextValue["addComment"] = async (projectId, payload) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const supabase = getWorkspaceSupabase();
    const { error } = await supabase!.from("project_comments").insert({
      project_id: projectId,
      author_id: user.id,
      body: payload.body,
      internal_only: payload.internalOnly,
    });

    if (error) {
      throw new Error(error.message);
    }

    await insertProjectActivity(
      projectId,
      user.id,
      payload.internalOnly ? "internal_note_added" : "comment_added",
      payload.internalOnly ? "left an internal note" : "added a comment",
    );

    await refreshWorkspace(user);
  };

  const addFeedback: AppStateContextValue["addFeedback"] = async (projectId, payload) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const supabase = getWorkspaceSupabase();
    const { error } = await supabase!.from("project_feedback").insert({
      project_id: projectId,
      author_id: user.id,
      action: payload.action,
      body: payload.body,
      rating: payload.rating ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    await insertProjectActivity(
      projectId,
      user.id,
      "feedback_added",
      payload.action === "approve"
        ? "approved a deliverable"
        : payload.action === "request_revision"
          ? "requested a revision"
          : "left feedback",
    );

    await refreshWorkspace(user);
  };

  const updateTaskStatus: AppStateContextValue["updateTaskStatus"] = async (projectId, taskId, payload) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    const project = state.projects.find((candidate) => candidate.id === projectId);
    const task = project?.tasks.find((candidate) => candidate.id === taskId);

    if (!project || !task) {
      throw new Error("Task not found");
    }

    ensureAuthorized(
      canUserUpdateTaskStatus(user, project, task),
      "You do not have permission to update this task",
    );

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: payload.status,
        completionScreenshotUrl: payload.completionScreenshotUrl ?? null,
      }),
    });

    await refreshWorkspace(user);
  };

  const createInvitation: AppStateContextValue["createInvitation"] = async (payload) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canInviteUsers(user.role), "Only managers can create invitations");

    if (appMode === "supabase") {
      const response = await fetch("/api/invitations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-haus-user-id": user.id,
          "x-haus-user-role": user.role,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorPayload?.error ?? "Failed to create invitation");
      }

      const result = (await response.json()) as { inviteLink: string; invitation: Invitation };
      await refreshWorkspace(user);
      return result;
    }

    const token = generateToken();
    const timestamp = new Date().toISOString();
    const derivedName = deriveInviteName(payload.email, payload.name);
    return {
      inviteLink: `/onboarding?token=${encodeURIComponent(token)}`,
      invitation: {
        id: `inv${Date.now()}`,
        email: payload.email.toLowerCase(),
        name: derivedName,
        role: payload.role,
        projectId: payload.projectId,
        tokenHash: token,
        status: "pending",
        expiresAt: payload.expiresAt,
        acceptedAt: null,
        createdBy: user.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
  };

  const revokeInvitation: AppStateContextValue["revokeInvitation"] = async (invitationId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canInviteUsers(user.role), "Only managers can revoke invitations");

    if (appMode === "supabase") {
      const response = await fetch("/api/invitations/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-haus-user-id": user.id,
          "x-haus-user-role": user.role,
        },
        body: JSON.stringify({ invitationId }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorPayload?.error ?? "Failed to revoke invitation");
      }

      await refreshWorkspace(user);
      return;
    }
  };

  const getInvitationByToken: AppStateContextValue["getInvitationByToken"] = (token) => {
    if (appMode === "supabase") {
      return null;
    }

    const invitation = state.invitations.find((candidate) => candidate.tokenHash === token) ?? null;
    if (!invitation) {
      return null;
    }

    return {
      ...invitation,
      status: deriveInvitationStatus(invitation),
    };
  };

  const acceptInvitation: AppStateContextValue["acceptInvitation"] = async ({
    token,
    name,
    password,
  }) => {
    if (appMode === "supabase") {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, name, password }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorPayload?.error ?? "Failed to accept invitation");
      }

      const result = (await response.json()) as { user: User };
      const supabase = getWorkspaceSupabase();
      const signInResult = await supabase?.auth.signInWithPassword({
        email: result.user.email,
        password,
      });
      if (signInResult?.error) {
        throw new Error(signInResult.error.message);
      }

      setUser(result.user);
      await refreshWorkspace(result.user);
      return result;
    }

    return { user: null };
  };

  return (
    <AppStateContext.Provider
      value={{
        mode: appMode,
        ready,
        state,
        user,
        login,
        logout,
        createProject,
        updateProject,
        deleteClient,
        updateTeamMemberRole,
        deleteTeamMember,
        deleteProject,
        updateProjectWorkflow,
        createTask,
        updateTask,
        deleteTask,
        addFile,
        addComment,
        addFeedback,
        updateTaskStatus,
        createInvitation,
        revokeInvitation,
        getInvitationByToken,
        acceptInvitation,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}
