export type Role =
  | "communication_manager"
  | "creative_manager"
  | "designer"
  | "client";

export type ProjectWorkflowStage =
  | "Complete"
  | "WIP"
  | "Pending Review"
  | "On Hold"
  | "Waiting List";

export type ProjectRequestStatus = ProjectWorkflowStage;
export type ProjectStage =
  | ProjectWorkflowStage
  | "intake"
  | "concept"
  | "design"
  | "review"
  | "delivery";
export type ProjectStatus =
  | ProjectWorkflowStage
  | "active"
  | "review"
  | "approved"
  | "revision"
  | "done";

export type FileVisibility = "internal" | "client";
export type FeedbackAction = "approve" | "request_revision" | "comment";
export type TaskStatus = "todo" | "in_progress" | "done" | "review" | "approved";
export type TaskPriority = "high" | "medium" | "low";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";
export type TaskManagerReviewStatus = "internal" | "ready_for_client" | "revision_requested";

export interface ClientOrganization {
  id: string;
  name: string;
  type?: "internal" | "external";
  status?: "active" | "inactive";
  phone?: string;
  address?: string;
  createdAt?: string;
}

export interface Department {
  id: string;
  name: string;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  company?: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  clientOrganizationId?: string | null;
  clientOrganizationIds?: string[];
  createdAt?: string;
}

export interface Task {
  id: string;
  title: string;
  assigneeId: string;
  status: TaskStatus;
  dueDate: string;
  priority: TaskPriority;
  completionScreenshotUrl?: string | null;
  clientVisible?: boolean;
  managerReviewStatus?: TaskManagerReviewStatus;
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
  rating?: number | null;
  createdAt: string;
}

export type ProjectActivityAction =
  | "workflow_updated"
  | "task_created"
  | "task_status_changed"
  | "task_submitted"
  | "task_revision_requested"
  | "task_approved"
  | "file_uploaded"
  | "comment_added"
  | "internal_note_added"
  | "feedback_added";

export interface ProjectActivity {
  id: string;
  actorId?: string | null;
  action: ProjectActivityAction;
  message: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  projectCode?: string | null;
  requestedDate?: string | null;
  requestStatus?: ProjectRequestStatus | string | null;
  departmentName?: string | null;
  projectRequestName?: string | null;
  contactPerson?: string | null;
  contactNumber?: string | null;
  projectType?: string | null;
  priorityLevel?: string | null;
  firstDraftDate?: string | null;
  finalDeliverableDate?: string | null;
  projectObjective?: string | null;
  projectBrief?: string | null;
  creativeAdvice?: string | null;
  referenceAttachmentUrl?: string | null;
  clientOrganizationId?: string | null;
  primaryClientContactId?: string | null;
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
  activities: ProjectActivity[];
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
  clientOrganizationId?: string | null;
  clientOrganizationName?: string | null;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoState {
  departments: Department[];
  clientOrganizations: ClientOrganization[];
  users: User[];
  projects: Project[];
  invitations: Invitation[];
}
