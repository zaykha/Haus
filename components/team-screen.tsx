"use client";

import Link from "next/link";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/components/app-state";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { FilterModal } from "@/components/filter-modal";
import { HeaderProfileAvatarLink } from "@/components/header-profile-avatar-link";
import { InviteWorkspaceModal } from "@/components/invite-workspace-modal";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { UserAvatar } from "@/components/user-avatar";
import { canDeleteTeamMember, canInviteUsers, canUpdateTeamRole } from "@/lib/permissions";
import { Role, TaskPriority, TaskStatus } from "@/lib/types";
import { formatRole, getTaskStatusLabel } from "@/lib/display";

const desktop = "@media (min-width: 768px)";
const PAGE_SIZE = 6;
const MEMBER_TASKS_PAGE_SIZE = 5;
const MOBILE_BATCH_SIZE = 20;

type RoleFilter = "all" | Role;
type InternalRole = Exclude<Role, "client">;
type TeamSortKey = "name" | "joined_desc" | "joined_asc";
type MemberTaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  projectId: string;
  projectName: string;
};
type MemberRow = {
  id: string;
  name: string;
  email: string;
  avatarPath?: string | null;
  phone?: string;
  role: Role;
  company?: string;
  joinedAt?: string | null;
  projectCount: number;
  openTasks: MemberTaskRow[];
};

function getRoleTone(role: Role) {
  switch (role) {
    case "creative_manager":
      return { bg: "#e9f4ea", fg: "#587f5f" };
    case "communication_manager":
      return { bg: "#eaf0ff", fg: "#5d76b9" };
    case "designer":
      return { bg: "#f8f1e5", fg: "#94754a" };
    default:
      return { bg: "#f3f0ff", fg: "#7760c5" };
  }
}

function invitationPill(status: string) {
  if (status === "accepted") {
    return { bg: "#e5f4e8", fg: "#4c8f5c", label: "Accepted" };
  }

  if (status === "revoked") {
    return { bg: "#f4f1ed", fg: "#8d857b", label: "Revoked" };
  }

  if (status === "expired") {
    return { bg: "#ffe7e5", fg: "#e06457", label: "Expired" };
  }

  return { bg: "#fff1da", fg: "#ca8a22", label: "Pending" };
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTaskStatus(status: TaskStatus) {
  return getTaskStatusLabel(status);
}

function formatPriority(priority: TaskPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function TeamScreen() {
  const { ready, state, user, revokeInvitation, regenerateInvitation, updateTeamMemberRole, deleteTeamMember } = useAppState();
  const [desktopView, setDesktopView] = useState<"cards" | "table">("table");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<TeamSortKey>("name");
  const [showSort, setShowSort] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRegeneratingInvite, setIsRegeneratingInvite] = useState(false);
  const [regeneratedInviteLink, setRegeneratedInviteLink] = useState("");
  const [regeneratedInviteEmail, setRegeneratedInviteEmail] = useState("");
  const [regeneratedInviteCopyState, setRegeneratedInviteCopyState] = useState<"idle" | "copied">("idle");
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [selectedTaskPage, setSelectedTaskPage] = useState(1);
  const [showUpdateRoleModal, setShowUpdateRoleModal] = useState(false);
  const [nextRole, setNextRole] = useState<InternalRole>("designer");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [showDeleteMemberModal, setShowDeleteMemberModal] = useState(false);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const roleFieldRef = useRef<HTMLDivElement | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [roleMenuDirection, setRoleMenuDirection] = useState<"up" | "down">("down");
  const [roleMenuMaxHeight, setRoleMenuMaxHeight] = useState(220);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_BATCH_SIZE);
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const appliedFilterCount = roleFilter !== "all" ? 1 : 0;
  const appliedSortCount = sort !== "name" ? 1 : 0;

  const viewerRole = user?.role ?? "client";
  const canManageInvites = canInviteUsers(viewerRole);
  const canManageRoles = canUpdateTeamRole(viewerRole);
  const canManageDelete = canDeleteTeamMember(viewerRole);
  const members = useMemo<MemberRow[]>(() => {
    const existingMembers = state.users.filter((member) => member.role !== "client");
    const knownMemberEmails = new Set(
      existingMembers.map((member) => member.email.trim().toLowerCase()),
    );
    const acceptedInviteEmails = new Set<string>();
    const acceptedInviteMembers = state.invitations
      .filter(
        (invitation) =>
          invitation.role !== "client" &&
          invitation.status === "accepted" &&
          !knownMemberEmails.has(invitation.email.trim().toLowerCase()) &&
          !acceptedInviteEmails.has(invitation.email.trim().toLowerCase()),
      )
      .map((invitation) => {
        const normalizedEmail = invitation.email.trim().toLowerCase();
        acceptedInviteEmails.add(normalizedEmail);

        return {
          id: `accepted-invite:${invitation.id}`,
          name: invitation.name,
          email: invitation.email,
          avatarPath: null,
          phone: undefined,
          role: invitation.role,
          company: "Haus",
          createdAt: invitation.acceptedAt ?? invitation.createdAt,
        };
      });

    return [...existingMembers, ...acceptedInviteMembers].map((member) => {
      const memberProjects = state.projects.filter(
        (project) =>
          project.ownerId === member.id ||
          project.staffIds.includes(member.id) ||
          project.tasks.some((task) => task.assigneeId === member.id),
      );

      const openTasks = memberProjects
        .flatMap((project) =>
          project.tasks
            .filter(
              (task) =>
                task.assigneeId === member.id &&
                (task.status === "todo" || task.status === "in_progress"),
            )
            .map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate,
              projectId: project.id,
              projectName: project.name,
            })),
        )
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      return {
        ...member,
        joinedAt: member.createdAt ?? null,
        projectCount: memberProjects.length,
        openTasks,
      };
    });
  }, [state.invitations, state.projects, state.users]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nextMembers = members.filter((member) => {
      const matchesSearch =
        !q ||
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        (member.company ?? "").toLowerCase().includes(q);

      const matchesRole = roleFilter === "all" ? true : member.role === roleFilter;

      return matchesSearch && matchesRole;
    });
    return [...nextMembers].sort((left, right) => {
      if (sort === "joined_desc") {
        return new Date(right.joinedAt ?? 0).getTime() - new Date(left.joinedAt ?? 0).getTime();
      }

      if (sort === "joined_asc") {
        return new Date(left.joinedAt ?? 0).getTime() - new Date(right.joinedAt ?? 0).getTime();
      }

      return left.name.localeCompare(right.name);
    });
  }, [members, roleFilter, search, sort]);

  const invitationRows = useMemo(
    () =>
      state.invitations
        .filter((invitation) => invitation.role !== "client")
        .map((invitation) => {
          const derivedStatus =
            invitation.status === "pending" && new Date(invitation.expiresAt).getTime() < Date.now()
              ? "expired"
              : invitation.status;

          return {
            ...invitation,
            status: derivedStatus,
            project: state.projects.find((project) => project.id === invitation.projectId) ?? null,
          };
        })
        .filter((invitation) => invitation.status === "pending" || invitation.status === "expired"),
    [state.invitations, state.projects],
  );

  const totalMembers = members.length;
  const designerCount = members.filter((member) => member.role === "designer").length;
  const managerCount = members.filter(
    (member) =>
      member.role === "creative_manager" || member.role === "communication_manager",
  ).length;
  const othersCount = Math.max(0, totalMembers - designerCount - managerCount);
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const mobileMembers = filteredMembers.slice(0, mobileVisibleCount);
  const hasMoreMobileMembers = mobileVisibleCount < filteredMembers.length;
  const rangeStart = filteredMembers.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredMembers.length);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_BATCH_SIZE);
  }, [filteredMembers.length, roleFilter, search]);

  useEffect(() => {
    const node = mobileLoadMoreRef.current;
    if (!node || !hasMoreMobileMembers) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setMobileVisibleCount((current) => Math.min(current + MOBILE_BATCH_SIZE, filteredMembers.length));
      },
      { rootMargin: "180px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredMembers.length, hasMoreMobileMembers]);

  const selectedMemberId = selectedMember?.id;
  const selectedMemberRole = selectedMember?.role;

  useEffect(() => {
    setSelectedTaskPage(1);

    if (selectedMemberRole && selectedMemberRole !== "client") {
      setNextRole(selectedMemberRole);
    }
  }, [selectedMemberId, selectedMemberRole]);

  useEffect(() => {
    if (!showUpdateRoleModal) {
      setRoleMenuOpen(false);
    }
  }, [showUpdateRoleModal]);

  useEffect(() => {
    if (!roleMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!roleFieldRef.current?.contains(target)) {
        setRoleMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRoleMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [roleMenuOpen]);

  useLayoutEffect(() => {
    if (!roleMenuOpen || !roleFieldRef.current) {
      return;
    }

    const updatePlacement = () => {
      if (!roleFieldRef.current) {
        return;
      }

      const rect = roleFieldRef.current.getBoundingClientRect();
      const spaceAbove = rect.top - 20;
      const spaceBelow = window.innerHeight - rect.bottom - 20;
      const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;

      setRoleMenuDirection(shouldOpenUp ? "up" : "down");
      setRoleMenuMaxHeight(Math.max(120, Math.min(220, shouldOpenUp ? spaceAbove : spaceBelow)));
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [roleMenuOpen]);

  const selectedTaskPages = Math.max(
    1,
    Math.ceil((selectedMember?.openTasks.length ?? 0) / MEMBER_TASKS_PAGE_SIZE),
  );
  const selectedMemberTasks = (selectedMember?.openTasks ?? []).slice(
    (selectedTaskPage - 1) * MEMBER_TASKS_PAGE_SIZE,
    selectedTaskPage * MEMBER_TASKS_PAGE_SIZE,
  );

  if (!ready) {
    return <ListScreenSkeleton title="Team" />;
  }

  if (!user) {
    return null;
  }

  return (
    <Shell>
      <ConfirmActionModal
        open={showDeleteMemberModal && Boolean(selectedMember)}
        title="Delete member"
        description={`This will remove ${selectedMember?.name ?? "this member"} from the workspace and delete their assigned tasks, uploads, comments, and feedback.`}
        confirmLabel="Delete member"
        tone="danger"
        busy={isDeletingMember}
        onCancel={() => {
          if (!isDeletingMember) {
            setShowDeleteMemberModal(false);
          }
        }}
        onConfirm={async () => {
          if (!selectedMember) {
            return;
          }

          setIsDeletingMember(true);
          try {
            await deleteTeamMember(selectedMember.id);
            setShowDeleteMemberModal(false);
            setSelectedMember(null);
          } finally {
            setIsDeletingMember(false);
          }
        }}
      />
      <ConfirmActionModal
        open={Boolean(revokeTarget)}
        title="Revoke invitation"
        description={`This will disable the invite link for ${revokeTarget?.email ?? "this invite"}.`}
        confirmLabel="Revoke invite"
        tone="danger"
        busy={isRevoking}
        onCancel={() => {
          if (!isRevoking) {
            setRevokeTarget(null);
          }
        }}
        onConfirm={async () => {
          if (!revokeTarget) {
            return;
          }

          setIsRevoking(true);
          try {
            await revokeInvitation(revokeTarget.id);
            setRevokeTarget(null);
          } finally {
            setIsRevoking(false);
          }
        }}
      />
      {isRegeneratingInvite ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Regenerating link...</p>
          </div>
        </div>
      ) : null}
      {selectedMember ? (
        <MemberDetailsOverlay onClick={() => setSelectedMember(null)}>
          <MemberDetailsCard onClick={(event) => event.stopPropagation()}>
            <DialogHeader>
              <MemberHeader>
                <Avatar user={selectedMember} />
                <MemberCopy>
                  <MemberName>{selectedMember.name}</MemberName>
                  <MemberEmail>{selectedMember.email}</MemberEmail>
                  <Pill
                    style={{
                      background: getRoleTone(selectedMember.role).bg,
                      color: getRoleTone(selectedMember.role).fg,
                    }}
                  >
                    {formatRole(selectedMember.role)}
                  </Pill>
                </MemberCopy>
              </MemberHeader>
              <DialogCloseButton type="button" onClick={() => setSelectedMember(null)} aria-label="Close">
                <IconClose />
              </DialogCloseButton>
            </DialogHeader>

            <DialogSection>
              <DialogStats>
                <DialogStatCard>
                  <DialogStatValue>{selectedMember.projectCount}</DialogStatValue>
                  <DialogStatLabel>Projects</DialogStatLabel>
                </DialogStatCard>
                <DialogStatCard>
                  <DialogStatValue>{selectedMember.openTasks.length}</DialogStatValue>
                  <DialogStatLabel>Open tasks</DialogStatLabel>
                </DialogStatCard>
              </DialogStats>
            </DialogSection>

            <DialogSection>
              <DialogLabel>Assigned tasks</DialogLabel>
              {selectedMember.openTasks.length ? (
                <>
                  <DialogList>
                    {selectedMemberTasks.map((task) => (
                      <DialogRow key={task.id}>
                        <div>
                          <DialogRowTitle>{task.title}</DialogRowTitle>
                          <DialogRowMeta>
                            {task.projectName} · {formatTaskStatus(task.status)} · {formatPriority(task.priority)} ·{" "}
                            {formatShortDate(task.dueDate)}
                          </DialogRowMeta>
                        </div>
                        <DialogLink href={`/projects/${task.projectId}`}>Open project</DialogLink>
                      </DialogRow>
                    ))}
                  </DialogList>
                  <DialogFooter>
                    <span>
                      Showing {(selectedTaskPage - 1) * MEMBER_TASKS_PAGE_SIZE + 1} to{" "}
                      {Math.min(selectedTaskPage * MEMBER_TASKS_PAGE_SIZE, selectedMember.openTasks.length)} of{" "}
                      {selectedMember.openTasks.length} tasks
                    </span>
                    <Pagination>
                      <PageButton
                        type="button"
                        onClick={() => setSelectedTaskPage((page) => Math.max(1, page - 1))}
                        disabled={selectedTaskPage === 1}
                      >
                        Last
                      </PageButton>
                      <PageButton $active type="button">
                        {selectedTaskPage}
                      </PageButton>
                      <PageButton
                        type="button"
                        onClick={() => setSelectedTaskPage((page) => Math.min(selectedTaskPages, page + 1))}
                        disabled={selectedTaskPage === selectedTaskPages}
                      >
                        Next
                      </PageButton>
                    </Pagination>
                  </DialogFooter>
                </>
              ) : (
                <EmptyText>No open tasks for this member.</EmptyText>
              )}
            </DialogSection>

            {(canManageRoles || canManageDelete) && !selectedMember.id.startsWith("accepted-invite:") ? (
              <DialogSection>
                <DialogActions>
                  {canManageRoles ? (
                    <GhostButton type="button" onClick={() => setShowUpdateRoleModal(true)}>
                      Update role
                    </GhostButton>
                  ) : null}
                  {canManageDelete ? (
                    <DangerButton type="button" onClick={() => setShowDeleteMemberModal(true)}>
                      Delete member
                    </DangerButton>
                  ) : null}
                </DialogActions>
              </DialogSection>
            ) : null}
          </MemberDetailsCard>
        </MemberDetailsOverlay>
      ) : null}
      {showUpdateRoleModal && selectedMember ? (
        <NestedModalOverlay onClick={() => setShowUpdateRoleModal(false)}>
          <NestedModalCard onClick={(event) => event.stopPropagation()}>
            <NestedModalHeader>
              <div>
                <PanelTitle>Update role</PanelTitle>
                <NestedModalCopy>Change this member’s team role.</NestedModalCopy>
              </div>
              <DialogCloseButton type="button" onClick={() => setShowUpdateRoleModal(false)} aria-label="Close">
                <IconClose />
              </DialogCloseButton>
            </NestedModalHeader>
            <NestedModalBody>
              <FloatingSelectField ref={roleFieldRef} $filled $open={roleMenuOpen}>
                <SelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={roleMenuOpen}
                  onClick={() => setRoleMenuOpen((current) => !current)}
                >
                  <SelectValue>{formatRole(nextRole)}</SelectValue>
                  <SelectChevron $open={roleMenuOpen}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectTrigger>
                <FieldLabel>Role</FieldLabel>
                {roleMenuOpen ? (
                  <SelectMenu
                    $direction={roleMenuDirection}
                    $maxHeight={roleMenuMaxHeight}
                    role="listbox"
                    aria-label="Role"
                  >
                    {(["creative_manager", "communication_manager", "designer"] as InternalRole[]).map((role) => (
                      <SelectOption
                        key={role}
                        type="button"
                        role="option"
                        aria-selected={nextRole === role}
                        $active={nextRole === role}
                        onClick={() => {
                          setNextRole(role);
                          setRoleMenuOpen(false);
                        }}
                      >
                        {formatRole(role)}
                      </SelectOption>
                    ))}
                  </SelectMenu>
                ) : null}
              </FloatingSelectField>
            </NestedModalBody>
            <NestedModalActions>
              <GhostButton type="button" onClick={() => setShowUpdateRoleModal(false)} disabled={isUpdatingRole}>
                Cancel
              </GhostButton>
              <InviteButton
                type="button"
                onClick={async () => {
                  setRoleMenuOpen(false);
                  setIsUpdatingRole(true);
                  try {
                    await updateTeamMemberRole(selectedMember.id, nextRole);
                    setSelectedMember((current) => (current ? { ...current, role: nextRole } : current));
                    setShowUpdateRoleModal(false);
                  } finally {
                    setIsUpdatingRole(false);
                  }
                }}
                disabled={isUpdatingRole}
              >
                <span>{isUpdatingRole ? "Updating..." : "Save role"}</span>
              </InviteButton>
            </NestedModalActions>
          </NestedModalCard>
        </NestedModalOverlay>
      ) : null}
      <InviteWorkspaceModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        variant="team"
      />
      <AppSidebar user={user} activeLabel="Team" />

      <Content>
        <Header>
          <HeaderCopy>
            <Title>Team</Title>
            <Subtitle>Manage your team members, roles, and permissions.</Subtitle>
          </HeaderCopy>
          <HeaderProfileAvatarLink user={user} />
        </Header>

        <Toolbar>
          <FilterModal
            open={showFilters}
            title="Filter team"
            description="Adjust which team roles are shown."
            sections={[
              {
                id: "role",
                label: "Role",
                options: [
                  { value: "all", label: "All Roles" },
                  { value: "creative_manager", label: "Creative Manager" },
                  { value: "communication_manager", label: "Communication Manager" },
                  { value: "designer", label: "Designer" },
                ],
              },
            ]}
            values={{ role: roleFilter }}
            onApply={(nextValues) => {
              setRoleFilter(nextValues.role as RoleFilter);
              setCurrentPage(1);
            }}
            onClose={() => setShowFilters(false)}
          />
          <FilterModal
            open={showSort}
            title="Sort team"
            description="Adjust team sorting."
            sections={[
              {
                id: "sort",
                label: "Sort by",
                options: [
                  { value: "name", label: "Name" },
                  { value: "joined_desc", label: "Newest to Oldest" },
                  { value: "joined_asc", label: "Oldest to Newest" },
                ],
              },
            ]}
            values={{ sort }}
            onApply={(nextValues) => {
              setSort(nextValues.sort as TeamSortKey);
              setCurrentPage(1);
            }}
            onReset={() => {
              setSort("name");
              setCurrentPage(1);
            }}
            onClose={() => setShowSort(false)}
            applyLabel="Apply sort"
            resetLabel="Default sort"
          />
          <SearchControls onSubmit={handleSearchSubmit}>
            <SearchWrap>
              <SearchInput
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search team members..."
              />
            </SearchWrap>
            <FilterMenuWrap>
              <FilterButton
                type="button"
                aria-label="Open filters"
                aria-expanded={showFilters}
                onClick={() => setShowFilters(true)}
              >
                {appliedFilterCount ? <FilterBadge>{appliedFilterCount}</FilterBadge> : null}
                <IconWrap>
                  <IconSliders />
                </IconWrap>
              </FilterButton>
              <FilterButton
                type="button"
                aria-label="Open sorting"
                aria-expanded={showSort}
                onClick={() => setShowSort(true)}
              >
                {appliedSortCount ? <FilterBadge>{appliedSortCount}</FilterBadge> : null}
                <IconWrap>
                  <IconSort />
                </IconWrap>
              </FilterButton>
            </FilterMenuWrap>
            <SearchButton type="submit" aria-label="Search team members">
              <IconWrap>
                <IconSearch />
              </IconWrap>
            </SearchButton>
          </SearchControls>

          <DesktopViewToggleGroup aria-label="Team view">
            <DesktopViewToggleButton
              type="button"
              $active={desktopView === "cards"}
              onClick={() => setDesktopView("cards")}
            >
              Cards
            </DesktopViewToggleButton>
            <DesktopViewToggleButton
              type="button"
              $active={desktopView === "table"}
              onClick={() => setDesktopView("table")}
            >
              Table
            </DesktopViewToggleButton>
          </DesktopViewToggleGroup>

          {canManageInvites ? (
            <InviteButton type="button" onClick={() => setShowInviteModal(true)}>
              <IconWrap>
                <IconPlus />
              </IconWrap>
              <span>Invite Member</span>
            </InviteButton>
          ) : null}
        </Toolbar>

        <StatsRow>
          <StatCard>
            <StatIcon $tone="green">
              <IconUsers />
            </StatIcon>
            <StatCopy>
              <StatValue>{totalMembers}</StatValue>
              <StatLabel>
                <MobileLabel>Members</MobileLabel>
                <DesktopLabel>Total Members</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="olive">
              <IconBriefcase />
            </StatIcon>
            <StatCopy>
              <StatValue>{designerCount}</StatValue>
              <StatLabel>
                <MobileLabel>Designers</MobileLabel>
                <DesktopLabel>Designers</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="shield">
              <IconShield />
            </StatIcon>
            <StatCopy>
              <StatValue>{managerCount}</StatValue>
              <StatLabel>
                <MobileLabel>Managers</MobileLabel>
                <DesktopLabel>Managers</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="gold">
              <IconUserPlus />
            </StatIcon>
            <StatCopy>
              <StatValue>{othersCount}</StatValue>
              <StatLabel>
                <MobileLabel>Others</MobileLabel>
                <DesktopLabel>Others</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCard>
        </StatsRow>

        <DesktopTable $visible={desktopView === "table"}>
          <TableHeader>
            <HeaderCell $wide>Member</HeaderCell>
            <HeaderCell>Role</HeaderCell>
            <HeaderCell>Projects</HeaderCell>
            <HeaderCell>Joined</HeaderCell>
          </TableHeader>

          <TableBody>
            {paginatedMembers.length ? (
              paginatedMembers.map((member) => {
                const roleTone = getRoleTone(member.role);

                return (
                  <TableRow key={member.id} onClick={() => setSelectedMember(member)}>
                    <MemberCell>
                      <Avatar user={member} />
                      <MemberCopy>
                        <MemberName>{member.name}</MemberName>
                        <MemberEmail>{member.email}</MemberEmail>
                      </MemberCopy>
                    </MemberCell>
                    <RoleCell>
                      <Pill style={{ background: roleTone.bg, color: roleTone.fg }}>
                        {formatRole(member.role)}
                      </Pill>
                    </RoleCell>
                    <CountCell>{member.projectCount || "—"}</CountCell>
                    <JoinedCell>{member.joinedAt ? formatShortDate(member.joinedAt) : "—"}</JoinedCell>
                  </TableRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No team members found</strong>
                <p>Try another search term or adjust the selected filters.</p>
              </EmptyState>
            )}
          </TableBody>

          <TableFooter>
            <span>
              Showing {rangeStart} to {rangeEnd} of {filteredMembers.length} members
            </span>
            <Pagination>
              <PageButton
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Last
              </PageButton>
              <PageButton $active type="button">
                {currentPage}
              </PageButton>
              <PageButton
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </PageButton>
            </Pagination>
          </TableFooter>
        </DesktopTable>

        <DesktopCardList $visible={desktopView === "cards"}>
          {paginatedMembers.length ? (
            paginatedMembers.map((member) => {
              const roleTone = getRoleTone(member.role);
              return (
                <MobileCard key={member.id} onClick={() => setSelectedMember(member)}>
                  <MobileJoinedMeta>
                    Joined {member.joinedAt ? formatShortDate(member.joinedAt) : "—"}
                  </MobileJoinedMeta>
                  <MobileCardRow>
                    <Avatar user={member} />
                    <MemberCopy>
                      <MemberName>{member.name}</MemberName>
                      <MemberEmail>{member.phone?.trim() || member.company || "No contact number"}</MemberEmail>
                      <Pill style={{ background: roleTone.bg, color: roleTone.fg }}>
                        {formatRole(member.role)}
                      </Pill>
                    </MemberCopy>
                  </MobileCardRow>
                </MobileCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No team members found</strong>
              <p>Try another search term or adjust the selected filters.</p>
            </EmptyState>
          )}
          {filteredMembers.length ? (
            <DesktopCardFooter>
              <span>
                Showing {rangeStart} to {rangeEnd} of {filteredMembers.length} members
              </span>
              <Pagination>
                <PageButton
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Last
                </PageButton>
                <PageButton $active type="button">
                  {currentPage}
                </PageButton>
                <PageButton
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </PageButton>
              </Pagination>
            </DesktopCardFooter>
          ) : null}
        </DesktopCardList>

        <MobileList>
          {mobileMembers.length ? (
            mobileMembers.map((member) => {
              const roleTone = getRoleTone(member.role);
              return (
                <MobileCard key={member.id} onClick={() => setSelectedMember(member)}>
                  <MobileJoinedMeta>
                    Joined {member.joinedAt ? formatShortDate(member.joinedAt) : "—"}
                  </MobileJoinedMeta>
                  <MobileCardRow>
                    <Avatar user={member} />
                    <MemberCopy>
                      <MemberName>{member.name}</MemberName>
                      <MemberEmail>{member.phone?.trim() || member.company || "No contact number"}</MemberEmail>
                      <Pill style={{ background: roleTone.bg, color: roleTone.fg }}>
                        {formatRole(member.role)}
                      </Pill>
                    </MemberCopy>
                  </MobileCardRow>
                </MobileCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No team members found</strong>
              <p>Try another search term or adjust the selected filters.</p>
            </EmptyState>
          )}
          {hasMoreMobileMembers ? <LoadMoreSentinel ref={mobileLoadMoreRef} aria-hidden="true" /> : null}
        </MobileList>

        {invitationRows.length ? (
          <InvitationPanel>
            <PanelHeader>
              <PanelTitle>Pending invitations</PanelTitle>
            </PanelHeader>
            <InvitationList>
              {invitationRows.slice(0, 4).map((invitation) => {
                const tone = invitationPill(invitation.status);
                return (
                  <InvitationRow key={invitation.id}>
                    <InvitationCopy>
                      <MemberName>{invitation.name}</MemberName>
                      <MemberEmail>{invitation.email}</MemberEmail>
                      <InvitationMeta>
                        {formatRole(invitation.role)} · {invitation.project?.name ?? "No project"}
                      </InvitationMeta>
                    </InvitationCopy>
                    <InvitationActions>
                      <Pill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</Pill>
                      {canManageInvites && (invitation.status === "pending" || invitation.status === "expired") ? (
                        <>
                          <TinyActionButton
                            type="button"
                            disabled={isRegeneratingInvite}
                            onClick={async () => {
                              setIsRegeneratingInvite(true);
                              try {
                                const result = await regenerateInvitation(invitation.id);
                                setRegeneratedInviteLink(result.inviteLink);
                                setRegeneratedInviteEmail(invitation.email);
                                setRegeneratedInviteCopyState("idle");
                              } finally {
                                setIsRegeneratingInvite(false);
                              }
                            }}
                          >
                            {isRegeneratingInvite ? "Regenerating..." : "Regenerate"}
                          </TinyActionButton>
                          <TinyDangerButton
                            type="button"
                            onClick={() =>
                              setRevokeTarget({
                                id: invitation.id,
                                email: invitation.email,
                              })
                            }
                          >
                            Revoke
                          </TinyDangerButton>
                        </>
                      ) : null}
                    </InvitationActions>
                  </InvitationRow>
                );
              })}
            </InvitationList>
          </InvitationPanel>
        ) : null}
      </Content>
      {regeneratedInviteLink ? (
        <div className="auth-popup-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="team-regenerated-link-title">
          <div className="auth-popup-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
              <h2 id="team-regenerated-link-title" style={{ margin: 0 }}>New invite link ready</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setRegeneratedInviteLink("")}
                style={{
                  width: "34px",
                  height: "34px",
                  flex: "0 0 34px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(230, 224, 215, 0.95)",
                  borderRadius: "999px",
                  background: "#fff",
                  color: "var(--color-text)",
                }}
              >
                <IconClose />
              </button>
            </div>
            <GeneratedLink>
              <p>{regeneratedInviteEmail ? `A fresh onboarding link is ready for ${regeneratedInviteEmail}.` : "A fresh onboarding link is ready."}</p>
              <LinkBox>{regeneratedInviteLink}</LinkBox>
              <InlineError>This link expires in 7 days. If it expires, regenerate it again from pending invites.</InlineError>
            </GeneratedLink>
            <div style={{ marginTop: "12px", width: "100%" }}>
              <button
                className="primary-button mobile-full-button"
                type="button"
                style={{ width: "100%" }}
                onClick={async () => {
                  await navigator.clipboard.writeText(regeneratedInviteLink);
                  setRegeneratedInviteCopyState("copied");
                }}
              >
                {regeneratedInviteCopyState === "copied" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const controlSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
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
  gap: 14px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 18px 22px 22px;
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
`;

const HeaderCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.92rem;
  line-height: 1.45;

  display: none;

  ${desktop} {
    display: block;
  }
`;

const StatsRow = styled.section`
  display: none;

  ${desktop} {
    display: flex;
    gap: 10px;
    overflow: visible;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  display: flex;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
  }
`;

const StatIcon = styled.div<{ $tone: "green" | "olive" | "shield" | "gold" }>`
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "green"
      ? "#e4f4e7"
      : $tone === "olive"
        ? "#f1efe4"
        : $tone === "shield"
          ? "#edf3ea"
          : "#f8f1e5"};
  color: ${({ $tone }) =>
    $tone === "green"
      ? "#4c8f5c"
      : $tone === "olive"
        ? "#7d7851"
        : $tone === "shield"
          ? "#536f59"
          : "#a47b2e"};

  svg {
    width: 20px;
    height: 20px;
  }
`;

const StatCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatValue = styled.strong`
  font-size: 1.65rem;
  line-height: 1;
`;

const StatLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.86rem;
  font-weight: 600;
`;

const MobileLabel = styled.span`
  ${desktop} {
    display: none;
  }
`;

const DesktopLabel = styled.span`
  display: none;

  ${desktop} {
    display: inline;
  }
`;

const InvitePanel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.96rem;
`;

const InviteForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

const Field = styled.label`
  flex: 1 1 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FieldLabel = styled.span`
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

const TextInput = styled.input`
  ${controlSurface}
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  color: var(--color-text);
`;

const FloatingSelectField = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const SelectTrigger = styled.button`
  ${controlSurface}
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 16px 12px;
  border-radius: 14px;
  color: var(--color-text);
  font-size: 16px;
  text-align: left;
`;

const SelectValue = styled.span`
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.2;
`;

const SelectChevron = styled.span<{ $open?: boolean }>`
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

const SelectMenu = styled.div<{ $direction: "up" | "down"; $maxHeight: number }>`
  ${cardSurface}
  position: absolute;
  left: 0;
  right: 0;
  ${({ $direction }) => ($direction === "up" ? "bottom: calc(100% + 8px);" : "top: calc(100% + 8px);")}
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  max-height: ${({ $maxHeight }) => `${$maxHeight}px`};
  overflow-y: auto;
`;

const SelectOption = styled.button<{ $active?: boolean }>`
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

  &:hover {
    background: rgba(31, 67, 57, 0.08);
  }
`;

const FormActions = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const Toolbar = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${desktop} {
    flex-direction: row;
    align-items: center;
    gap: 18px;
  }
`;

const SearchWrap = styled.div`
  flex: 1;

  ${desktop} {
    min-width: 0;
  }
`;

const SearchControls = styled.form`
  display: flex;
  align-items: stretch;
  gap: 10px;

  ${desktop} {
    flex: 1;
  }
`;

const SearchInput = styled.input`
  ${controlSurface}
  width: 100%;
  min-height: 40px;
  padding: 0 18px;
  border-radius: 10px;
  color: var(--color-text);
  font-size: 0.94rem;
`;

const FilterMenuWrap = styled.div`
  display: flex;
  gap: 10px;
`;

const FilterPopup = styled.div`
  ${cardSurface}
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 10;
  width: min(260px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
`;

const FilterPopupTitle = styled.strong`
  font-size: 0.9rem;
  color: var(--color-text);
`;

const DesktopViewToggleGroup = styled.div`
  display: none;

  ${desktop} {
    ${cardSurface}
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 4px;
    border-radius: 12px;
  }
`;

const DesktopViewToggleButton = styled.button<{ $active?: boolean }>`
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: ${({ $active }) => ($active ? "#1f4339" : "transparent")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--color-text-muted)")};
  font-size: 0.78rem;
  font-weight: 700;
`;

const DesktopTable = styled.section<{ $visible: boolean }>`
  ${cardSurface}
  display: none;
  flex-direction: column;
  border-radius: 22px;
  overflow: hidden;

  ${desktop} {
    display: ${({ $visible }) => ($visible ? "flex" : "none")};
  }
`;

const DesktopCardList = styled.div<{ $visible: boolean }>`
  display: none;

  ${desktop} {
    display: ${({ $visible }) => ($visible ? "flex" : "none")};
    flex-direction: column;
    gap: 12px;
  }
`;

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  color: var(--color-text-light);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const HeaderCell = styled.span<{ $wide?: boolean }>`
  flex: ${({ $wide }) => ($wide ? "1.6" : "1")};
`;

const TableBody = styled.div`
  display: flex;
  flex-direction: column;
`;

const TableRow = styled.article`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  cursor: pointer;
  transition: background 160ms ease, box-shadow 160ms ease;

  &:hover {
    background: rgba(244, 239, 232, 0.72);
  }
`;

const MemberCell = styled.div`
  flex: 1.6;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MemberCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const MemberName = styled.strong`
  font-size: 0.96rem;
`;

const MemberEmail = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.4;
`;

const MobileJoinedMeta = styled.p`
  position: absolute;
  top: 14px;
  right: 16px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.76rem;
  line-height: 1;

  ${desktop} {
    display: none;
  }
`;

const RoleCell = styled.div`
  flex: 1;
`;

const CountCell = styled.div`
  flex: 1;
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--color-text);
`;

const JoinedCell = styled.div`
  flex: 1;
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 500;
`;

const TableFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  color: var(--color-text-muted);
  font-size: 0.86rem;
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

  &:disabled {
    opacity: 0.45;
  }
`;

const MobileList = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${desktop} {
    display: none;
  }
`;

const LoadMoreSentinel = styled.div`
  height: 1px;
`;

const MobileCard = styled.article`
  ${cardSurface}
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 20px;
  cursor: pointer;
`;

const DesktopCardFooter = styled(TableFooter)`
  ${cardSurface}
  border: 0;
  border-radius: 20px;
`;

const MobileCardRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const Avatar = styled(UserAvatar)`
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: 999px;
  overflow: hidden;
`;

const InvitationPanel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
`;

const InvitationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InvitationRow = styled.article`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(230, 224, 215, 0.8);

  &:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
`;

const InvitationCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InvitationMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
`;

const InvitationActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MemberDetailsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(21, 18, 13, 0.4);
`;

const MemberDetailsCard = styled.div`
  ${cardSurface}
  width: min(560px, calc(100vw - 32px));
  border-radius: 24px;
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 0;
`;

const MemberHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DialogCloseButton = styled.button`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: #fff;
  color: var(--color-text);

  svg {
    width: 16px;
    height: 16px;
  }
`;

const DialogSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;

  & + & {
    padding-top: 0;
  }
`;

const DialogLabel = styled.strong`
  font-size: 0.9rem;
  color: var(--color-text);
`;

const DialogStats = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`;

const DialogStatCard = styled.div`
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  padding: 14px;
`;

const DialogStatValue = styled.strong`
  display: block;
  font-size: 1.2rem;
  line-height: 1;
  margin-bottom: 6px;
`;

const DialogStatLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.8rem;
`;

const DialogList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DialogRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
`;

const DialogRowTitle = styled.strong`
  display: block;
  margin-bottom: 4px;
  font-size: 0.9rem;
`;

const DialogRowMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.4;
`;

const DialogLink = styled(Link)`
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
`;

const DialogFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.8rem;

  ${desktop} {
    gap: 16px;
  }
`;

const EmptyText = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
`;

const DialogActions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const DangerButton = styled.button`
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(226, 100, 87, 0.24);
  border-radius: 10px;
  background: rgba(255, 236, 233, 0.8);
  color: #d65c4c;
  font-size: 0.86rem;
  font-weight: 700;
`;

const NestedModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 96;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);
`;

const NestedModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 420px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
`;

const NestedModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const NestedModalCopy = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.86rem;
`;

const NestedModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const NestedModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
`;

const InviteButton = styled.button`
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
  box-shadow: 0 14px 26px rgba(31, 68, 57, 0.16);

  ${desktop} {
    flex: 0 0 230px;
  }
`;

const GhostButton = styled.button`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
`;

const FilterButton = styled.button`
  position: relative;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
`;

const FilterBadge = styled.span`
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #d94b45;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 8px 18px rgba(217, 75, 69, 0.28);
`;

const SearchButton = styled(FilterButton)`
  background: #1f4339;
  color: #fff;
`;

const IconWrap = styled.span`
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

const GeneratedLink = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const LinkBox = styled.div`
  ${controlSurface}
  padding: 12px 14px;
  border-radius: 14px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.82rem;
`;

const TinyDangerButton = styled.button`
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: #b42318;
  color: #fff;
  font-size: 0.74rem;
  font-weight: 700;
`;

const TinyActionButton = styled.button`
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(31, 67, 57, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #1f4339;
  font-size: 0.74rem;
  font-weight: 700;
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

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M4.5 18a5.5 5.5 0 0 1 9 0" />
      <path d="M14.5 18a4.5 4.5 0 0 1 5-3.7" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="12" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M4 11.5h16" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.8 18.5 6v5.8c0 4.1-2.8 7.1-6.5 8.4-3.7-1.3-6.5-4.3-6.5-8.4V6z" />
      <path d="m9.5 12 1.7 1.8 3.5-3.8" />
    </svg>
  );
}

function IconUserPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="3" />
      <path d="M4.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8v6" />
      <path d="M15 11h6" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSort() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6v12" />
      <path d="m5 9 3-3 3 3" />
      <path d="M16 18V6" />
      <path d="m13 15 3 3 3-3" />
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

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
