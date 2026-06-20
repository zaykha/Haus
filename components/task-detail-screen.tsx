"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { useAppState } from "@/components/app-state";
import { formatLabel, getTaskStatusLabel } from "@/lib/display";
import { canEditTask, canViewProject } from "@/lib/permissions";
import {
  getCurrentTaskCompletionLabel,
  getTaskCompletionLabel,
  isTaskCompletionImage,
  isTaskCompletionLink,
  parseTaskCompletionAssets,
  parseTaskCompletionState,
} from "@/lib/task-completion-assets";
import { TaskPriority, TaskStatus } from "@/lib/types";

const desktop = "@media (min-width: 1100px)";

type TaskDetailScreenProps = {
  projectId: string;
  taskId: string;
};

export function TaskDetailScreen({ projectId, taskId }: TaskDetailScreenProps) {
  const router = useRouter();
  const { state, user, updateTask } = useAppState();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState<"assignee" | "status" | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("current");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");
  const [error, setError] = useState("");

  const project = useMemo(
    () => state.projects.find((candidate) => candidate.id === projectId) ?? null,
    [projectId, state.projects],
  );
  const task = useMemo(
    () => project?.tasks.find((candidate) => candidate.id === taskId) ?? null,
    [project, taskId],
  );
  const completionState = useMemo(
    () => parseTaskCompletionState(task?.completionScreenshotUrl ?? null),
    [task?.completionScreenshotUrl],
  );
  const taskAssets = useMemo(
    () => parseTaskCompletionAssets(task?.completionScreenshotUrl ?? null),
    [task?.completionScreenshotUrl],
  );
  const currentVersionAssets = useMemo(() => {
    if (
      completionState.history.length > 0 &&
      (task?.managerReviewStatus === "revision_requested" || task?.status === "in_progress")
    ) {
      return [];
    }

    return taskAssets;
  }, [completionState.history.length, task?.managerReviewStatus, task?.status, taskAssets]);
  const versionOptions = useMemo(() => {
    const currentVersionLabel = getCurrentTaskCompletionLabel(completionState);
    const historyOptions = completionState.history
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((snapshot) => snapshot.id !== currentVersionLabel)
      .map((snapshot) => ({
        id: snapshot.id,
        label: snapshot.label,
        assets: snapshot.assets,
        isCurrent: false,
      }));

    return [
      {
        id: "current",
        label: `${currentVersionLabel} (Current)`,
        assets: currentVersionAssets,
        isCurrent: true,
      },
      ...historyOptions,
    ];
  }, [completionState, currentVersionAssets]);
  const selectedVersion =
    versionOptions.find((option) => option.id === selectedVersionId) ?? versionOptions[0] ?? null;
  const displayedAssets = useMemo(() => selectedVersion?.assets ?? [], [selectedVersion]);
  const imageAssets = useMemo(
    () => displayedAssets.filter((asset) => isTaskCompletionImage(asset)),
    [displayedAssets],
  );
  const linkAssets = useMemo(
    () => displayedAssets.filter((asset) => !isTaskCompletionImage(asset) && isPlainExternalLink(asset)),
    [displayedAssets],
  );
  const fileAssets = useMemo(
    () => displayedAssets.filter((asset) => !isTaskCompletionImage(asset) && !isPlainExternalLink(asset)),
    [displayedAssets],
  );
  const canManagerReview =
    task?.status === "done" && task.managerReviewStatus === "internal" && currentVersionAssets.length > 0;
  const availableStaff = useMemo(
    () => state.users.filter((candidate) => candidate.role !== "client"),
    [state.users],
  );
  const clientOrganization = useMemo(
    () =>
      project?.clientOrganizationId
        ? state.clientOrganizations.find((organization) => organization.id === project.clientOrganizationId) ?? null
        : null,
    [project?.clientOrganizationId, state.clientOrganizations],
  );
  const assignee = availableStaff.find((candidate) => candidate.id === assigneeId) ?? null;

  useEffect(() => {
    if (!task || !project) {
      return;
    }

    setTitle(task.title);
    setAssigneeId(task.assigneeId);
    setStatus(task.status);
    setDueDate(task.dueDate ?? project.dueDate);
    setPriority(task.priority ?? "medium");
    setShowSubmitConfirm(false);
    setShowReviseModal(false);
    setRevisionComment("");
    setError("");
    setSelectOpen(null);
    setVersionOpen(false);
    setSelectedVersionId("current");
    setPreviewAsset(null);
    setIsEditing(false);
  }, [project, task]);

  if (!user || !project || !task || !canViewProject(user, project) || !canEditTask(user.role)) {
    return (
      <Shell>
        {user ? <AppSidebar user={user} activeLabel="Projects" /> : null}
        <Content>
          <EmptyState>
            <strong>Task not found</strong>
            <p>This task is not available from your current role.</p>
            <InlineLink href="/tasks">Return to tasks</InlineLink>
          </EmptyState>
        </Content>
      </Shell>
    );
  }

  const handleSaveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      await updateTask(project.id, task.id, {
        title,
        assigneeId,
        status,
        dueDate,
        priority,
        completionScreenshotUrl: task.completionScreenshotUrl ?? null,
        clientVisible: task.clientVisible,
        managerReviewStatus: task.managerReviewStatus,
      });
      setIsEditing(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update task.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleManagerSubmit = async () => {
    setIsSaving(true);
    setError("");

    try {
      await updateTask(project.id, task.id, {
        title,
        assigneeId,
        status: "review",
        dueDate,
        priority,
        completionScreenshotUrl: task.completionScreenshotUrl ?? null,
        clientVisible: true,
        managerReviewStatus: "ready_for_client",
      });
      setShowSubmitConfirm(false);
      setRevisionComment("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update task.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleManagerRevise = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!revisionComment.trim()) {
      setError("Add revision feedback before sending the task back.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await updateTask(project.id, task.id, {
        title,
        assigneeId,
        status: "in_progress",
        dueDate,
        priority,
        completionScreenshotUrl: task.completionScreenshotUrl ?? null,
        clientVisible: false,
        managerReviewStatus: "revision_requested",
        activityNote: revisionComment.trim(),
      });
      setShowReviseModal(false);
      setRevisionComment("");
      router.push(`/projects/${project.id}`);
      return;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update task.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Shell>
      {isSaving ? (
        <LoadingOverlay role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Saving task...</p>
          </div>
        </LoadingOverlay>
      ) : null}
      {previewAsset ? (
        <PreviewOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Deliverable preview"
          onClick={() => setPreviewAsset(null)}
        >
          <PreviewCloseButton
            type="button"
            aria-label="Close preview"
            onClick={() => setPreviewAsset(null)}
          >
            <IconClose />
          </PreviewCloseButton>
          <PreviewFrame onClick={(event) => event.stopPropagation()}>
            <PreviewImage src={previewAsset} alt={`${task.title} deliverable preview`} />
          </PreviewFrame>
        </PreviewOverlay>
      ) : null}
      <ConfirmActionModal
        open={showSubmitConfirm}
        title="Submit to client"
        description="This will send the current deliverables to the client for review."
        confirmLabel="Submit to client"
        busy={isSaving}
        onCancel={() => {
          if (!isSaving) {
            setShowSubmitConfirm(false);
          }
        }}
        onConfirm={handleManagerSubmit}
      />
      {showReviseModal ? (
        <ReviewModalOverlay onClick={() => (isSaving ? null : setShowReviseModal(false))}>
          <ReviewModalCard onClick={(event) => event.stopPropagation()}>
            <PanelHeader>
              <PanelTitle>Send revision</PanelTitle>
              <ModalClose
                type="button"
                onClick={() => {
                  if (!isSaving) {
                    setShowReviseModal(false);
                  }
                }}
                aria-label="Close"
              >
                <IconClose />
              </ModalClose>
            </PanelHeader>
            <ReviewModalDescription>
              Add revision feedback for the designer before sending this task back to work in progress.
            </ReviewModalDescription>
            <EditForm onSubmit={handleManagerRevise}>
              <FieldStack>
                <FieldLabel>Revision feedback</FieldLabel>
                <TaskTextArea
                  value={revisionComment}
                  onChange={(event) => setRevisionComment(event.target.value)}
                  rows={5}
                  placeholder="Explain what needs to be changed before this can be resubmitted."
                />
              </FieldStack>
              {error ? <InlineError>{error}</InlineError> : null}
              <ActionRow>
                <button className="primary-button" type="submit" disabled={isSaving}>
                  {isSaving ? "Sending..." : "Send revision"}
                </button>
              </ActionRow>
            </EditForm>
          </ReviewModalCard>
        </ReviewModalOverlay>
      ) : null}
      <AppSidebar user={user} activeLabel="Projects" />
      <Content>
        <Header>
          <div>
            <BackLink href={`/projects/${project.id}`}>Projects / {project.projectRequestName || project.name}</BackLink>
            <Title>{task.title}</Title>
            <Subtitle>Review task details and update assignment, status, priority, or due date.</Subtitle>
          </div>
          <HeaderActions>
            <ActionButton type="button" onClick={() => setIsEditing((current) => !current)}>
              <IconPencil />
              {isEditing ? "Cancel edit" : "Edit task"}
            </ActionButton>
          </HeaderActions>
        </Header>

        <TaskMetaGrid>
          <TaskMetaCard>
            <MetaLabel>Project</MetaLabel>
            <MetaValue>{project.projectRequestName || project.name}</MetaValue>
          </TaskMetaCard>
          <TaskMetaCard>
            <MetaLabel>Client Org</MetaLabel>
            <MetaValue>{clientOrganization?.name ?? "Unassigned client"}</MetaValue>
          </TaskMetaCard>
          <TaskMetaCard>
            <MetaLabel>Assignee</MetaLabel>
            <MetaValue>{availableStaff.find((member) => member.id === task.assigneeId)?.name ?? "Unassigned"}</MetaValue>
          </TaskMetaCard>
          <TaskMetaCard>
            <MetaLabel>Status</MetaLabel>
            <MetaValue>{getTaskStatusLabel(task.status)}</MetaValue>
          </TaskMetaCard>
          <TaskMetaCard>
            <MetaLabel>Priority</MetaLabel>
            <MetaValue>{formatLabel(task.priority ?? "medium")}</MetaValue>
          </TaskMetaCard>
        </TaskMetaGrid>

        {!isEditing && task.status === "review" && task.managerReviewStatus === "ready_for_client" ? (
          <ReviewStateBanner>
            <ReviewStatePill>Awaiting Client Review</ReviewStatePill>
            <ReviewStateText>
              The submitted deliverables are still attached and currently waiting for client approval or revision.
            </ReviewStateText>
          </ReviewStateBanner>
        ) : null}

        {isEditing ? (
          <Panel>
            <PanelTitle>Task details</PanelTitle>
            <EditForm onSubmit={handleSaveDetails}>
              <TaskFormGrid>
                <TaskFormField $wide>
                  <TaskFloatingField className={title ? "auth-field is-filled" : "auth-field"}>
                    <TaskTextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder=" " required />
                    <span>Task title</span>
                  </TaskFloatingField>
                </TaskFormField>

                <TaskFormField>
                  <TaskFloatingSelect $filled={Boolean(assigneeId)} $open={selectOpen === "assignee"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={selectOpen === "assignee"}
                      onClick={() => setSelectOpen((current) => (current === "assignee" ? null : "assignee"))}
                    >
                      <TaskSelectValue>{assignee?.name ?? "Select staff"}</TaskSelectValue>
                      <TaskSelectChevron $open={selectOpen === "assignee"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Assignee</TaskFloatingLabel>
                    {selectOpen === "assignee" ? (
                      <TaskSelectMenu role="listbox" aria-label="Assignee">
                        {availableStaff.map((member) => (
                          <TaskSelectOption
                            key={member.id}
                            type="button"
                            role="option"
                            aria-selected={assigneeId === member.id}
                            $active={assigneeId === member.id}
                            onClick={() => {
                              setAssigneeId(member.id);
                              setSelectOpen(null);
                            }}
                          >
                            {member.name}
                          </TaskSelectOption>
                        ))}
                      </TaskSelectMenu>
                    ) : null}
                  </TaskFloatingSelect>
                </TaskFormField>

                <TaskFormField>
                  <TaskFloatingSelect $filled $open={selectOpen === "status"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={selectOpen === "status"}
                      onClick={() => setSelectOpen((current) => (current === "status" ? null : "status"))}
                    >
                      <TaskSelectValue>{getTaskStatusLabel(status)}</TaskSelectValue>
                      <TaskSelectChevron $open={selectOpen === "status"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Status</TaskFloatingLabel>
                    {selectOpen === "status" ? (
                      <TaskSelectMenu role="listbox" aria-label="Status">
                        {(["todo", "in_progress", "done"] as TaskStatus[]).map((option) => (
                          <TaskSelectOption
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={status === option}
                            $active={status === option}
                            onClick={() => {
                              setStatus(option);
                              setSelectOpen(null);
                            }}
                          >
                            {getTaskStatusLabel(option)}
                          </TaskSelectOption>
                        ))}
                      </TaskSelectMenu>
                    ) : null}
                  </TaskFloatingSelect>
                </TaskFormField>

                <TaskFormField>
                  <CustomDatePicker label="Due date" value={dueDate} onChange={setDueDate} />
                </TaskFormField>
              </TaskFormGrid>

              <PriorityField>
                <MetaLabel>Priority</MetaLabel>
                <PriorityChips>
                  {(["high", "medium", "low"] as TaskPriority[]).map((option) => (
                    <PriorityChip
                      key={option}
                      type="button"
                      $tone={option}
                      $active={priority === option}
                      onClick={() => setPriority(option)}
                    >
                      {formatLabel(option)}
                    </PriorityChip>
                  ))}
                </PriorityChips>
              </PriorityField>

              {error ? <InlineError>{error}</InlineError> : null}

              <ActionRow>
                <button className="primary-button" type="submit">
                  Save details
                </button>
              </ActionRow>
            </EditForm>
          </Panel>
        ) : null}

        {!isEditing ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>
                {task.status === "review" && task.managerReviewStatus === "ready_for_client"
                  ? "Submitted deliverables"
                  : "Deliverables"}
              </PanelTitle>
              <DeliverablesHeaderActions>
                {task.status === "review" && task.managerReviewStatus === "ready_for_client" ? (
                  <PanelMetaPill>Visible to client</PanelMetaPill>
                ) : null}
                {versionOptions.length > 1 ? (
                  <VersionSelectWrap>
                    <TaskFloatingSelect $filled $open={versionOpen}>
                      <CompactSelectTrigger
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={versionOpen}
                        onClick={() => setVersionOpen((current) => !current)}
                      >
                        <CompactSelectValue>{selectedVersion?.label ?? "Select version"}</CompactSelectValue>
                        <TaskSelectChevron $open={versionOpen}>
                          <IconChevronDown />
                        </TaskSelectChevron>
                      </CompactSelectTrigger>
                      {versionOpen ? (
                        <TaskSelectMenu role="listbox" aria-label="Version">
                          {versionOptions.map((option) => (
                            <TaskSelectOption
                              key={option.id}
                              type="button"
                              role="option"
                              aria-selected={selectedVersionId === option.id}
                              $active={selectedVersionId === option.id}
                              onClick={() => {
                                setSelectedVersionId(option.id);
                                setVersionOpen(false);
                              }}
                            >
                              {option.label}
                            </TaskSelectOption>
                          ))}
                        </TaskSelectMenu>
                      ) : null}
                    </TaskFloatingSelect>
                  </VersionSelectWrap>
                ) : null}
              </DeliverablesHeaderActions>
            </PanelHeader>
            {task.status === "review" && task.managerReviewStatus === "ready_for_client" ? (
              <PanelCaption>
                These are the exact files currently under client review.
              </PanelCaption>
            ) : null}
            {displayedAssets.length ? (
              <DeliverableStack>
                {imageAssets.length ? (
                  <DeliverableGroup>
                    <DeliverableLabel>Screenshots</DeliverableLabel>
                    <AssetGrid>
                      {imageAssets.map((asset) => (
                        <AssetCard key={asset}>
                          <AssetPreviewWrap type="button" onClick={() => setPreviewAsset(asset)}>
                            <AssetPreview src={asset} alt={`${getTaskCompletionLabel(asset)} for ${task.title}`} />
                          </AssetPreviewWrap>
                          <AssetNameButton type="button" onClick={() => setPreviewAsset(asset)}>
                            {getTaskCompletionLabel(asset)}
                          </AssetNameButton>
                        </AssetCard>
                      ))}
                    </AssetGrid>
                  </DeliverableGroup>
                ) : null}

                {fileAssets.length ? (
                  <DeliverableGroup>
                    <DeliverableLabel>Files</DeliverableLabel>
                    <AssetList>
                      {fileAssets.map((asset) => (
                        <AssetFileCard key={asset} href={asset} target="_blank" rel="noreferrer">
                          <IconFile />
                          <span>{getTaskCompletionLabel(asset)}</span>
                        </AssetFileCard>
                      ))}
                    </AssetList>
                  </DeliverableGroup>
                ) : null}

                {linkAssets.length ? (
                  <DeliverableGroup>
                    <DeliverableLabel>URLs</DeliverableLabel>
                    <AssetList>
                      {linkAssets.map((asset) => (
                        <AssetFileCard key={asset} href={asset} target="_blank" rel="noreferrer">
                          <IconLink />
                          <span>{getTaskCompletionLabel(asset)}</span>
                        </AssetFileCard>
                      ))}
                    </AssetList>
                  </DeliverableGroup>
                ) : null}

                <DeliverableGroup>
                  <DeliverableLabel>{selectedVersion?.isCurrent ? "Current assets" : "Version assets"}</DeliverableLabel>
                  <AssetList>
                    {displayedAssets.map((asset) => (
                      <AssetFileCard
                        key={`all-${asset}`}
                        href={asset}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {isTaskCompletionImage(asset) ? <IconImage /> : isPlainExternalLink(asset) ? <IconLink /> : <IconFile />}
                        <span>{getTaskCompletionLabel(asset)}</span>
                      </AssetFileCard>
                    ))}
                  </AssetList>
                </DeliverableGroup>
              </DeliverableStack>
            ) : (
              <EmptyInline>
                {selectedVersion?.isCurrent
                  ? "Not updated yet."
                  : "No deliverables were uploaded for this version."}
              </EmptyInline>
            )}
          </Panel>
        ) : null}

        {!isEditing && canManagerReview ? (
          <Panel>
            <PanelTitle>Manager review</PanelTitle>
            <ReviewActions>
              <ReviewActionButton type="button" onClick={() => {
                setError("");
                setShowSubmitConfirm(true);
              }}>
                Submit to client
              </ReviewActionButton>
              <ReviewActionButton type="button" onClick={() => {
                setError("");
                setShowReviseModal(true);
              }}>
                Revise
              </ReviewActionButton>
            </ReviewActions>
          </Panel>
        ) : null}
      </Content>
    </Shell>
  );
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const Shell = styled.main`
  display: block;
  min-height: 100vh;
  padding: 16px 14px 20px;

  ${desktop} {
    display: flex;
    align-items: flex-start;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
  }
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 20px 24px 24px;
    border-radius: 0 26px 26px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84));
  }
`;

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  color: var(--color-text-muted);
  font-size: 0.86rem;
  text-decoration: none;
`;

const Title = styled.h1`
  margin: 10px 0 6px;
  font-size: clamp(1.34rem, 3vw, 1.9rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
`;

const ActionButton = styled.button`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 700;
`;

const Panel = styled.section`
  ${cardSurface}
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 22px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const DeliverablesHeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
`;

const PanelMetaPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #e9f5ee;
  color: #2b7a4b;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
`;

const PanelCaption = styled.p`
  margin: -6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.4;
`;

const TaskMetaGrid = styled.section`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
`;

const TaskMetaCard = styled.div`
  ${cardSurface}
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 18px;
`;

const ReviewStateBanner = styled.div`
  ${cardSurface}
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 250, 239, 0.96);

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const ReviewStatePill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fff1da;
  color: #ca8a22;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  white-space: nowrap;
`;

const ReviewStateText = styled.p`
  margin: 0;
  color: #7c6c58;
  font-size: 0.84rem;
  line-height: 1.45;
`;

const MetaLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const MetaValue = styled.strong`
  color: #1f1f1f;
  font-size: 0.92rem;
  line-height: 1.35;
`;

const EditForm = styled.form`
  display: grid;
  gap: 14px;
`;

const TaskFormGrid = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskFormField = styled.div<{ $wide?: boolean }>`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${({ $wide }) =>
    $wide
      ? css`
          ${desktop} {
            grid-column: 1 / -1;
          }
        `
      : ""}
`;

const TaskFloatingField = styled.label`
  width: 100%;
`;

const TaskTextInput = styled.input`
  width: 100%;
  min-height: 58px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  font-size: 16px;
`;

const TaskTextArea = styled.textarea`
  width: 100%;
  min-height: 132px;
  padding: 14px 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  font-size: 15px;
  line-height: 1.5;
  resize: vertical;
`;

const TaskFloatingSelect = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const TaskSelectTrigger = styled.button`
  width: 100%;
  padding: 18px 16px 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  font-size: 16px;
  text-align: left;
`;

const CompactSelectTrigger = styled(TaskSelectTrigger)`
  width: auto;
  min-width: 180px;
  padding: 10px 14px;
  align-items: center;
  border-radius: 12px;
  font-size: 0.9rem;

  @media (max-width: 767px) {
    width: 100%;
  }
`;

const TaskFloatingLabel = styled.span`
  position: absolute;
  left: 16px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #29463e;
  font-size: 13px;
  font-weight: 500;
  z-index: 3;
  pointer-events: none;
`;

const TaskSelectValue = styled.span`
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.2;
`;

const CompactSelectValue = styled(TaskSelectValue)`
  font-size: 0.9rem;
`;

const VersionSelectWrap = styled.div`
  min-width: 180px;

  ${TaskFloatingLabel} {
    display: none;
  }

  @media (max-width: 767px) {
    width: 100%;
  }
`;

const TaskSelectChevron = styled.span<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transform: rotate(${({ $open }) => ($open ? "180deg" : "0deg")});
  transition: transform 140ms ease;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const TaskSelectMenu = styled.div`
  ${cardSurface}
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  max-height: 240px;
  overflow-y: auto;
`;

const TaskSelectOption = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: ${({ $active }) => ($active ? "rgba(31, 67, 57, 0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "#1f4339" : "var(--color-text)")};
  font-size: 0.94rem;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  text-align: left;
`;

const PriorityField = styled.div`
  display: grid;
  gap: 10px;
`;

const PriorityChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const PriorityChip = styled.button<{ $active?: boolean; $tone: TaskPriority }>`
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid
    ${({ $active, $tone }) =>
      $active
        ? $tone === "high"
          ? "#e06457"
          : $tone === "medium"
            ? "#ca8a22"
            : "#5ca16d"
        : "rgba(230, 224, 215, 0.95)"};
  background: ${({ $active, $tone }) =>
    $active
      ? $tone === "high"
        ? "#ffe7e5"
        : $tone === "medium"
          ? "#fff1da"
          : "#e5f4e8"
      : "rgba(255, 255, 255, 0.92)"};
  color: ${({ $active, $tone }) =>
    $active
      ? $tone === "high"
        ? "#e06457"
        : $tone === "medium"
          ? "#ca8a22"
          : "#5ca16d"
      : "var(--color-text)"};
  font-size: 0.84rem;
  font-weight: 700;
`;

const AssetGrid = styled.div`
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  ${desktop} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

const DeliverableStack = styled.div`
  display: grid;
  gap: 12px;
`;

const DeliverableGroup = styled.div`
  display: grid;
  gap: 6px;
`;

const DeliverableLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const AssetList = styled.div`
  display: grid;
  gap: 4px;
`;

const AssetCard = styled.div`
  display: grid;
  gap: 4px;
`;

const AssetNameButton = styled.button`
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: zoom-in;
`;

const AssetPreviewWrap = styled.button`
  ${cardSurface}
  width: 100%;
  padding: 4px;
  border-radius: 12px;
  cursor: zoom-in;
`;

const AssetPreview = styled.img`
  width: 100%;
  aspect-ratio: 1 / 1;
  display: block;
  object-fit: cover;
  border-radius: 8px;
`;

const AssetFileCard = styled.a`
  ${cardSurface}
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  border-radius: 10px;
  color: var(--color-text);
  text-decoration: none;

  span {
    font-size: 0.64rem;
    font-weight: 700;
    overflow-wrap: anywhere;
    line-height: 1.1;
  }

  svg {
    width: 11px;
    height: 11px;
    flex: 0 0 auto;
    color: #8d6520;
  }
`;

const PreviewOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 180;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 18, 16, 0.84);
  backdrop-filter: blur(8px);
`;

const PreviewFrame = styled.div`
  max-width: min(1200px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  display: grid;
  place-items: center;
`;

const PreviewImage = styled.img`
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  border-radius: 18px;
  object-fit: contain;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
`;

const PreviewCloseButton = styled.button`
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 181;
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  backdrop-filter: blur(10px);

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ReviewModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 170;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);
`;

const ReviewModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 520px);
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 24px;
`;

const ReviewModalDescription = styled.p`
  margin: -8px 0 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.5;
`;

const ModalClose = styled.button`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  flex: 0 0 40px;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ReviewActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ReviewActionButton = styled.button<{ $active?: boolean }>`
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? "transparent" : "rgba(230, 224, 215, 0.95)")};
  background: ${({ $active }) => ($active ? "#214f39" : "rgba(255, 255, 255, 0.92)")};
  color: ${({ $active }) => ($active ? "#fff" : "#214f39")};
  font-size: 0.86rem;
  font-weight: 700;
`;

const FieldStack = styled.label`
  display: grid;
  gap: 8px;
`;

const FieldLabel = styled.span`
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.84rem;
  line-height: 1.45;
`;

const EmptyState = styled.div`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px;
  border-radius: 20px;
  color: var(--color-text-muted);

  strong {
    color: var(--color-text);
    font-size: 0.92rem;
  }

  p {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
  }
`;

const EmptyInline = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
`;

const InlineLink = styled(Link)`
  color: #1f4339;
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
`;

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 20 7-7" />
      <path d="m16 4 4 4" />
      <path d="M4 20h4l10-10-4-4L4 16z" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10.41 5.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07l2.42-2.4" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m20.5 15-4.5-4.5L8 18" />
    </svg>
  );
}

function isPlainExternalLink(value: string) {
  if (!isTaskCompletionLink(value)) {
    return false;
  }

  const path = getAssetPath(value).toLowerCase();
  return !/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|txt|csv|ai|psd|fig|sketch|mp4|mov|webm)$/i.test(path);
}

function getAssetPath(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  );
}
