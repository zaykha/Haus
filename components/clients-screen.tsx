"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { FilterModal } from "@/components/filter-modal";
import { useAppState } from "@/components/app-state";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { UserAvatar } from "@/components/user-avatar";
import {
  buildClientOrganizationRows,
  getClientOrganizationMark,
  getClientOrganizationStatusLabel,
} from "@/lib/client-organizations";
import { formatRole } from "@/lib/display";
import { canCreateClient, getUserClientOrganizationIds } from "@/lib/permissions";

type ClientFilter = "all" | "active" | "feedback" | "approvals" | "inactive";
type ClientSortKey = "name" | "created_at_desc" | "created_at_asc";
const PAGE_SIZE = 6;
const MOBILE_BATCH_SIZE = 20;
const desktop = "@media (min-width: 768px)";

const filterOptions: Array<{ key: ClientFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "feedback", label: "Awaiting Feedback" },
  { key: "approvals", label: "Approvals Needed" },
  { key: "inactive", label: "Inactive" },
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

function getClusterItems(labels: string[]) {
  const visibleLabels = labels.slice(0, 4);
  const overflowCount = Math.max(0, labels.length - visibleLabels.length);

  return {
    visibleLabels,
    overflowCount,
  };
}

export function ClientsScreen() {
  const router = useRouter();
  const { ready, state, user, createClientOrganization } = useAppState();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<ClientSortKey>("name");
  const [showSort, setShowSort] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateOrganizationModal, setShowCreateOrganizationModal] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState<"internal" | "external">("external");
  const [organizationStatus, setOrganizationStatus] = useState<"active" | "inactive">("active");
  const [organizationPhone, setOrganizationPhone] = useState("");
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [openCreateSelect, setOpenCreateSelect] = useState<"type" | "status" | null>(null);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_BATCH_SIZE);
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const appliedFilterCount = filter !== "all" ? 1 : 0;
  const appliedSortCount = sort !== "name" ? 1 : 0;

  useEffect(() => {
    if (isCreatingOrganization) {
      setOpenCreateSelect(null);
    }
  }, [isCreatingOrganization]);

  const viewerRole = user?.role ?? "client";
  const roleLabel = formatRole(viewerRole).toUpperCase();
  const canManage = canCreateClient(viewerRole);
  const clients = useMemo(() => buildClientOrganizationRows(state), [state]);
  const clientCreatedAtById = useMemo(
    () => new Map(state.clientOrganizations.map((organization) => [organization.id, organization.createdAt ?? ""])),
    [state.clientOrganizations],
  );
  const viewerClientOrganizationIds = useMemo(
    () => (user ? getUserClientOrganizationIds(user) : []),
    [user],
  );
  const visibleClients = useMemo(
    () =>
      viewerRole === "client"
        ? clients.filter((client) => Boolean(client.organizationId && viewerClientOrganizationIds.includes(client.organizationId)))
        : clients,
    [clients, viewerClientOrganizationIds, viewerRole],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nextClients = visibleClients.filter((client) => {
      const matchesSearch =
        !q ||
        client.name.toLowerCase().includes(q) ||
        client.company.toLowerCase().includes(q) ||
        client.members.some(
          (member) =>
            member.name.toLowerCase().includes(q) ||
            member.email.toLowerCase().includes(q) ||
            (member.company ?? "").toLowerCase().includes(q),
        ) ||
        client.recentProjects.some((project) => project.name.toLowerCase().includes(q));

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "feedback"
            ? client.pendingProjects.some((project) => project.status === "review")
          : filter === "approvals"
            ? client.pendingProjects.some((project) => project.status === "revision")
          : filter === "active"
            ? client.status === "active"
            : client.isUnassigned || client.status === "inactive";

      return matchesSearch && matchesFilter;
    });
    return [...nextClients].sort((left, right) => {
      if (sort === "created_at_desc") {
        return (
          new Date(clientCreatedAtById.get(right.id) ?? 0).getTime() -
          new Date(clientCreatedAtById.get(left.id) ?? 0).getTime()
        );
      }

      if (sort === "created_at_asc") {
        return (
          new Date(clientCreatedAtById.get(left.id) ?? 0).getTime() -
          new Date(clientCreatedAtById.get(right.id) ?? 0).getTime()
        );
      }

      return left.name.localeCompare(right.name);
    });
  }, [clientCreatedAtById, filter, search, sort, visibleClients]);

  const totalCount = visibleClients.length;
  const activeCount = visibleClients.filter((client) => client.status === "active").length;
  const pendingFeedbackCount = visibleClients.filter((client) =>
    client.pendingProjects.some((project) => project.status === "review"),
  ).length;
  const activeProjectOrganizationsCount = visibleClients.filter((client) => client.activeProjectCount > 0).length;

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const mobileClients = filteredClients.slice(0, mobileVisibleCount);
  const hasMoreMobileClients = mobileVisibleCount < filteredClients.length;
  const rangeStart = filteredClients.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredClients.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_BATCH_SIZE);
  }, [filter, search, visibleClients.length]);

  useEffect(() => {
    const node = mobileLoadMoreRef.current;
    if (!node || !hasMoreMobileClients) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setMobileVisibleCount((current) => Math.min(current + MOBILE_BATCH_SIZE, filteredClients.length));
      },
      { rootMargin: "180px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredClients.length, hasMoreMobileClients]);

  if (!ready) {
    return <ListScreenSkeleton title="Clients" />;
  }

  if (!user) {
    return null;
  }

  return (
    <Shell>
      {showCreateOrganizationModal ? (
        <Overlay onClick={() => !isCreatingOrganization && setShowCreateOrganizationModal(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <PanelTitle>Create Organization</PanelTitle>
                <ClientMeta>Create the organization first. Liaison invites happen inside the organization detail page.</ClientMeta>
              </div>
              <IconButton
                type="button"
                aria-label="Close"
                onClick={() => !isCreatingOrganization && setShowCreateOrganizationModal(false)}
              >
                <IconClose />
              </IconButton>
            </ModalHeader>
            <ModalForm
              onSubmit={async (event) => {
                event.preventDefault();
                setIsCreatingOrganization(true);
                try {
                  const result = await createClientOrganization({
                    name: organizationName,
                    type: organizationType,
                    status: organizationStatus,
                    phone: organizationType === "external" ? organizationPhone : undefined,
                    address: organizationType === "external" ? organizationAddress : undefined,
                  });
                  setShowCreateOrganizationModal(false);
                  setOrganizationName("");
                  setOrganizationPhone("");
                  setOrganizationAddress("");
                  setOpenCreateSelect(null);
                  router.push(`/clients/${result.id}`);
                } finally {
                  setIsCreatingOrganization(false);
                }
              }}
            >
              <FloatingField className={organizationName ? "auth-field is-filled" : "auth-field"}>
                <TextInput
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  disabled={isCreatingOrganization}
                  placeholder=" "
                  required
                />
                <span>Organization name</span>
              </FloatingField>
              <FieldGrid>
                <FloatingSelectField $filled $open={openCreateSelect === "type"}>
                  <SelectTrigger
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openCreateSelect === "type"}
                    disabled={isCreatingOrganization}
                    onClick={() => {
                      if (isCreatingOrganization) {
                        return;
                      }
                      setOpenCreateSelect((current) => (current === "type" ? null : "type"));
                    }}
                  >
                    <SelectValue>{organizationType === "internal" ? "Internal" : "External"}</SelectValue>
                    <SelectChevron $open={openCreateSelect === "type"}>
                      <IconChevronDown />
                    </SelectChevron>
                  </SelectTrigger>
                  <FloatingLabel>Type</FloatingLabel>
                  {openCreateSelect === "type" && !isCreatingOrganization ? (
                    <SelectMenu role="listbox" aria-label="Organization type">
                      <SelectOption
                        type="button"
                        role="option"
                        aria-selected={organizationType === "external"}
                        $active={organizationType === "external"}
                        onClick={() => {
                          setOrganizationType("external");
                          setOpenCreateSelect(null);
                        }}
                      >
                        External
                      </SelectOption>
                      <SelectOption
                        type="button"
                        role="option"
                        aria-selected={organizationType === "internal"}
                        $active={organizationType === "internal"}
                        onClick={() => {
                          setOrganizationType("internal");
                          setOrganizationPhone("");
                          setOrganizationAddress("");
                          setOpenCreateSelect(null);
                        }}
                      >
                        Internal
                      </SelectOption>
                    </SelectMenu>
                  ) : null}
                </FloatingSelectField>
                <FloatingSelectField $filled $open={openCreateSelect === "status"}>
                  <SelectTrigger
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openCreateSelect === "status"}
                    disabled={isCreatingOrganization}
                    onClick={() => {
                      if (isCreatingOrganization) {
                        return;
                      }
                      setOpenCreateSelect((current) => (current === "status" ? null : "status"));
                    }}
                  >
                    <SelectValue>{organizationStatus === "active" ? "Active" : "Inactive"}</SelectValue>
                    <SelectChevron $open={openCreateSelect === "status"}>
                      <IconChevronDown />
                    </SelectChevron>
                  </SelectTrigger>
                  <FloatingLabel>Status</FloatingLabel>
                  {openCreateSelect === "status" && !isCreatingOrganization ? (
                    <SelectMenu role="listbox" aria-label="Organization status">
                      <SelectOption
                        type="button"
                        role="option"
                        aria-selected={organizationStatus === "active"}
                        $active={organizationStatus === "active"}
                        onClick={() => {
                          setOrganizationStatus("active");
                          setOpenCreateSelect(null);
                        }}
                      >
                        Active
                      </SelectOption>
                      <SelectOption
                        type="button"
                        role="option"
                        aria-selected={organizationStatus === "inactive"}
                        $active={organizationStatus === "inactive"}
                        onClick={() => {
                          setOrganizationStatus("inactive");
                          setOpenCreateSelect(null);
                        }}
                      >
                        Inactive
                      </SelectOption>
                    </SelectMenu>
                  ) : null}
                </FloatingSelectField>
              </FieldGrid>
              {organizationType === "external" ? (
                <FieldGrid>
                  <FloatingField className={organizationPhone ? "auth-field is-filled" : "auth-field"}>
                    <TextInput
                      type="tel"
                      value={organizationPhone}
                      onChange={(event) => setOrganizationPhone(event.target.value)}
                      disabled={isCreatingOrganization}
                      placeholder=" "
                    />
                    <span>Phone</span>
                  </FloatingField>
                  <FloatingField className={organizationAddress ? "auth-field is-filled" : "auth-field"}>
                    <TextInput
                      value={organizationAddress}
                      onChange={(event) => setOrganizationAddress(event.target.value)}
                      disabled={isCreatingOrganization}
                      placeholder=" "
                    />
                    <span>Address</span>
                  </FloatingField>
                </FieldGrid>
              ) : null}
              <InviteButton type="submit" disabled={isCreatingOrganization}>
                <span>{isCreatingOrganization ? "Creating..." : "Create Organization"}</span>
              </InviteButton>
            </ModalForm>
          </ModalCard>
        </Overlay>
      ) : null}
      <AppSidebar user={user} activeLabel="Clients" />
      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <Title>Clients</Title>
            <Subtitle>Browse client organizations, then open one to manage liaisons and linked projects.</Subtitle>
          </div>
          <HeaderAvatarLink href="/profile" aria-label="Open profile">
            <UserAvatar user={user} />
          </HeaderAvatarLink>
        </Header>

        <Toolbar>
          <FilterModal
            open={showFilters}
            title="Filter client organizations"
            description="Adjust which client organizations are shown."
            sections={[
              {
                id: "filter",
                label: "Organization status",
                options: filterOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                })),
              },
            ]}
            values={{ filter }}
            onApply={(nextValues) => {
              setFilter(nextValues.filter as ClientFilter);
              setCurrentPage(1);
            }}
            onClose={() => setShowFilters(false)}
          />
          <FilterModal
            open={showSort}
            title="Sort client organizations"
            description="Adjust organization sorting."
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
              setSort(nextValues.sort as ClientSortKey);
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
                placeholder="Search organizations, liaisons, or projects..."
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
            </FilterMenuWrap>
            <SearchButton type="submit" aria-label="Search clients">
              <ActionIcon>
                <IconSearch />
              </ActionIcon>
            </SearchButton>
          </SearchControls>

          <ToolbarActions>
            {canManage ? (
              <SecondaryActionLink href="/clients/liaisons">View All Liaisons</SecondaryActionLink>
            ) : null}
            {canManage ? (
              <InviteButton type="button" onClick={() => setShowCreateOrganizationModal(true)}>
                <ActionIcon>
                  <IconPlus />
                </ActionIcon>
                <span>Organization</span>
              </InviteButton>
            ) : null}
          </ToolbarActions>
        </Toolbar>

        <StatsRow>
          <StatCard>
            <StatIcon $tone="green">
              <IconUsers />
            </StatIcon>
            <StatCopy>
              <StatValue>{totalCount}</StatValue>
              <StatLabel>
                <MobileLabel>Orgs</MobileLabel>
                <DesktopLabel>Total Organizations</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="mint">
              <IconSpark />
            </StatIcon>
            <StatCopy>
              <StatValue>{activeCount}</StatValue>
              <StatLabel>
                <MobileLabel>Active</MobileLabel>
                <DesktopLabel>Active Organizations</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCard>
          <StatCardLink href="/projects?quick=awaiting_feedback">
            <StatIcon $tone="gold">
              <IconComment />
            </StatIcon>
            <StatCopy>
              <StatValue>{pendingFeedbackCount}</StatValue>
              <StatLabel>
                <MobileLabel>Feedback</MobileLabel>
                <DesktopLabel>Awaiting Feedback</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCardLink>
          <StatCardLink href="/projects?quick=active">
            <StatIcon $tone="red">
              <IconShield />
            </StatIcon>
            <StatCopy>
              <StatValue>{activeProjectOrganizationsCount}</StatValue>
              <StatLabel>
                <MobileLabel>Active Work</MobileLabel>
                <DesktopLabel>Organizations With Active Projects</DesktopLabel>
              </StatLabel>
            </StatCopy>
          </StatCardLink>
        </StatsRow>

        <DesktopPanel>
          <TableHeader>
            <span>Organization</span>
            <span>Liaisons</span>
            <span>Projects</span>
            <span>Last Activity</span>
            <span>Pending</span>
          </TableHeader>
          <TableBody>
            {paginatedClients.length ? (
              paginatedClients.map((client) => {
                const liaisonCluster = getClusterItems(client.members.map((member) => member.name));

                return (
                  <DesktopRow key={client.id} href={`/clients/${client.id}`}>
                    <ClientCell>
                      <ClientMark>{getClientOrganizationMark(client.name)}</ClientMark>
                      <ClientCopy>
                        <ClientName>{client.name}</ClientName>
                        <InlinePills>
                          <TypePill $type={client.type}>
                            {client.type === "internal" ? "Internal" : "External"}
                          </TypePill>
                          {getClientOrganizationStatusLabel(client) ? (
                            <PendingPill $active={client.status === "active"}>
                              {getClientOrganizationStatusLabel(client)}
                            </PendingPill>
                          ) : null}
                        </InlinePills>
                      </ClientCopy>
                    </ClientCell>
                    <MetaColumn>
                      {client.memberCount ? (
                        <ClientCopy>
                          <ClusterWrap aria-label={`${client.memberCount} liaisons`}>
                            {liaisonCluster.visibleLabels.map((memberName, index) => (
                              <ClusterBubble
                                key={`${client.id}:${memberName}:${index}`}
                                $index={index}
                                title={memberName}
                              >
                                {getClusterMark(memberName)}
                              </ClusterBubble>
                            ))}
                            {liaisonCluster.overflowCount > 0 ? (
                              <ClusterBubble
                                $index={liaisonCluster.visibleLabels.length}
                                $tone="accent"
                                title={`${liaisonCluster.overflowCount} more liaisons`}
                              >
                                +{liaisonCluster.overflowCount}
                              </ClusterBubble>
                            ) : null}
                          </ClusterWrap>
                          <ClientMeta>
                            {client.memberCount === 1 ? "1 liaison" : `${client.memberCount} liaisons`}
                          </ClientMeta>
                        </ClientCopy>
                      ) : (
                        <ClientMeta>No liaisons</ClientMeta>
                      )}
                    </MetaColumn>
                    <CountCell>{client.projectCount}</CountCell>
                    <MetaColumn>
                      <DatePill>{formatDate(client.lastActivityDate)}</DatePill>
                    </MetaColumn>
                    <MetaColumn>
                      <PendingPill $active={client.pendingCount > 0}>
                        {client.pendingCount ? `${client.pendingCount} pending` : "Clear"}
                      </PendingPill>
                    </MetaColumn>
                  </DesktopRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No client organizations found</strong>
                <p>Try another search term or adjust the selected filter.</p>
              </EmptyState>
            )}
          </TableBody>
          <TableFooter>
            <span>
              Showing {rangeStart} to {rangeEnd} of {filteredClients.length} organizations
            </span>
            <Pagination>
              <PageButton
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Last
              </PageButton>
              <PageButton $active type="button">{currentPage}</PageButton>
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

        <MobileList>
          {mobileClients.length ? (
            mobileClients.map((client) => (
                <MobileCard key={client.id} href={`/clients/${client.id}`}>
                  <MobileTop>
                    <ClientMark>{getClientOrganizationMark(client.name)}</ClientMark>
                    <ClientCopy>
                      <ClientName>{client.name}</ClientName>
                      <MobileSummaryRow>
                        <TypePill $type={client.type}>
                          {client.type === "internal" ? "Internal" : "External"}
                        </TypePill>
                        <ClientMeta>
                          {client.memberCount === 0
                            ? "No liaisons"
                            : client.memberCount === 1
                              ? "1 liaison"
                              : `${client.memberCount} liaisons`}
                        </ClientMeta>
                        <ClientMeta>{client.projectCount} projects</ClientMeta>
                      </MobileSummaryRow>
                    </ClientCopy>
                  </MobileTop>
                </MobileCard>
            ))
          ) : (
            <EmptyState>
              <strong>No client organizations found</strong>
              <p>Try another search term or adjust the selected filter.</p>
            </EmptyState>
          )}
          {hasMoreMobileClients ? <LoadMoreSentinel ref={mobileLoadMoreRef} aria-hidden="true" /> : null}
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

const ToolbarActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;

  ${desktop} {
    display: flex;
    width: auto;
    flex-wrap: wrap;
    margin: auto;
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

const FilterMenuWrap = styled.div`
  display: flex;
  gap: 10px;
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

const InviteButton = styled.button`
  width: 100%;
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

  @media (max-width: 768px){
  min-height: 40px;
  font-size: 0.8rem;
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
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;

  @media (max-width: 768px){
  min-height: 40px;
  font-size: 0.8rem;
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

const StatCardLink = styled(StatCard).attrs({ as: Link })`
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(214, 206, 193, 0.95);
    box-shadow: 0 16px 30px rgba(31, 31, 31, 0.08);
    background: rgba(252, 249, 244, 0.98);
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

const DesktopPanel = styled.section`
  ${cardSurface}
  display: none;
  border-radius: 22px;
  overflow: hidden;

  ${desktop} {
    display: block;
  }
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

  span:first-child {
    flex: 1.4;
  }

  span:nth-child(2) {
    flex: 1;
  }

  span:nth-child(3) {
    flex: 0 0 110px;
    text-align: center;
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

const DesktopRow = styled(Link)`
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  cursor: pointer;
  text-decoration: none;
  transition: background 160ms ease, box-shadow 160ms ease;

  &:hover {
    background: rgba(244, 239, 232, 0.72);
  }
`;

const ClientCell = styled.div`
  flex: 1.4;
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
  flex: 0 0 110px;
  color: var(--color-text);
  font-size: 1.25rem;
  font-weight: 700;
  text-align: center;
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
  background: ${({ $active }) => ($active ? "#ffe7e5" : "#e5f4e8")};
  color: ${({ $active }) => ($active ? "#e06457" : "#5ca16d")};
`;

const TypePill = styled(Pill)<{ $type: "internal" | "external" }>`
  background: ${({ $type }) => ($type === "internal" ? "#e6efff" : "#f4f1ed")};
  color: ${({ $type }) => ($type === "internal" ? "#4770d8" : "#7f7468")};
`;

const ClusterWrap = styled.div`
  display: flex;
  align-items: center;
  min-height: 24px;
  padding-right: 6px;

  ${desktop} {
    min-height: 30px;
    padding-right: 8px;
  }
`;

const ClusterBubble = styled.span<{ $index: number; $tone?: "default" | "accent" }>`
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

const LoadMoreSentinel = styled.div`
  height: 1px;
`;

const MobileCard = styled(Link)`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  padding: 12px;
  border-radius: 18px;
  text-decoration: none;
`;

const MobileTop = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const MobileSummaryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.96rem;
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const FloatingField = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);

  span {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    font-size: 0.92rem;
    pointer-events: none;
    transition: all 140ms ease;
    background: transparent;
    padding: 0 4px;
  }

  &.is-filled span,
  &:focus-within span {
    top: 0;
    transform: translateY(-50%);
    font-size: 0.74rem;
    color: #335c4f;
    background: rgba(252, 249, 244, 0.96);
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

const TextInput = styled.input`
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text);
  outline: none;

  &:disabled {
    background: rgba(244, 241, 237, 0.92);
    color: var(--color-text-muted);
    cursor: not-allowed;
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

const ActionIcon = styled.span`
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

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

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

function IconComment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 17.5 3.5 20V6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 17H6z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 19 6v5.5c0 4.4-2.7 7.8-7 9-4.3-1.2-7-4.6-7-9V6z" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M7 12h10M10 17h4" />
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
