"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { ClientTitleLogo } from "@/components/client-title-logo";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { FilterModal } from "@/components/filter-modal";
import { InviteWorkspaceModal } from "@/components/invite-workspace-modal";
import { useAppState } from "@/components/app-state";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { UserAvatar } from "@/components/user-avatar";
import { getClientBrandStyle } from "@/lib/client-branding";
import { buildLiaisonRows } from "@/lib/client-organizations";
import { formatRole } from "@/lib/display";
import { canCreateClient } from "@/lib/permissions";

type LiaisonFilter = "all" | "assigned" | "unassigned" | "active" | "inactive";
type LiaisonSortKey = "name" | "created_at_desc" | "created_at_asc";

const PAGE_SIZE = 6;
const desktop = "@media (min-width: 768px)";

const filterOptions: Array<{ key: LiaisonFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "unassigned", label: "Unassigned" },
  { key: "active", label: "Active orgs" },
  { key: "inactive", label: "Inactive orgs" },
];

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

function getOrganizationStatusLabel(
  isUnassigned: boolean,
  status: "active" | "inactive" | null,
  hasActiveOrganizations = false,
  hasInactiveOrganizations = false,
) {
  if (isUnassigned) {
    return "Unassigned";
  }

  if (hasActiveOrganizations && hasInactiveOrganizations) {
    return "Mixed";
  }

  if (status === "inactive") {
    return "Inactive";
  }

  return "Active";
}

function getClusterMark(label: string) {
  const words = label
    .split(/[\s&()/-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 1).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function getOrganizationClusterItems(names: string[]) {
  const visibleNames = names.slice(0, 4);
  const overflowCount = Math.max(0, names.length - visibleNames.length);

  return {
    visibleNames,
    overflowCount,
  };
}

export function LiaisonsScreen() {
  const { ready, state, user, updateClient, deleteClient } = useAppState();
  const [desktopView, setDesktopView] = useState<"cards" | "table">("table");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LiaisonFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<LiaisonSortKey>("name");
  const [showSort, setShowSort] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLiaisonId, setSelectedLiaisonId] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [assignOrganizationOpen, setAssignOrganizationOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRemovingOrganization, setIsRemovingOrganization] = useState(false);
  const [showManageOrganizations, setShowManageOrganizations] = useState(false);
  const [showDeleteLiaisonModal, setShowDeleteLiaisonModal] = useState(false);
  const [isDeletingLiaison, setIsDeletingLiaison] = useState(false);
  const [showInviteLiaisonModal, setShowInviteLiaisonModal] = useState(false);
  const appliedFilterCount = filter !== "all" ? 1 : 0;
  const appliedSortCount = sort !== "name" ? 1 : 0;

  const viewerRole = user?.role ?? "client";
  const roleLabel = formatRole(viewerRole).toUpperCase();
  const canManage = canCreateClient(viewerRole);
  const { activeClientOrganization, activeClientOrganizationId, clientOrganizationIds } =
    useActiveClientOrganization(user, state.clientOrganizations);
  const clientBrandStyle = useMemo(
    () => getClientBrandStyle(viewerRole === "client" ? activeClientOrganization : null),
    [activeClientOrganization, viewerRole],
  );
  const canInviteLiaisons = canManage || (viewerRole === "client" && clientOrganizationIds.length > 0);
  const inviteLockedToSingleOrganization = viewerRole === "client" && clientOrganizationIds.length === 1;
  const liaisons = useMemo(() => buildLiaisonRows(state), [state]);
  const currentClientOrganization = activeClientOrganization;
  const selectedLiaison = selectedLiaisonId
    ? liaisons.find((liaison) => liaison.id === selectedLiaisonId) ?? null
    : null;
  const canDeleteSelectedLiaison = Boolean(
    canManage && selectedLiaison && !selectedLiaison.id.startsWith("accepted-invite:"),
  );
  const assignableOrganizations = useMemo(
    () =>
      selectedLiaison
        ? state.clientOrganizations.filter(
            (organization) => !selectedLiaison.clientOrganizationIds.includes(organization.id),
          )
        : state.clientOrganizations,
    [selectedLiaison, state.clientOrganizations],
  );
  const visibleLiaisons = useMemo(
    () =>
      viewerRole === "client"
        ? liaisons.filter((liaison) =>
            Boolean(
              activeClientOrganizationId &&
              liaison.clientOrganizationIds.includes(activeClientOrganizationId),
            ),
          )
        : liaisons,
    [activeClientOrganizationId, liaisons, viewerRole],
  );

  const filteredLiaisons = useMemo(() => {
    const q = search.trim().toLowerCase();

    const nextLiaisons = visibleLiaisons.filter((liaison) => {
      const matchesSearch =
        !q ||
        liaison.name.toLowerCase().includes(q) ||
        liaison.email.toLowerCase().includes(q) ||
        liaison.organizationName.toLowerCase().includes(q) ||
        liaison.company.toLowerCase().includes(q) ||
        (liaison.phone ?? "").toLowerCase().includes(q) ||
        (liaison.jobTitle ?? "").toLowerCase().includes(q) ||
        (liaison.department ?? "").toLowerCase().includes(q);

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "assigned"
            ? !liaison.isUnassigned
            : filter === "unassigned"
              ? liaison.isUnassigned
              : filter === "active"
                ? liaison.hasActiveOrganizations
                : liaison.hasInactiveOrganizations;

      return matchesSearch && matchesFilter;
    });
    return [...nextLiaisons].sort((left, right) => {
      if (sort === "created_at_desc") {
        return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime();
      }

      if (sort === "created_at_asc") {
        return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
      }

      return left.name.localeCompare(right.name);
    });
  }, [filter, search, sort, visibleLiaisons]);

  const totalCount = visibleLiaisons.length;
  const assignedCount = visibleLiaisons.filter((liaison) => !liaison.isUnassigned).length;
  const unassignedCount = visibleLiaisons.filter((liaison) => liaison.isUnassigned).length;
  const activeOrgCount = new Set(
    visibleLiaisons
      .flatMap((liaison) =>
        liaison.hasActiveOrganizations ? liaison.clientOrganizationIds : [],
      ),
  ).size;

  const totalPages = Math.max(1, Math.ceil(filteredLiaisons.length / PAGE_SIZE));
  const paginatedLiaisons = filteredLiaisons.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const rangeStart = filteredLiaisons.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredLiaisons.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  if (!ready) {
    return <ListScreenSkeleton title="Liaisons" />;
  }

  if (!user) {
    return null;
  }

  return (
    <Shell style={viewerRole === "client" ? clientBrandStyle : undefined}>
      <InviteWorkspaceModal
        open={showInviteLiaisonModal}
        onClose={() => setShowInviteLiaisonModal(false)}
        variant="client"
        initialClientOrganizationId={clientOrganizationIds[0] ?? ""}
        lockClientOrganization={inviteLockedToSingleOrganization}
        allowedClientOrganizationIds={viewerRole === "client" ? clientOrganizationIds : undefined}
      />
      <ConfirmActionModal
        open={showDeleteLiaisonModal && Boolean(selectedLiaison)}
        title="Delete liaison"
        description={`This will remove ${selectedLiaison?.name ?? "this liaison"} from the workspace.`}
        confirmLabel="Delete liaison"
        tone="danger"
        busy={isDeletingLiaison}
        onCancel={() => {
          if (!isDeletingLiaison) {
            setShowDeleteLiaisonModal(false);
          }
        }}
        onConfirm={async () => {
          if (!selectedLiaison) {
            return;
          }

          setIsDeletingLiaison(true);
          try {
            await deleteClient(selectedLiaison.id);
            setShowDeleteLiaisonModal(false);
            setSelectedLiaisonId(null);
            setSelectedOrganizationId("");
            setAssignOrganizationOpen(false);
            setShowManageOrganizations(false);
          } finally {
            setIsDeletingLiaison(false);
          }
        }}
      />
      {selectedLiaison ? (
        <Overlay
          onClick={() => {
            if (!isAssigning && !isRemovingOrganization && !isDeletingLiaison) {
              setSelectedLiaisonId(null);
              setSelectedOrganizationId("");
              setAssignOrganizationOpen(false);
              setShowManageOrganizations(false);
            }
          }}
        >
          <ModalCard onClick={(event) => event.stopPropagation()}>
            {isDeletingLiaison ? (
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
                <SubtitleText>Short liaison details and organization memberships.</SubtitleText>
              </div>
              <HeaderActions>
                {canDeleteSelectedLiaison ? (
                  <DangerIconButton
                    type="button"
                    aria-label="Delete liaison"
                    disabled={isAssigning || isRemovingOrganization || isDeletingLiaison}
                    onClick={() => setShowDeleteLiaisonModal(true)}
                  >
                    <IconTrash />
                  </DangerIconButton>
                ) : null}
                <IconButton
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    if (!isAssigning && !isRemovingOrganization && !isDeletingLiaison) {
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
                  <span>{[selectedLiaison.jobTitle, selectedLiaison.department].filter(Boolean).join(" · ") || selectedLiaison.company}</span>
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
                              const organizationId = selectedLiaison.clientOrganizationIds[index] ?? null;
                              if (!organizationId) {
                                return;
                              }

                              setIsRemovingOrganization(true);
                              try {
                                await updateClient(selectedLiaison.id, {
                                  name: selectedLiaison.name,
                                  company: selectedLiaison.company,
                                  removeClientOrganizationId: organizationId,
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
                    <EmptyInlineText>No organizations assigned yet.</EmptyInlineText>
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
                  <CompactMetaValue>{formatDate(selectedLiaison.createdAt)}</CompactMetaValue>
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
                            {assignableOrganizations.find((organization) => organization.id === selectedOrganizationId)
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
                              assignableOrganizations.map((organization) => (
                                <SelectOption
                                  key={organization.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selectedOrganizationId === organization.id}
                                  $active={selectedOrganizationId === organization.id}
                                  onClick={() => {
                                    setSelectedOrganizationId(organization.id);
                                    setAssignOrganizationOpen(false);
                                  }}
                                >
                                  {organization.name}
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
                            (organization) => organization.id === selectedOrganizationId,
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
      <AppSidebar user={user} activeLabel={viewerRole === "client" ? "Liaisons" : "Clients"} />
      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <TitleRow>
              {viewerRole === "client" ? <HeaderClientLogo organization={currentClientOrganization} /> : null}
              <Title>Liaisons</Title>
            </TitleRow>
            <Subtitle>
              {viewerRole === "client"
                ? "Browse liaison accounts in your organization and invite additional liaisons."
                : "Browse all client liaison accounts and manage their organization memberships."}
            </Subtitle>
          </div>
          <HeaderAvatarLink href="/profile" aria-label="Open profile">
            <UserAvatar user={user} />
          </HeaderAvatarLink>
        </Header>

        <Toolbar>
          <FilterModal
            open={showFilters}
            title="Filter liaisons"
            description="Adjust which liaison accounts are shown."
            sections={[
              {
                id: "filter",
                label: "Liaison status",
                options: filterOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                })),
              },
            ]}
            values={{ filter }}
            onApply={(nextValues) => {
              setFilter(nextValues.filter as LiaisonFilter);
              setCurrentPage(1);
            }}
            onClose={() => setShowFilters(false)}
          />
          <FilterModal
            open={showSort}
            title="Sort liaisons"
            description="Adjust liaison sorting."
            sections={[
              {
                id: "sort",
                label: "Sort by",
                options: [
                  { value: "name", label: "Name" },
                  { value: "created_at_desc", label: "Newest to Oldest" },
                  { value: "created_at_asc", label: "Oldest to Newest" },
                ],
              },
            ]}
            values={{ sort }}
            onApply={(nextValues) => {
              setSort(nextValues.sort as LiaisonSortKey);
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
          <SearchControls
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              setSearch(searchDraft);
              setCurrentPage(1);
            }}
          >
            <SearchWrap>
              <SearchInput
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search liaisons, organizations, or contact info..."
              />
            </SearchWrap>
            <FilterButton
              type="button"
              aria-label="Open filters"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(true)}
            >
              {appliedFilterCount ? <FilterBadge>{appliedFilterCount}</FilterBadge> : null}
              <ActionIcon>
                <IconFilter />
              </ActionIcon>
            </FilterButton>
            <FilterButton
              type="button"
              aria-label="Open sorting"
              aria-expanded={showSort}
              onClick={() => setShowSort(true)}
            >
              {appliedSortCount ? <FilterBadge>{appliedSortCount}</FilterBadge> : null}
              <ActionIcon>
                <IconSort />
              </ActionIcon>
            </FilterButton>
            <SearchButton type="submit" aria-label="Search liaisons">
              <ActionIcon>
                <IconSearch />
              </ActionIcon>
            </SearchButton>
          </SearchControls>

          <DesktopViewToggleGroup aria-label="Liaison view">
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

          <ToolbarActions>
            {canInviteLiaisons ? (
              <PrimaryActionButton
                type="button"
                onClick={() => setShowInviteLiaisonModal(true)}
              >
                <ActionIcon>
                  <IconPlus />
                </ActionIcon>
                Liaison
              </PrimaryActionButton>
            ) : null}
            {canManage ? <SecondaryActionLink href="/clients">View Organizations</SecondaryActionLink> : null}
          </ToolbarActions>
        </Toolbar>

        <StatsRow>
          <StatCard>
            <StatIcon $tone="green">
              <IconUsers />
            </StatIcon>
            <StatCopy>
              <StatValue>{totalCount}</StatValue>
              <StatLabel>Total Liaisons</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="gold">
              <IconLink />
            </StatIcon>
            <StatCopy>
              <StatValue>{assignedCount}</StatValue>
              <StatLabel>Assigned</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="red">
              <IconAlert />
            </StatIcon>
            <StatCopy>
              <StatValue>{unassignedCount}</StatValue>
              <StatLabel>Unassigned</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="mint">
              <IconSpark />
            </StatIcon>
            <StatCopy>
              <StatValue>{activeOrgCount}</StatValue>
              <StatLabel>Active Orgs</StatLabel>
            </StatCopy>
          </StatCard>
        </StatsRow>

        <DesktopPanel $visible={desktopView === "table"}>
          <TableHeader>
            <span>Liaison</span>
            <span>Organization</span>
            <span>Projects</span>
            <span>Joined</span>
          </TableHeader>
          <TableBody>
            {paginatedLiaisons.length ? (
              paginatedLiaisons.map((liaison) => {
                const statusLabel = getOrganizationStatusLabel(
                  liaison.isUnassigned,
                  liaison.organizationStatus,
                  liaison.hasActiveOrganizations,
                  liaison.hasInactiveOrganizations,
                );
                const organizationCluster = getOrganizationClusterItems(liaison.clientOrganizationNames);
                const liaisonMeta = [liaison.jobTitle, liaison.department].filter(Boolean).join(" · ");

                if (liaison.isUnassigned) {
                  return (
                    <DesktopStaticRow key={liaison.id} type="button" onClick={() => setSelectedLiaisonId(liaison.id)}>
                      <ClientCell>
                        <ClientMark>{liaison.name.slice(0, 1).toUpperCase()}</ClientMark>
                        <ClientCopy>
                          <ClientName>{liaison.name}</ClientName>
                          <ClientMeta>{liaison.email}</ClientMeta>
                          {liaisonMeta ? <ClientMeta>{liaisonMeta}</ClientMeta> : null}
                        </ClientCopy>
                      </ClientCell>
                      <MetaColumn>
                        <ClientCopy>
                          <InlinePills>
                            <PendingPill $active={false}>{statusLabel}</PendingPill>
                          </InlinePills>
                        </ClientCopy>
                      </MetaColumn>
                      <CountCell>
                        {liaison.activeProjectCount}/{liaison.projectCount}
                      </CountCell>
                      <MetaColumn>
                        <DatePill>{formatDate(liaison.createdAt)}</DatePill>
                      </MetaColumn>
                    </DesktopStaticRow>
                  );
                }

                return (
                  <DesktopStaticRow key={liaison.id} type="button" onClick={() => setSelectedLiaisonId(liaison.id)}>
                    <ClientCell>
                      <ClientMark>{liaison.name.slice(0, 1).toUpperCase()}</ClientMark>
                      <ClientCopy>
                        <ClientName>{liaison.name}</ClientName>
                        <ClientMeta>{liaison.email}</ClientMeta>
                        {liaisonMeta ? <ClientMeta>{liaisonMeta}</ClientMeta> : null}
                      </ClientCopy>
                    </ClientCell>
                    <MetaColumn>
                      <ClientCopy>
                        {organizationCluster.visibleNames.length ? (
                          <OrganizationCluster aria-label={`${liaison.clientOrganizationIds.length} organizations`}>
                            {organizationCluster.visibleNames.map((organizationName, index) => (
                              <OrganizationBubble
                                key={`${liaison.id}:${organizationName}:${index}`}
                                $index={index}
                                title={organizationName}
                              >
                                {getClusterMark(organizationName)}
                              </OrganizationBubble>
                            ))}
                            {organizationCluster.overflowCount > 0 ? (
                              <OrganizationBubble
                                $index={organizationCluster.visibleNames.length}
                                $tone="accent"
                                title={`${organizationCluster.overflowCount} more organizations`}
                              >
                                +{organizationCluster.overflowCount}
                              </OrganizationBubble>
                            ) : null}
                          </OrganizationCluster>
                        ) : null}
                        <ClientMeta>
                          {liaison.clientOrganizationIds.length > 1
                            ? `${liaison.clientOrganizationIds.length} organizations`
                            : liaison.isUnassigned
                              ? "No organizations assigned"
                              : "1 organization"}
                        </ClientMeta>
                        <InlinePills>
                          {statusLabel ? (
                            <PendingPill
                              $active={liaison.hasActiveOrganizations && !liaison.hasInactiveOrganizations}
                            >
                              {statusLabel}
                            </PendingPill>
                          ) : null}
                        </InlinePills>
                      </ClientCopy>
                    </MetaColumn>
                    <CountCell>
                      {liaison.activeProjectCount}/{liaison.projectCount}
                    </CountCell>
                    <MetaColumn>
                      <DatePill>{formatDate(liaison.createdAt)}</DatePill>
                    </MetaColumn>
                  </DesktopStaticRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No liaisons found</strong>
                <p>Try another search term or adjust the selected filter.</p>
              </EmptyState>
            )}
          </TableBody>
          <TableFooter>
            <span>
              Showing {rangeStart} to {rangeEnd} of {filteredLiaisons.length} liaisons
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
        </DesktopPanel>

        <DesktopCardList $visible={desktopView === "cards"}>
          {paginatedLiaisons.length ? (
            paginatedLiaisons.map((liaison) => (
              <MobileStaticCard key={liaison.id} type="button" onClick={() => setSelectedLiaisonId(liaison.id)}>
                <MobileTop>
                  <ClientMark>{liaison.name.slice(0, 1).toUpperCase()}</ClientMark>
                  <ClientCopy>
                    <MobileTitleRow>
                      <ClientName>{liaison.name}</ClientName>
                      <ClientMeta>{liaison.phone || liaison.email}</ClientMeta>
                    </MobileTitleRow>
                    <MobileOrganizationPills>
                      {liaison.clientOrganizationNames.length ? (
                        liaison.clientOrganizationNames.map((organizationName, index) => (
                          <OrganizationNamePill key={`${liaison.id}:${organizationName}:${index}`}>
                            {organizationName}
                          </OrganizationNamePill>
                        ))
                      ) : (
                        <OrganizationNamePill>No organizations</OrganizationNamePill>
                      )}
                      {liaison.jobTitle ? <OrganizationNamePill>{liaison.jobTitle}</OrganizationNamePill> : null}
                    </MobileOrganizationPills>
                  </ClientCopy>
                </MobileTop>
              </MobileStaticCard>
            ))
          ) : (
            <EmptyState>
              <strong>No liaisons found</strong>
              <p>Try another search term or adjust the selected filter.</p>
            </EmptyState>
          )}
          {filteredLiaisons.length ? (
            <DesktopCardFooter>
              <span>
                Showing {rangeStart} to {rangeEnd} of {filteredLiaisons.length} liaisons
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
          {paginatedLiaisons.length ? (
            paginatedLiaisons.map((liaison) => {
              return (
                <MobileStaticCard key={liaison.id} type="button" onClick={() => setSelectedLiaisonId(liaison.id)}>
                  <MobileTop>
                    <ClientMark>{liaison.name.slice(0, 1).toUpperCase()}</ClientMark>
                    <ClientCopy>
                      <MobileTitleRow>
                        <ClientName>{liaison.name}</ClientName>
                        <ClientMeta>{liaison.phone || liaison.email}</ClientMeta>
                      </MobileTitleRow>
                      <MobileOrganizationPills>
                        {liaison.clientOrganizationNames.length ? (
                          liaison.clientOrganizationNames.map((organizationName, index) => (
                            <OrganizationNamePill key={`${liaison.id}:${organizationName}:${index}`}>
                              {organizationName}
                            </OrganizationNamePill>
                          ))
                        ) : (
                          <OrganizationNamePill>No organizations</OrganizationNamePill>
                        )}
                        {liaison.jobTitle ? <OrganizationNamePill>{liaison.jobTitle}</OrganizationNamePill> : null}
                      </MobileOrganizationPills>
                    </ClientCopy>
                  </MobileTop>
                </MobileStaticCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No liaisons found</strong>
              <p>Try another search term or adjust the selected filter.</p>
            </EmptyState>
          )}
        </MobileList>
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
    background: var(--client-brand-soft, rgba(255, 255, 255, 0.58));
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
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.72), transparent 18%),
      var(--client-brand-soft-panel, linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84)));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const Eyebrow = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Title = styled.h1`
  margin: 4px 0 6px;
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const HeaderClientLogo = styled(ClientTitleLogo)`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
  flex: 0 0 auto;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.45;

  display: none;

  ${desktop} {
    display: block;
  }
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
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  background: rgba(21, 18, 13, 0.4);

  ${desktop} {
    align-items: center;
  }
`;

const ModalCard = styled.div`
  ${cardSurface}
  position: relative;
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

const HeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.96rem;
`;

const SubtitleText = styled.p`
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;

  @media (max-width: 767px) {
    display: none;
  }
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
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

  strong {
    font-size: 0.94rem;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.84rem;
  }
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
`;

const SecondaryButton = styled.button`
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 700;
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

  svg {
    width: 16px;
    height: 16px;
    display: block;
  }
`;

const DangerIconButton = styled(IconButton)`
  border-color: rgba(252, 196, 190, 0.95);
  background: #ffe7e5;
  color: #e06457;
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

const SearchControls = styled.form`
  display: flex;
  align-items: stretch;
  gap: 10px;

  ${desktop} {
    flex: 1;
  }
`;

const SearchWrap = styled.div`
  flex: 1;
`;

const SearchInput = styled.input`
  width: 100%;
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
  font-size: 0.94rem;
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
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
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

const ToolbarActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;

  ${desktop} {
    display: flex;
    width: auto;
    flex-wrap: wrap;
  }
`;

const SecondaryActionLink = styled(Link)`
  width: 100%;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;

  ${desktop} {
    font-size: 0.9rem;
  }
`;

const PrimaryActionButton = styled.button`
  width: 100%;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #1f4339;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;

  ${desktop} {
    font-size: 0.9rem;
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
  padding: 12px;
  border-radius: 18px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border-radius: 20px;
  }
`;

const StatIcon = styled.div<{ $tone: "green" | "gold" | "red" | "mint" }>`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "green"
      ? "#dff1dd"
      : $tone === "gold"
        ? "#fff0d5"
        : $tone === "red"
          ? "#ffe6e4"
          : "#e7f5ea"};
  color: ${({ $tone }) =>
    $tone === "green"
      ? "#5ca16d"
      : $tone === "gold"
        ? "#ca8a22"
        : $tone === "red"
          ? "#e06457"
          : "#5ca16d"};

  svg {
    width: 18px;
    height: 18px;
  }
`;

const StatCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatValue = styled.strong`
  font-size: 1.5rem;
  line-height: 1;
`;

const StatLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
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

const DesktopPanel = styled.section<{ $visible: boolean }>`
  ${cardSurface}
  display: none;
  border-radius: 22px;
  overflow: hidden;

  ${desktop} {
    display: ${({ $visible }) => ($visible ? "block" : "none")};
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

const DesktopCardFooter = styled.div`
  ${cardSurface}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border: 0;
  border-radius: 20px;
  color: var(--color-text-muted);
  font-size: 0.86rem;
`;

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;

  span {
    flex: 1;
  }
`;

const TableBody = styled.div`
  display: flex;
  flex-direction: column;
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
`;

const DesktopStaticRow = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  border: 0;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  background: transparent;
  text-align: left;
  transition: background 160ms ease;

  &:hover {
    background: rgba(244, 239, 232, 0.72);
  }
`;

const ClientCell = styled.div`
  flex: 1.3;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ClientMark = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.9rem;
  font-weight: 700;
  flex: 0 0 40px;

  ${desktop} {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    font-size: 1rem;
    flex-basis: 48px;
  }
`;

const ClientCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  ${desktop} {
    gap: 4px;
  }
`;

const ClientName = styled.strong`
  font-size: 0.9rem;
  color: var(--color-text);

  ${desktop} {
    font-size: 0.96rem;
  }
`;

const ClientMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.76rem;
  line-height: 1.25;

  ${desktop} {
    font-size: 0.82rem;
    line-height: 1.4;
  }
`;

const OrganizationCluster = styled.div`
  display: flex;
  align-items: center;
  min-height: 24px;
  padding-right: 6px;

  ${desktop} {
    min-height: 30px;
    padding-right: 8px;
  }
`;

const InlinePills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  ${desktop} {
    gap: 6px;
  }
`;

const MetaColumn = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const CountCell = styled.div`
  flex: 1;
  color: var(--color-text);
  font-size: 1.1rem;
  font-weight: 700;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;

  ${desktop} {
    min-height: 24px;
    padding: 0 8px;
    font-size: 0.74rem;
  }
`;

const DatePill = styled(Pill)`
  background: rgba(244, 241, 237, 0.9);
  color: var(--color-text);
`;

const PendingPill = styled(Pill)<{ $active?: boolean }>`
  background: ${({ $active }) => ($active ? "#e5f4e8" : "#ffe7e5")};
  color: ${({ $active }) => ($active ? "#5ca16d" : "#e06457")};
`;

const OrganizationBubble = styled.span<{ $index: number; $tone?: "default" | "accent" }>`
  position: relative;
  z-index: ${({ $index }) => 10 - $index};
  width: 24px;
  height: 24px;
  margin-left: ${({ $index }) => ($index === 0 ? "0" : "-6px")};
  display: inline-grid;
  place-items: center;
  border: 1.5px solid rgba(255, 255, 255, 0.96);
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "accent"
      ? "#1f4339"
      : "linear-gradient(145deg, #ede5d8, #f8f4ee)"};
  color: ${({ $tone }) => ($tone === "accent" ? "#fff" : "#8c7040")};
  font-size: 0.64rem;
  font-weight: 700;
  box-shadow: 0 6px 14px rgba(104, 84, 54, 0.12);
  transition: transform 140ms ease, box-shadow 140ms ease, z-index 140ms ease;

  ${desktop} {
    width: 30px;
    height: 30px;
    margin-left: ${({ $index }) => ($index === 0 ? "0" : "-8px")};
    font-size: 0.72rem;
  }

  &:hover {
    z-index: 30;
    transform: translateY(-7px);
    box-shadow: 0 12px 22px rgba(104, 84, 54, 0.2);
  }
`;

const MobileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;

  ${desktop} {
    display: none;
  }
`;

const MobileStaticCard = styled.button`
  ${cardSurface}
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 0;
  border-radius: 18px;
  text-align: left;
`;

const MobileTop = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const MobileTitleRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
`;

const MobileOrganizationPills = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const OrganizationNamePill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.9);
  color: var(--color-text);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
`;

const EmptyState = styled.div`
  ${cardSurface}
  border-radius: 20px;
  padding: 22px 18px;
  color: var(--color-text-muted);

  strong {
    display: block;
    margin-bottom: 4px;
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: 0.9rem;
  }
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

const EmptyInlineText = styled.span`
  color: var(--color-text-muted);
  font-size: 0.84rem;
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

const ActionIcon = styled.span`
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
  }
`;

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

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
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

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
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
      <path d="M3 6h18" />
      <path d="M8 6V4.8c0-.9.7-1.6 1.6-1.6h4.8c.9 0 1.6.7 1.6 1.6V6" />
      <path d="m6.5 6 .8 12.1c.1 1.5 1.3 2.7 2.8 2.7h3.8c1.5 0 2.7-1.2 2.8-2.7L17.5 6" />
      <path d="M10 10.2v6.2" />
      <path d="M14 10.2v6.2" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 1 0-7.07-7.07L10.7 5.23" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13.3 18.8" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.2 4.1L17.5 8l-4.3 1L12 13l-1.2-4-4.3-1 4.3-.9Z" />
      <path d="M5 14.5 5.8 17 8.5 18l-2.7.8L5 21.5l-.8-2.7L1.5 18l2.7-1Z" />
      <path d="m18 14 .7 2.1L21 17l-2.3.8L18 20l-.7-2.2L15 17l2.3-.9Z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
