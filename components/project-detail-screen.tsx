"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state";
import { ProjectForm, ProjectFormValues } from "@/components/project-form";
import {
  canCreateTask,
  canChangeWorkflow,
  canDeleteProject,
  canDeleteTask,
  canEditProject,
  canEditTask,
  canLeaveInternalComment,
  canUpdateTaskStatus as canUserUpdateTaskStatus,
  canUploadFiles,
  canViewProject,
} from "@/lib/permissions";
import { FeedbackAction, FileVisibility, ProjectStage, ProjectStatus, TaskStatus } from "@/lib/types";
import {
  formatLabel,
  formatProjectStage,
  getProjectStatusClass,
  getProjectStatusLabel,
} from "@/lib/display";

const statuses: ProjectStatus[] = ["active", "review", "approved", "revision", "done"];
const stages: ProjectStage[] = ["intake", "concept", "design", "review", "delivery"];

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const {
    state,
    user,
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
  } = useAppState();
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [stage, setStage] = useState<ProjectStage>("intake");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingTaskAssigneeId, setEditingTaskAssigneeId] = useState("");
  const [editingTaskStatus, setEditingTaskStatus] = useState<TaskStatus>("todo");
  const [fileTitle, setFileTitle] = useState("");
  const [fileVersion, setFileVersion] = useState("v1");
  const [fileVisibility, setFileVisibility] = useState<FileVisibility>("client");
  const [fileNotes, setFileNotes] = useState("");
  const [comment, setComment] = useState("");
  const [internalOnly, setInternalOnly] = useState(false);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackAction, setFeedbackAction] = useState<FeedbackAction>("comment");

  const project = useMemo(
    () => state.projects.find((candidate) => candidate.id === projectId) ?? null,
    [projectId, state.projects],
  );

  if (!user || !project || !canViewProject(user, project)) {
    return (
      <main className="page-stack">
        <section className="panel">
          <p>Project not found or not accessible from this role.</p>
          <Link href="/projects">Return to projects</Link>
        </section>
      </main>
    );
  }

  const staff = state.users.filter((candidate) => project.staffIds.includes(candidate.id));
  const availableClients = state.users.filter((candidate) => candidate.role === "client");
  const availableStaff = state.users.filter((candidate) => candidate.role !== "client");
  const client = state.users.find((candidate) => candidate.id === project.clientId);
  const canEditDetails = canEditProject(user.role);
  const canRemoveProject = canDeleteProject(user.role);
  const canManageTasks = canCreateTask(user.role);
  const visibleFiles =
    user.role === "client"
      ? project.files.filter((file) => file.visibility === "client")
      : project.files;
  const visibleComments =
    user.role === "client"
      ? project.comments.filter((item) => !item.internalOnly)
      : project.comments;

  useEffect(() => {
    setStatus(project.status);
    setStage(project.stage);
  }, [project.stage, project.status]);

  const projectFormInitialValues: ProjectFormValues = {
    name: project.name,
    imageUrl: project.imageUrl ?? "",
    description: project.description,
    category: project.category,
    dueDate: project.dueDate,
    clientId: project.clientId,
    staffIds: project.staffIds,
  };

  const handleWorkflowSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProjectWorkflow(project.id, status, stage);
  };

  const handleProjectUpdate = async (values: ProjectFormValues) => {
    updateProject(project.id, values);
  };

  const handleProjectDelete = () => {
    if (!window.confirm("Delete this project? This will remove its tasks, files, comments, and feedback.")) {
      return;
    }

    deleteProject(project.id);
    router.push("/projects");
  };

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createTask(project.id, {
      title: newTaskTitle,
      assigneeId: newTaskAssigneeId,
      status: newTaskStatus,
    });
    setNewTaskTitle("");
    setNewTaskAssigneeId("");
    setNewTaskStatus("todo");
  };

  const startEditingTask = (taskId: string) => {
    const task = project.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return;
    }

    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskAssigneeId(task.assigneeId);
    setEditingTaskStatus(task.status);
  };

  const handleTaskUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTaskId) {
      return;
    }

    updateTask(project.id, editingTaskId, {
      title: editingTaskTitle,
      assigneeId: editingTaskAssigneeId,
      status: editingTaskStatus,
    });
    setEditingTaskId(null);
  };

  const handleFileSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addFile(project.id, {
      title: fileTitle,
      version: fileVersion,
      visibility: fileVisibility,
      notes: fileNotes,
    });
    setFileTitle("");
    setFileVersion("v1");
    setFileVisibility("client");
    setFileNotes("");
  };

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addComment(project.id, { body: comment, internalOnly });
    setComment("");
    setInternalOnly(false);
  };

  const handleFeedbackSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addFeedback(project.id, { action: feedbackAction, body: feedbackBody });
    setFeedbackBody("");
    setFeedbackAction("comment");
  };

  return (
    <main className="page-stack">
      <section className="page-header">
        <p className="eyebrow">{project.category}</p>
        <h1>{project.name}</h1>
        <p className="muted">{project.description}</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Overview</h2>
          <span className={`pill ${getProjectStatusClass(project.status)}`}>
            {getProjectStatusLabel(project.status)}
          </span>
        </div>
        <div className="metadata-grid">
          <div>
            <span className="stat-label">Stage</span>
            <strong>{formatProjectStage(project.stage)}</strong>
          </div>
          <div>
            <span className="stat-label">Due</span>
            <strong>{project.dueDate}</strong>
          </div>
          <div>
            <span className="stat-label">Client</span>
            <strong>{client?.name ?? "Unassigned"}</strong>
          </div>
          <div>
            <span className="stat-label">Assigned</span>
            <strong>{staff.map((member) => member.name).join(", ") || "None"}</strong>
          </div>
        </div>
      </section>

      {canEditDetails ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Project settings</h2>
          </div>
          <ProjectForm
            initialValues={projectFormInitialValues}
            clients={availableClients}
            staff={availableStaff}
            submitLabel="Save Project"
            onSubmit={handleProjectUpdate}
          />
          {canRemoveProject ? (
            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="segment"
                onClick={handleProjectDelete}
                style={{ color: "#b42318", borderColor: "rgba(224, 100, 87, 0.3)" }}
              >
                Delete project
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {canChangeWorkflow(user.role) ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Workflow controls</h2>
          </div>
          <form className="form-stack" onSubmit={handleWorkflowSubmit}>
            <div className="field-row">
              <label className="field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
                  {statuses.map((option) => (
                    <option key={option} value={option}>
                      {getProjectStatusLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Stage</span>
                <select value={stage} onChange={(event) => setStage(event.target.value as ProjectStage)}>
                  {stages.map((option) => (
                    <option key={option} value={option}>
                      {formatProjectStage(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary-button" type="submit">
              Update workflow
            </button>
          </form>
        </section>
      ) : null}

      {project.tasks.length || canManageTasks ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Tasks</h2>
          </div>
          {canManageTasks ? (
            <form className="form-stack compact-form" onSubmit={handleCreateTask}>
              <label className="field">
                <span>Task title</span>
                <input
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  required
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Assignee</span>
                  <select
                    value={newTaskAssigneeId}
                    onChange={(event) => setNewTaskAssigneeId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select staff
                    </option>
                    {availableStaff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    value={newTaskStatus}
                    onChange={(event) => setNewTaskStatus(event.target.value as TaskStatus)}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              </div>
              <button className="primary-button" type="submit">
                Add task
              </button>
            </form>
          ) : null}
          <div className="card-stack">
            {project.tasks.map((task) => {
              const assignee = state.users.find((candidate) => candidate.id === task.assigneeId);
              const canChangeOwnTask = canUserUpdateTaskStatus(user, project, task);
              const canManageThisTask = canEditTask(user.role);

              return (
                <article key={task.id} className="mini-card">
                  <div className="project-row">
                    <strong>{task.title}</strong>
                    <span className="pill pill-subtle">{formatLabel(task.status)}</span>
                  </div>
                  <p className="muted">{assignee?.name}</p>
                  {canManageThisTask ? (
                    <>
                      <div className="inline-actions">
                        <button type="button" className="segment" onClick={() => startEditingTask(task.id)}>
                          Edit
                        </button>
                        {canDeleteTask(user.role) ? (
                          <button
                            type="button"
                            className="segment"
                            onClick={() => deleteTask(project.id, task.id)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                      {editingTaskId === task.id ? (
                        <form className="form-stack compact-form" onSubmit={handleTaskUpdate}>
                          <label className="field">
                            <span>Task title</span>
                            <input
                              value={editingTaskTitle}
                              onChange={(event) => setEditingTaskTitle(event.target.value)}
                              required
                            />
                          </label>
                          <div className="field-row">
                            <label className="field">
                              <span>Assignee</span>
                              <select
                                value={editingTaskAssigneeId}
                                onChange={(event) => setEditingTaskAssigneeId(event.target.value)}
                                required
                              >
                                {availableStaff.map((member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>Status</span>
                              <select
                                value={editingTaskStatus}
                                onChange={(event) =>
                                  setEditingTaskStatus(event.target.value as TaskStatus)
                                }
                              >
                                <option value="todo">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done">Done</option>
                              </select>
                            </label>
                          </div>
                          <div className="inline-actions">
                            <button className="primary-button" type="submit">
                              Save task
                            </button>
                            <button
                              type="button"
                              className="segment"
                              onClick={() => setEditingTaskId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </>
                  ) : null}
                  {canChangeOwnTask ? (
                    <div className="inline-actions">
                      {(["todo", "in_progress", "done"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={task.status === option ? "segment active" : "segment"}
                          onClick={() => updateTaskStatus(project.id, task.id, option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!project.tasks.length ? <p className="muted">No tasks yet.</p> : null}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <h2>Files and versions</h2>
        </div>
        {canUploadFiles(user.role) ? (
          <form className="form-stack compact-form" onSubmit={handleFileSubmit}>
            <label className="field">
              <span>Title</span>
              <input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} required />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Version</span>
                <input value={fileVersion} onChange={(event) => setFileVersion(event.target.value)} />
              </label>
              <label className="field">
                <span>Visibility</span>
                <select
                  value={fileVisibility}
                  onChange={(event) => setFileVisibility(event.target.value as FileVisibility)}
                >
                  <option value="client">Client visible</option>
                  <option value="internal">Internal only</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Notes</span>
              <textarea value={fileNotes} onChange={(event) => setFileNotes(event.target.value)} rows={2} />
            </label>
            <button className="primary-button" type="submit">
              Add file version
            </button>
          </form>
        ) : null}

        <div className="card-stack">
          {visibleFiles.map((file) => {
            const uploader = state.users.find((candidate) => candidate.id === file.uploadedBy);
            return (
              <article className="mini-card" key={file.id}>
                <div className="project-row">
                  <strong>{file.title}</strong>
                  <span className="pill pill-subtle">{file.version}</span>
                </div>
                <p>{file.notes}</p>
                <div className="project-meta">
                  <span>{uploader?.name}</span>
                  <span>{file.visibility}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{user.role === "client" ? "Feedback" : "Comments and approvals"}</h2>
        </div>
        <form
          className="form-stack compact-form"
          onSubmit={user.role === "client" ? handleFeedbackSubmit : handleCommentSubmit}
        >
          {user.role === "client" ? (
            <>
              <label className="field">
                <span>Action</span>
                <select
                  value={feedbackAction}
                  onChange={(event) => setFeedbackAction(event.target.value as FeedbackAction)}
                >
                  <option value="comment">Comment</option>
                  <option value="approve">Approve</option>
                  <option value="request_revision">Request revision</option>
                </select>
              </label>
              <label className="field">
                <span>Message</span>
                <textarea
                  value={feedbackBody}
                  onChange={(event) => setFeedbackBody(event.target.value)}
                  rows={3}
                  required
                />
              </label>
              <button className="primary-button" type="submit">
                Submit feedback
              </button>
            </>
          ) : (
            <>
              <label className="field">
                <span>Comment</span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  required
                />
              </label>
              {canLeaveInternalComment(user.role) ? (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={internalOnly}
                    onChange={(event) => setInternalOnly(event.target.checked)}
                  />
                  <span>Internal only</span>
                </label>
              ) : null}
              <button className="primary-button" type="submit">
                Add comment
              </button>
            </>
          )}
        </form>

        <div className="card-stack">
          {visibleComments.map((item) => {
            const author = state.users.find((candidate) => candidate.id === item.authorId);
            return (
              <article className="mini-card" key={item.id}>
                <div className="project-row">
                  <strong>{author?.name}</strong>
                  {item.internalOnly ? <span className="pill pill-subtle">Internal</span> : null}
                </div>
                <p>{item.body}</p>
              </article>
            );
          })}
          {project.feedback.map((item) => {
            const author = state.users.find((candidate) => candidate.id === item.authorId);
            const feedbackClass =
              item.action === "request_revision"
                ? "status-revision"
                : item.action === "approve"
                  ? "status-approved"
                  : "pill-subtle";
            return (
              <article className="mini-card" key={item.id}>
                <div className="project-row">
                  <strong>{author?.name}</strong>
                  <span className={`pill ${feedbackClass}`}>
                    {item.action === "request_revision"
                      ? "Revision Needed"
                      : item.action === "approve"
                        ? "Approved"
                        : "Comment"}
                  </span>
                </div>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
