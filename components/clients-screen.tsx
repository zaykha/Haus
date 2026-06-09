"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { InviteWorkspaceModal } from "@/components/invite-workspace-modal";
import { useAppState } from "@/components/app-state";
import { formatRole } from "@/lib/display";
import { canCreateClient } from "@/lib/permissions";

type ClientFilter = "all" | "active" | "feedback" | "approvals" | "inactive";
const PAGE_SIZE = 6;

type ClientRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  projectCount: number;
  lastActivityDate: string | null;
  lastActivityLabel: string;
  pendingCount: number;
  pendingProjects: Array<{
    id: string;
    name: string;
    status: "review" | "revision";
    dueDate: string;
  }>;
  latestFeedback: Array<{
    id: string;
    body: string;
    action: "approve" | "request_revision" | "comment";
    createdAt: string;
  }>;
};

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

function formatShortDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getProjectMark(name: string) {
  const words = name.split(" ");
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function ClientsScreen() {
  const { state, user } = useAppState();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);

  if (!user) {
    return null;
  }

  const roleLabel = formatRole(user.role).toUpperCase();
  const canManage = canCreateClient(user.role);

  const clients = useMemo<ClientRow[]>(() => {
    const existingClients = state.users.filter((member) => member.role === "client");
    const knownEmails = new Set(existingClients.map((member) => member.email.toLowerCase()));
    const acceptedInviteClients = state.invitations
      .filter(
        (invitation) =>
          invitation.role === "client" &&
          invitation.status === "accepted" &&
          !knownEmails.has(invitation.email.toLowerCase()),
      )
      .map((invitation) => ({
        id: `accepted-invite:${invitation.id}`,
        name: invitation.name,
        email: invitation.email,
        role: invitation.role,
        company: "Client account",
      }));

    return [...existingClients, ...acceptedInviteClients]
      .map((client) => {
        const clientProjects = state.projects.filter((project) => project.clientId === client.id);

        const latestProject = [...clientProjects].sort(
          (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
        )[0];

        const latestFeedback = clientProjects
          .flatMap((project) =>
            project.feedback.map((feedback) => ({
              id: feedback.id,
              body: feedback.body,
              action: feedback.action,
              createdAt: feedback.createdAt,
            })),
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const pendingProjects = clientProjects
          .filter(
            (project): project is typeof project & { status: "review" | "revision" } =>
              project.status === "review" || project.status === "revision",
          )
          .map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
            dueDate: project.dueDate,
          }));

        return {
          id: client.id,
          name: client.name,
          email: client.email,
          company: client.company ?? "Client account",
          projectCount: clientProjects.length,
          lastActivityDate: latestFeedback[0]?.createdAt ?? latestProject?.dueDate ?? null,
          lastActivityLabel:
            latestFeedback[0]?.action === "approve"
              ? "Logo concepts approved"
              : latestFeedback[0]?.action === "request_revision"
                ? "Feedback requested"
              : latestProject
                  ? `${latestProject.name} updated`
                  : "No recent activity",
          pendingCount: pendingProjects.length,
          pendingProjects,
          latestFeedback,
        };
      });
  }, [state.invitations, state.projects, state.users]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesSearch =
        !q ||
        client.name.toLowerCase().includes(q) ||
        client.company.toLowerCase().includes(q) ||
        client.email.toLowerCase().includes(q);

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "feedback"
            ? client.pendingProjects.some((project) => project.status === "review")
          : filter === "approvals"
              ? client.pendingProjects.some((project) => project.status === "revision")
              : filter === "active"
                ? client.projectCount > 0 && client.pendingCount === 0
                : client.projectCount === 0;

      return matchesSearch && matchesFilter;
    });
  }, [clients, filter, search]);

  const totalCount = clients.length;
  const activeCount = clients.filter((client) => client.projectCount > 0 && client.pendingCount === 0).length;
  const pendingFeedbackCount = clients.filter((client) =>
    client.pendingProjects.some((project) => project.status === "review"),
  ).length;
  const approvalsCount = clients.filter((client) =>
    client.pendingProjects.some((project) => project.status === "revision"),
  ).length;

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const rangeStart = filteredClients.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredClients.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <Shell>
      {selectedClient ? (
        <ClientDetailsOverlay onClick={() => setSelectedClient(null)}>
          <ClientDetailsCard onClick={(event) => event.stopPropagation()}>
            <DialogHeader>
              <div>
                <PanelTitle>{selectedClient.company}</PanelTitle>
                <ClientMeta>
                  {selectedClient.name} · {selectedClient.email}
                </ClientMeta>
              </div>
              <DialogHeaderActions>
                <DatePill>{formatDate(selectedClient.lastActivityDate)}</DatePill>
                <DialogCloseButton type="button" onClick={() => setSelectedClient(null)}>
                  Close
                </DialogCloseButton>
              </DialogHeaderActions>
            </DialogHeader>
            <DialogSection>
              <DialogLabel>Pending items</DialogLabel>
              {selectedClient.pendingProjects.length ? (
                <DialogList>
                  {selectedClient.pendingProjects.map((project) => (
                    <DialogRow key={project.id}>
                      <div>
                        <DialogProjectName>{project.name}</DialogProjectName>
                        <ClientMeta>
                          {project.status === "revision" ? "Approval needed" : "Waiting feedback"} ·{" "}
                          {formatShortDate(project.dueDate)}
                        </ClientMeta>
                      </div>
                      <DialogLink href={`/projects/${project.id}`}>Open project</DialogLink>
                    </DialogRow>
                  ))}
                </DialogList>
              ) : (
                <ClientMeta>No pending items for this client.</ClientMeta>
              )}
            </DialogSection>
          </ClientDetailsCard>
        </ClientDetailsOverlay>
      ) : null}
      <InviteWorkspaceModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        variant="client"
      />
      <AppSidebar user={user} activeLabel="Clients" />

      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <Title>Clients</Title>
            <Subtitle>
              Manage client accounts, track project relationships, monitor approvals, and review
              client activity.
            </Subtitle>
          </div>
          <BellButton type="button" aria-label="Notifications">
            <IconBell />
            <BellBadge>3</BellBadge>
          </BellButton>
        </Header>

        <Toolbar>
          <SearchControls onSubmit={handleSearchSubmit}>
            <SearchWrap>
              <SearchInput
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search clients, companies, or contacts..."
              />
            </SearchWrap>
            <FilterMenuWrap>
              <FilterButton
                type="button"
                aria-label="Open filters"
                aria-expanded={showFilters}
                onClick={() => setShowFilters((current) => !current)}
              >
                <ActionIcon>
                  <IconFilter />
                </ActionIcon>
              </FilterButton>
              {showFilters ? (
                <FilterPopup>
                  <FilterPopupTitle>Filter clients</FilterPopupTitle>
                  <FilterSelect
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as ClientFilter)}
                  >
                    {filterOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </FilterSelect>
                </FilterPopup>
              ) : null}
            </FilterMenuWrap>
            <SearchButton type="submit" aria-label="Search clients">
              <ActionIcon>
                <IconSearch />
              </ActionIcon>
            </SearchButton>
          </SearchControls>

          {canManage ? (
            <InviteButton type="button" onClick={() => setShowInviteModal(true)}>
              <ActionIcon>
                <IconPlus />
              </ActionIcon>
              <span>Invite Client</span>
            </InviteButton>
          ) : null}
        </Toolbar>

        <StatsRow>
          <StatCard>
            <StatIcon $tone="green">
              <IconUsers />
            </StatIcon>
            <StatCopy>
              <StatValue>{totalCount}</StatValue>
              <StatLabel>Total Clients</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="gold">
              <IconComment />
            </StatIcon>
            <StatCopy>
              <StatValue>{pendingFeedbackCount}</StatValue>
              <StatLabel>Awaiting Feedback</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="red">
              <IconShield />
            </StatIcon>
            <StatCopy>
              <StatValue>{approvalsCount}</StatValue>
              <StatLabel>Approvals</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="mint">
              <IconSpark />
            </StatIcon>
            <StatCopy>
              <StatValue>{activeCount}</StatValue>
              <StatLabel>Active Clients</StatLabel>
            </StatCopy>
          </StatCard>
        </StatsRow>

        <DesktopPanel>
          <TableHeader>
            <span>Client</span>
            <span>Projects</span>
            <span>Last Activity</span>
            <span>Pending</span>
          </TableHeader>

          <TableBody>
            {paginatedClients.length ? (
              paginatedClients.map((client) => {
                return (
                  <DesktopRow key={client.id} onClick={() => setSelectedClient(client)}>
                    <ClientCell>
                      <ClientMark>{getProjectMark(client.company)}</ClientMark>
                      <ClientCopy>
                        <ClientMeta>{client.company}</ClientMeta>
                        <ClientName>{client.name}</ClientName>
                        <ClientMeta>{client.email}</ClientMeta>
                      </ClientCopy>
                    </ClientCell>
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
                <strong>No clients found</strong>
                <p>Try another search term or adjust the selected filter.</p>
              </EmptyState>
            )}
          </TableBody>
          <TableFooter>
            <span>
              Showing {rangeStart} to {rangeEnd} of {filteredClients.length} clients
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

        <MobileList>
          {paginatedClients.length ? (
            paginatedClients.map((client) => {
              return (
                <MobileCard key={client.id} onClick={() => setSelectedClient(client)}>
                  <MobileTop>
                    <ClientMark>{getProjectMark(client.company)}</ClientMark>
                    <ClientCopy>
                      <ClientMeta>{client.company}</ClientMeta>
                      <ClientName>{client.name}</ClientName>
                      <ClientMeta>{client.email}</ClientMeta>
                      <ClientMeta>{client.projectCount} projects</ClientMeta>
                    </ClientCopy>
                    <PendingPill $active={client.pendingCount > 0}>
                      {client.pendingCount ? `${client.pendingCount} pending` : "Clear"}
                    </PendingPill>
                  </MobileTop>
                  <MobileBottom>
                    <DatePill>{formatShortDate(client.lastActivityDate)}</DatePill>
                    <ClientMeta>{client.lastActivityLabel}</ClientMeta>
                    <ArrowWrap>
                      <IconArrowRight />
                    </ArrowWrap>
                  </MobileBottom>
                </MobileCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No clients found</strong>
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

  ${desktop} {
    font-size: 0.86rem;
  }
`;

const BellButton = styled.button`
  position: relative;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-text-muted);

  svg {
    width: 20px;
    height: 20px;
  }
`;

const BellBadge = styled.span`
  position: absolute;
  right: -2px;
  top: -2px;
  min-width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: #7d2f2a;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
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

  ${desktop} {
    min-width: 0;
  }
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
  position: relative;
`;

const FilterButton = styled.button`
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

const SearchButton = styled(FilterButton)`
  background: #1f4339;
  color: #fff;
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

const FilterSelect = styled.select`
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text);
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

const StatsRow = styled.section`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  ${desktop} {
    overflow: visible;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    flex-direction: row;
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

  &:disabled {
    opacity: 0.45;
  }
`;

const DesktopRow = styled.article`
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  cursor: pointer;
`;

const ClientCell = styled.div`
  flex: 1.4;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ClientCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const ClientName = styled.strong`
  font-size: 0.96rem;
`;

const ClientMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.4;
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

const MobileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${desktop} {
    display: none;
  }
`;

const MobileCard = styled.article`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
  cursor: pointer;
`;

const MobileTop = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const MobileBottom = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const ClientMark = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 1rem;
  font-weight: 700;
  flex: 0 0 48px;
`;

const ArrowWrap = styled.span`
  width: 18px;
  height: 18px;
  color: var(--color-text-muted);

  svg {
    width: 100%;
    height: 100%;
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.96rem;
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

const DatePill = styled(Pill)`
  background: rgba(244, 241, 237, 0.9);
  color: var(--color-text);
`;

const PendingPill = styled(Pill)<{ $active?: boolean }>`
  background: ${({ $active }) => ($active ? "#ffe7e5" : "#e5f4e8")};
  color: ${({ $active }) => ($active ? "#e06457" : "#5ca16d")};
`;

const ClientDetailsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(21, 18, 13, 0.4);
`;

const ClientDetailsCard = styled.div`
  ${cardSurface}
  width: min(540px, calc(100vw - 32px));
  border-radius: 24px;
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 0;
`;

const DialogHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const DialogSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
`;

const DialogLabel = styled.strong`
  font-size: 0.9rem;
  color: var(--color-text);
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

const DialogProjectName = styled.strong`
  display: block;
  margin-bottom: 4px;
  font-size: 0.9rem;
`;

const DialogLink = styled(Link)`
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
`;

const DialogCloseButton = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: #fff;
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 700;
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

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 16.5h11l-1.4-1.6V11a4.1 4.1 0 1 0-8.2 0v3.9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
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

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5h6l2-2H20a1 1 0 0 1 1 1v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7.5A2.5 2.5 0 0 1 8.5 5h7A2.5 2.5 0 0 1 18 7.5v5A2.5 2.5 0 0 1 15.5 15H11l-4 3v-3H8.5A2.5 2.5 0 0 1 6 12.5z" />
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

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
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

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
