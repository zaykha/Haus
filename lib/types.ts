export type Role =
  | "communication_manager"
  | "creative_manager"
  | "designer"
  | "client";

export type ProjectStatus = "active" | "review" | "approved" | "revision" | "done";

export type ProjectStage =
  | "intake"
  | "concept"
  | "design"
  | "review"
  | "delivery";

export type FileVisibility = "internal" | "client";
export type FeedbackAction = "approve" | "request_revision" | "comment";
export type TaskStatus = "todo" | "in_progress" | "done";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  company?: string;
}

export interface Task {
  id: string;
  title: string;
  assigneeId: string;
  status: TaskStatus;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  internalOnly: boolean;
  createdAt: string;
}

export interface FileVersion {
  id: string;
  title: string;
  version: string;
  uploadedBy: string;
  createdAt: string;
  visibility: FileVisibility;
  notes: string;
}

export interface Feedback {
  id: string;
  authorId: string;
  action: FeedbackAction;
  body: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  imageUrl?: string | null;
  clientId: string;
  ownerId: string;
  description: string;
  category: string;
  stage: ProjectStage;
  status: ProjectStatus;
  dueDate: string;
  staffIds: string[];
  tasks: Task[];
  files: FileVersion[];
  comments: Comment[];
  feedback: Feedback[];
}

export interface Session {
  email: string;
  role: Role;
}

export interface Invitation {
  id: string;
  email: string;
  name: string;
  role: Role;
  projectId: string | null;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoState {
  users: User[];
  projects: Project[];
  invitations: Invitation[];
}
