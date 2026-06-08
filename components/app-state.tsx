"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  ProjectStage,
  ProjectStatus,
  Role,
  Session,
  TaskStatus,
  User,
} from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canAssignTask,
  canCreateProject,
  canCreateTask,
  canDeleteProject,
  canDeleteTask,
  canEditProject,
  canEditTask,
  canInviteUsers,
  canUpdateTaskStatus as canUserUpdateTaskStatus,
  canUpdateProjectWorkflow,
} from "@/lib/permissions";

const STORAGE_KEY = "haus-app-state";
const LEGACY_STORAGE_KEY = "haus-demo-state";
const SESSION_KEY = "haus-session";

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
    staffIds: string[];
  }) => Project;
  updateProject: (
    projectId: string,
    project: {
      name: string;
      imageUrl?: string | null;
      description: string;
      category: string;
      dueDate: string;
      clientId: string;
      staffIds: string[];
    },
  ) => void;
  deleteProject: (projectId: string) => void;
  updateProjectWorkflow: (projectId: string, status: ProjectStatus, stage: ProjectStage) => void;
  createTask: (
    projectId: string,
    task: { title: string; assigneeId: string; status?: TaskStatus },
  ) => void;
  updateTask: (
    projectId: string,
    taskId: string,
    task: { title: string; assigneeId: string; status: TaskStatus },
  ) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  addFile: (
    projectId: string,
    payload: { title: string; version: string; visibility: FileVisibility; notes: string },
  ) => void;
  addComment: (projectId: string, payload: { body: string; internalOnly: boolean }) => void;
  addFeedback: (projectId: string, payload: { action: FeedbackAction; body: string }) => void;
  updateTaskStatus: (projectId: string, taskId: string, status: "todo" | "in_progress" | "done") => void;
  createInvitation: (payload: {
    name: string;
    email: string;
    role: Role;
    projectId: string | null;
    expiresAt: string;
  }) => Promise<{ inviteLink: string; invitation: Invitation }>;
  revokeInvitation: (invitationId: string) => void;
  getInvitationByToken: (token: string) => Invitation | null;
  acceptInvitation: (payload: { token: string; password: string }) => Promise<{ user: User | null }>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

type ProfileRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function readStoredState() {
  if (typeof window === "undefined") {
    return initialAppState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return initialAppState;
  }

  try {
    return JSON.parse(raw) as DemoState;
  } catch {
    return initialAppState;
  }
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function persistState(nextState: DemoState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function persistSession(session: Session | null) {
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function buildMockInviteLink(token: string) {
  if (typeof window === "undefined") {
    return `/accept-invite?token=${encodeURIComponent(token)}`;
  }

  return `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

function generateToken() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll("-", "");
  }

  return `${Date.now()}${Math.random().toString(36).slice(2, 18)}`;
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

function ensureInternalAssignee(users: User[], assigneeId: string) {
  return users.some((candidate) => candidate.id === assigneeId && candidate.role !== "client");
}

function ensureClientUser(users: User[], clientId: string) {
  return users.some((candidate) => candidate.id === clientId && candidate.role === "client");
}

function mergeUserByEmail(users: User[], nextUser: User) {
  const nextEmail = nextUser.email.toLowerCase();
  const existingIndex = users.findIndex((candidate) => candidate.email.toLowerCase() === nextEmail);

  if (existingIndex === -1) {
    return [...users, nextUser];
  }

  return users.map((candidate, index) => (index === existingIndex ? { ...candidate, ...nextUser } : candidate));
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialAppState);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    setState(readStoredState());
    setSession(readStoredSession());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || appMode !== "supabase") {
      return;
    }

    let cancelled = false;

    async function syncSupabaseSession() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        return;
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser || cancelled) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", authUser.id)
        .maybeSingle();

      const nextUser: User = {
        id: authUser.id,
        email: profile?.email ?? authUser.email ?? "",
        name: profile?.name ?? ((authUser.user_metadata.name as string | undefined) ?? authUser.email?.split("@")[0] ?? "User"),
        role: profile?.role ?? ((authUser.user_metadata.role as Role | undefined) ?? "client"),
        company: state.users.find((candidate) => candidate.email.toLowerCase() === (profile?.email ?? authUser.email ?? "").toLowerCase())?.company,
      };

      const nextSession: Session = {
        email: nextUser.email,
        role: nextUser.role,
      };

      setSession(nextSession);
      persistSession(nextSession);
      updateState((current) => ({
        ...current,
        users: mergeUserByEmail(current.users, nextUser),
      }));
    }

    void syncSupabaseSession();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  const user = useMemo(() => {
    if (!session) {
      return null;
    }

    return (
      state.users.find(
        (candidate) => candidate.email === session.email && candidate.role === session.role,
      ) ?? null
    );
  }, [session, state.users]);

  const login = async (email: string, password?: string) => {
    const matchedUser = state.users.find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
    );

    if (appMode === "supabase") {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password: password ?? "",
      });

      if (error || !data.user) {
        throw new Error(error?.message ?? "Unable to sign in.");
      }

      const { data: profile } = await supabase!
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role =
        profile?.role ??
        matchedUser?.role ??
        ((data.user.user_metadata.role as Role | undefined) ?? "client");
      const name =
        profile?.name ??
        matchedUser?.name ??
        ((data.user.user_metadata.name as string | undefined) ?? email.split("@")[0]);

      const nextUser: User = {
        id: data.user.id,
        email: profile?.email ?? data.user.email ?? email,
        role,
        name,
        company: matchedUser?.company,
      };

      const nextSession = { email: nextUser.email, role: nextUser.role };
      setSession(nextSession);
      persistSession(nextSession);
      updateState((current) => ({
        ...current,
        users: mergeUserByEmail(current.users, nextUser),
      }));
      return;
    }

    if (!matchedUser) {
      throw new Error("No account found for this email.");
    }

    const nextSession = { email: matchedUser.email, role: matchedUser.role };
    setSession(nextSession);
    persistSession(nextSession);
  };

  const logout = async () => {
    setSession(null);
    persistSession(null);

    if (appMode === "supabase") {
      const supabase = getSupabaseBrowserClient();
      await supabase?.auth.signOut().catch(() => null);
    }
  };

  const updateState = (updater: (current: DemoState) => DemoState) => {
    setState((current) => {
      const nextState = updater(current);
      persistState(nextState);
      return nextState;
    });
  };

  const createProject: AppStateContextValue["createProject"] = (project) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canCreateProject(user.role), "Only managers can create projects");
    ensureAuthorized(ensureClientUser(state.users, project.clientId), "Project client must be a client user");
    ensureAuthorized(
      project.staffIds.every((staffId) => ensureInternalAssignee(state.users, staffId)),
      "Project staff must be internal users",
    );

    const createdProject: Project = {
      id: `p${Date.now()}`,
      name: project.name,
      imageUrl: project.imageUrl?.trim() ? project.imageUrl.trim() : null,
      clientId: project.clientId,
      ownerId: user.id,
      description: project.description,
      category: project.category,
      stage: "intake",
      status: "active",
      dueDate: project.dueDate,
      staffIds: project.staffIds,
      tasks: [],
      files: [],
      comments: [],
      feedback: [],
    };

    updateState((current) => ({
      ...current,
      projects: [createdProject, ...current.projects],
    }));

    return createdProject;
  };

  const updateProject: AppStateContextValue["updateProject"] = (projectId, project) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canEditProject(user.role), "Only managers can edit projects");
    ensureAuthorized(ensureClientUser(state.users, project.clientId), "Project client must be a client user");
    ensureAuthorized(
      project.staffIds.every((staffId) => ensureInternalAssignee(state.users, staffId)),
      "Project staff must be internal users",
    );

    updateState((current) => ({
      ...current,
      projects: current.projects.map((candidate) =>
        candidate.id === projectId
          ? {
              ...candidate,
              name: project.name,
              imageUrl: project.imageUrl?.trim() ? project.imageUrl.trim() : null,
              description: project.description,
              category: project.category,
              dueDate: project.dueDate,
              clientId: project.clientId,
              staffIds: project.staffIds,
            }
          : candidate,
      ),
    }));
  };

  const deleteProject: AppStateContextValue["deleteProject"] = (projectId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canDeleteProject(user.role), "Only managers can delete projects");

    updateState((current) => ({
      ...current,
      projects: current.projects.filter((candidate) => candidate.id !== projectId),
    }));
  };

  const updateProjectWorkflow: AppStateContextValue["updateProjectWorkflow"] = (
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

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? { ...project, status, stage } : project,
      ),
    }));
  };

  const createTask: AppStateContextValue["createTask"] = (projectId, task) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canCreateTask(user.role), "Only managers can create tasks");
    ensureAuthorized(canAssignTask(user.role), "Only managers can assign tasks");
    ensureAuthorized(
      ensureInternalAssignee(state.users, task.assigneeId),
      "Tasks can only be assigned to internal staff",
    );

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              tasks: [
                {
                  id: `t${Date.now()}`,
                  title: task.title,
                  assigneeId: task.assigneeId,
                  status: task.status ?? "todo",
                },
                ...project.tasks,
              ],
            }
          : project,
      ),
    }));
  };

  const updateTask: AppStateContextValue["updateTask"] = (projectId, taskId, task) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canEditTask(user.role), "Only managers can edit tasks");
    ensureAuthorized(canAssignTask(user.role), "Only managers can assign tasks");
    ensureAuthorized(
      ensureInternalAssignee(state.users, task.assigneeId),
      "Tasks can only be assigned to internal staff",
    );

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              tasks: project.tasks.map((candidate) =>
                candidate.id === taskId
                  ? {
                      ...candidate,
                      title: task.title,
                      assigneeId: task.assigneeId,
                      status: task.status,
                    }
                  : candidate,
              ),
            }
          : project,
      ),
    }));
  };

  const deleteTask: AppStateContextValue["deleteTask"] = (projectId, taskId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canDeleteTask(user.role), "Only managers can delete tasks");

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              tasks: project.tasks.filter((candidate) => candidate.id !== taskId),
            }
          : project,
      ),
    }));
  };

  const addFile: AppStateContextValue["addFile"] = (projectId, payload) => {
    if (!user) {
      return;
    }

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              files: [
                {
                  id: `f${Date.now()}`,
                  title: payload.title,
                  version: payload.version,
                  uploadedBy: user.id,
                  createdAt: new Date().toISOString(),
                  visibility: payload.visibility,
                  notes: payload.notes,
                },
                ...project.files,
              ],
            }
          : project,
      ),
    }));
  };

  const addComment: AppStateContextValue["addComment"] = (projectId, payload) => {
    if (!user) {
      return;
    }

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              comments: [
                {
                  id: `c${Date.now()}`,
                  authorId: user.id,
                  body: payload.body,
                  internalOnly: payload.internalOnly,
                  createdAt: new Date().toISOString(),
                } satisfies Comment,
                ...project.comments,
              ],
            }
          : project,
      ),
    }));
  };

  const addFeedback: AppStateContextValue["addFeedback"] = (projectId, payload) => {
    if (!user) {
      return;
    }

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              feedback: [
                {
                  id: `fb${Date.now()}`,
                  authorId: user.id,
                  action: payload.action,
                  body: payload.body,
                  createdAt: new Date().toISOString(),
                },
                ...project.feedback,
              ],
            }
          : project,
      ),
    }));
  };

  const updateTaskStatus: AppStateContextValue["updateTaskStatus"] = (projectId, taskId, status) => {
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

    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              tasks: project.tasks.map((task) => (task.id === taskId ? { ...task, status } : task)),
            }
          : project,
      ),
    }));
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
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to create invitation");
      }

      const result = (await response.json()) as { inviteLink: string; invitation: Invitation };
      updateState((current) => ({
        ...current,
        invitations: [result.invitation, ...current.invitations],
      }));
      return result;
    }

    const token = generateToken();
    const timestamp = new Date().toISOString();
    const invitation: Invitation = {
      id: `inv${Date.now()}`,
      email: payload.email.toLowerCase(),
      name: payload.name,
      role: payload.role,
      projectId: payload.projectId,
      tokenHash: token,
      status: "pending",
      expiresAt: payload.expiresAt,
      acceptedAt: null,
      createdBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    updateState((current) => ({
      ...current,
      invitations: [invitation, ...current.invitations],
    }));

    return {
      inviteLink: buildMockInviteLink(token),
      invitation,
    };
  };

  const revokeInvitation: AppStateContextValue["revokeInvitation"] = (invitationId) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    ensureAuthorized(canInviteUsers(user.role), "Only managers can revoke invitations");

    updateState((current) => ({
      ...current,
      invitations: current.invitations.map((invitation) =>
        invitation.id === invitationId
          ? {
              ...invitation,
              status: "revoked",
              updatedAt: new Date().toISOString(),
            }
          : invitation,
      ),
    }));
  };

  const getInvitationByToken: AppStateContextValue["getInvitationByToken"] = (token) => {
    const invitation = state.invitations.find((candidate) => candidate.tokenHash === token) ?? null;
    if (!invitation) {
      return null;
    }

    return {
      ...invitation,
      status: deriveInvitationStatus(invitation),
    };
  };

  const acceptInvitation: AppStateContextValue["acceptInvitation"] = async ({ token, password }) => {
    if (appMode === "supabase") {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to accept invitation");
      }

      const result = (await response.json()) as { user: User };
      const supabase = getSupabaseBrowserClient();
      await supabase?.auth.signInWithPassword({
        email: result.user.email,
        password,
      });

      const nextSession: Session = {
        email: result.user.email,
        role: result.user.role,
      };

      setSession(nextSession);
      persistSession(nextSession);
      updateState((current) => ({
        ...current,
        users: mergeUserByEmail(current.users, result.user),
      }));

      return result;
    }

    const invitation = state.invitations.find((candidate) => candidate.tokenHash === token) ?? null;
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    const status = deriveInvitationStatus(invitation);
    if (status !== "pending") {
      throw new Error(`Invitation is ${status}`);
    }

    const newUser: User = {
      id: `u${Date.now()}`,
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      company: invitation.role === "client" ? "Client" : "Haus",
    };

    const nextSession: Session = {
      email: newUser.email,
      role: newUser.role,
    };

    setSession(nextSession);
    persistSession(nextSession);

    updateState((current) => ({
      ...current,
      users: mergeUserByEmail(current.users, newUser),
      projects: current.projects.map((project) => {
        if (project.id !== invitation.projectId) {
          return project;
        }

        if (newUser.role === "client") {
          return { ...project, clientId: newUser.id };
        }

        return project.staffIds.includes(newUser.id)
          ? project
          : { ...project, staffIds: [...project.staffIds, newUser.id] };
      }),
      invitations: current.invitations.map((candidate) =>
        candidate.id === invitation.id
          ? {
              ...candidate,
              status: "accepted",
              acceptedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    }));

    return { user: newUser };
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
