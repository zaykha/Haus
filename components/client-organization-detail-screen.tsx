"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandColorPicker } from "@/components/brand-color-picker";
import { ClientTitleLogo } from "@/components/client-title-logo";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { HeaderProfileAvatarLink } from "@/components/header-profile-avatar-link";
import { InviteWorkspaceModal } from "@/components/invite-workspace-modal";
import { useAppState } from "@/components/app-state";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { ProjectStageProgress } from "@/components/project-stage-progress";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { getClientBrandStyle, normalizeHexColor } from "@/lib/client-branding";
import {
  buildLiaisonRows,
  buildClientOrganizationRows,
  getClientOrganizationMark,
  getClientOrganizationStatusLabel,
} from "@/lib/client-organizations";
import { formatProjectStage, formatRole, getProjectStatusLabel } from "@/lib/display";
import { optimizeImageToWebp } from "@/lib/image-upload";
import { uploadOrganizationLogo } from "@/lib/organization-logo-upload";
import {
  canCreateClient,
  canCreateProjectForOrganization,
  canDeleteClient,
  canInviteClientsForOrganization,
  getUserClientOrganizationIds,
} from "@/lib/permissions";

const desktop = "@media (min-width: 768px)";
const TASKS_PAGE_SIZE = 5;
const LIAISON_LIST_CAP = 4;
const SECTION_LIST_CAP = 4;
const PROJECT_LIST_CAP = 3;
const PENDING_ITEMS_CAP = 3;

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

function getClientProjectTone(status: string, stage?: string | null) {
  if (isCompletedProject(status, stage)) {
    return { fg: "#5ca16d", bg: "#e5f4e8" };
  }

  if (isPendingReviewProject(status, stage)) {
    return { fg: "#c58911", bg: "#fbefcf" };
  }

  if (status === "On Hold" || stage === "On Hold") {
    return { fg: "#d36c57", bg: "#fbe7e3" };
  }

  return { fg: "#4770d8", bg: "#e6efff" };
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

function getOrganizationStatusMeta(status: "active" | "inactive" | null | undefined) {
  if (status === "active") {
    return {
      label: "Active",
      bg: "#5ca16d",
      fg: "#ffffff",
      icon: "✓",
    };
  }

  if (status === "inactive") {
    return {
      label: "Inactive",
      bg: "#8d857b",
      fg: "#ffffff",
      icon: "−",
    };
  }

  return null;
}

function getTaskTone(status: string) {
  switch (status) {
    case "in_progress":
      return { fg: "#4770d8", bg: "#e6efff", label: "In progress" };
    case "review":
      return { fg: "#ca8a22", bg: "#fff1da", label: "Review" };
    case "approved":
    case "done":
      return { fg: "#5ca16d", bg: "#e5f4e8", label: "Completed" };
    default:
      return { fg: "#8d857b", bg: "#f4f1ed", label: "To do" };
  }
}

function getProjectPriorityRank(status: string, stage?: string | null) {
  if (status === "review" || stage === "Pending Review") {
    return 0;
  }

  if (status === "revision") {
    return 1;
  }

  if (status === "active" || stage === "WIP" || stage === "Waiting List") {
    return 2;
  }

  return 3;
}

type ClientOrganizationDetailScreenProps = {
  organizationId: string;
  homeMode?: boolean;
};

export function ClientOrganizationDetailScreen({
  organizationId,
  homeMode = false,
}: ClientOrganizationDetailScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, user, deleteClient, deleteClientOrganization, revokeInvitation, updateClientOrganization, updateClient } =
    useAppState();
  const { scopedHref } = useActiveClientOrganization(user, state.clientOrganizations);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTasksPage, setSelectedTasksPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteClientModal, setShowDeleteClientModal] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [showDeleteOrganizationModal, setShowDeleteOrganizationModal] = useState(false);
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null);
  const [showRevokeInviteModal, setShowRevokeInviteModal] = useState(false);
  const [isRevokingInvite, setIsRevokingInvite] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [showOrganizationErrorPopup, setShowOrganizationErrorPopup] = useState(false);
  const [organizationSubmitAttempted, setOrganizationSubmitAttempted] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"internal" | "external">("external");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#1F4339");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openEditSelect, setOpenEditSelect] = useState<"type" | "status" | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
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
  const [showPendingLiaisonsOnly, setShowPendingLiaisonsOnly] = useState(false);
  const [showOrganizationSwitcher, setShowOrganizationSwitcher] = useState(false);
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [showAllActivityModal, setShowAllActivityModal] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const rows = useMemo(() => buildClientOrganizationRows(state), [state]);
  const liaisonRows = useMemo(() => buildLiaisonRows(state), [state]);
  const organization = rows.find((row) => row.id === organizationId) ?? null;
  const rawOrganization = state.clientOrganizations.find((row) => row.id === organizationId) ?? null;
  const viewerRole = user?.role ?? "client";
  const roleLabel = formatRole(viewerRole).toUpperCase();
  const canManage = canCreateClient(viewerRole);
  const canDelete = canDeleteClient(viewerRole);
  const canCreateOrganizationProject = user
    ? canCreateProjectForOrganization(
        {
          role: user.role,
          clientOrganizationId: user.clientOrganizationId,
          clientOrganizationIds: user.clientOrganizationIds,
        },
        organization?.organizationId ?? null,
      )
    : false;
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
    setLogoUrl(rawOrganization.logoUrl ?? "");
    setLogoPreviewUrl("");
    setBrandColor(rawOrganization.brandColor ?? "#1F4339");
    setPhone(rawOrganization.phone ?? "");
    setAddress(rawOrganization.address ?? "");
  }, [rawOrganization]);

  useEffect(() => {
    setSelectedTasksPage(1);
  }, [organization?.id]);

  const brandStyle = useMemo(() => getClientBrandStyle(rawOrganization), [rawOrganization]);
  const editBrandStyle = useMemo(() => getClientBrandStyle({ brandColor }), [brandColor]);
  const headerLogoUrl =
    rawOrganization?.logoUrl?.trim() ||
    state.clientOrganizations.find((candidate) => candidate.id === organization?.organizationId)?.logoUrl?.trim() ||
    "";
  const clientHomeOrganizations = useMemo(
    () =>
      user?.role === "client"
        ? state.clientOrganizations.filter((candidate) =>
            getUserClientOrganizationIds(user).includes(candidate.id),
          )
        : [],
    [state.clientOrganizations, user],
  );
  const canSwitchClientHomeOrganization =
    homeMode && user?.role === "client" && clientHomeOrganizations.length > 1;
  const isClientViewer = user?.role === "client";
  const organizationStatusMeta = getOrganizationStatusMeta(organization?.status ?? null);
  const canEditOrganization =
    Boolean(user) &&
    (canManage ||
      (isClientViewer &&
        Boolean(
          organization?.organizationId &&
            getUserClientOrganizationIds(user).includes(organization.organizationId),
        )));
  const canInviteOrganizationClients = user
    ? canInviteClientsForOrganization(user, organization?.organizationId ?? null)
    : false;
  const isWorkspaceHydrating =
    Boolean(user) &&
    state.users.length === 0 &&
    state.clientOrganizations.length === 0 &&
    state.projects.length === 0 &&
    state.invitations.length === 0;

  useEffect(() => {
    if (homeMode || !canEditOrganization) {
      return;
    }

    if (searchParams.get("edit") !== "branding") {
      return;
    }

    setShowEditModal(true);
    setOpenEditSelect(null);
    router.replace(`/clients/${organizationId}`);
  }, [canEditOrganization, homeMode, organizationId, router, searchParams]);

  if (!user) {
    return null;
  }

  if (isWorkspaceHydrating) {
    return <ListScreenSkeleton title="Organization" showStats={false} />;
  }

  if (!organization) {
    return (
      <Shell>
        <ClientSidebarSlot>
          <AppSidebar user={user} activeLabel={activeLabel} pinToViewport />
        </ClientSidebarSlot>
        <Content>
          {!homeMode && viewerRole !== "client" ? <BackLink href="/clients">← Back to clients</BackLink> : null}
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
        <ClientSidebarSlot>
          <AppSidebar user={user} activeLabel={activeLabel} pinToViewport />
        </ClientSidebarSlot>
        <Content>
          {!homeMode && viewerRole !== "client" ? <BackLink href="/clients">← Back to clients</BackLink> : null}
          <EmptyState>
            <strong>Access denied</strong>
            <p>You can only view your own organization.</p>
          </EmptyState>
        </Content>
      </Shell>
    );
  }

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
  const visibleLiaisonRows = (
    showPendingLiaisonsOnly
      ? pendingInvitations.map((invitation) => ({ kind: "pending" as const, invitation }))
      : [
          ...organization.members.map((member) => ({ kind: "member" as const, member })),
          ...pendingInvitations.map((invitation) => ({ kind: "pending" as const, invitation })),
        ]
  ).slice(0, LIAISON_LIST_CAP);
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
  const activeProjects = organizationProjects.filter(
    (project) =>
      !isCompletedProject(project.status, project.stage) &&
      project.status !== "On Hold" &&
      project.stage !== "On Hold",
  );
  const projectsInReview = organizationProjects.filter((project) => isPendingReviewProject(project.status, project.stage));
  const completedProjects = organizationProjects.filter((project) => isCompletedProject(project.status, project.stage));
  const holdProjects = organizationProjects.filter(
    (project) => project.status === "On Hold" || project.stage === "On Hold",
  );
  const visibleOrganizationProjects = organizationProjects
    .slice()
    .sort((left, right) => {
      const leftPriority = getProjectPriorityRank(left.status, left.stage);
      const rightPriority = getProjectPriorityRank(right.status, right.stage);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftDue = new Date(left.finalDeliverableDate ?? left.dueDate).getTime();
      const rightDue = new Date(right.finalDeliverableDate ?? right.dueDate).getTime();

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return (left.projectRequestName || left.name).localeCompare(right.projectRequestName || right.name);
    })
    .slice(0, PROJECT_LIST_CAP);
  const visiblePendingProjects = organization.pendingProjects.slice(0, PENDING_ITEMS_CAP);
  const pendingReviewItems = organization.openTasks.slice(0, 3);
  const upcomingDeliveries = activeProjects
    .slice()
    .sort((left, right) => {
      const leftDue = new Date(left.finalDeliverableDate ?? left.dueDate).getTime();
      const rightDue = new Date(right.finalDeliverableDate ?? right.dueDate).getTime();

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return (left.projectRequestName || left.name).localeCompare(right.projectRequestName || right.name);
    })
    .slice(0, 3);
  const clientPriorityProjects = organizationProjects
    .filter(
      (project) =>
        !isCompletedProject(project.status, project.stage) &&
        project.status !== "On Hold" &&
        project.stage !== "On Hold",
    )
    .slice()
    .sort((left, right) => {
      const leftPriority = getProjectPriorityRank(left.status, left.stage);
      const rightPriority = getProjectPriorityRank(right.status, right.stage);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftDue = new Date(left.finalDeliverableDate ?? left.dueDate).getTime();
      const rightDue = new Date(right.finalDeliverableDate ?? right.dueDate).getTime();

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return (left.projectRequestName || left.name).localeCompare(right.projectRequestName || right.name);
    })
    .slice(0, 3);
  const totalProjectsForOverview = Math.max(organizationProjects.length, 1);
  const completedProjectsPct = Math.round((completedProjects.length / totalProjectsForOverview) * 100);
  const inProgressProjectsPct = Math.round((activeProjects.length / totalProjectsForOverview) * 100);
  const reviewProjectsPct = Math.round((projectsInReview.length / totalProjectsForOverview) * 100);
  const holdProjectsPct = Math.round((holdProjects.length / totalProjectsForOverview) * 100);
  const progressDonut = `conic-gradient(
    #5ca16d 0 ${completedProjectsPct}%,
    #1f4339 ${completedProjectsPct}% ${completedProjectsPct + inProgressProjectsPct}%,
    #d69b47 ${completedProjectsPct + inProgressProjectsPct}% ${completedProjectsPct + inProgressProjectsPct + reviewProjectsPct}%,
    #d3ccc1 ${completedProjectsPct + inProgressProjectsPct + reviewProjectsPct}% 100%
  )`;

  if (homeMode && user.role === "client") {
    return (
      <Shell style={brandStyle}>
        {showAllReviewsModal ? (
          <Overlay onClick={() => setShowAllReviewsModal(false)}>
            <ScrollableModalCard onClick={(event) => event.stopPropagation()}>
              <ModalHeader>
                <div>
                  <ModalTitle>Pending Your Review</ModalTitle>
                  <ModalDescription>Browse every task currently waiting for client review.</ModalDescription>
                </div>
                <IconButton type="button" onClick={() => setShowAllReviewsModal(false)} aria-label="Close reviews">
                  <IconClose />
                </IconButton>
              </ModalHeader>
              <ScrollableModalBody>
                {organization.openTasks.length ? (
                  <ClientHomeList>
                    {organization.openTasks.map((task) => (
                      <ClientReviewCard key={task.id} href={scopedHref(`/projects/${task.projectId}`)}>
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
                  <ClientEmptyState $mobileMinHeight={252}>
                    <ClientEmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No pending reviews right now.</strong>
                    <p>Tasks waiting for your feedback will appear here.</p>
                  </ClientEmptyState>
                )}
              </ScrollableModalBody>
            </ScrollableModalCard>
          </Overlay>
        ) : null}

        {showAllActivityModal ? (
          <Overlay onClick={() => setShowAllActivityModal(false)}>
            <ScrollableModalCard onClick={(event) => event.stopPropagation()}>
              <ModalHeader>
                <div>
                  <ModalTitle>Recent Activity</ModalTitle>
                  <ModalDescription>Browse the full activity history for this organization.</ModalDescription>
                </div>
                <IconButton type="button" onClick={() => setShowAllActivityModal(false)} aria-label="Close activity">
                  <IconClose />
                </IconButton>
              </ModalHeader>
              <ScrollableModalBody>
                {organizationActivities.length ? (
                  <ActivityList>
                    {organizationActivities.map((activity) => (
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
                  <ClientEmptyState $mobileMinHeight={206}>
                    <ClientEmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No recent activity yet.</strong>
                    <p>Project updates, uploads, and feedback history will appear here.</p>
                  </ClientEmptyState>
                )}
              </ScrollableModalBody>
            </ScrollableModalCard>
          </Overlay>
        ) : null}

        {showOrganizationSwitcher ? (
          <Overlay onClick={() => setShowOrganizationSwitcher(false)}>
            <ModalCard onClick={(event) => event.stopPropagation()}>
              <ModalHeader>
                <div>
                  <PanelTitle>Switch Organization</PanelTitle>
                  <ClientMeta>Choose which organization dashboard to view.</ClientMeta>
                </div>
                <IconButton
                  type="button"
                  onClick={() => setShowOrganizationSwitcher(false)}
                  aria-label="Close switch organization"
                >
                  <IconClose />
                </IconButton>
              </ModalHeader>
              <OrganizationSwitchList>
                {clientHomeOrganizations.map((clientOrganization) => {
                  const isActiveOrganization = clientOrganization.id === organization.organizationId;
                  return (
                    <OrganizationSwitchButton
                      key={clientOrganization.id}
                      type="button"
                      $active={isActiveOrganization}
                      onClick={() => {
                        setShowOrganizationSwitcher(false);
                        router.replace(`/dashboard?org=${clientOrganization.id}`);
                      }}
                    >
                      <OrganizationSwitchLogo organization={clientOrganization} />
                      <OrganizationSwitchCopy>
                        <strong>{clientOrganization.name}</strong>
                        <span>{clientOrganization.type === "internal" ? "Internal" : "External"}</span>
                      </OrganizationSwitchCopy>
                      <OrganizationSwitchState>
                        {isActiveOrganization ? "Current" : "Switch"}
                      </OrganizationSwitchState>
                    </OrganizationSwitchButton>
                  );
                })}
              </OrganizationSwitchList>
            </ModalCard>
          </Overlay>
        ) : null}
        <ClientSidebarSlot>
          <AppSidebar user={user} activeLabel="Home" pinToViewport />
        </ClientSidebarSlot>
        <Content>
          <Header>
            <div>
              <Eyebrow>Client Organization</Eyebrow>
              <ClientHeaderIdentity>
                <ClientLogo organization={rawOrganization} />
                <div>
                  {canSwitchClientHomeOrganization ? (
                    <ClientHeaderSwitchButton
                      type="button"
                      onClick={() => setShowOrganizationSwitcher(true)}
                      aria-label="Switch organization"
                    >
                      <ClientHeaderTitleRow>
                        <ClientHeaderTitle>{organization.name}</ClientHeaderTitle>
                        {organizationStatusMeta ? (
                          <HeaderStatusIndicator>
                            <HeaderStatusIcon $bg={organizationStatusMeta.bg} $fg={organizationStatusMeta.fg}>
                              {organizationStatusMeta.icon}
                            </HeaderStatusIcon>
                          </HeaderStatusIndicator>
                        ) : null}
                      </ClientHeaderTitleRow>
                      <HeaderSwitchIcon aria-hidden="true">
                        <IconChevronDown />
                      </HeaderSwitchIcon>
                    </ClientHeaderSwitchButton>
                  ) : (
                    <ClientHeaderTitleRow>
                      <ClientHeaderTitle>{organization.name}</ClientHeaderTitle>
                      {organizationStatusMeta ? (
                        <HeaderStatusIndicator>
                          <HeaderStatusIcon $bg={organizationStatusMeta.bg} $fg={organizationStatusMeta.fg}>
                            {organizationStatusMeta.icon}
                          </HeaderStatusIcon>
                        </HeaderStatusIndicator>
                      ) : null}
                    </ClientHeaderTitleRow>
                  )}
                  <InlinePills>
                    <TypePill $type={organization.type}>
                      {organization.type === "internal" ? "Internal" : "External"}
                    </TypePill>
                  {canEditOrganization ? (
                      <BrandConfigButton
                        type="button"
                        aria-label="Configure organization branding"
                        onClick={() => router.push(`/clients/${organizationId}?edit=branding`)}
                      >
                        <IconSettings />
                        <span>Edit</span>
                      </BrandConfigButton>
                    ) : null}
                  </InlinePills>
                </div>
              </ClientHeaderIdentity>
              <ClientHomeWelcome>
                Welcome back, {user.name} <span aria-hidden="true">👋</span>
              </ClientHomeWelcome>
            </div>
            <HeaderActions>
              <HeaderProfileAvatarLink user={user} />
            </HeaderActions>
          </Header>

          <ClientHomeHero>
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
                {organizationProjects.length > PROJECT_LIST_CAP ? (
                  <SectionLink href={scopedHref("/projects")}>View all projects</SectionLink>
                ) : null}
              </SectionHeader>
              <ClientHomeContentArea $minHeight={252} $desktopMinHeight={256}>
                {clientPriorityProjects.length ? (
                  <ClientHomeList>
                    {clientPriorityProjects.map((project) => {
                      const tone = getClientProjectTone(project.status, project.stage);
                      const needsClientReview = isPendingReviewProject(project.status, project.stage);
                      return (
                        <ClientProjectCard key={project.id} href={scopedHref(`/projects/${project.id}`)}>
                          <ClientProjectGlyph
                            organization={
                              project.clientOrganizationId
                                ? state.clientOrganizations.find(
                                    (clientOrganization) => clientOrganization.id === project.clientOrganizationId,
                                  ) ?? rawOrganization
                                : rawOrganization
                            }
                          />
                          <ClientProjectBody>
                            <ClientHomeProjectHeader>
                              <ClientProjectTitle>{project.projectRequestName || project.name}</ClientProjectTitle>
                              <ClientHomeProjectDue>{formatShortDate(project.finalDeliverableDate ?? project.dueDate)}</ClientHomeProjectDue>
                            </ClientHomeProjectHeader>
                            <ClientProjectTop>
                              <ClientProjectMetaGroup>
                                <ClientProjectMetaLabel>Due date</ClientProjectMetaLabel>
                                <ClientProjectMetaValue>{formatDate(project.finalDeliverableDate ?? project.dueDate)}</ClientProjectMetaValue>
                              </ClientProjectMetaGroup>
                              <ClientProjectMetaGroup>
                                <ClientProjectMetaLabel>Stage</ClientProjectMetaLabel>
                                <ClientProjectMetaValue>{formatProjectStage(project.stage)}</ClientProjectMetaValue>
                              </ClientProjectMetaGroup>
                              <ClientProjectMetaGroup>
                                <ClientProjectMetaLabel>Progress</ClientProjectMetaLabel>
                                <ProjectStageProgress stage={project.stage} size="sm" showStageLabel={false} />
                              </ClientProjectMetaGroup>
                            </ClientProjectTop>
                            <ClientProjectStatusRow>
                              {needsClientReview ? <ClientAttentionPill>Needs Review</ClientAttentionPill> : null}
                              <ClientProjectStatusPill style={{ background: tone.bg, color: tone.fg }}>
                                {getClientProjectStatusLabel(project.status, project.stage)}
                              </ClientProjectStatusPill>
                            </ClientProjectStatusRow>
                          </ClientProjectBody>
                        </ClientProjectCard>
                      );
                    })}
                  </ClientHomeList>
                ) : (
                  <ClientEmptyState $mobileMinHeight={188}>
                    <ClientEmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No active projects for this organization yet.</strong>
                    <p>Projects shared with this organization will appear here.</p>
                  </ClientEmptyState>
                )}
              </ClientHomeContentArea>
            </ClientHomePanel>

            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Project Progress Overview</PanelTitle>
                <PanelTag>This Org</PanelTag>
              </SectionHeader>
              <ClientProgressWrap>
                <ClientProgressDonut style={{ background: progressDonut }}>
                  <ClientProgressCenter>
                    <strong>{organizationProjects.length}</strong>
                    <span>Projects</span>
                  </ClientProgressCenter>
                </ClientProgressDonut>
                <ClientLegendList>
                  <ClientLegendItem>
                    <ClientLegendDot $color="#5ca16d" />
                    <span>Completed</span>
                    <strong>{completedProjectsPct}%</strong>
                  </ClientLegendItem>
                  <ClientLegendItem>
                    <ClientLegendDot $color="#1f4339" />
                    <span>In Progress</span>
                    <strong>{inProgressProjectsPct}%</strong>
                  </ClientLegendItem>
                  <ClientLegendItem>
                    <ClientLegendDot $color="#d69b47" />
                    <span>In Review</span>
                    <strong>{reviewProjectsPct}%</strong>
                  </ClientLegendItem>
                  <ClientLegendItem>
                    <ClientLegendDot $color="#d3ccc1" />
                    <span>On Hold</span>
                    <strong>{holdProjectsPct}%</strong>
                  </ClientLegendItem>
                </ClientLegendList>
              </ClientProgressWrap>
            </ClientHomePanel>

            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Pending Your Review</PanelTitle>
                {organization.openTasks.length > 3 ? (
                  <SectionActionButton type="button" onClick={() => setShowAllReviewsModal(true)}>
                    View all reviews
                  </SectionActionButton>
                ) : null}
              </SectionHeader>
              <ClientHomeContentArea $minHeight={206} $desktopMinHeight={206}>
                {pendingReviewItems.length ? (
                  <ClientHomeList>
                    {pendingReviewItems.map((task) => (
                      <ClientReviewCard key={task.id} href={scopedHref(`/projects/${task.projectId}`)}>
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
                  <ClientEmptyState $mobileMinHeight={236}>
                    <ClientEmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No pending reviews right now.</strong>
                    <p>Tasks waiting for your feedback will appear here.</p>
                  </ClientEmptyState>
                )}
              </ClientHomeContentArea>
            </ClientHomePanel>

            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Upcoming Deliveries</PanelTitle>
                {activeProjects.length > 3 ? (
                  <SectionLink href={scopedHref("/projects")}>View all projects</SectionLink>
                ) : null}
              </SectionHeader>
              <ClientHomeContentArea $minHeight={188} $desktopMinHeight={188}>
                {upcomingDeliveries.length ? (
                  <ClientHomeList>
                    {upcomingDeliveries.map((project) => {
                      const tone = getClientProjectTone(project.status, project.stage);
                      return (
                        <CompactDeliveryCard key={project.id} href={scopedHref(`/projects/${project.id}`)}>
                          <CompactDeliveryIcon>
                            <IconCalendarMini />
                          </CompactDeliveryIcon>
                          <CompactDeliveryBody>
                            <ClientProjectTitle>{project.projectRequestName || project.name}</ClientProjectTitle>
                            <CompactDeliveryMeta>{formatProjectStage(project.stage)}</CompactDeliveryMeta>
                            <CompactDeliveryMeta>Due {formatDate(project.finalDeliverableDate ?? project.dueDate)}</CompactDeliveryMeta>
                          </CompactDeliveryBody>
                          <CompactDeliveryStatusPill style={{ background: tone.bg, color: tone.fg }}>
                            {getClientProjectStatusLabel(project.status, project.stage)}
                          </CompactDeliveryStatusPill>
                          <CompactDeliveryArrow>
                            <IconChevronRight />
                          </CompactDeliveryArrow>
                        </CompactDeliveryCard>
                      );
                    })}
                  </ClientHomeList>
                ) : (
                  <ClientEmptyState>
                    <ClientEmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No upcoming deliveries scheduled yet.</strong>
                    <p>Upcoming due dates will appear here once projects are in motion.</p>
                  </ClientEmptyState>
                )}
              </ClientHomeContentArea>
            </ClientHomePanel>

            <ClientHomePanel>
              <SectionHeader>
                <PanelTitle>Recent Activity</PanelTitle>
                {organizationActivities.length > 4 ? (
                  <SectionActionButton type="button" onClick={() => setShowAllActivityModal(true)}>
                    View all activity
                  </SectionActionButton>
                ) : null}
              </SectionHeader>
              <ClientHomeContentArea $minHeight={236} $desktopMinHeight={236}>
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
                  <ClientEmptyState>
                    <ClientEmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No recent activity yet.</strong>
                    <p>Project updates, uploads, and feedback history will appear here.</p>
                  </ClientEmptyState>
                )}
              </ClientHomeContentArea>
            </ClientHomePanel>
          </ClientHomeGrid>
        </Content>
      </Shell>
    );
  }

  const handleSaveOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rawOrganization || isUploadingLogo) {
      return;
    }

    setShowOrganizationErrorPopup(false);
    setOrganizationSubmitAttempted(true);

    if (!name.trim()) {
      setOrganizationError("Organization name is required.");
      setShowOrganizationErrorPopup(true);
      return;
    }

    setIsSavingOrganization(true);
    try {
      await updateClientOrganization(rawOrganization.id, {
        name: name.trim(),
        type,
        status,
        logoUrl,
        brandColor: normalizeHexColor(brandColor) ?? "#1F4339",
        phone: type === "external" ? phone : "",
        address: type === "external" ? address : "",
      });
      setShowEditModal(false);
      setOrganizationError("");
      setOrganizationSubmitAttempted(false);
    } catch (nextError) {
      setOrganizationError(nextError instanceof Error ? nextError.message : "Unable to save organization.");
      setShowOrganizationErrorPopup(true);
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

  const handleLogoInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    const localPreviewUrl = URL.createObjectURL(file);
    setLogoPreviewUrl(localPreviewUrl);

    setIsUploadingLogo(true);
    try {
      const optimizedBlob = await optimizeImageToWebp(file, { maxDimension: 1200, quality: 0.84 });
      const optimizedFile = new File(
        [optimizedBlob],
        `${file.name.replace(/\.[^.]+$/, "") || "organization-logo"}.webp`,
        { type: "image/webp" },
      );

      const uploadedUrl = await uploadOrganizationLogo(optimizedFile);
      setLogoUrl(uploadedUrl);
      setLogoPreviewUrl(uploadedUrl);
    } finally {
      setIsUploadingLogo(false);
      event.target.value = "";
    }
  };

  return (
    <Shell style={user.role === "client" ? brandStyle : undefined}>
      <BrandHiddenInput
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleLogoInputChange}
      />
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
        open={showDeleteOrganizationModal}
        title="Delete organization"
        description={`This will delete ${organization.name} and remove its liaison memberships, pending invites, and organization link from related projects.`}
        confirmLabel="Delete organization"
        tone="danger"
        busy={isDeletingOrganization}
        onCancel={() => {
          if (!isDeletingOrganization) {
            setShowDeleteOrganizationModal(false);
          }
        }}
        onConfirm={async () => {
          if (!organization.organizationId) {
            return;
          }

          setIsDeletingOrganization(true);
          try {
            await deleteClientOrganization(organization.organizationId);
            setShowDeleteOrganizationModal(false);
            router.push("/clients");
          } finally {
            setIsDeletingOrganization(false);
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
            {showOrganizationErrorPopup && organizationError ? (
              <div className="auth-popup-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="organization-form-error-title">
                <div className="auth-popup-card">
                  <h2 id="organization-form-error-title">Organization form error</h2>
                  <p>{organizationError}</p>
                  <button className="primary-button mobile-full-button" type="button" onClick={() => setShowOrganizationErrorPopup(false)}>
                    Close
                  </button>
                </div>
              </div>
            ) : null}
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
            <ModalForm onSubmit={handleSaveOrganization} noValidate>
              <FieldStack>
                <FieldLabel>Organization name</FieldLabel>
                <TextInput
                  $invalid={organizationSubmitAttempted && !name.trim()}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isSavingOrganization}
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
              <BrandSection style={editBrandStyle}>
                <BrandSectionHeader>
                  <FieldLabel>Organization branding</FieldLabel>
                  <ClientMeta>Upload a logo and choose the client brand color.</ClientMeta>
                </BrandSectionHeader>
                <BrandPreviewRow>
                  {logoPreviewUrl || logoUrl ? (
                    <BrandLogoPreview src={logoPreviewUrl || logoUrl} alt={name || organization.name} />
                  ) : (
                    <BrandMarkPreview>{getClientOrganizationMark(name || organization.name)}</BrandMarkPreview>
                  )}
                  <BrandPreviewMeta>
                    <BrandPreviewChip>Primary tone preview</BrandPreviewChip>
                    <ClientMeta>The softer background tone is derived automatically from the selected primary color.</ClientMeta>
                  </BrandPreviewMeta>
                </BrandPreviewRow>
                <BrandActionRow>
                  <SecondaryButton
                    type="button"
                    disabled={isSavingOrganization || isUploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {isUploadingLogo ? "Uploading..." : "Upload logo"}
                  </SecondaryButton>
                  {logoUrl || logoPreviewUrl ? (
                    <SecondaryButton
                      type="button"
                      disabled={isSavingOrganization || isUploadingLogo}
                      onClick={() => {
                        setLogoUrl("");
                        setLogoPreviewUrl("");
                      }}
                    >
                      Remove logo
                    </SecondaryButton>
                  ) : null}
                </BrandActionRow>
                <BrandColorPicker
                  value={brandColor}
                  onChange={setBrandColor}
                  disabled={isSavingOrganization}
                />
              </BrandSection>
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
              {organizationError ? <InlineError>{organizationError}</InlineError> : null}
              <PrimaryButton type="submit" disabled={isSavingOrganization || isUploadingLogo}>
                {isUploadingLogo ? "Uploading logo..." : isSavingOrganization ? "Saving..." : "Save Organization"}
              </PrimaryButton>
            </ModalForm>
          </ModalCard>
        </Overlay>
      ) : null}
      <ClientSidebarSlot>
        <AppSidebar user={user} activeLabel={activeLabel} pinToViewport />
      </ClientSidebarSlot>
      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            {!homeMode && viewerRole !== "client" ? <BackLink href="/clients">← Back to clients</BackLink> : null}
            <TitleRow>
              <HeaderClientLogo organization={{ logoUrl: headerLogoUrl, name: organization.name }} />
              <HeaderTitleStatusRow>
                <Title>{organization.name}</Title>
                {organizationStatusMeta ? (
                  <HeaderStatusIndicator>
                    <HeaderStatusIcon $bg={organizationStatusMeta.bg} $fg={organizationStatusMeta.fg}>
                      {organizationStatusMeta.icon}
                    </HeaderStatusIcon>
                  </HeaderStatusIndicator>
                ) : null}
              </HeaderTitleStatusRow>
              <HeaderInlinePills>
                <TypePill $type={organization.type}>
                  {organization.type === "internal" ? "Internal" : "External"}
                </TypePill>
              </HeaderInlinePills>
            </TitleRow>
            <MobileHeaderIdentity>
              <HeaderClientLogo organization={{ logoUrl: headerLogoUrl, name: organization.name }} />
              <div>
                {homeMode && canSwitchClientHomeOrganization ? (
                  <ClientHeaderSwitchButton
                    type="button"
                    onClick={() => setShowOrganizationSwitcher(true)}
                    aria-label="Switch organization"
                  >
                    <HeaderTitleStatusRow>
                      <MobileHeaderTitle>{organization.name}</MobileHeaderTitle>
                      {organizationStatusMeta ? (
                        <HeaderStatusIndicator>
                          <HeaderStatusIcon $bg={organizationStatusMeta.bg} $fg={organizationStatusMeta.fg}>
                            {organizationStatusMeta.icon}
                          </HeaderStatusIcon>
                        </HeaderStatusIndicator>
                      ) : null}
                    </HeaderTitleStatusRow>
                    <HeaderSwitchIcon aria-hidden="true">
                      <IconChevronDown />
                    </HeaderSwitchIcon>
                  </ClientHeaderSwitchButton>
                ) : (
                  <HeaderTitleStatusRow>
                    <MobileHeaderTitle>{organization.name}</MobileHeaderTitle>
                    {organizationStatusMeta ? (
                      <HeaderStatusIndicator>
                        <HeaderStatusIcon $bg={organizationStatusMeta.bg} $fg={organizationStatusMeta.fg}>
                          {organizationStatusMeta.icon}
                        </HeaderStatusIcon>
                      </HeaderStatusIndicator>
                    ) : null}
                  </HeaderTitleStatusRow>
                )}
                <HeaderInlinePills>
                  <TypePill $type={organization.type}>
                    {organization.type === "internal" ? "Internal" : "External"}
                  </TypePill>
                </HeaderInlinePills>
              </div>
            </MobileHeaderIdentity>
            <Subtitle>
              {homeMode
                ? "Home for your organization, current projects, and client-facing activity."
                : "Manage liaisons, projects, and client-facing activity for this organization."}
            </Subtitle>
          </div>
          <HeaderActions>
            {!organization.isUnassigned ? (
              <>
                {canCreateOrganizationProject && organization.organizationId ? (
                  <PrimaryActionLink href={scopedHref(`/projects/new?clientOrganizationId=${organization.organizationId}`)}>
                    <ButtonIcon aria-hidden="true">
                      <IconPlusMini />
                    </ButtonIcon>
                    Project
                  </PrimaryActionLink>
                ) : null}         
                {canInviteOrganizationClients ? (
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
                {canDelete && organization.organizationId ? (
                  <SecondaryDangerButton type="button" onClick={() => setShowDeleteOrganizationModal(true)}>
                    <ButtonIcon aria-hidden="true">
                      <IconTrash />
                    </ButtonIcon>
                    Delete
                  </SecondaryDangerButton>
                ) : null}
              </>
            ) : null}
            <HeaderProfileAvatarLink user={user} />
          </HeaderActions>
        </Header>

        <ClientHomeHero>
          <ClientHomeStats>
            <ClientMetricCard>
              <MetricIcon $tone="neutral">
                <IconUsersMini />
              </MetricIcon>
              <div>
                <MetricLabel>Liaisons</MetricLabel>
                <MetricValue>{organization.memberCount}</MetricValue>
              </div>
            </ClientMetricCard>
            <ClientMetricCard>
              <MetricIcon $tone="success">
                <IconBriefcase />
              </MetricIcon>
              <div>
                <MetricLabel>Projects</MetricLabel>
                <MetricValue>{organization.projectCount}</MetricValue>
              </div>
            </ClientMetricCard>
            <ClientMetricCard>
              <MetricIcon $tone="warning">
                <IconCalendarMini />
              </MetricIcon>
              <div>
                <MetricLabel>Last Activity</MetricLabel>
                <MetricValue>{formatDate(organization.lastActivityDate)}</MetricValue>
              </div>
            </ClientMetricCard>
            {organization.type === "external" ? (
              <ClientMetricCard>
                <MetricIcon $tone="neutral">
                  <IconPhoneMini />
                </MetricIcon>
                <div>
                  <MetricLabel>Contact Number</MetricLabel>
                  <MetricValue>{rawOrganization?.phone?.trim() || "Not provided"}</MetricValue>
                </div>
              </ClientMetricCard>
            ) : null}
            {organization.type === "external" ? (
              <ClientMetricCard>
                <MetricIcon $tone="neutral">
                  <IconLocationMini />
                </MetricIcon>
                <div>
                  <MetricLabel>Address</MetricLabel>
                  <MetricValue>{rawOrganization?.address?.trim() || "Not provided"}</MetricValue>
                </div>
              </ClientMetricCard>
            ) : null}
          </ClientHomeStats>
        </ClientHomeHero>

        <Grid>
          <SectionCard>
            <SectionHeader>
              <PanelTitle>Liaisons</PanelTitle>
              <SectionActions>
                {canManage ? <SectionLink href="/clients/liaisons">View all liaisons</SectionLink> : null}
                {pendingInvitations.length ? (
                  <SectionToggleButton
                    type="button"
                    onClick={() => setShowPendingLiaisonsOnly((current) => !current)}
                  >
                    {showPendingLiaisonsOnly ? "Show All" : "Show Pending"}
                  </SectionToggleButton>
                ) : null}
              </SectionActions>
            </SectionHeader>
            {visibleLiaisonRows.length ? (
              <List>
                {visibleLiaisonRows.map((row) => {
                  if (row.kind === "pending") {
                    const invitation = row.invitation;

                    return (
                      <Row key={invitation.id}>
                        <RowLead>
                          <RowIconTile>
                            <IconSparkMini />
                          </RowIconTile>
                          <RowCopy>
                            <RowTitleLine>
                              <RowTitle>{invitation.name}</RowTitle>
                              <MetaPill>Pending</MetaPill>
                            </RowTitleLine>
                            <ClientMeta>{invitation.email}</ClientMeta>
                            <RowMetaPills>
                              <MetaPill>Sent {formatShortDate(invitation.createdAt)}</MetaPill>
                            </RowMetaPills>
                          </RowCopy>
                        </RowLead>
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
                    );
                  }

                  const member = row.member;
                  const canOpenLiaison =
                    Boolean(member.deletableUserId) && (canManage || member.deletableUserId === user.id);
                  const liaisonProfile = userById.get(member.deletableUserId ?? member.id);
                  const liaisonMeta = [liaisonProfile?.jobTitle, liaisonProfile?.department].filter(Boolean);
                  const liaisonContact = [member.email, liaisonProfile?.phone].filter(Boolean).join(" · ") || "No contact details";

                  if (!canOpenLiaison) {
                    return (
                      <Row key={member.id}>
                        <RowLead>
                          <RowGlyph>{member.name.slice(0, 1).toUpperCase()}</RowGlyph>
                          <RowCopy>
                            <RowTitleLine>
                              <RowTitle>{member.name}</RowTitle>
                              {liaisonMeta.map((item) => (
                                <MetaPill key={`${member.id}:${item}`}>{item}</MetaPill>
                              ))}
                            </RowTitleLine>
                            <ClientMeta>{liaisonContact}</ClientMeta>
                          </RowCopy>
                        </RowLead>
                      </Row>
                    );
                  }

                  return (
                    <LiaisonRowButton key={member.id} type="button" onClick={() => handleOpenEditLiaison(member)}>
                      <RowLead>
                        <RowGlyph>{member.name.slice(0, 1).toUpperCase()}</RowGlyph>
                        <RowCopy>
                          <RowTitleLine>
                            <RowTitle>{member.name}</RowTitle>
                            {liaisonMeta.map((item) => (
                              <MetaPill key={`${member.id}:${item}`}>{item}</MetaPill>
                            ))}
                          </RowTitleLine>
                          <ClientMeta>{liaisonContact}</ClientMeta>
                        </RowCopy>
                      </RowLead>
                    </LiaisonRowButton>
                  );
                })}
              </List>
            ) : (
              <ClientMeta>
                {showPendingLiaisonsOnly
                  ? "No pending liaison invites for this organization."
                  : "No liaisons linked to this organization yet."}
              </ClientMeta>
            )}
            {(showPendingLiaisonsOnly ? pendingInvitations.length : organization.members.length + pendingInvitations.length) >
            LIAISON_LIST_CAP ? (
              <SectionCountNote>
                Showing {LIAISON_LIST_CAP} of{" "}
                {showPendingLiaisonsOnly ? pendingInvitations.length : organization.members.length + pendingInvitations.length}{" "}
                {showPendingLiaisonsOnly ? "pending liaisons" : "liaisons"}
              </SectionCountNote>
            ) : null}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>Projects</PanelTitle>
            </SectionHeader>
            {visibleOrganizationProjects.length ? (
              <ClientHomeList>
                {visibleOrganizationProjects.map((project) => {
                  const tone = getClientProjectTone(project.status, project.stage);
                  const needsClientReview = isPendingReviewProject(project.status, project.stage);

                  return (
                    <CompactDeliveryCard key={project.id} href={scopedHref(`/projects/${project.id}`)}>
                      <CompactDeliveryIcon>
                        <IconBriefcase />
                      </CompactDeliveryIcon>
                      <CompactDeliveryBody>
                        <ClientProjectTitle>{project.projectRequestName || project.name}</ClientProjectTitle>
                        {needsClientReview ? <CompactAttentionPill>Needs Review</CompactAttentionPill> : null}
                        <CompactDeliveryMeta>Due {formatDate(project.finalDeliverableDate ?? project.dueDate)}</CompactDeliveryMeta>
                        <CompactDeliveryMeta>{project.projectCode ?? "Project"}</CompactDeliveryMeta>
                      </CompactDeliveryBody>
                      <CompactDeliveryStatusPill style={{ background: tone.bg, color: tone.fg }}>
                        {getClientProjectStatusLabel(project.status, project.stage)}
                      </CompactDeliveryStatusPill>
                      <CompactDeliveryArrow>
                        <IconChevronRight />
                      </CompactDeliveryArrow>
                    </CompactDeliveryCard>
                  );
                })}
              </ClientHomeList>
            ) : (
              <ClientMeta>No projects linked to this organization yet.</ClientMeta>
            )}
            {organizationProjects.length > PROJECT_LIST_CAP ? (
              <SectionCountNote>Showing {PROJECT_LIST_CAP} of {organizationProjects.length} projects</SectionCountNote>
            ) : null}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>Pending Items</PanelTitle>
            </SectionHeader>
            {visiblePendingProjects.length ? (
              <ClientHomeList>
                {visiblePendingProjects.map((project) => {
                  const tone = getClientProjectTone(project.status);

                  return (
                    <CompactDeliveryCard key={project.id} href={scopedHref(`/projects/${project.id}`)}>
                      <CompactDeliveryIcon>
                        <IconFolderMini />
                      </CompactDeliveryIcon>
                      <CompactDeliveryBody>
                        <ClientProjectTitle>{project.name}</ClientProjectTitle>
                        <CompactDeliveryMeta>Due {formatDate(project.dueDate)}</CompactDeliveryMeta>
                      </CompactDeliveryBody>
                      <CompactDeliveryStatusPill style={{ background: tone.bg, color: tone.fg }}>
                        {getClientProjectStatusLabel(project.status)}
                      </CompactDeliveryStatusPill>
                      <CompactDeliveryArrow>
                        <IconChevronRight />
                      </CompactDeliveryArrow>
                    </CompactDeliveryCard>
                  );
                })}
              </ClientHomeList>
            ) : (
              <ClientMeta>No pending items for this organization.</ClientMeta>
            )}
            {organization.pendingProjects.length > PENDING_ITEMS_CAP ? (
              <SectionCountNote>Showing {PENDING_ITEMS_CAP} of {organization.pendingProjects.length} pending items</SectionCountNote>
            ) : null}
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <PanelTitle>{viewerRole === "client" ? "Your Tasks" : "Client Tasks"}</PanelTitle>
            </SectionHeader>
            {organization.openTasks.length ? (
              <>
                <List>
                  {paginatedTasks.map((task) => {
                    const taskTone = getTaskTone(task.status);
                    return (
                    <Row key={task.id}>
                      <RowLead>
                        <RowIconTile>
                          <IconCheckBadge />
                        </RowIconTile>
                        <RowCopy>
                        <RowTitle>{task.title}</RowTitle>
                        <ClientMeta>{task.projectName}</ClientMeta>
                        <RowMetaPills>
                          <MetaPill>{task.assigneeName}</MetaPill>
                          <MetaPill style={{ background: taskTone.bg, color: taskTone.fg }}>{formatTaskStatus(task.status)}</MetaPill>
                          <MetaPill>{formatPriority(task.priority)}</MetaPill>
                          <MetaPill>Due {formatShortDate(task.dueDate)}</MetaPill>
                        </RowMetaPills>
                      </RowCopy>
                      </RowLead>
                      <RowLink href={scopedHref(`/projects/${task.projectId}`)}>Open project</RowLink>
                    </Row>
                  )})}
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
    background: var(--client-screen-soft, rgba(255, 255, 255, 0.58));
  }
`;

const ClientSidebarSlot = styled.div`
  display: none;

  ${desktop} {
    display: block;
    width: 260px;
    flex: 0 0 260px;
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
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.68), transparent 18%),
      var(--client-screen-soft-panel, linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84)));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 767px) {
    display: flex;
    align-items: flex-start;
    gap: 10px;

    > :first-child {
      flex: 1;
      min-width: 0;
    }
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 767px) {
    width: auto;
    flex: 0 0 auto;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
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

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;

  @media (max-width: 767px) {
    display: none;
  }
`;

const HeaderInlinePills = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
`;

const HeaderClientLogo = styled(ClientTitleLogo)`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  display: grid;
  place-items: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.9rem;
  font-weight: 700;
  flex: 0 0 42px;
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
  color: var(--client-brand-primary, #1f1f1f);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.4;
`;

const ClientHeaderIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 6px;
`;

const MobileHeaderIdentity = styled.div`
  display: none;

  @media (max-width: 767px) {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }
`;

const MobileHeaderTitle = styled.h1`
  margin: 0 0 4px;
  font-size: 1.1rem;
  line-height: 1.1;
  letter-spacing: -0.03em;

  ${desktop} {
    display: none;
  }
`;

const ClientHeaderTitle = styled.h1`
  margin: 0;
  font-size: clamp(1.28rem, 2.5vw, 1.72rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const HeaderTitleStatusRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
`;

const ClientHeaderTitleRow = styled(HeaderTitleStatusRow)`
  min-width: 0;
`;

const ClientHeaderSwitchButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
`;

const HeaderSwitchIcon = styled.span`
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--client-brand-primary, #1f4339);

  svg {
    width: 100%;
    height: 100%;
  }
`;

const ClientLogo = styled(ClientTitleLogo)`
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  box-shadow: 0 10px 22px rgba(31, 31, 31, 0.08);
  display: grid;
  place-items: center;
  color: #8c7040;
  font-size: 1rem;
  font-weight: 700;
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

const TypePill = styled(Pill)<{ $type: "internal" | "external" }>`
  background: ${({ $type }) => ($type === "internal" ? "#e6efff" : "#f4f1ed")};
  color: ${({ $type }) => ($type === "internal" ? "#4770d8" : "#7f7468")};
`;

const HeaderStatusIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  min-width: 0;
`;

const HeaderStatusIcon = styled.span<{ $bg: string; $fg: string }>`
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
`;


const ClientHomeHero = styled.section`
  ${cardSurface}
  display: grid;
  gap: 10px;
  background: none;
  border: none;

  ${desktop} {
    gap: 14px;
    padding: 15px;
    border-radius: 20px;
    background: var(--client-screen-soft-panel, rgba(255, 255, 255, 0.95));
  }
`;

const ClientHomeStats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  background: none;
  ${desktop} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
  }
`;

const ClientMetricCard = styled.div`
  ${cardSurface}
  display: grid;
  gap: 4px;
  min-height: 74px;
  padding: 10px 8px 8px;
  border-radius: 16px;

  ${desktop} {
    border: 0;
    box-shadow: none;
    background: transparent;
    min-height: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    padding: 0 14px;
    border-left: 1px solid rgba(230, 224, 215, 0.95);

    &:first-child {
      border-left: 0;
      padding-left: 0;
    }
  }
`;

const MetricIcon = styled.div<{ $tone: "success" | "warning" | "neutral" }>`
  width: 24px;
  height: 24px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: ${({ $tone }) =>
    $tone === "success" ? "#e5f4e8" : $tone === "warning" ? "#fbefcf" : "#f4f1ed"};
  color: ${({ $tone }) =>
    $tone === "success" ? "#5ca16d" : $tone === "warning" ? "#c58911" : "#7f7468"};
  justify-self: end;

  svg {
    width: 12px;
    height: 12px;
  }

  ${desktop} {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    justify-self: auto;

    svg {
      width: 15px;
      height: 15px;
    }
  }
`;

const MetricLabel = styled.span`
  display: block;
  color: #5f564b;
  font-size: 0.6rem;
  line-height: 1.15;

  ${desktop} {
    font-size: 0.74rem;
    line-height: 1.25;
  }
`;

const MetricValue = styled.strong`
  display: block;
  margin-top: 2px;
  color: #1f1f1f;
  font-size: 1.02rem;
  line-height: 1;
  letter-spacing: -0.04em;

  ${desktop} {
    font-size: 1.08rem;
  }
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
  gap: 12px;
  padding: 16px;
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
  gap: 8px;
`;

const RowLead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
`;

const RowCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const RowGlyph = styled.div`
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 800;
`;

const RowIconTile = styled.div`
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(244, 241, 237, 0.96);
  color: var(--client-brand-primary, #1f4339);

  svg {
    width: 15px;
    height: 15px;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
`;

const RowTitle = styled.strong`
  display: block;
  margin-bottom: 2px;
  font-size: 0.86rem;
  line-height: 1.25;
`;

const RowTitleLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
`;

const LiaisonRowButton = styled.button`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
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
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
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
  font-size: 0.78rem;
  line-height: 1.3;
`;

const RowMetaPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const MetaPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.96);
  color: #7f7468;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
  max-width: 100%;
`;

const SectionCountNote = styled.p`
  margin: -2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
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
  background: var(--client-brand-primary, #1f4339);
  color: var(--client-brand-on-primary, #fff);
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
  background: var(--client-brand-primary, #1f4339);
  color: var(--client-brand-on-primary, #fff);
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
  color: var(--client-brand-primary, #1f4339);
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
  background: ${({ $active }) => ($active ? "var(--client-brand-primary, #1f4339)" : "#fff")};
  color: ${({ $active }) => ($active ? "var(--client-brand-on-primary, #fff)" : "var(--color-text)")};
  font-size: 0.9rem;
  font-weight: 700;
`;

const ClientHomeGrid = styled.section`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    align-items: start;
    gap: 14px;
  }
`;

const ClientHomePanel = styled.section`
  ${cardSurface}
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;

  ${desktop} {
    gap: 12px;
    padding: 15px;
  }
`;

const ClientHomeContentArea = styled.div<{ $minHeight: number; $desktopMinHeight?: number }>`
  display: flex;
  flex-direction: column;

  ${desktop} {
    min-height: ${({ $desktopMinHeight, $minHeight }) => `${$desktopMinHeight ?? $minHeight}px`};
  }
`;

const ClientHomeList = styled.div`
  display: grid;
  gap: 6px;
`;

const ClientEmptyState = styled.div<{ $mobileMinHeight?: number }>`
  flex: 1;
  min-height: ${({ $mobileMinHeight }) => ($mobileMinHeight ? `${$mobileMinHeight}px` : "inherit")};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  color: var(--color-text-muted);

  strong {
    color: #1f1f1f;
    font-size: 0.86rem;
    line-height: 1.3;
  }

  p {
    margin: 0;
    max-width: 30ch;
    font-size: 0.76rem;
    line-height: 1.45;
  }
`;

const ClientEmptyImage = styled.img`
  width: 70px;
  height: 70px;
  object-fit: contain;
  opacity: 0.92;

  ${desktop} {
    width: 82px;
    height: 82px;
  }
`;

const SectionLink = styled(Link)`
  color: var(--client-brand-primary, #1f4339);
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
`;

const SectionActionButton = styled.button`
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--client-brand-primary, #1f4339);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
`;

const PanelTag = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.92);
  color: #7f7468;
  font-size: 0.72rem;
  font-weight: 700;
`;

const SectionToggleButton = styled.button`
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--client-brand-primary, #1f4339);
  font-size: 0.74rem;
  font-weight: 700;
`;

const BrandConfigButton = styled.button`
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--client-brand-primary, #1f4339);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  span {
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const BrandHiddenInput = styled.input`
  display: none;
`;

const BrandSection = styled.div`
  ${cardSurface}
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: var(--client-screen-soft-panel, rgba(255, 255, 255, 0.95));
`;

const BrandSectionHeader = styled.div`
  display: grid;
  gap: 4px;
`;

const BrandPreviewRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
`;

const BrandLogoPreview = styled.img`
  width: 58px;
  height: 58px;
  border-radius: 16px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.94);
`;

const BrandMarkPreview = styled.div`
  width: 58px;
  height: 58px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: var(--client-brand-primary, #1f4339);
  color: var(--client-brand-on-primary, #fff);
  font-size: 1rem;
  font-weight: 800;
`;

const BrandPreviewMeta = styled.div`
  display: grid;
  gap: 6px;
`;

const BrandPreviewChip = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--client-brand-primary, #1f4339);
  color: var(--client-brand-on-primary, #fff);
  font-size: 0.7rem;
  font-weight: 700;
`;

const BrandActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ClientProjectCard = styled(Link)`
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  border-top: 1px solid rgba(230, 224, 215, 0.72);
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease,
    background 160ms ease;

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }

  &:hover {
    transform: translateY(-2px);
    background: rgba(255, 248, 239, 0.82);
    box-shadow: 0 14px 24px rgba(31, 67, 57, 0.06);
  }

  ${desktop} {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
  }
`;

const ClientProjectGlyph = styled(ClientTitleLogo)`
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.95rem;
  font-weight: 600;
  object-fit: cover;

  ${desktop} {
    width: 42px;
    height: 42px;
    font-size: 1.05rem;
  }
`;

const ClientProjectBody = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;

  ${desktop} {
    gap: 8px;
  }
`;

const ClientProjectTitle = styled.strong`
  color: #1f1f1f;
  font-size: 0.78rem;
  line-height: 1.25;
  min-width: 0;

  ${desktop} {
    font-size: 0.88rem;
    white-space: nowrap;
  }
`;

const ClientHomeProjectHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;

  ${desktop} {
    display: none;
  }
`;

const ClientHomeProjectDue = styled.span`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
`;

const ClientHomeProjectStage = styled.span`
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 600;

  ${desktop} {
    display: none;
  }
`;

const ClientProjectTop = styled.div`
  display: grid;
  gap: 4px;

  ${desktop} {
    gap: 16px;
  }

  @media (max-width: 767px) {
    > :first-child,
    > :nth-child(2) {
      display: none;
    }
  }

  ${desktop} {
    grid-template-columns: minmax(0, 1.3fr) repeat(3, minmax(92px, auto));
    align-items: start;
  }
`;

const ClientProjectMetaGroup = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;
`;

const ClientProjectMetaLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ClientProjectMetaValue = styled.strong`
  color: #1f1f1f;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
`;

const ClientProjectStatusRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
`;

const ClientProjectStatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
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
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  color: inherit;
`;

const CompactDeliveryCard = styled(ClientReviewCard)`
  gap: 8px;
  padding: 9px 10px;
  border-radius: 16px;
  align-items: center;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    background: rgba(255, 248, 239, 0.94);
    border-color: rgba(220, 208, 194, 0.95);
    box-shadow: 0 14px 24px rgba(31, 67, 57, 0.08);
  }
`;

const ClientReviewIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f7f4ef, #fbf9f5);
  color: #b18225;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const CompactDeliveryIcon = styled(ClientReviewIcon)`
  width: 34px;
  height: 34px;
  border-radius: 12px;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ClientReviewBody = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;
`;

const CompactDeliveryBody = styled(ClientReviewBody)`
  gap: 2px;

  ${ClientProjectTitle} {
    font-size: 0.82rem;
    line-height: 1.2;
  }
`;

const CompactDeliveryMeta = styled(ClientMeta)`
  font-size: 0.72rem;
  line-height: 1.2;
`;

const ClientReviewPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fbefcf;
  color: #c58911;
  font-size: 0.72rem;
  font-weight: 700;
`;

const ClientAttentionPill = styled(ClientReviewPill)`
  min-height: 22px;
  padding: 0 8px;
  background: #fff1da;
  color: #b97912;
  font-size: 0.68rem;
`;

const CompactAttentionPill = styled(ClientAttentionPill)`
  width: fit-content;
`;

const CompactDeliveryStatusPill = styled(ClientProjectStatusPill)`
  min-height: 22px;
  padding: 0 8px;
  font-size: 0.68rem;
`;

const CompactDeliveryArrow = styled(ClientProjectArrow)`
  width: 28px;
  height: 28px;
  flex: 0 0 28px;

  svg {
    width: 13px;
    height: 13px;
  }
`;

const ClientProgressWrap = styled.div`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }
`;

const ClientProgressDonut = styled.div`
  width: 150px;
  height: 150px;
  margin: 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;

  ${desktop} {
    margin: 0;
  }
`;

const ClientProgressCenter = styled.div`
  width: 134px;
  height: 134px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  strong {
    display: block;
    color: #1f1f1f;
    font-size: 2rem;
    line-height: 1;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }
`;

const ClientLegendList = styled.div`
  display: grid;
  gap: 8px;
`;

const ClientLegendItem = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  color: #4f463d;
  font-size: 0.82rem;

  strong {
    color: #1f1f1f;
    font-size: 0.82rem;
  }
`;

const ClientLegendDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${({ $color }) => $color};
`;

const ActivityList = styled.div`
  display: grid;
  gap: 10px;
`;

const ActivityRowCard = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
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
  @media (max-width: 767px) {
    align-items: flex-start;
  }
`;

const ModalCard = styled.div`
  ${cardSurface}
  width: min(520px, calc(100vw - 32px));
  border-radius: 24px;
  padding: 20px;

  @media (max-width: 767px) {
    height: 80vh;
    overflow-y: auto;
    }
`;

const ScrollableModalCard = styled(ModalCard)`
  width: min(720px, calc(100vw - 32px));
  max-height: 80vh;
  display: flex;
  flex-direction: column;

  @media (max-width: 767px) {
    height: 80vh;
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  color: #1f1f1f;
  font-size: 1.04rem;
  line-height: 1.2;
`;

const ModalDescription = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
`;

const ScrollableModalBody = styled.div`
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const OrganizationSwitchList = styled.div`
  display: grid;
  gap: 10px;
  max-height: min(58vh, 520px);
  overflow-y: auto;
  padding-right: 2px;
`;

const OrganizationSwitchButton = styled.button<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid
    ${({ $active }) => ($active ? "rgba(31, 67, 57, 0.24)" : "rgba(230, 224, 215, 0.95)")};
  border-radius: 16px;
  background: ${({ $active }) => ($active ? "rgba(250, 245, 237, 0.96)" : "rgba(255, 255, 255, 0.92)")};
  text-align: left;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(31, 67, 57, 0.18);
    box-shadow: 0 14px 24px rgba(31, 67, 57, 0.07);
  }
`;

const OrganizationSwitchLogo = styled(ClientTitleLogo)`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.92rem;
  font-weight: 700;
`;

const OrganizationSwitchCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;

  strong {
    font-size: 0.92rem;
    line-height: 1.2;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.76rem;
    line-height: 1.25;
  }
`;

const OrganizationSwitchState = styled.span`
  color: var(--client-brand-primary, #1f4339);
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
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

const TextInput = styled.input<{ $invalid?: boolean }>`
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid ${({ $invalid }) => ($invalid ? "#c04f42" : "rgba(230, 224, 215, 0.95)")};
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text);
  box-shadow: ${({ $invalid }) => ($invalid ? "0 0 0 1px rgba(192, 79, 66, 0.12)" : "none")};

  &:disabled {
    color: var(--color-text-muted);
    background: rgba(244, 241, 237, 0.92);
  }
`;

const InlineError = styled.p`
  margin: 0;
  color: #c04f42;
  font-size: 0.82rem;
  line-height: 1.45;
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

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.8 13.8 5l2.2-.3 1 2 2 .9-.3 2.2 1.2 1.8-1.2 1.8.3 2.2-2 .9-1 2-2.2-.3L12 20.2 10.2 19l-2.2.3-1-2-2-.9.3-2.2L4.1 12l1.2-1.8-.3-2.2 2-.9 1-2 2.2.3z" />
      <circle cx="12" cy="12" r="3.1" />
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

function IconPhoneMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.7 4.6h3l1.1 4.2-1.8 1.8a15 15 0 0 0 4.4 4.4l1.8-1.8 4.2 1.1v3a1.8 1.8 0 0 1-2 1.8A16.8 16.8 0 0 1 4.9 6.6a1.8 1.8 0 0 1 1.8-2Z" />
    </svg>
  );
}

function IconLocationMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-6-4.7-6-10a6 6 0 1 1 12 0c0 5.3-6 10-6 10Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function IconUsersMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 19v-1a3 3 0 0 0-2-2.8" />
      <path d="M15 5.2a3 3 0 0 1 0 5.6" />
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
