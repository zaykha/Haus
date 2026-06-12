"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import styled, { css } from "styled-components";
import { optimizeImageToWebp, uploadOptimizedImage } from "@/lib/image-upload";
import { formatLabel } from "@/lib/display";
import { TaskManagerReviewStatus, TaskStatus } from "@/lib/types";

type DesignerTaskModalTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  status: TaskStatus;
  completionScreenshotUrl?: string | null;
  managerReviewStatus?: TaskManagerReviewStatus;
};

type Props = {
  open: boolean;
  task: DesignerTaskModalTask | null;
  onClose: () => void;
  onSubmit: (payload: {
    taskId: string;
    projectId: string;
    status: TaskStatus;
    completionScreenshotUrl?: string | null;
  }) => Promise<void>;
};

const desktop = "@media (min-width: 768px)";

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getCompletionMessage(reviewStatus?: TaskManagerReviewStatus) {
  if (reviewStatus === "ready_for_client") {
    return "This task has already been sent to the client and is locked until a manager reopens it.";
  }

  if (reviewStatus === "internal") {
    return "This task was completed and kept internal. It is locked until a manager reopens it.";
  }

  return "This task is complete. A manager must move it back to In Progress before you can update it again.";
}

export function DesignerTaskModal({ open, task, onClose, onSubmit }: Props) {
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [statusOpen, setStatusOpen] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!task) {
      return;
    }

    setStatus(task.status);
    setStatusOpen(false);
    setScreenshotFile(null);
    setScreenshotPreview(task.completionScreenshotUrl ?? null);
    setError("");
  }, [task]);

  useEffect(() => {
    return () => {
      if (screenshotPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(screenshotPreview);
      }
    };
  }, [screenshotPreview]);

  if (!open || !task) {
    return null;
  }

  const isLocked = task.status === "done" || task.status === "review" || task.status === "approved";

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setScreenshotFile(file);
    setScreenshotPreview(file ? URL.createObjectURL(file) : task.completionScreenshotUrl ?? null);
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked) {
      onClose();
      return;
    }

    if (status === "done" && !screenshotFile && !task.completionScreenshotUrl) {
      setError("Upload a completion screenshot before marking this task complete.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      let completionScreenshotUrl = task.completionScreenshotUrl ?? null;
      if (screenshotFile) {
        const optimized = await optimizeImageToWebp(screenshotFile, {
          maxDimension: 1600,
          quality: 0.82,
        });
        completionScreenshotUrl = await uploadOptimizedImage(optimized, "task-completion");
      }

      await onSubmit({
        taskId: task.id,
        projectId: task.projectId,
        status,
        completionScreenshotUrl: status === "done" ? completionScreenshotUrl : null,
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isSubmitting ? (
        <LoadingOverlay role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Updating task...</p>
          </div>
        </LoadingOverlay>
      ) : null}
      <ModalBackdrop onClick={onClose}>
        <ModalCard onClick={(event) => event.stopPropagation()}>
          <ModalHeader>
            <div>
              <ModalTitle>{isLocked ? "Task status" : "Update task"}</ModalTitle>
              <ModalDescription>
                {isLocked
                  ? getCompletionMessage(task.managerReviewStatus)
                  : "Move your task forward and attach a completion screenshot when it is done."}
              </ModalDescription>
            </div>
            <ModalClose type="button" onClick={onClose} aria-label="Close">
              <IconClose />
            </ModalClose>
          </ModalHeader>

          <InlineForm onSubmit={handleSubmit}>
            <TaskModalGrid>
             <TaskSummaryCard>
              <TaskSummaryHeader>
                  <TaskSummaryEyebrow>Task</TaskSummaryEyebrow>
                  <TaskSummaryTitle>{task.title}</TaskSummaryTitle>
                </TaskSummaryHeader>

                <TaskSummaryGrid>
                  <TaskSummaryItem>
                    <TaskSummaryLabel>Project</TaskSummaryLabel>
                    <TaskSummaryValue>{task.projectName}</TaskSummaryValue>
                  </TaskSummaryItem>

                  <TaskSummaryItem>
                    <TaskSummaryLabel>Due date</TaskSummaryLabel>
                    <TaskSummaryValue>{formatDueDate(task.dueDate)}</TaskSummaryValue>
                  </TaskSummaryItem>
                </TaskSummaryGrid>
              </TaskSummaryCard>
              <TaskModalField $wide>
                {isLocked ? (
                  <TaskFloatingField className="auth-field is-filled">
                    <TaskTextInput value={formatLabel(task.status)} readOnly placeholder=" " />
                    <span>Status</span>
                  </TaskFloatingField>
                ) : (
                  <TaskFloatingSelect $filled $open={statusOpen}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={statusOpen}
                      onClick={() => setStatusOpen((current) => !current)}
                    >
                      <TaskSelectValue>{formatLabel(status)}</TaskSelectValue>
                      <TaskSelectChevron $open={statusOpen}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Status</TaskFloatingLabel>
                    {statusOpen ? (
                      <TaskSelectMenu role="listbox" aria-label="Task status">
                        {(["todo", "in_progress", "done"] as TaskStatus[]).map((option) => (
                          <TaskSelectOption
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={status === option}
                            $active={status === option}
                            onClick={() => {
                              setStatus(option);
                              setStatusOpen(false);
                              setError("");
                            }}
                          >
                            {formatLabel(option)}
                          </TaskSelectOption>
                        ))}
                      </TaskSelectMenu>
                    ) : null}
                  </TaskFloatingSelect>
                )}
              </TaskModalField>
            </TaskModalGrid>

            {/* {screenshotPreview ? (
              <ScreenshotPreviewWrap>
                <ScreenshotPreview src={screenshotPreview} alt="Task completion screenshot preview" />
              </ScreenshotPreviewWrap>
            ) : null}

            {!isLocked && status === "done" ? (
              <UploadField>
                <MetaLabel>Completion screenshot</MetaLabel>
                <UploadHint>Required when marking the task complete.</UploadHint>
                <UploadButton as="label">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    onChange={handleFileChange}
                  />
                  <IconUpload />
                  <span>{screenshotFile ? "Replace screenshot" : "Upload screenshot"}</span>
                </UploadButton>
              </UploadField>
            ) : null} */}
          {!isLocked && status === "done" ? (<UploadCompactArea>
            <UploadLabel>Completion screenshot</UploadLabel>

            {screenshotPreview ? (
              <ImageReplaceLabel>
                <ScreenshotPreview src={screenshotPreview} alt="Task completion preview" />
                {!isLocked ? <ReplaceImageOverlay>Tap to replace image</ReplaceImageOverlay> : null}

                {!isLocked ? (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    hidden
                  />
                ) : null}
              </ImageReplaceLabel>
            ) : (
              <>
                <UploadEmptyState>No screenshot uploaded yet.</UploadEmptyState>

                {!isLocked ? (
                  <UploadButtonLabel>
                    Choose image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      hidden
                    />
                  </UploadButtonLabel>
                ) : null}
              </>
            )}
          </UploadCompactArea>): null} 
            {error ? <InlineError>{error}</InlineError> : null}

            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isLocked ? "Close" : isSubmitting ? "Updating..." : "Update task"}
            </button>
          </InlineForm>
        </ModalCard>
      </ModalBackdrop>
    </>
  );
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);
`;

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
`;

const ModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 620px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-radius: 26px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.08rem;
`;

const ModalDescription = styled.p`
  margin: 6px 0 0;
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
`;

const InlineForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const TaskModalGrid = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskModalField = styled.div<{ $wide?: boolean }>`
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

const UploadField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const MetaLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const UploadHint = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
`;

const UploadButton = styled.label`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 1px dashed rgba(33, 79, 57, 0.28);
  border-radius: 16px;
  background: rgba(244, 248, 246, 0.92);
  color: #214f39;
  font-weight: 600;
  cursor: pointer;

  input {
    display: none;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ScreenshotPreviewWrap = styled.div`
  ${cardSurface}
  padding: 10px;
  border-radius: 18px;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.84rem;
  line-height: 1.45;
`;

const TaskSummaryCard = styled.div`
  border-radius: 18px;
  background: rgba(251, 250, 247, 0.96);
  border: 1px solid rgba(230, 224, 215, 0.9);
  padding: 14px;
  display: grid;
  gap: 12px;

  @media (min-width: 768px) {
    padding: 16px;
  }
`;

const TaskSummaryHeader = styled.div`
  display: grid;
  gap: 4px;
`;

const TaskSummaryEyebrow = styled.span`
  color: #7f7468;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const TaskSummaryTitle = styled.h3`
  margin: 0;
  color: #1f1f1f;
  font-size: 1rem;
  line-height: 1.3;
  letter-spacing: -0.02em;
`;

const TaskSummaryGrid = styled.div`
  display: grid;
  gap: 10px;

  @media (min-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskSummaryItem = styled.div`
  display: grid;
  gap: 3px;
`;

const TaskSummaryLabel = styled.span`
  color: #8b8277;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const TaskSummaryValue = styled.strong`
  color: #2e2a27;
  font-size: 0.9rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const CompactFieldGroup = styled.label`
  display: grid;
  gap: 8px;
`;

const CompactFieldLabel = styled.span`
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const StatusSelect = styled.select`
  width: 100%;
  min-height: 46px;
  border-radius: 14px;
  border: 1.5px solid rgba(47, 93, 80, 0.28);
  background: #fff;
  color: #1f1f1f;
  padding: 0 14px;
  font-size: 0.95rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const UploadCompactArea = styled.div`
  display: grid;
  gap: 10px;
  border-radius: 18px;
  border: 1px dashed rgba(47, 93, 80, 0.22);
  background: rgba(251, 250, 247, 0.8);
  padding: 12px;
`;

const UploadLabel = styled.span`
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const ScreenshotPreview = styled.img`
  width: 100%;
  max-height: 170px;
  object-fit: cover;
  border-radius: 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);

  @media (min-width: 768px) {
    max-height: 220px;
  }
`;

const UploadEmptyState = styled.p`
  margin: 0;
  color: #8b8277;
  font-size: 0.86rem;
  line-height: 1.45;
`;

const UploadButtonLabel = styled.label`
  min-height: 42px;
  border-radius: 14px;
  background: #214f39;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
`;

const ImageReplaceLabel = styled.label`
  position: relative;
  display: block;
  cursor: pointer;
  border-radius: 14px;
  overflow: hidden;

  &:hover span {
    opacity: 1;
  }
`;

const ReplaceImageOverlay = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(31, 31, 31, 0.42);
  color: #fff;
  font-size: 0.86rem;
  font-weight: 800;
  opacity: 0;
  transition: opacity 160ms ease;

  @media (max-width: 767px) {
    opacity: 1;
    align-items: end;
    padding-bottom: 12px;
    background: linear-gradient(
      180deg,
      rgba(31, 31, 31, 0) 35%,
      rgba(31, 31, 31, 0.58) 100%
    );
  }
`;

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}
