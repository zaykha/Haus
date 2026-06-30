"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { optimizeImageToWebp } from "@/lib/image-upload";
import {
  getCurrentTaskCompletionLabel,
  getTaskCompletionLabel,
  isTaskCompletionImage,
  isTaskCompletionLink,
  parseTaskCompletionAssets,
  parseTaskCompletionState,
  serializeTaskCompletionAssets,
} from "@/lib/task-completion-assets";
import { uploadTaskDeliverable } from "@/lib/task-deliverable-upload";
import { getTaskStatusLabel } from "@/lib/display";
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
  feedbackEntries?: {
    id: string;
    source: "internal" | "client";
    author: string;
    body: string;
    createdAt: string;
    rating?: number | null;
  }[];
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

type PendingCompletionUpload = {
  file: File;
  previewUrl: string;
  isImage: boolean;
  label: string;
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
    return "This task was internally submitted and is locked until a manager reopens it.";
  }

  return "This task was submitted for internal review. A manager must move it back to In Progress before you can update it again.";
}

export function DesignerTaskModal({ open, task, onClose, onSubmit }: Props) {
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [statusOpen, setStatusOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("current");
  const [pendingUploads, setPendingUploads] = useState<PendingCompletionUpload[]>([]);
  const [completionLinks, setCompletionLinks] = useState<string[]>([]);
  const [linkValue, setLinkValue] = useState("");
  const [error, setError] = useState("");
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [linkSubmitAttempted, setLinkSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingUploadsRef = useRef<PendingCompletionUpload[]>([]);
  const completionState = useMemo(
    () => parseTaskCompletionState(task?.completionScreenshotUrl ?? null),
    [task?.completionScreenshotUrl],
  );
  const currentVersionAssets = useMemo(
    () => parseTaskCompletionAssets(task?.completionScreenshotUrl ?? null),
    [task?.completionScreenshotUrl],
  );
  const hasVersionHistory = completionState.history.length > 0;
  const isLocked = task?.status === "done" || task?.status === "review" || task?.status === "approved";
  const editableCurrentAssets = useMemo(
    () => (!isLocked && hasVersionHistory ? [] : currentVersionAssets),
    [currentVersionAssets, hasVersionHistory, isLocked],
  );
  const canReturnToTodo = !hasVersionHistory && currentVersionAssets.length === 0;
  const availableStatusOptions = useMemo(
    () =>
      (canReturnToTodo ? ["todo", "in_progress", "done"] : ["in_progress", "done"]) as TaskStatus[],
    [canReturnToTodo],
  );
  const versionOptions = useMemo(() => {
    // Build options based on internal versions (IV). If an internal version
    // has a matching submitted snapshot (same assets), annotate it with (SV#).
    const history = completionState.history.slice();
    const internalSnapshots = history
      .filter((s) => s.kind === "internal")
      .map((s) => ({ number: s.number, assets: s.assets, id: s.id, label: s.label }));
    const submittedSnapshots = history.filter((s) => s.kind === "submitted");

    const assetsKey = (arr: string[]) => JSON.stringify([...arr].sort());

    const internalMap = new Map<number, { id: string; label: string; assets: string[] }>();
    internalSnapshots.forEach((s) => internalMap.set(s.number, { id: s.id, label: s.label, assets: s.assets }));

    // include current in-progress internal version if present
    const currentInternalNumber = completionState.currentVersionKind === "internal" ? completionState.internalVersion : null;
    if (currentInternalNumber !== null && !internalMap.has(currentInternalNumber)) {
      internalMap.set(currentInternalNumber, {
        id: `IV${currentInternalNumber}`,
        label: `IV${currentInternalNumber}`,
        assets: completionState.currentAssets,
      });
    }

    const numbers = Array.from(internalMap.keys()).sort((a, b) => a - b);

    const historicalOptions = numbers.map((n) => {
      const entry = internalMap.get(n)!;
      const matchingSubmitted = submittedSnapshots.find((s) => assetsKey(s.assets) === assetsKey(entry.assets));
      const svLabel = matchingSubmitted ? `(SV${matchingSubmitted.number})` : "";
      const isCurrentSnapshot = currentInternalNumber === n && completionState.currentVersionKind === "internal";
      const label = `${entry.label}${svLabel ? ` ${svLabel}` : ""}`;
      return { id: entry.id, label, assets: entry.assets, isCurrent: false, isCurrentSnapshot };
    });

    const currentOption = {
      id: "current",
      label: `${getCurrentTaskCompletionLabel(completionState)} (Current)`,
      assets: currentVersionAssets,
      isCurrent: true,
    };

    // if locked and there are no options, show the current label
    if (isLocked && historicalOptions.length === 0 && currentVersionAssets.length > 0) {
      return [
        {
          id: "current",
          label: getCurrentTaskCompletionLabel(completionState),
          assets: currentVersionAssets,
          isCurrent: true,
        },
      ];
    }

    if (isLocked) {
      return historicalOptions.map(({ isCurrentSnapshot, ...option }) =>
        isCurrentSnapshot ? { ...option, label: `${option.label} (Current)` } : option,
      );
    }

    return [
      currentOption,
      ...historicalOptions
        .filter((option) => !option.isCurrentSnapshot)
        .map(({ isCurrentSnapshot: _isCurrentSnapshot, ...option }) => option),
    ];
  }, [completionState, currentVersionAssets, isLocked]);
  const allAssets = useMemo(
    () => [
      ...editableCurrentAssets.map((value) => ({
        key: `existing-${value}`,
        value,
        label: getTaskCompletionLabel(value),
        isImage: isTaskCompletionImage(value),
        isLink: isTaskCompletionLink(value),
        removable: false,
      })),
      ...pendingUploads.map((upload) => ({
        key: `pending-${upload.previewUrl}`,
        value: upload.previewUrl,
        label: upload.label,
        isImage: upload.isImage,
        isLink: false,
        removable: true,
      })),
      ...completionLinks.map((value) => ({
        key: `link-${value}`,
        value,
        label: getTaskCompletionLabel(value),
        isImage: false,
        isLink: true,
        removable: true,
      })),
    ],
    [completionLinks, editableCurrentAssets, pendingUploads],
  );
  const selectedVersion = versionOptions.find((option) => option.id === selectedVersionId) ?? versionOptions[0] ?? null;
  const displayedAssets = selectedVersion?.isCurrent ? allAssets : (selectedVersion?.assets ?? []);
  const isViewingCurrentVersion = selectedVersion?.isCurrent ?? false;
  const versionFeedbackEntries = task?.feedbackEntries ?? [];
  const shouldShowSubmitButton =
    isLocked ||
    isViewingCurrentVersion ||
    pendingUploads.length > 0 ||
    completionLinks.length > 0;

  useEffect(() => {
    if (!open || !task) {
      return;
    }

    setStatus(task.status);
    setStatusOpen(false);
    setVersionOpen(false);
    setSelectedVersionId("current");
    setPendingUploads([]);
    setCompletionLinks([]);
    setLinkValue("");
    setError("");
    setShowErrorPopup(false);
    setSubmitAttempted(false);
    setLinkSubmitAttempted(false);
  }, [open, task]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (versionOptions.some((option) => option.id === "current")) {
      setSelectedVersionId("current");
    }
  }, [open, versionOptions]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      pendingUploadsRef.current.forEach((upload) => {
        if (upload.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(upload.previewUrl);
        }
      });
    };
  }, []);

  if (!open || !task) {
    return null;
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const existingValues = new Set<string>([
      ...editableCurrentAssets,
      ...completionLinks,
    ]);

    const nextUploads: PendingCompletionUpload[] = [];
    for (const file of files) {
      const alreadyPending = pendingUploads.some(
        (u) => u.file.name === file.name && u.file.size === file.size,
      );

      const dupInExisting = Array.from(existingValues).some((v) => v.endsWith(file.name));

      if (alreadyPending || dupInExisting) {
        // skip duplicates
        continue;
      }

      nextUploads.push({
        file,
        previewUrl: URL.createObjectURL(file),
        isImage: file.type.startsWith("image/"),
        label: file.name,
      });
    }

    if (nextUploads.length === 0) {
      setError("No new files to add (duplicates were skipped).");
      setShowErrorPopup(true);
      event.target.value = "";
      return;
    }

    setPendingUploads((current) => [...current, ...nextUploads]);
    setError("");
    setShowErrorPopup(false);
    event.target.value = "";
  };

  const handleAddLink = () => {
    const nextLink = linkValue.trim();
    if (!nextLink) {
      return;
    }

    setLinkSubmitAttempted(true);

    if (!isTaskCompletionLink(nextLink)) {
      setError("Enter a valid https:// link.");
      setShowErrorPopup(true);
      return;
    }

    // Prevent duplicate links or links that match existing assets
    if (
      completionLinks.includes(nextLink) ||
      editableCurrentAssets.includes(nextLink) ||
      pendingUploads.some((u) => u.previewUrl === nextLink)
    ) {
      setError("This link is already added.");
      setShowErrorPopup(true);
      return;
    }

    setCompletionLinks((current) => [...current, nextLink]);
    setLinkValue("");
    setError("");
    setShowErrorPopup(false);
    setLinkSubmitAttempted(false);
  };

  const handleRemoveAsset = (asset: string) => {
    const previewIndex = pendingUploads.findIndex((upload) => upload.previewUrl === asset);
    if (previewIndex >= 0) {
      const nextPreview = pendingUploads[previewIndex]?.previewUrl;
      if (nextPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(nextPreview);
      }
      setPendingUploads((current) => current.filter((_, index) => index !== previewIndex));
      return;
    }

    if (completionLinks.includes(asset)) {
      setCompletionLinks((current) => current.filter((value) => value !== asset));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);

    if (isLocked) {
      onClose();
      return;
    }

    const nextStatus =
      allAssets.length > 0 && (status === "todo" || status === "in_progress") ? "done" : status;

    if (nextStatus === "done" && allAssets.length === 0) {
      setError("Upload completion screenshots, files, or links before submitting this task for internal review.");
      setShowErrorPopup(true);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setShowErrorPopup(false);

    try {
      const uploadedUrls: string[] = [];
      for (const { file } of pendingUploads) {
        if (file.type.startsWith("image/")) {
          const optimized = await optimizeImageToWebp(file, {
            maxDimension: 1600,
            quality: 0.82,
          });
          uploadedUrls.push(
            await uploadTaskDeliverable(
              new File([optimized], `${file.name.replace(/\.[^.]+$/, "") || "task-completion"}.webp`, {
                type: "image/webp",
              }),
            ),
          );
        } else {
          uploadedUrls.push(await uploadTaskDeliverable(file));
        }
      }

      const completionScreenshotUrl = serializeTaskCompletionAssets([
        ...editableCurrentAssets,
        ...uploadedUrls,
        ...completionLinks,
      ]);

      await onSubmit({
        taskId: task.id,
        projectId: task.projectId,
        status: nextStatus,
        completionScreenshotUrl,
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update task.");
      setShowErrorPopup(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const linkIsInvalid =
    linkSubmitAttempted &&
    Boolean(linkValue.trim()) &&
    (!isTaskCompletionLink(linkValue.trim()) ||
      completionLinks.includes(linkValue.trim()) ||
      editableCurrentAssets.includes(linkValue.trim()) ||
      pendingUploads.some((upload) => upload.previewUrl === linkValue.trim()));
  const missingCompletionAssets = submitAttempted && status === "done" && allAssets.length === 0;

  return (
    <>
      {showErrorPopup && error ? (
        <div className="auth-popup-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="designer-task-form-error-title">
          <div className="auth-popup-card">
            <h2 id="designer-task-form-error-title">Task form error</h2>
            <p>{error}</p>
            <button className="primary-button mobile-full-button" type="button" onClick={() => setShowErrorPopup(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
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
              <ModalDescription $hideOnMobile={isLocked}>
                {isLocked
                  ? getCompletionMessage(task.managerReviewStatus)
                  : "Move your task forward and attach completion screenshots, files, or links when it reaches internal submit."}
              </ModalDescription>
            </div>
            <ModalClose type="button" onClick={onClose} aria-label="Close">
              <IconClose />
            </ModalClose>
          </ModalHeader>

          <InlineForm onSubmit={handleSubmit} noValidate>
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
                    <TaskTextInput value={getTaskStatusLabel(task.status)} readOnly placeholder=" " />
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
                      <TaskSelectValue>{getTaskStatusLabel(status)}</TaskSelectValue>
                      <TaskSelectChevron $open={statusOpen}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Status</TaskFloatingLabel>
                    {statusOpen ? (
                      <TaskSelectMenu role="listbox" aria-label="Task status">
                        {availableStatusOptions.map((option) => (
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
                            {getTaskStatusLabel(option)}
                          </TaskSelectOption>
                        ))}
                      </TaskSelectMenu>
                    ) : null}
                  </TaskFloatingSelect>
                )}
              </TaskModalField>
              {versionOptions.length ? (
                <TaskModalField $wide>
                  <TaskFloatingSelect $filled $open={versionOpen}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={versionOpen}
                      onClick={() => setVersionOpen((current) => !current)}
                    >
                      <TaskSelectValue>{selectedVersion?.label ?? "Select version"}</TaskSelectValue>
                      <TaskSelectChevron $open={versionOpen}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Version</TaskFloatingLabel>
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
                </TaskModalField>
              ) : null}
            </TaskModalGrid>

            {(isLocked || !isViewingCurrentVersion) && displayedAssets.length > 0 ? (
              <SubmittedAssetsPanel>
                <UploadHeader>
                  <UploadLabel>{isLocked ? "Submitted assets" : "Version assets"}</UploadLabel>
                  <UploadCount>{displayedAssets.length} item{displayedAssets.length === 1 ? "" : "s"}</UploadCount>
                </UploadHeader>
                <SubmittedAssetsScroller>
                  {displayedAssets.map((asset) => (
                    <SubmittedAssetCard key={typeof asset === "string" ? asset : asset.key}>
                      {typeof asset === "string" && isTaskCompletionImage(asset) ? (
                        <UploadAssetPreview src={asset} alt={getTaskCompletionLabel(asset)} />
                      ) : (
                        <UploadAssetFile>
                          {typeof asset === "string" && isTaskCompletionLink(asset) ? <IconLink /> : <IconFile />}
                        </UploadAssetFile>
                      )}
                      <UploadAssetMeta>
                        <UploadAssetName>
                          {typeof asset === "string" ? getTaskCompletionLabel(asset) : asset.label}
                        </UploadAssetName>
                        <UploadAssetType>
                          {typeof asset === "string" && isTaskCompletionImage(asset)
                            ? "Image"
                            : typeof asset === "string" && isTaskCompletionLink(asset)
                              ? "Link"
                              : "File"}
                        </UploadAssetType>
                      </UploadAssetMeta>
                    </SubmittedAssetCard>
                  ))}
                </SubmittedAssetsScroller>
              </SubmittedAssetsPanel>
            ) : null}

            {versionFeedbackEntries.length > 0 ? (
              <FeedbackPanel>
                <UploadHeader>
                  <UploadLabel>Feedback</UploadLabel>
                  <UploadCount>{versionFeedbackEntries.length} item{versionFeedbackEntries.length === 1 ? "" : "s"}</UploadCount>
                </UploadHeader>
                <FeedbackList>
                  {versionFeedbackEntries.map((entry) => (
                    <FeedbackItem key={entry.id}>
                      <FeedbackRow>
                        <strong>{entry.author}</strong>
                        <FeedbackPill $source={entry.source}>
                          {entry.source === "internal" ? "Internal Feedback" : "Client Feedback"}
                        </FeedbackPill>
                      </FeedbackRow>
                      <FeedbackMeta>
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(entry.createdAt))}
                      </FeedbackMeta>
                      {entry.rating ? (
                        <FeedbackStars>
                          {Array.from({ length: 5 }, (_, index) => (
                            <FeedbackStar key={index} $filled={index < entry.rating!}>★</FeedbackStar>
                          ))}
                        </FeedbackStars>
                      ) : null}
                      <FeedbackBody>{entry.body}</FeedbackBody>
                    </FeedbackItem>
                  ))}
                </FeedbackList>
              </FeedbackPanel>
            ) : null}

            {!isLocked && isViewingCurrentVersion ? (
              <UploadCompactArea $invalid={missingCompletionAssets}>
                <UploadHeader>
                  <UploadLabel>Completion assets</UploadLabel>
                  <UploadCount>{allAssets.length} item{allAssets.length === 1 ? "" : "s"}</UploadCount>
                </UploadHeader>
                <UploadEmptyState $invalid={missingCompletionAssets}>
                  Add screenshots, files, or links for {getCurrentTaskCompletionLabel(completionState)}. Previous versions are read-only.
                </UploadEmptyState>
                <UploadTileGrid $horizontal={allAssets.length > 2}>
                  {allAssets.map((asset) => (
                    <UploadAssetTile key={asset.key}>
                      {asset.isImage ? (
                        <UploadAssetPreview src={asset.value} alt={asset.label} />
                      ) : (
                        <UploadAssetFile>
                          {asset.isLink ? <IconLink /> : <IconFile />}
                        </UploadAssetFile>
                      )}
                      <UploadAssetMeta>
                        <UploadAssetName>{asset.label}</UploadAssetName>
                        <UploadAssetType>
                          {asset.isImage
                            ? "Image"
                            : asset.isLink
                              ? "Link"
                              : "File"}
                        </UploadAssetType>
                      </UploadAssetMeta>
                      {asset.removable ? (
                        <UploadAssetRemove
                          type="button"
                          onClick={() => handleRemoveAsset(asset.value)}
                          aria-label="Remove asset"
                        >
                          <IconClose />
                        </UploadAssetRemove>
                      ) : null}
                    </UploadAssetTile>
                  ))}
                  <UploadDropTile as="label">
                    <UploadDropInner>
                      <IconUpload />
                      <span>Upload files</span>
                    </UploadDropInner>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt"
                      multiple
                      onChange={handleFileChange}
                      hidden
                    />
                  </UploadDropTile>
                </UploadTileGrid>

                <LinkInputRow>
                  <TaskFloatingField className={linkValue ? "auth-field is-filled" : "auth-field"} $invalid={linkIsInvalid}>
                    <TaskTextInput
                      value={linkValue}
                      onChange={(event) => {
                        setLinkValue(event.target.value);
                        setError("");
                        setShowErrorPopup(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddLink();
                        }
                      }}
                      placeholder=" "
                      $invalid={linkIsInvalid}
                    />
                    <span>Attachment link</span>
                  </TaskFloatingField>
                  <LinkAddButton type="button" onClick={handleAddLink}>
                    Add link
                  </LinkAddButton>
                </LinkInputRow>
              </UploadCompactArea>
            ) : null}
            {error ? <InlineError>{error}</InlineError> : null}

            {shouldShowSubmitButton ? (
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {isLocked ? "Close" : isSubmitting ? "Updating..." : "Update task"}
              </button>
            ) : null}
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

  @media (max-width: 767px) {
  align-items: flex-start;
  }
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
  height: 80vh;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 22px;
  border-radius: 26px;

  @media (max-width: 767px) {
    height: 80vh;
    max-height: 80vh;
  }
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

const ModalDescription = styled.p<{ $hideOnMobile?: boolean }>`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.5;

  @media (max-width: 767px) {
    display: none;
  }
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
  @media (max-width: 767px) {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
  }
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

const TaskFloatingField = styled.label<{ $invalid?: boolean }>`
  width: 100%;

  span {
    color: ${({ $invalid }) => ($invalid ? "#c04f42" : "inherit")};
  }
`;

const TaskTextInput = styled.input<{ $invalid?: boolean }>`
  width: 100%;
  min-height: 58px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: ${({ $invalid }) => ($invalid ? "0 0 0 1px rgba(192, 79, 66, 0.12)" : "var(--shadow-sm)")};
  border-color: ${({ $invalid }) => ($invalid ? "#c04f42" : "rgba(230, 224, 215, 0.95)")};
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

const UploadCompactArea = styled.div<{ $invalid?: boolean }>`
  display: grid;
  gap: 10px;
  border-radius: 18px;
  border: 1px dashed ${({ $invalid }) => ($invalid ? "#c04f42" : "rgba(47, 93, 80, 0.22)")};
  background: rgba(251, 250, 247, 0.8);
  box-shadow: ${({ $invalid }) => ($invalid ? "0 0 0 1px rgba(192, 79, 66, 0.12)" : "none")};
  padding: 12px;
`;

const SubmittedAssetsPanel = styled.div`
  display: grid;
  gap: 10px;
  border-radius: 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(251, 250, 247, 0.88);
  padding: 12px;
`;

const SubmittedAssetsScroller = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
`;

const UploadLabel = styled.span`
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const UploadEmptyState = styled.p<{ $invalid?: boolean }>`
  margin: 0;
  color: ${({ $invalid }) => ($invalid ? "#c04f42" : "#8b8277")};
  font-size: 0.86rem;
  line-height: 1.45;
`;

const UploadHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const UploadCount = styled.span`
  color: #8b8277;
  font-size: 0.8rem;
  font-weight: 600;
`;

const UploadTileGrid = styled.div<{ $horizontal?: boolean }>`
  gap: 10px;
  ${({ $horizontal }) =>
    $horizontal
      ? css`
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          overflow-x: auto;
          padding-bottom: 6px;
          scrollbar-width: thin;
        `
      : css`
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));

          ${desktop} {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        `}
`;

const UploadAssetTile = styled.div`
  position: relative;
  display: grid;
  gap: 8px;
  min-height: 124px;
  max-width: 154px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.94);
  flex: 0 0 220px;
`;

const SubmittedAssetCard = styled.div`
  flex: 0 0 168px;
  display: grid;
  gap: 8px;
  min-height: 124px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.94);
`;

const UploadDropTile = styled.label`
  min-height: 124px;
  display: grid;
  place-items: center;
  padding: 10px;
  border-radius: 16px;
  border: 1px dashed rgba(47, 93, 80, 0.28);
  background: rgba(244, 248, 246, 0.92);
  cursor: pointer;
  flex: 0 0 220px;
`;

const UploadDropInner = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #214f39;
  font-size: 0.86rem;
  font-weight: 800;
  text-align: center;

  svg {
    width: 20px;
    height: 20px;
  }
`;

const UploadAssetPreview = styled.img`
  width: 100%;
  height: 68px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
`;

const UploadAssetFile = styled.div`
  width: 100%;
  height: 68px;
  border-radius: 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(251, 248, 243, 0.96);
  color: #8d6520;
  display: grid;
  place-items: center;

  svg {
    width: 22px;
    height: 22px;
  }
`;

const UploadAssetMeta = styled.div`
  display: grid;
  gap: 2px;
`;

const UploadAssetName = styled.span`
  color: #2e2a27;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const UploadAssetType = styled.span`
  color: #8b8277;
  font-size: 0.74rem;
  line-height: 1.3;
`;

const UploadAssetRemove = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #5f564b;

  svg {
    width: 12px;
    height: 12px;
  }
`;

const LinkInputRow = styled.div`
  display: grid;
  gap: 10px;

  ${desktop} {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
`;

const LinkAddButton = styled.button`
  min-height: 46px;
  padding: 0 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  color: #214f39;
  font-size: 0.92rem;
  font-weight: 800;
  white-space: nowrap;
`;

const FeedbackPanel = styled.div`
  display: grid;
  gap: 10px;
  border-radius: 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(251, 250, 247, 0.88);
  padding: 12px;
`;

const FeedbackList = styled.div`
  display: grid;
  gap: 10px;
`;

const FeedbackItem = styled.div`
  display: grid;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(235, 229, 221, 0.95);

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }
`;

const FeedbackRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  strong {
    color: #2e2a27;
    font-size: 0.86rem;
  }
`;

const FeedbackPill = styled.span<{ $source: "internal" | "client" }>`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: ${({ $source }) => ($source === "internal" ? "#eef3f0" : "#e6efff")};
  color: ${({ $source }) => ($source === "internal" ? "#214f39" : "#4770d8")};
  font-size: 0.74rem;
  font-weight: 800;
`;

const FeedbackMeta = styled.span`
  color: #7d7266;
  font-size: 0.76rem;
`;

const FeedbackStars = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const FeedbackStar = styled.span<{ $filled?: boolean }>`
  color: ${({ $filled }) => ($filled ? "#ca8a22" : "#ddd4c9")};
  font-size: 0.9rem;
  line-height: 1;
`;

const FeedbackBody = styled.p`
  margin: 0;
  color: #433b34;
  font-size: 0.84rem;
  line-height: 1.5;
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

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
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
