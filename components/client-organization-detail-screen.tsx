"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { InviteWorkspaceModal } from "@/components/invite-workspace-modal";
import { useAppState } from "@/components/app-state";
import {
  buildLiaisonRows,
  buildClientOrganizationRows,
  getClientOrganizationMark,
  getClientOrganizationStatusLabel,
} from "@/lib/client-organizations";
import { formatProjectStage, formatRole, getProjectStatusLabel } from "@/lib/display";
import {
  canCreateClient,
  canDeleteClient,
  getUserClientOrganizationIds,
} from "@/lib/permissions";

const desktop = "@media (min-width: 768px)";
const TASKS_PAGE_SIZE = 5;

function formatDate(value: string | null) {
  if (!value) {
    return "No activity";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTaskStatus(status: string) {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "review":
      return "Review";
    case "approved":
      return "Approved";
    case "done":
      return "Completed";
    default:
      return "To do";
  }
}

function formatPriority(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function isCompletedProject(status: string, stage?: string | null) {
  return status === "done" || status === "approved" || status === "Complete" || stage === "Complete";
}

function isPendingReviewProject(status: string, stage?: string | null) {
  return status === "review" || status === "revision" || status === "Pending Review" || stage === "Pending Review";
}

function getClientProjectProgress(project: {
  status: string;
  stage?: string;
  tasks: Array<{ status: string }>;
}) {
  if (isCompletedProject(project.status, project.stage)) {
    return 100;
  }

  const visibleTaskCount = project.tasks.length;
  const completedTaskCount = project.tasks.filter(
    (task) => task.status === "done" || task.status === "review" || task.status === "approved",
  ).length;

  const stageFloor =
    {
      "Waiting List": 18,
      WIP: 52,
      "Pending Review": 76,
      "On Hold": 40,
      Complete: 100,
    }[project.stage ?? "Waiting List"] ?? 18;

  if (!visibleTaskCount) {
    return stageFloor;
  }

  return Math.max(stageFloor, Math.round((completedTaskCount / visibleTaskCount) * 100));
}

function getClientProjectTone(status: string, stage?: string | null) {
  if (isCompletedProject(status, stage)) {
    return { fg: "#5ca16d", bg: "#e5f4e8", bar: "#63b174" };
  }

  if (isPendingReviewProject(status, stage)) {
    return { fg: "#c58911", bg: "#fbefcf", bar: "#d39a1f" };
  }

  if (status === "On Hold" || stage === "On Hold") {
    return { fg: "#d36c57", bg: "#fbe7e3", bar: "#db7b67" };
  }

  return { fg: "#4770d8", bg: "#e6efff", bar: "#4770d8" };
}

function getClientProjectStatusLabel(status: string, stage?: string | null) {
  if (stage) {
    return formatProjectStage(stage);
  }

  return getProjectStatusLabel(status as Parameters<typeof getProjectStatusLabel>[0]);
}

function getRelativeActivityLabel(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "1d ago";
  }

  return `${days}d ago`;
}

type ClientOrganizationDetailScreenProps = {
  organizationId: string;
  homeMode?: boolean;
};

export function ClientOrganizationDetailScreen({
  organizationId,
  homeMode = false,
}: ClientOrganizationDetailScreenProps) {
  const { state, user, deleteClient, revokeInvitation, updateClientOrganization, updateClient } =
    useAppState();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTasksPage, setSelectedTasksPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteClientModal, setShowDeleteClientModal] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null);
  const [showRevokeInviteModal, setShowRevokeInviteModal] = useState(false);
  const [isRevokingInvite, setIsRevokingInvite] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"internal" | "external">("external");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openEditSelect, setOpenEditSelect] = useState<"type" | "status" | null>(null);
  const [showAssignLiaisonModal, setShowAssignLiaisonModal] = useState(false);
  const [selectedAssignableLiaisonId, setSelectedAssignableLiaisonId] = useState("");
  const [assignLiaisonOpen, setAssignLiaisonOpen] = useState(false);
  const [isAssigningLiaison, setIsAssigningLiaison] = useState(false);
  const [selectedLiaisonId, setSelectedLiaisonId] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [assignOrganizationOpen, setAssignOrganizationOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRemovingOrganization, setIsRemovingOrganization] = useState(false);
  const [showManageOrganizations, setShowManageOrganizations] = useState(false);

  const rows = useMemo(() => buildClientOrganizationRows(state), [state]);
  const liaisonRows = useMemo(() => buildLiaisonRows(state), [state]);
  const organization = rows.find((row) => row.id === organizationId) ?? null;
  const rawOrganization = state.clientOrganizations.find((row) => row.id === organizationId) ?? null;
  const viewerRole = user?.role ?? "client";
  const roleLabel = formatRole(viewerRole).toUpperCase();
  const canManage = canCreateClient(viewerRole);
  const canDelete = canDeleteClient(viewerRole);
  const activeLabel = homeMode ? "Home" : "Clients";
  const userById = useMemo(() => new Map(state.users.map((member) => [member.id, member])), [state.users]);
  const selectedLiaison = selectedLiaisonId
    ? liaisonRows.find((liaison) => liaison.id === selectedLiaisonId) ?? null
    : null;
  const canDeleteSelectedLiaison = Boolean(
    canManage && selectedLiaison && !selectedLiaison.id.startsWith("accepted-invite:"),
  );
  const assignableOrganizations = useMemo(
    () =>
      selectedLiaison
        ? state.clientOrganizations.filter(
            (clientOrganization) => !selectedLiaison.clientOrganizationIds.includes(clientOrganization.id),
          )
        : state.clientOrganizations,
    [selectedLiaison, state.clientOrganizations],
  );
  const assignableLiaisons = useMemo(
    () => {
      const organizationMembershipId = organization?.organizationId;
      if (!organizationMembershipId) {
        return [];
      }

      return state.users.filter(
        (member) =>
          member.role === "client" &&
          !getUserClientOrganizationIds(member).includes(organizationMembershipId),
      );
    },
    [organization?.organizationId, state.users],
  );

  useEffect(() => {
    if (!rawOrganization) {
      return;
    }

    setName(rawOrganization.name);
    setType(rawOrganization.type ?? "external");
    setStatus(rawOrganization.status ?? "active");
    setPhone(rawOrganization.phone ?? "");
    setAddress(rawOrganization.address ?? "");
  }, [rawOrganization]);

  useEffect(() => {
    setSelectedTasksPage(1);
  }, [organization?.id]);

  if (!user) {
    return null;
  }

  if (!organization) {
    return (
      <Shell>
        <AppSidebar user={user} activeLabel={activeLabel} />
        <Content>
          {!homeMode ? <BackLink href="/clients">← Back to clients</BackLink> : null}
          <EmptyState>
            <strong>Organization not found</strong>
            <p>The requested client organization could not be found.</p>
          </EmptyState>
        </Content>
      </Shell>
    );
  }

  if (
    user.role === "client" &&
    (!organization.organizationId ||
      !getUserClientOrganizationIds(user).includes(organization.organizationId))
  ) {
    return (
      <Shell>
        <AppSidebar user={user} activeLabel={activeLabel} />
        <Content>
          {!homeMode ? <BackLink href="/clients">← Back to clients</BackLink> : null}
          <EmptyState>
            <strong>Access denied</strong>
            <p>You can only view your own organization.</p>
          </EmptyState>
        </Content>
      </Shell>
    );
  }

  const canEditOrganization =
    canManage ||
    (user.role === "client" &&
      Boolean(
        organization.organizationId &&
          getUserClientOrganizationIds(user).includes(organization.organizationId),
      ));
  const organizationProjects = state.projects
    .filter((project) =>
      organization.organizationId
        ? project.clientOrganizationId === organization.organizationId
        : organization.members.some(
            (member) =>
              member.company?.trim().toLowerCase() === organization.name.trim().toLowerCase() ||
              member.name.trim().toLowerCase() === (project.contactPerson ?? "").trim().toLowerCase(),
          ),
    )
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const totalTaskPages = Math.max(1, Math.ceil(organization.openTasks.length / TASKS_PAGE_SIZE));
  const paginatedTasks = organization.openTasks.slice(
    (selectedTasksPage - 1) * TASKS_PAGE_SIZE,
    selectedTasksPage * TASKS_PAGE_SIZE,
  );
  const pendingInvitations = state.invitations
    .filter(
      (invitation) =>
        invitation.role === "client" &&
        invitation.status === "pending" &&
        invitation.clientOrganizationId === organization.organizationId,
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const organizationActivities = organizationProjects
    .flatMap((project) =>
      project.activities.map((activity) => ({
        id: activity.id,
        message: activity.message,
        createdAt: activity.createdAt,
        actorName: activity.actorId ? userById.get(activity.actorId)?.name ?? "Haus" : "Haus",
        projectName: project.projectRequestName || project.name,
      })),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activeProjects = organizationProjects.filter((project) => !isCompletedProject(project.status, project.stage));
  const projectsInReview = organizationProjects.filter((project) => isPendingReviewProject(project.status, project.stage));
  const completedProjects = organizationProjects.filter((project) => isCompletedProject(project.status, project.stage));
  const pendingReviewItems = organization.openTasks.slice(0, 4);
  const featuredProjects = activeProjects
    .slice()
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3);

  if (homeMode && user.role === "client") {
    return (
      <Shell>
        <AppSidebar user={user} activeLabel="Home" />
        <Content>
          <Header>
            <div>
              <Eyebrow>Client Organization</Eyebrow>
              <Title>{organization.name}</Title>
              <ClientHomeWelcome>
                Welcome back, {user.name} <span aria-hidden="true">👋</span>
              </ClientHomeWelcome>
            </div>
            <HeaderActions>
              <HeaderAvatarLink href="/profile" aria-label="Open profile">
                {user.name.slice(0, 1)}
              </HeaderAvatarLink>
            </HeaderActions>
          </Header>

          <ClientHomeHero id="client-organization-overview">
            <ClientHomeHeroBrand>
              <ClientMark $large>{getClientOrganizationMark(organization.name)}</ClientMark>
              <div>
                <ClientHomeHeroTitle>{organization.name}</ClientHomeHeroTitle>
                <InlinePills>
                  <TypePill $type={organization.type}>
                    {organization.type === "internal" ? "Internal" : "External"}
                  </TypePill>
                  {getClientOrganizationStatusLabel(organization) ? (
                    <PendingPill $active={organization.status === "active"}>
                      {getClientOrganizationStatusLabel(organization)}
                    </PendingPill>
                  ) : null}
                </InlinePills>
              </div>
            </ClientHomeHeroBrand>

            <ClientHomeStats>
              <ClientMetricCard>
                <MetricIcon $tone="success">
                  <IconBriefcase />
                </MetricIcon>
                <div>
                  <MetricLabel>Active Projects</MetricLabel>
                  <MetricValue>{activeProjects.length}</MetricValue>
                </div>
              </ClientMetricCard>
              <ClientMetricCard>
                <MetricIcon $tone="warning">
                  <IconFolderMini />
                </MetricIcon>
                <div>
                  <MetricLabel>Projects in Review</MetricLabel>
                  <MetricValue>{projectsInReview.length}</MetricValue>
                </div>
              </ClientMetricCard>
              <ClientMetricCard>
                <MetricIcon $tone="success">
                  <IconCheckBadge />
                </MetricIcon>
                <div>
                  <MetricLabel>Completed Projects</MetricLabel>
                  <MetricValue>{completedProjects.length}</MetricValue>
                </div>
              </ClientMetricCard>
              <ClientMetricCard>
                <MetricIcon $tone="neutral">
                  <IconCalendarMini />
                </MetricIcon>
                <div>
                  <MetricLabel>Last Activity</MetricLabel>
                  <MetricValue>{formatDate(organization.lastActivityDate)}</MetricValue>
                </div>
              </ClientMetricCard>
            </ClientHomeStats>
          </ClientHomeHero>

          <ClientHomeGrid>
            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Active Projects</PanelTitle>
                <SectionLink href="/projects">View all projects</SectionLink>
              </SectionHeader>
              {featuredProjects.length ? (
                <ClientHomeList>
                  {featuredProjects.map((project) => {
                    const tone = getClientProjectTone(project.status, project.stage);
                    const progress = getClientProjectProgress(project);
                    return (
                      <ClientProjectCard key={project.id} href={`/projects/${project.id}`}>
                        <ClientProjectGlyph>{getClientOrganizationMark(project.projectRequestName || project.name)}</ClientProjectGlyph>
                        <ClientProjectBody>
                          <ClientProjectHeading>
                            <ClientProjectTitle>{project.projectRequestName || project.name}</ClientProjectTitle>
                            <ClientProjectArrow>
                              <IconChevronRight />
                            </ClientProjectArrow>
                          </ClientProjectHeading>
                          <ClientProjectMeta>
                            <StatusInline $fg={tone.fg}>
                              {getClientProjectStatusLabel(project.status, project.stage)}
                            </StatusInline>
                            <span>·</span>
                            <span>{project.projectBrief || project.description || "Project in progress"}</span>
                          </ClientProjectMeta>
                          <ClientProjectMeta>
                            <InlineMeta>
                              <IconCalendarMini />
                              <span>Due {formatDate(project.finalDeliverableDate ?? project.dueDate)}</span>
                            </InlineMeta>
                          </ClientProjectMeta>
                        </ClientProjectBody>
                        <ClientProjectProgress>
                          <ProgressTrack>
                            <ProgressBar $value={progress} $color={tone.bar} />
                          </ProgressTrack>
                          <ProgressValue>{progress}%</ProgressValue>
                        </ClientProjectProgress>
                      </ClientProjectCard>
                    );
                  })}
                </ClientHomeList>
              ) : (
                <ClientMeta>No active projects for this organization yet.</ClientMeta>
              )}
            </ClientHomePanel>

            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Pending Your Review</PanelTitle>
                <SectionLink href="/projects">View all reviews</SectionLink>
              </SectionHeader>
              {pendingReviewItems.length ? (
                <ClientHomeList>
                  {pendingReviewItems.map((task) => (
                    <ClientReviewCard key={task.id} href={`/projects/${task.projectId}`}>
                      <ClientReviewIcon>
                        <IconFolderMini />
                      </ClientReviewIcon>
                      <ClientReviewBody>
                        <ClientProjectTitle>{task.projectName}</ClientProjectTitle>
                        <ClientMeta>{task.title}</ClientMeta>
                        <ClientMeta>
                          Submitted by {task.assigneeName} · {formatDate(task.dueDate)}
                        </ClientMeta>
                      </ClientReviewBody>
                      <ClientReviewPill>Review</ClientReviewPill>
                      <ClientProjectArrow>
                        <IconChevronRight />
                      </ClientProjectArrow>
                    </ClientReviewCard>
                  ))}
                </ClientHomeList>
              ) : (
                <ClientMeta>No pending reviews right now.</ClientMeta>
              )}
            </ClientHomePanel>

            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Recent Activity</PanelTitle>
                <SectionLink href="/projects">View all activity</SectionLink>
              </SectionHeader>
              {organizationActivities.length ? (
                <ActivityList>
                  {organizationActivities.slice(0, 4).map((activity) => (
                    <ActivityRowCard key={activity.id}>
                      <ActivityIcon>
                        <IconSparkMini />
                      </ActivityIcon>
                      <ActivityBody>
                        <ActivityTitle>{activity.message}</ActivityTitle>
                        <ClientMeta>
                          by {activity.actorName} · {formatDate(activity.createdAt)}
                        </ClientMeta>
                      </ActivityBody>
                      <ActivityTime>{getRelativeActivityLabel(activity.createdAt)}</ActivityTime>
                    </ActivityRowCard>
                  ))}
                </ActivityList>
              ) : (
                <ClientMeta>No recent activity yet.</ClientMeta>
              )}
            </ClientHomePanel>
          </ClientHomeGrid>
        </Content>
      </Shell>
    );
  }

  const handleSaveOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rawOrganization) {
      return;
    }

    setIsSavingOrganization(true);
    try {
      await updateClientOrganization(rawOrganization.id, {
        name,
        type,
        status,
        phone: type === "external" ? phone : "",
        address: type === "external" ? address : "",
      });
      setShowEditModal(false);
    } finally {
      setIsSavingOrganization(false);
    }
  };

  const handleOpenEditLiaison = (member: (typeof organization.members)[number]) => {
    if (!member.deletableUserId) {
      return;
    }

    setSelectedLiaisonId(member.deletableUserId);
    setSelectedOrganizationId("");
    setAssignOrganizationOpen(false);
    setShowManageOrganizations(false);
  };

  return (
    <Shell>
      <ConfirmActionModal
        open={showDeleteClientModal}
        title="Delete liaison"
        description={`This will remove ${deleteTarget?.name ?? "this liaison"} from the workspace and unlink them from any existing projects.`}
        confirmLabel="Delete liaison"
        tone="danger"
        busy={isDeletingClient}
        onCancel={() => {
          if (!isDeletingClient) {
            setShowDeleteClientModal(false);
          }
        }}
        onConfirm={async () => {
          if (!deleteTarget?.id) {
            return;
          }

          setIsDeletingClient(true);
          try {
            await deleteClient(deleteTarget.id);
            setShowDeleteClientModal(false);
            setDeleteTarget(null);
            if (selectedLiaisonId === deleteTarget.id) {
              setSelectedLiaisonId(null);
              setSelectedOrganizationId("");
              setAssignOrganizationOpen(false);
              setShowManageOrganizations(false);
            }
          } finally {
            setIsDeletingClient(false);
          }
        }}
      />
      <ConfirmActionModal
        open={showRevokeInviteModal}
        title="Revoke invite"
        description={`This will revoke the pending liaison invite for ${revokeTarget?.email ?? "this email"}.`}
        confirmLabel="Revoke invite"
        tone="danger"
        busy={isRevokingInvite}
        onCancel={() => {
          if (!isRevokingInvite) {
            setShowRevokeInviteModal(false);
          }
        }}
        onConfirm={async () => {
          if (!revokeTarget?.id) {
            return;
          }

          setIsRevokingInvite(true);
          try {
            await revokeInvitation(revokeTarget.id);
            setShowRevokeInviteModal(false);
            setRevokeTarget(null);
          } finally {
            setIsRevokingInvite(false);
          }
        }}
      />
      <InviteWorkspaceModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        variant="client"
        initialClientOrganizationId={organization.organizationId ?? ""}
        lockClientOrganization={Boolean(organization.organizationId)}
      />
      {showAssignLiaisonModal ? (
        <Overlay
          onClick={() => {
            if (!isAssigningLiaison) {
              setShowAssignLiaisonModal(false);
              setAssignLiaisonOpen(false);
            }
          }}
        >
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <PanelTitle>Assign Existing Liaison</PanelTitle>
                <ClientMeta>Pick any liaison not already attached to this organization and add them here.</ClientMeta>
              </div>
              <IconButton
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (!isAssigningLiaison) {
                    setShowAssignLiaisonModal(false);
                    setAssignLiaisonOpen(false);
                  }
                }}
              >
                <IconClose />
              </IconButton>
            </ModalHeader>
            <ModalForm
              onSubmit={async (event) => {
                event.preventDefault();
                const selectedLiaison = assignableLiaisons.find(
                  (member) => member.id === selectedAssignableLiaisonId,
                );
                if (!selectedLiaison || !organization.organizationId) {
                  return;
                }

                setIsAssigningLiaison(true);
                try {
                  await updateClient(selectedLiaison.id, {
                    name: selectedLiaison.name,
                    company: organization.name,
                    addClientOrganizationId: organization.organizationId,
                  });
                  setSelectedAssignableLiaisonId("");
                  setAssignLiaisonOpen(false);
                  setShowAssignLiaisonModal(false);
                } finally {
                  setIsAssigningLiaison(false);
                }
              }}
            >
              <FloatingSelectField $filled={Boolean(selectedAssignableLiaisonId)} $open={assignLiaisonOpen}>
                <SelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={assignLiaisonOpen}
                  onClick={() => setAssignLiaisonOpen((current) => !current)}
                >
                  <SelectValue>
                    {assignableLiaisons.find((member) => member.id === selectedAssignableLiaisonId)
                      ? `${assignableLiaisons.find((member) => member.id === selectedAssignableLiaisonId)?.name} · ${
                          assignableLiaisons.find((member) => member.id === selectedAssignableLiaisonId)?.email
                        }`
                      : "Select liaison"}
                  </SelectValue>
                  <SelectChevron $open={assignLiaisonOpen}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectTrigger>
                <FloatingLabel>Liaison</FloatingLabel>
                {assignLiaisonOpen ? (
                  <SelectMenu role="listbox" aria-label="Assignable liaisons">
                    {assignableLiaisons.length ? (
                      assignableLiaisons.map((member) => (
                        <SelectOption
                          key={member.id}
                          type="button"
                          role="option"
                          aria-selected={selectedAssignableLiaisonId === member.id}
                          $active={selectedAssignableLiaisonId === member.id}
                          onClick={() => {
                            setSelectedAssignableLiaisonId(member.id);
                            setAssignLiaisonOpen(false);
                          }}
                        >
                          {member.name} · {member.email}
                        </SelectOption>
                      ))
                    ) : (
                      <SelectOption type="button" role="option" aria-selected={false} $active={false} disabled>
                        No eligible liaisons available
                      </SelectOption>
                    )}
                  </SelectMenu>
                ) : null}
              </FloatingSelectField>
              <PrimaryButton
                type="submit"
                disabled={isAssigningLiaison || !selectedAssignableLiaisonId || !organization.organizationId}
              >
                {isAssigningLiaison ? "Assigning..." : "Assign Liaison"}
              </PrimaryButton>
            </ModalForm>
          </ModalCard>
        </Overlay>
      ) : null}
      {selectedLiaison ? (
        <Overlay
          onClick={() => {
            if (!isAssigning && !isRemovingOrganization && !isDeletingClient) {
              setSelectedLiaisonId(null);
              setSelectedOrganizationId("");
              setAssignOrganizationOpen(false);
              setShowManageOrganizations(false);
            }
          }}
        >
          <ModalCard onClick={(event) => event.stopPropagation()}>
            {isDeletingClient ? (
              <PopupLoadingOverlay role="status" aria-live="polite">
                <div className="auth-loading-card">
                  <div className="auth-loading-spinner" aria-hidden="true" />
                  <p>Deleting liaison...</p>
                </div>
              </PopupLoadingOverlay>
            ) : null}
            <ModalHeader>
              <div>
                <PanelTitle>{selectedLiaison.name}</PanelTitle>
                <ClientMeta>Short liaison details and organization memberships.</ClientMeta>
              </div>
              <HeaderActions>
                {canDeleteSelectedLiaison ? (
                  <IconButton
                    type="button"
                    aria-label="Delete liaison"
                    disabled={isAssigning || isRemovingOrganization || isDeletingClient}
                    onClick={() => {
                      setDeleteTarget({ id: selectedLiaison.id, name: selectedLiaison.name });
                      setShowDeleteClientModal(true);
                    }}
                  >
                    <IconTrash />
                  </IconButton>
                ) : null}
                <IconButton
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    if (!isAssigning && !isRemovingOrganization && !isDeletingClient) {
                      setSelectedLiaisonId(null);
                      setSelectedOrganizationId("");
                      setAssignOrganizationOpen(false);
                      setShowManageOrganizations(false);
                    }
                  }}
                >
                  <IconClose />
                </IconButton>
              </HeaderActions>
            </ModalHeader>
            <ModalForm>
              <ReadOnlyField>
                <ReadOnlyLabel>Liaison</ReadOnlyLabel>
                <ReadOnlyValue>
                  <strong>{selectedLiaison.name}</strong>
                  <span>{selectedLiaison.email}</span>
                  <span>
                    {[selectedLiaison.jobTitle, selectedLiaison.department].filter(Boolean).join(" · ") ||
                      selectedLiaison.company}
                  </span>
                </ReadOnlyValue>
              </ReadOnlyField>
              <ReadOnlyField>
                <ReadOnlyLabel>Organizations</ReadOnlyLabel>
                <OrganizationsScroller>
                  {selectedLiaison.clientOrganizationNames.length ? (
                    selectedLiaison.clientOrganizationNames.map((organizationName, index) => (
                      <OrganizationPill key={`${selectedLiaison.id}:${organizationName}:${index}`}>
                        {organizationName}
                        {showManageOrganizations && canManage ? (
                          <RemoveOrganizationButton
                            type="button"
                            aria-label={`Remove ${organizationName}`}
                            disabled={isRemovingOrganization}
                            onClick={async () => {
                              const currentOrganizationId = selectedLiaison.clientOrganizationIds[index] ?? null;
                              if (!currentOrganizationId) {
                                return;
                              }

                              setIsRemovingOrganization(true);
                              try {
                                await updateClient(selectedLiaison.id, {
                                  name: selectedLiaison.name,
                                  company: selectedLiaison.company,
                                  removeClientOrganizationId: currentOrganizationId,
                                });
                                setSelectedOrganizationId("");
                                setAssignOrganizationOpen(false);
                              } finally {
                                setIsRemovingOrganization(false);
                              }
                            }}
                          >
                            <IconClose />
                          </RemoveOrganizationButton>
                        ) : null}
                      </OrganizationPill>
                    ))
                  ) : (
                    <ClientMeta>No organizations assigned yet.</ClientMeta>
                  )}
                </OrganizationsScroller>
              </ReadOnlyField>
              <DetailMetaGrid>
                <CompactMetaCard>
                  <ReadOnlyLabel>Projects</ReadOnlyLabel>
                  <CompactMetaValue>
                    {selectedLiaison.activeProjectCount}/{selectedLiaison.projectCount}
                  </CompactMetaValue>
                </CompactMetaCard>
                <CompactMetaCard>
                  <ReadOnlyLabel>Joined</ReadOnlyLabel>
                  <CompactMetaValue>{formatDate(selectedLiaison.createdAt ?? null)}</CompactMetaValue>
                </CompactMetaCard>
              </DetailMetaGrid>
              {canManage ? (
                <>
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      setShowManageOrganizations((current) => !current);
                    }}
                  >
                    {showManageOrganizations ? "Hide org management" : "Manage org"}
                  </SecondaryButton>
                  {showManageOrganizations ? (
                    <>
                      <FloatingSelectField $filled={Boolean(selectedOrganizationId)} $open={assignOrganizationOpen}>
                        <SelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={assignOrganizationOpen}
                          onClick={() => setAssignOrganizationOpen((current) => !current)}
                        >
                          <SelectValue>
                            {assignableOrganizations.find((clientOrganization) => clientOrganization.id === selectedOrganizationId)
                              ?.name ?? "Select organization"}
                          </SelectValue>
                          <SelectChevron $open={assignOrganizationOpen}>
                            <IconChevronDown />
                          </SelectChevron>
                        </SelectTrigger>
                        <FloatingLabel>Add organization</FloatingLabel>
                        {assignOrganizationOpen ? (
                          <SelectMenu role="listbox" aria-label="Client organizations">
                            {assignableOrganizations.length ? (
                              assignableOrganizations.map((clientOrganization) => (
                                <SelectOption
                                  key={clientOrganization.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selectedOrganizationId === clientOrganization.id}
                                  $active={selectedOrganizationId === clientOrganization.id}
                                  onClick={() => {
                                    setSelectedOrganizationId(clientOrganization.id);
                                    setAssignOrganizationOpen(false);
                                  }}
                                >
                                  {clientOrganization.name}
                                </SelectOption>
                              ))
                            ) : (
                              <SelectOption type="button" role="option" aria-selected={false} $active={false} disabled>
                                No organizations available
                              </SelectOption>
                            )}
                          </SelectMenu>
                        ) : null}
                      </FloatingSelectField>
                      <PrimaryButton
                        type="button"
                        disabled={isAssigning || !selectedOrganizationId}
                        onClick={async () => {
                          const nextOrganization = assignableOrganizations.find(
                            (clientOrganization) => clientOrganization.id === selectedOrganizationId,
                          );
                          if (!nextOrganization) {
                            return;
                          }

                          setIsAssigning(true);
                          try {
                            await updateClient(selectedLiaison.id, {
                              name: selectedLiaison.name,
                              company: nextOrganization.name,
                              addClientOrganizationId: nextOrganization.id,
                            });
                            setSelectedOrganizationId("");
                            setAssignOrganizationOpen(false);
                          } finally {
                            setIsAssigning(false);
                          }
                        }}
                      >
                        {isAssigning ? "Adding..." : "Add organization"}
                      </PrimaryButton>
                    </>
                  ) : null}
                </>
              ) : null}
            </ModalForm>
          </ModalCard>
        </Overlay>
      ) : null}
      {showEditModal ? (
        <Overlay onClick={() => !isSavingOrganization && setShowEditModal(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <PanelTitle>Edit Organization</PanelTitle>
                <ClientMeta>Update organization details for client-facing work.</ClientMeta>
              </div>
              <IconButton
                type="button"
                aria-label="Close"
                onClick={() => !isSavingOrganization && setShowEditModal(false)}
              >
                <IconClose />
              </IconButton>
            </ModalHeader>
            <ModalForm onSubmit={handleSaveOrganization}>
              <FieldStack>
                <FieldLabel>Organization name</FieldLabel>
                <TextInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isSavingOrganization}
                  required
                />
              </FieldStack>
              <FieldGrid>
                <FieldStack>
                  <FloatingSelectField $filled $open={openEditSelect === "type"}>
                    <SelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={openEditSelect === "type"}
                      disabled={isSavingOrganization}
                      onClick={() => {
                        if (isSavingOrganization) {
                          return;
                        }
                        setOpenEditSelect((current) => (current === "type" ? null : "type"));
                      }}
                    >
                      <SelectValue>{type === "internal" ? "Internal" : "External"}</SelectValue>
                      <SelectChevron $open={openEditSelect === "type"}>
                        <IconChevronDown />
                      </SelectChevron>
                    </SelectTrigger>
                    <FloatingLabel>Type</FloatingLabel>
                    {openEditSelect === "type" && !isSavingOrganization ? (
                      <SelectMenu role="listbox" aria-label="Organization type">
                        <SelectOption
                          type="button"
                          role="option"
                          aria-selected={type === "external"}
                          $active={type === "external"}
                          onClick={() => {
                            setType("external");
                            setOpenEditSelect(null);
                          }}
                        >
                          External
                        </SelectOption>
                        <SelectOption
                          type="button"
                          role="option"
                          aria-selected={type === "internal"}
                          $active={type === "internal"}
                          onClick={() => {
                            setType("internal");
                            setPhone("");
                            setAddress("");
                            setOpenEditSelect(null);
                          }}
                        >
                          Internal
                        </SelectOption>
                      </SelectMenu>
                    ) : null}
                  </FloatingSelectField>
                </FieldStack>
                <FieldStack>
                  <FloatingSelectField $filled $open={openEditSelect === "status"}>
                    <SelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={openEditSelect === "status"}
                      disabled={isSavingOrganization}
                      onClick={() => {
                        if (isSavingOrganization) {
                          return;
                        }
                        setOpenEditSelect((current) => (current === "status" ? null : "status"));
                      }}
                    >
                      <SelectValue>{status === "active" ? "Active" : "Inactive"}</SelectValue>
                      <SelectChevron $open={openEditSelect === "status"}>
                        <IconChevronDown />
                      </SelectChevron>
                    </SelectTrigger>
                    <FloatingLabel>Status</FloatingLabel>
                    {openEditSelect === "status" && !isSavingOrganization ? (
                      <SelectMenu role="listbox" aria-label="Organization status">
                        <SelectOption
                          type="button"
                          role="option"
                          aria-selected={status === "active"}
                          $active={status === "active"}
                          onClick={() => {
                            setStatus("active");
                            setOpenEditSelect(null);
                          }}
                        >
                          Active
                        </SelectOption>
                        <SelectOption
                          type="button"
                          role="option"
                          aria-selected={status === "inactive"}
                          $active={status === "inactive"}
                          onClick={() => {
                            setStatus("inactive");
                            setOpenEditSelect(null);
                          }}
                        >
                          Inactive
                        </SelectOption>
                      </SelectMenu>
                    ) : null}
                  </FloatingSelectField>
                </FieldStack>
              </FieldGrid>
              {type === "external" ? (
                <FieldGrid>
                  <FieldStack>
                    <FieldLabel>Contact Number</FieldLabel>
                    <TextInput
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      disabled={isSavingOrganization}
                    />
                  </FieldStack>
                  <FieldStack>
                    <FieldLabel>Address</FieldLabel>
                    <TextInput
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      disabled={isSavingOrganization}
                    />
                  </FieldStack>
                </FieldGrid>
              ) : null}
              <PrimaryButton type="submit" disabled={isSavingOrganization}>
                {isSavingOrganization ? "Saving..." : "Save Organization"}
              </PrimaryButton>
            </ModalForm>
          </ModalCard>
        </Overlay>
      ) : null}
      <AppSidebar user={user} activeLabel={activeLabel} />
      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            {!homeMode ? <BackLink href="/clients">← Back to clients</BackLink> : null}
            <Title>{organization.name}</Title>
            <Subtitle>
              {homeMode
                ? "Home for your organization, current projects, and client-facing activity."
                : "Manage liaisons, projects, and client-facing activity for this organization."}
            </Subtitle>
          </div>
          <HeaderActions>
            {!organization.isUnassigned ? (
              <>
                {canManage && organization.organizationId ? (
                  <PrimaryActionLink href={`/projects/new?clientOrganizationId=${organization.organizationId}`}>
                    <ButtonIcon aria-hidden="true">
                      <IconPlusMini />
                    </ButtonIcon>
                    Project
                  </PrimaryActionLink>
                ) : null}         
                {canManage ? (
                  <PrimaryButton type="button" onClick={() => setShowInviteModal(true)}>
                    <ButtonIcon aria-hidden="true">
                      <IconPlusMini />
                    </ButtonIcon>
                    Liaison
                  </PrimaryButton>
                ) : null}
                {canEditOrganization ? (
                  <SecondaryButton type="button" onClick={() => setShowEditModal(true)}>
                    <ButtonIcon aria-hidden="true">
                      <IconPenMini />
                    </ButtonIcon>
                    Edit
                  </SecondaryButton>
                ) : null}
              </>
            ) : null}
            <HeaderAvatarLink href="/profile" aria-label="Open profile">
              {user.name.slice(0, 1)}
            </HeaderAvatarLink>
          </HeaderActions>
        </Header>

        <HeroCard>
          <HeroTop>
            <ClientMark>{getClientOrganizationMark(organization.name)}</ClientMark>
            <div>
              <PanelTitle>{organization.name}</PanelTitle>
              <InlinePills>
                <TypePill $type={organization.type}>
                  {organization.type === "internal" ? "Internal" : "External"}
                </TypePill>
                {getClientOrganizationStatusLabel(organization) ? (
                  <PendingPill $active={organization.status === "active"}>
                    {getClientOrganizationStatusLabel(organization)}
                  </PendingPill>
                ) : null}
              </InlinePills>
            </div>
          </HeroTop>

          <StatGrid>
            <StatCard>
              <MetaTag>Liaisons</MetaTag>
              <StatValue>{organization.memberCount}</StatValue>
            </StatCard>
            <StatCard>
              <MetaTag>Projects</MetaTag>
              <StatValue>{organization.projectCount}</StatValue>
            </StatCard>
            <StatCard>
              <MetaTag>Last Activity</MetaTag>
              <StatValue>{formatDate(organization.lastActivityDate)}</StatValue>
            </StatCard>
            {organization.type === "external" ? (
              <StatCard>
                <MetaTag>Contact Number</MetaTag>
                <StatValue>{rawOrganization?.phone?.trim() || "Not provided"}</StatValue>
              </StatCard>
            ) : null}
            {organization.type === "external" ? (
              <StatCard>
                <MetaTag>Address</MetaTag>
                <StatValue>{rawOrganization?.address?.trim() || "Not provided"}</StatValue>
              </StatCard>
            ) : null}
          </StatGrid>
        </HeroCard>

        <Grid>
          <SectionCard>
            <SectionHeader>
              <PanelTitle>Liaisons</PanelTitle>
              <SectionActions>
                {canManage ? <SectionLink href="/clients/liaisons">View all liaisons</SectionLink> : null}
                
              </SectionActions>
            </SectionHeader>
            {organization.members.length ? (
              <List>
                {organization.members.map((member) => {
                  const canOpenLiaison =
                    Boolean(member.deletableUserId) && (canManage || member.deletableUserId === user.id);

                  if (!canOpenLiaison) {
                    return (
                      <Row key={member.id}>
                        <div>
                          <RowTitle>{member.name}</RowTitle>
                          <ClientMeta>
                            {member.email}
                            {member.company ? ` · ${member.company}` : ""}
                          </ClientMeta>
                        </div>
                      </Row>
                    );
                  }

                  return (
                    <LiaisonRowButton key={member.id} type="button" onClick={() => handleOpenEditLiaison(member)}>
                      <div>
                        <RowTitle>{member.name}</RowTitle>
                        <ClientMeta>
                          {member.email}
                          {member.company ? ` · ${member.company}` : ""}
                        </ClientMeta>
                      </div>
                    </LiaisonRowButton>
                  );
                })}
              </List>
            ) : (
              <ClientMeta>No liaisons linked to this organization yet.</ClientMeta>
            )}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>Projects</PanelTitle>
            </SectionHeader>
            {organizationProjects.length ? (
              <List>
                {organizationProjects.map((project) => (
                  <RowCardLink key={project.id} href={`/projects/${project.id}`}>
                    <div>
                      <RowTitle>{project.name}</RowTitle>
                      <ClientMeta>
                        {formatShortDate(project.dueDate)} · {getClientProjectStatusLabel(project.status, project.stage)}
                      </ClientMeta>
                    </div>
                  </RowCardLink>
                ))}
              </List>
            ) : (
              <ClientMeta>No projects linked to this organization yet.</ClientMeta>
            )}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>Pending Liaison Invites</PanelTitle>
            </SectionHeader>
            {pendingInvitations.length ? (
              <List>
                {pendingInvitations.map((invitation) => (
                  <Row key={invitation.id}>
                    <div>
                      <RowTitle>{invitation.name}</RowTitle>
                      <ClientMeta>
                        {invitation.email} · Sent {formatDate(invitation.createdAt)}
                      </ClientMeta>
                    </div>
                    {canManage ? (
                      <RowActionButton
                        type="button"
                        onClick={() => {
                          setRevokeTarget({
                            id: invitation.id,
                            email: invitation.email,
                          });
                          setShowRevokeInviteModal(true);
                        }}
                      >
                        Revoke
                      </RowActionButton>
                    ) : null}
                  </Row>
                ))}
              </List>
            ) : (
              <ClientMeta>No pending liaison invites for this organization.</ClientMeta>
            )}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>Pending Items</PanelTitle>
            </SectionHeader>
            {organization.pendingProjects.length ? (
              <List>
                {organization.pendingProjects.map((project) => (
                  <RowCardLink key={project.id} href={`/projects/${project.id}`}>
                    <div>
                      <RowTitle>{project.name}</RowTitle>
                      <ClientMeta>
                        {getClientProjectStatusLabel(project.status)} · {formatShortDate(project.dueDate)}
                      </ClientMeta>
                    </div>
                  </RowCardLink>
                ))}
              </List>
            ) : (
              <ClientMeta>No pending items for this organization.</ClientMeta>
            )}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>Client Tasks</PanelTitle>
            </SectionHeader>
            {organization.openTasks.length ? (
              <>
                <List>
                  {paginatedTasks.map((task) => (
                    <Row key={task.id}>
                      <div>
                        <RowTitle>{task.title}</RowTitle>
                        <ClientMeta>
                          {task.projectName} · {task.assigneeName} · {formatTaskStatus(task.status)} · {formatPriority(task.priority)} · {formatShortDate(task.dueDate)}
                        </ClientMeta>
                      </div>
                      <RowLink href={`/projects/${task.projectId}`}>Open project</RowLink>
                    </Row>
                  ))}
                </List>
                <Footer>
                  <span>
                    Showing {(selectedTasksPage - 1) * TASKS_PAGE_SIZE + 1} to {Math.min(selectedTasksPage * TASKS_PAGE_SIZE, organization.openTasks.length)} of {organization.openTasks.length} tasks
                  </span>
                  <Pagination>
                    <PageButton
                      type="button"
                      onClick={() => setSelectedTasksPage((page) => Math.max(1, page - 1))}
                      disabled={selectedTasksPage === 1}
                    >
                      Last
                    </PageButton>
                    <PageButton $active type="button">{selectedTasksPage}</PageButton>
                    <PageButton
                      type="button"
                      onClick={() => setSelectedTasksPage((page) => Math.min(totalTaskPages, page + 1))}
                      disabled={selectedTasksPage === totalTaskPages}
                    >
                      Next
                    </PageButton>
                  </Pagination>
                </Footer>
              </>
            ) : (
              <ClientMeta>No open tasks for this organization.</ClientMeta>
            )}
          </SectionCard>
        </Grid>
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
    align-items: stretch;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
  }
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 24px 28px;
    border-radius: 0 26px 26px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 767px) {
    align-items: center;
    gap: 0;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 767px) {
    width: 100%;
    gap: 6px;
    flex-wrap: nowrap;
  }
`;

const Eyebrow = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  @media (max-width: 767px) {
    display: none;
  }
`;

const BackLink = styled(Link)`
  display: inline-flex;
  margin-top: 8px;
  color: var(--color-text-muted);
  font-size: 0.86rem;
  text-decoration: none;

  @media (max-width: 767px) {
    display: none;
  }
`;

const Title = styled.h1`
  margin: 8px 0 6px;
  font-size: clamp(1.28rem, 2.5vw, 1.72rem);
  line-height: 1;
  letter-spacing: -0.04em;

  @media (max-width: 767px) {
    display: none;
  }
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.45;

  @media (max-width: 767px) {
    display: none;
  }
`;

const ClientHomeWelcome = styled.p`
  margin: 0;
  color: #1f1f1f;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.4;
`;

const HeaderAvatarLink = styled(Link)`
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: #ded6c8;
  color: #fff;
  font-weight: 700;
  text-decoration: none;

  @media (max-width: 767px) {
    display: none;
  }
`;

const HeroCard = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
`;

const HeroTop = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const ClientMark = styled.div<{ $large?: boolean }>`
  width: ${({ $large }) => ($large ? "72px" : "56px")};
  height: ${({ $large }) => ($large ? "72px" : "56px")};
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: ${({ $large }) => ($large ? "1.5rem" : "1rem")};
  font-weight: 700;
  flex: 0 0 ${({ $large }) => ($large ? "72px" : "56px")};
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.96rem;
`;

const InlinePills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
`;

const PendingPill = styled(Pill)<{ $active?: boolean }>`
  background: ${({ $active }) => ($active ? "#e5f4e8" : "#f4f1ed")};
  color: ${({ $active }) => ($active ? "#5ca16d" : "#8d857b")};
`;

const TypePill = styled(Pill)<{ $type: "internal" | "external" }>`
  background: ${({ $type }) => ($type === "internal" ? "#e6efff" : "#f4f1ed")};
  color: ${({ $type }) => ($type === "internal" ? "#4770d8" : "#7f7468")};
`;

const StatGrid = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
`;

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
`;

const MetaTag = styled.span`
  color: var(--color-text-light);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const StatValue = styled.strong`
  font-size: 0.94rem;
`;

const ClientHomeHero = styled.section`
  ${cardSurface}
  display: grid;
  gap: 18px;
  padding: 18px;
  border-radius: 24px;
`;

const ClientHomeHeroBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const ClientHomeHeroTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.2rem, 2.2vw, 1.62rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const ClientHomeStats = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;

  ${desktop} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
  }
`;

const ClientMetricCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;

  ${desktop} {
    padding: 0 18px;
    border-left: 1px solid rgba(230, 224, 215, 0.95);

    &:first-child {
      border-left: 0;
      padding-left: 0;
    }
  }
`;

const MetricIcon = styled.div<{ $tone: "success" | "warning" | "neutral" }>`
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ $tone }) =>
    $tone === "success" ? "#e5f4e8" : $tone === "warning" ? "#fbefcf" : "#f4f1ed"};
  color: ${({ $tone }) =>
    $tone === "success" ? "#5ca16d" : $tone === "warning" ? "#c58911" : "#7f7468"};

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MetricLabel = styled.span`
  display: block;
  color: #5f564b;
  font-size: 0.84rem;
  line-height: 1.25;
`;

const MetricValue = styled.strong`
  display: block;
  margin-top: 3px;
  color: #1f1f1f;
  font-size: 1.4rem;
  line-height: 1;
  letter-spacing: -0.04em;
`;

const Grid = styled.section`
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SectionCard = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 22px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const SectionActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
`;

const RowTitle = styled.strong`
  display: block;
  margin-bottom: 4px;
  font-size: 0.9rem;
`;

const LiaisonRowButton = styled.button`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  text-align: left;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(31, 67, 57, 0.18);
    box-shadow: 0 14px 24px rgba(31, 67, 57, 0.07);
  }

  &:hover ${RowTitle} {
    color: #1f4339;
  }
`;

const RowCardLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: inherit;
  text-decoration: none;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(31, 67, 57, 0.18);
    box-shadow: 0 14px 24px rgba(31, 67, 57, 0.07);
  }

  &:hover ${RowTitle} {
    color: #1f4339;
  }
`;

const RowLink = styled(Link)`
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
`;

const RowActionButton = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 700;
`;

const RowActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
`;

const ClientMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.4;
`;

const PrimaryButton = styled.button`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #1f4339;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;

  @media (max-width: 767px) {
    flex: 1 1 0;
    min-height: 34px;
    gap: 6px;
    padding: 0 10px;
    font-size: 0.76rem;
  }
`;

const PrimaryActionLink = styled(Link)`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #1f4339;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;

  @media (max-width: 767px) {
    flex: 1 1 0;
    min-height: 34px;
    gap: 6px;
    padding: 0 10px;
    font-size: 0.76rem;
  }
`;

const SecondaryButton = styled.button`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 700;

  @media (max-width: 767px) {
    flex: 1 1 0;
    min-height: 34px;
    gap: 6px;
    padding: 0 10px;
    font-size: 0.76rem;
  }
`;

const SecondaryDangerButton = styled(SecondaryButton)`
  color: #d25545;
`;

const ButtonIcon = styled.span`
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const LinkButton = styled.button`
  padding: 0;
  border: 0;
  background: transparent;
  color: #1f4339;
  font-size: 0.84rem;
  font-weight: 700;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.8rem;
`;

const Pagination = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  min-width: 38px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: ${({ $active }) => ($active ? "#1f4339" : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--color-text)")};
  font-size: 0.9rem;
  font-weight: 700;
`;

const ClientHomeGrid = styled.section`
  display: grid;
  gap: 16px;

  ${desktop} {
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    align-items: start;
  }
`;

const ClientHomePanel = styled.section`
  ${cardSurface}
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 24px;
`;

const ClientHomeList = styled.div`
  display: grid;
  gap: 12px;
`;

const SectionLink = styled(Link)`
  color: #1f4339;
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
`;

const ClientProjectCard = styled(Link)`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  color: inherit;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(31, 67, 57, 0.18);
    box-shadow: 0 18px 32px rgba(31, 67, 57, 0.08);
  }

  ${desktop} {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }
`;

const ClientProjectGlyph = styled.div`
  width: 60px;
  height: 60px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #eff8f1, #f8fbf9);
  color: #8c7040;
  font-size: 1.1rem;
  font-weight: 700;
`;

const ClientProjectBody = styled.div`
  display: grid;
  gap: 6px;
  min-width: 0;
`;

const ClientProjectHeading = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const ClientProjectTitle = styled.strong`
  color: #1f1f1f;
  font-size: 0.94rem;
  line-height: 1.3;
`;

const ClientProjectMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: #6f6558;
  font-size: 0.84rem;
  line-height: 1.4;
`;

const StatusInline = styled.span<{ $fg: string }>`
  color: ${({ $fg }) => $fg};
  font-weight: 700;
`;

const InlineMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ClientProjectProgress = styled.div`
  display: grid;
  gap: 8px;

  ${desktop} {
    width: 220px;
  }
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #ede7df;
`;

const ProgressBar = styled.div<{ $value: number; $color: string }>`
  width: ${({ $value }) => `${Math.max(0, Math.min(100, $value))}%`};
  height: 100%;
  border-radius: inherit;
  background: ${({ $color }) => $color};
`;

const ProgressValue = styled.span`
  color: #534a3f;
  font-size: 0.84rem;
  font-weight: 700;
  justify-self: end;
`;

const ClientProjectArrow = styled.span`
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  color: #534a3f;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ClientReviewCard = styled(Link)`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  color: inherit;
`;

const ClientReviewIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f7f4ef, #fbf9f5);
  color: #b18225;

  svg {
    width: 22px;
    height: 22px;
  }
`;

const ClientReviewBody = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;
`;

const ClientReviewPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fbefcf;
  color: #c58911;
  font-size: 0.78rem;
  font-weight: 700;
`;

const ActivityList = styled.div`
  display: grid;
  gap: 12px;
`;

const ActivityRowCard = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
`;

const ActivityIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef7f0;
  color: #5ca16d;
`;

const ActivityBody = styled.div`
  display: grid;
  gap: 3px;
`;

const ActivityTitle = styled.strong`
  color: #1f1f1f;
  font-size: 0.9rem;
  line-height: 1.35;
`;

const ActivityTime = styled.span`
  color: #8f8579;
  font-size: 0.76rem;
  font-weight: 600;
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(21, 18, 13, 0.4);
`;

const ModalCard = styled.div`
  ${cardSurface}
  width: min(520px, calc(100vw - 32px));
  border-radius: 24px;
  padding: 20px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const FloatingSelectField = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
`;

const FloatingLabel = styled.span`
  position: absolute;
  left: 12px;
  top: 0;
  transform: translateY(-50%);
  padding: 0 4px;
  background: rgba(252, 249, 244, 0.96);
  color: #335c4f;
  font-size: 0.74rem;
  pointer-events: none;
`;

const SelectTrigger = styled.button`
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text);
  text-align: left;

  &:disabled {
    background: rgba(244, 241, 237, 0.92);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
`;

const SelectValue = styled.span`
  display: block;
  min-width: 0;
  font-size: 0.94rem;
  line-height: 1.25;
`;

const SelectChevron = styled.span<{ $open?: boolean }>`
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transform: rotate(${({ $open }) => ($open ? "180deg" : "0deg")});
  transition: transform 140ms ease;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SelectMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--shadow-md);
  max-height: 260px;
  overflow-y: auto;
`;

const SelectOption = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: ${({ $active }) => ($active ? "rgba(31, 67, 57, 0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "#1f4339" : "var(--color-text)")};
  font-size: 0.92rem;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const FieldStack = styled.label`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FieldLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ReadOnlyField = styled.div`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
`;

const ReadOnlyLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ReadOnlyValue = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: rgba(244, 241, 237, 0.92);
  color: var(--color-text-muted);

  strong {
    color: var(--color-text);
    font-size: 0.88rem;
  }

  span {
    font-size: 0.78rem;
    line-height: 1.45;
  }
`;

const PopupLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  border-radius: 24px;
  background: rgba(247, 243, 237, 0.78);
  backdrop-filter: blur(6px);
`;

const OrganizationsScroller = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
  padding-right: 4px;
`;

const OrganizationPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.9);
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 600;
`;

const RemoveOrganizationButton = styled.button`
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: rgba(31, 67, 57, 0.12);
  color: #1f4339;
  padding: 0;

  svg {
    width: 11px;
    height: 11px;
  }
`;

const DetailMetaGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const CompactMetaCard = styled.div`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
`;

const CompactMetaValue = styled.strong`
  font-size: 0.9rem;
  color: var(--color-text);
`;

const TextInput = styled.input`
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text);

  &:disabled {
    color: var(--color-text-muted);
    background: rgba(244, 241, 237, 0.92);
  }
`;

const IconButton = styled.button`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: #fff;
  color: var(--color-text);
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

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconPlusMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconPenMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 20 4.5-1 9.2-9.2a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
      <path d="m13.5 7.5 3 3" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function IconFolderMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconCheckBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconCalendarMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconSparkMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v5" />
      <path d="m16.5 7.5-3 3" />
      <path d="M21 12h-5" />
      <path d="m16.5 16.5-3-3" />
      <path d="M12 21v-5" />
      <path d="m7.5 16.5 3-3" />
      <path d="M3 12h5" />
      <path d="m7.5 7.5 3 3" />
    </svg>
  );
}
