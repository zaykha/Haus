"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SupabaseClient, User as AuthUser } from "@supabase/supabase-js";
import { initialAppState } from "@/lib/mock-data";
import { appMode } from "@/lib/config";
import {
  DemoState,
  FeedbackAction,
  FileVisibility,
  Invitation,
  InvitationStatus,
  Project,
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
  canCreateClient,
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
    projectRequestName: string;
    requestedDate: string;
    requestStatus: string;
    departmentName: string;
    contactPerson: string;
    contactNumber: string;
    projectType: string;
    priorityLevel: string;
    firstDraftDate: string;
    finalDeliverableDate: string;
    projectObjective: string;
    projectBrief: string;
    creativeAdvice: string;
    description: string;
    referenceAttachmentUrl: string;
    clientOrganizationId: string;
  }) => Promise<Project>;
  bulkCreateProjects: (rows: Array<{
    projectId: string;
    requestedDate: string;
    projectRequestName: string;
    requestStatus: string;
    departmentName: string;
    contactPerson: string;
    contactNumber: string;
    projectType: string;
    priorityLevel: string;
    firstDraftDate: string;
    finalDeliverableDate: string;
    projectObjective: string;
    projectBrief: string;
    creativeAdvice: string;
    description: string;
    referenceAttachmentUrl: string;
    clientOrganizationName: string;
    primaryContactEmail?: string;
  }>) => Promise<{ createdCount: number }>;
  updateProject: (
    projectId: string,
    project: {
      projectRequestName: string;
      requestedDate: string;
      requestStatus: string;
      departmentName: string;
      contactPerson: string;
      contactNumber: string;
      projectType: string;
      priorityLevel: string;
      firstDraftDate: string;
      finalDeliverableDate: string;
      projectObjective: string;
      projectBrief: string;
      creativeAdvice: string;
      description: string;
      referenceAttachmentUrl: string;
      clientOrganizationId: string;
    },
  ) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  updateClient: (
    clientId: string,
    client: {
      name: string;
      company?: string;
      clientOrganizationId?: string | null;
      addClientOrganizationId?: string | null;
      removeClientOrganizationId?: string | null;
      primaryClientOrganizationId?: string | null;
    },
  ) => Promise<void>;
  createClientOrganization: (organization: {
    name: string;
    type: "internal" | "external";
    status: "active" | "inactive";
    phone?: string;
    address?: string;
  }) => Promise<{ id: string }>;
  updateClientOrganization: (
    organizationId: string,
    organization: {
      name: string;
      type: "internal" | "external";
      status: "active" | "inactive";
      phone?: string;
      address?: string;
    },
  ) => Promise<void>;
  updateTeamMemberRole: (memberId: string, role: Exclude<Role, "client">) => Promise<void>;
  deleteTeamMember: (memberId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  updateProjectWorkflow: (
    projectId: string,
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
      completionScreenshotUrl?: string | null;
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
    clientOrganizationId?: string | null;
    expiresAt: string;
  }) => Promise<{ inviteLink: string; invitation: Invitation }>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  getInvitationByToken: (token: string) => Invitation | null;
  acceptInvitation: (payload: {
    token: string;
    name: string;
    password: string;
    phone: string;
    jobTitle?: string;
    department?: string;
  }) => Promise<{ user: User | null }>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

type ProfileRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  company: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
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

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined) {
  const safeLeft = left ?? [];
  const safeRight = right ?? [];
  if (safeLeft.length !== safeRight.length) {
    return false;
  }

  return safeLeft.every((value, index) => value === safeRight[index]);
}

function areUsersEqual(left: User | null, right: User | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.email === right.email &&
    left.name === right.name &&
    left.role === right.role &&
    left.company === right.company &&
    left.phone === right.phone &&
    left.jobTitle === right.jobTitle &&
    left.department === right.department &&
    left.clientOrganizationId === right.clientOrganizationId &&
    areStringArraysEqual(left.clientOrganizationIds, right.clientOrganizationIds)
  );
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

function ensureClientOrganizationExists(
  clientOrganizations: DemoState["clientOrganizations"],
  clientOrganizationId: string,
) {
  if (!clientOrganizationId) {
    return true;
  }

  return clientOrganizations.some((organization) => organization.id === clientOrganizationId);
}

function isMissingRelationError(message: string | undefined) {
  return Boolean(message && message.includes('relation "project_activity" does not exist'));
}

async function fetchAuthUserProfile(authUser: AuthUser): Promise<User> {
  const supabase = getWorkspaceSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, company, phone, job_title, department, created_at")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const profile = data as ProfileRecord | null;
  const role = profile?.role ?? ((authUser.user_metadata.role as Role | undefined) ?? "client");
  let clientOrganizationIds: string[] = [];

  if (role === "client") {
    const { data: liaisonRows, error: liaisonError } = await supabase
      .from("client_organization_liaisons")
      .select("client_organization_id, is_primary")
      .eq("profile_id", authUser.id);

    if (liaisonError && !liaisonError.message.includes('relation "client_organization_liaisons" does not exist')) {
      throw new Error(liaisonError.message);
    }

    clientOrganizationIds = ((liaisonRows ?? []) as Array<{
      client_organization_id: string;
      is_primary: boolean;
    }>)
      .slice()
      .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))
      .map((liaison) => liaison.client_organization_id);
  }

  return {
    id: authUser.id,
    email: profile?.email ?? authUser.email ?? "",
    name:
      profile?.name ??
      ((authUser.user_metadata.name as string | undefined) ??
        authUser.email?.split("@")[0] ??
        "User"),
    role,
    company: profile?.company ?? undefined,
    phone: profile?.phone ?? undefined,
    jobTitle: profile?.job_title ?? undefined,
    department: profile?.department ?? undefined,
    clientOrganizationId: clientOrganizationIds[0] ?? null,
    clientOrganizationIds,
    createdAt: profile?.created_at,
  };
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
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as {
      error?: string;
      details?: string[];
    } | null;
    const detailMessage =
      errorPayload?.details && errorPayload.details.length > 0
        ? `\n${errorPayload.details.join("\n")}`
        : "";
    throw new Error(`${errorPayload?.error ?? "Request failed"}${detailMessage}`);
  }

  return (await response.json()) as T;
}

async function fetchWorkspaceState(): Promise<DemoState> {
  return apiRequest<DemoState>("/api/workspace/state");
}

const REALTIME_WORKSPACE_TABLES = [
  "tasks",
  "projects",
  "project_members",
  "project_feedback",
  "project_comments",
  "project_activity",
  "project_files",
  "client_organization_liaisons",
  "profiles",
] as const;

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
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);

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

    const currentUserId = user?.id;

    if (!currentUserId) {
      setState(initialAppState);
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      try {
        const nextState = await fetchWorkspaceState();
        if (!cancelled) {
          setState(nextState);
          const hydratedUser = nextState.users.find((profile) => profile.id === currentUserId) ?? null;
          if (hydratedUser) {
            setUser((current) => (areUsersEqual(current, hydratedUser) ? current : hydratedUser));
          }
        }
      } catch (error) {
        console.error("Failed to load workspace state", error);
        if (!cancelled) {
          setState(initialAppState);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [ready, user?.id]);

  const refreshWorkspace = async (currentUser: User) => {
    if (appMode !== "supabase") {
      return;
    }

    const nextState = await fetchWorkspaceState();
    setState(nextState);
    const hydratedUser = nextState.users.find((profile) => profile.id === currentUser.id) ?? currentUser;
    setUser((current) => (areUsersEqual(current, hydratedUser) ? current : hydratedUser));
  };

  useEffect(() => {
    if (!ready || appMode !== "supabase") {
      return;
    }

    const currentUserId = user?.id;
    const supabase = getSupabaseBrowserClient();

    if (!currentUserId || !supabase) {
      return;
    }

    let cancelled = false;

    const scheduleRefresh = (payload?: { table?: string; eventType?: string }) => {
      console.log("[workspace-realtime] change received", {
        userId: currentUserId,
        table: payload?.table,
        eventType: payload?.eventType,
      });

      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }

      realtimeRefreshTimeoutRef.current = window.setTimeout(async () => {
        try {
          console.log("[workspace-realtime] refreshing workspace", {
            userId: currentUserId,
          });
          const nextState = await fetchWorkspaceState();
          if (cancelled) {
            return;
          }

          setState(nextState);
          const hydratedUser = nextState.users.find((profile) => profile.id === currentUserId) ?? null;
          if (hydratedUser) {
            setUser((current) => (areUsersEqual(current, hydratedUser) ? current : hydratedUser));
          }
        } catch (error) {
          console.error("Failed to refresh workspace state from realtime event", error);
        }
      }, 400);
    };

    const channel = supabase.channel(`workspace-live:${currentUserId}`);

    REALTIME_WORKSPACE_TABLES.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) =>
        scheduleRefresh({
          table,
          eventType: payload.eventType,
        }),
      );
    });

    channel.subscribe((status) => {
      console.log("[workspace-realtime] channel status", {
        userId: currentUserId,
        status,
      });
    });

    return () => {
      cancelled = true;
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [ready, user?.id]);

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

    const resolvedClientOrganizationId = project.clientOrganizationId;

    ensureAuthorized(canCreateProject(user.role), "Only managers can create projects");
    ensureAuthorized(
      ensureClientOrganizationExists(state.clientOrganizations, resolvedClientOrganizationId),
      "Project client organization must exist",
    );

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const data = await apiRequest<{ id: string }>("/api/workspace/projects", {
      method: "POST",
      body: JSON.stringify({
        ...project,
        clientOrganizationId: resolvedClientOrganizationId,
      }),
    });

    const createdProject: Project = {
      id: data.id,
      name: project.projectRequestName,
      requestedDate: project.requestedDate,
      requestStatus: project.requestStatus,
      departmentName: project.departmentName || null,
      projectRequestName: project.projectRequestName,
      contactPerson: project.contactPerson,
      contactNumber: project.contactNumber || null,
      projectType: project.projectType,
      priorityLevel: project.priorityLevel || null,
      firstDraftDate: project.firstDraftDate || null,
      finalDeliverableDate: project.finalDeliverableDate,
      projectObjective: project.projectObjective || null,
      projectBrief: project.projectBrief || null,
      creativeAdvice: project.creativeAdvice || null,
      referenceAttachmentUrl: project.referenceAttachmentUrl || null,
      clientOrganizationId: resolvedClientOrganizationId || null,
      primaryClientContactId: null,
      ownerId: user.id,
      description: project.description,
      category: project.projectType,
      stage: project.requestStatus as ProjectStage,
      status:
        project.requestStatus === "Complete"
          ? "done"
          : project.requestStatus === "Pending Review"
            ? "review"
            : project.requestStatus === "On Hold"
              ? "revision"
              : "active",
      dueDate: project.finalDeliverableDate,
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

  const bulkCreateProjects: AppStateContextValue["bulkCreateProjects"] = async (rows) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canCreateProject(user.role), "Only managers can create projects");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const data = await apiRequest<{ ok: true; createdCount: number }>("/api/workspace/projects/bulk", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });

    await refreshWorkspace(user);
    return { createdCount: data.createdCount };
  };

  const updateProject: AppStateContextValue["updateProject"] = async (projectId, project) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    const resolvedClientOrganizationId = project.clientOrganizationId;

    ensureAuthorized(canEditProject(user.role), "Only managers can edit projects");
    ensureAuthorized(
      ensureClientOrganizationExists(state.clientOrganizations, resolvedClientOrganizationId),
      "Project client organization must exist",
    );

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...project,
        clientOrganizationId: resolvedClientOrganizationId,
      }),
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

  const updateClient: AppStateContextValue["updateClient"] = async (clientId, client) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/clients/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify(client),
    });

    await refreshWorkspace(user);
  };

  const createClientOrganization: AppStateContextValue["createClientOrganization"] = async (
    organization,
  ) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canCreateClient(user.role), "Only managers can create organizations");

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    const data = await apiRequest<{ id: string }>("/api/workspace/client-organizations", {
      method: "POST",
      body: JSON.stringify(organization),
    });

    await refreshWorkspace(user);
    return data;
  };

  const updateClientOrganization: AppStateContextValue["updateClientOrganization"] = async (
    organizationId,
    organization,
  ) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (appMode !== "supabase") {
      throw new Error("Mock mode is not enabled.");
    }

    await apiRequest<{ ok: true }>(`/api/workspace/client-organizations/${organizationId}`, {
      method: "PATCH",
      body: JSON.stringify(organization),
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
      body: JSON.stringify({ stage }),
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
    if (payload.role === "client") {
      ensureAuthorized(
        ensureClientOrganizationExists(state.clientOrganizations, payload.clientOrganizationId ?? ""),
        "Client organization is required for client invites",
      );
    }

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
        clientOrganizationId: payload.clientOrganizationId ?? null,
        clientOrganizationName:
          state.clientOrganizations.find(
            (organization) => organization.id === payload.clientOrganizationId,
          )?.name ?? null,
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
    phone,
    jobTitle,
    department,
  }) => {
    if (appMode === "supabase") {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, name, password, phone, jobTitle, department }),
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
    bulkCreateProjects,
    updateProject,
        deleteClient,
        updateClient,
        createClientOrganization,
        updateClientOrganization,
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
