"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/components/app-state";
import { formatRole } from "@/lib/display";
import { canCreateClient } from "@/lib/permissions";

type ClientFilter = "all" | "active" | "feedback" | "approvals" | "inactive";
type ClientStatus = "active" | "waiting_feedback" | "approval_needed" | "onboarding" | "inactive";

type ClientRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  projectCount: number;
  status: ClientStatus;
  lastActivityDate: string | null;
  lastActivityLabel: string;
  pendingItems: string;
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

function getClientStatus(projects: Array<{ status: string; feedbackCount: number }>): ClientStatus {
  if (!projects.length) {
    return "inactive";
  }

  if (projects.some((project) => project.status === "revision")) {
    return "approval_needed";
  }

  if (projects.some((project) => project.status === "review")) {
    return "waiting_feedback";
  }

  if (projects.every((project) => project.status === "done")) {
    return "inactive";
  }

  if (projects.length <= 1) {
    return "onboarding";
  }

  return "active";
}

function getStatusTone(status: ClientStatus) {
  switch (status) {
    case "active":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Active" };
    case "waiting_feedback":
      return { bg: "#fff1da", fg: "#ca8a22", label: "Waiting Feedback" };
    case "approval_needed":
      return { bg: "#ffe7e5", fg: "#e06457", label: "Approval Needed" };
    case "onboarding":
      return { bg: "#e9ecff", fg: "#6d7fe2", label: "Onboarding" };
    default:
      return { bg: "#f4f1ed", fg: "#8d857b", label: "Inactive" };
  }
}

function getFeedbackTone(action: "approve" | "request_revision" | "comment") {
  switch (action) {
    case "approve":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Positive" };
    case "request_revision":
      return { bg: "#ffe7e5", fg: "#e06457", label: "Negative" };
    default:
      return { bg: "#fff1da", fg: "#ca8a22", label: "Neutral" };
  }
}

export function ClientsScreen() {
  const { state, user } = useAppState();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");

  if (!user) {
    return null;
  }

  const roleLabel = formatRole(user.role).toUpperCase();
  const canManage = canCreateClient(user.role);

  const clients = useMemo<ClientRow[]>(() => {
    return state.users
      .filter((member) => member.role === "client")
      .map((client) => {
        const clientProjects = state.projects.filter((project) => project.clientId === client.id);
        const status = getClientStatus(
          clientProjects.map((project) => ({
            status: project.status,
            feedbackCount: project.feedback.length,
          })),
        );

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

        const pendingApprovals = clientProjects.filter((project) => project.status === "revision").length;
        const pendingFeedback = clientProjects.filter((project) => project.status === "review").length;

        return {
          id: client.id,
          name: client.company ?? client.name,
          email: client.email,
          company: client.company ?? "Client account",
          projectCount: clientProjects.length,
          status,
          lastActivityDate: latestFeedback[0]?.createdAt ?? latestProject?.dueDate ?? null,
          lastActivityLabel:
            latestFeedback[0]?.action === "approve"
              ? "Logo concepts approved"
              : latestFeedback[0]?.action === "request_revision"
                ? "Feedback requested"
                : latestProject
                  ? `${latestProject.name} updated`
                  : "No recent activity",
          pendingItems:
            pendingApprovals > 0
              ? `${pendingApprovals} approval${pendingApprovals > 1 ? "s" : ""}`
              : pendingFeedback > 0
                ? `${pendingFeedback} feedback`
                : "—",
          latestFeedback,
        };
      });
  }, [state.projects, state.users]);

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
            ? client.status === "waiting_feedback"
            : filter === "approvals"
              ? client.status === "approval_needed"
              : client.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [clients, filter, search]);

  const activeCount = clients.filter((client) => client.status === "active").length;
  const pendingFeedbackCount = clients.filter((client) => client.status === "waiting_feedback").length;
  const approvalsCount = clients.filter((client) => client.status === "approval_needed").length;
  const newCount = clients.filter((client) => client.status === "onboarding").length;

  const recentFeedback = filteredClients
    .flatMap((client) =>
      client.latestFeedback.map((feedback) => ({
        ...feedback,
        clientName: client.name,
      })),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const activityRows = filteredClients.slice(0, 4);

  return (
    <Shell>
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
          <SearchWrap>
            <SearchIcon>
              <IconSearch />
            </SearchIcon>
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients, companies, or contacts..."
            />
          </SearchWrap>

          {canManage ? (
            <InviteButton type="button">
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
              <StatValue>{activeCount}</StatValue>
              <StatLabel>Active Clients</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="gold">
              <IconComment />
            </StatIcon>
            <StatCopy>
              <StatValue>{pendingFeedbackCount}</StatValue>
              <StatLabel>Pending</StatLabel>
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
              <StatValue>{newCount}</StatValue>
              <StatLabel>New</StatLabel>
            </StatCopy>
          </StatCard>
        </StatsRow>

        <FilterBar>
          <FilterScroll>
            {filterOptions.map((option) => (
              <FilterChip
                key={option.key}
                type="button"
                $active={filter === option.key}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </FilterChip>
            ))}
          </FilterScroll>

          <DesktopControls>
            <GhostButton type="button">
              <ActionIcon>
                <IconFilter />
              </ActionIcon>
              <span>Filter</span>
            </GhostButton>
            <SortBadge>Sort: Last activity</SortBadge>
          </DesktopControls>
        </FilterBar>

        <DesktopPanel>
          <TableHeader>
            <span>Client</span>
            <span>Company</span>
            <span>Active Projects</span>
            <span>Main Contact</span>
            <span>Status</span>
            <span>Last Activity</span>
            <span>Pending Items</span>
            <span />
          </TableHeader>

          <TableBody>
            {filteredClients.length ? (
              filteredClients.map((client) => {
                const tone = getStatusTone(client.status);
                return (
                  <DesktopRow key={client.id}>
                    <ClientCell>
                      <ClientMark>{getProjectMark(client.name)}</ClientMark>
                      <ClientCopy>
                        <ClientName>{client.name}</ClientName>
                        <ClientMeta>{client.company}</ClientMeta>
                      </ClientCopy>
                    </ClientCell>
                    <MetaColumn>
                      <ClientMeta>{client.company}</ClientMeta>
                      <ClientMeta>{client.email}</ClientMeta>
                    </MetaColumn>
                    <CountCell>{client.projectCount}</CountCell>
                    <MetaColumn>
                      <ContactAvatar>{client.name.slice(0, 1)}</ContactAvatar>
                      <div>
                        <ClientMeta>{client.name}</ClientMeta>
                        <ClientMeta>{client.email}</ClientMeta>
                      </div>
                    </MetaColumn>
                    <Pill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</Pill>
                    <MetaColumn>
                      <ClientMeta>{formatDate(client.lastActivityDate)}</ClientMeta>
                      <ClientMeta>{client.lastActivityLabel}</ClientMeta>
                    </MetaColumn>
                    <PendingText>{client.pendingItems}</PendingText>
                    <MoreButton>...</MoreButton>
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
        </DesktopPanel>

        <MobileList>
          {filteredClients.length ? (
            filteredClients.map((client) => {
              const tone = getStatusTone(client.status);
              return (
                <MobileCard key={client.id}>
                  <MobileTop>
                    <ClientMark>{getProjectMark(client.name)}</ClientMark>
                    <ClientCopy>
                      <ClientName>{client.name}</ClientName>
                      <ClientMeta>{client.email}</ClientMeta>
                      <ClientMeta>{client.projectCount} projects</ClientMeta>
                    </ClientCopy>
                    <Pill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</Pill>
                  </MobileTop>
                  <MobileBottom>
                    <ClientMeta>{formatShortDate(client.lastActivityDate)}</ClientMeta>
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

        <MobileFeedbackPanel>
          <PanelHeader>
            <PanelTitle>Recent Feedback</PanelTitle>
            <PanelLink href="/projects">View all</PanelLink>
          </PanelHeader>
          <FeedbackList>
            {recentFeedback.length ? (
              recentFeedback.slice(0, 1).map((feedback) => {
                const tone = getFeedbackTone(feedback.action);
                return (
                  <FeedbackRow key={feedback.id}>
                    <ClientMark>{getProjectMark(feedback.clientName)}</ClientMark>
                    <FeedbackCopy>
                      <FeedbackBody>{feedback.body}</FeedbackBody>
                      <ClientMeta>{formatShortDate(feedback.createdAt)}</ClientMeta>
                    </FeedbackCopy>
                    <Pill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</Pill>
                  </FeedbackRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No feedback yet</strong>
                <p>Recent client feedback will appear here.</p>
              </EmptyState>
            )}
          </FeedbackList>
        </MobileFeedbackPanel>

        <DesktopBottom>
          <Panel>
            <PanelHeader>
              <PanelTitle>Recent Client Feedback</PanelTitle>
              <PanelLink href="/projects">View all</PanelLink>
            </PanelHeader>
            <FeedbackList>
              {recentFeedback.length ? (
                recentFeedback.map((feedback) => {
                  const tone = getFeedbackTone(feedback.action);
                  return (
                    <FeedbackRow key={feedback.id}>
                      <ClientMark>{getProjectMark(feedback.clientName)}</ClientMark>
                      <FeedbackCopy>
                        <FeedbackBody>{feedback.body}</FeedbackBody>
                        <ClientMeta>{feedback.clientName}</ClientMeta>
                        <ClientMeta>{formatShortDate(feedback.createdAt)}</ClientMeta>
                      </FeedbackCopy>
                      <Pill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</Pill>
                    </FeedbackRow>
                  );
                })
              ) : (
                <EmptyState>
                  <strong>No feedback yet</strong>
                  <p>Recent client feedback will appear here.</p>
                </EmptyState>
              )}
            </FeedbackList>
            <FooterLink href="/projects">
              <span>View all feedback</span>
              <IconArrowRight />
            </FooterLink>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>Client Activity</PanelTitle>
              <PanelLink href="/projects">View all</PanelLink>
            </PanelHeader>
            <ActivityList>
              {activityRows.length ? (
                activityRows.map((client) => (
                  <ActivityRow key={client.id}>
                    <ContactAvatar>{client.name.slice(0, 1)}</ContactAvatar>
                    <FeedbackCopy>
                      <FeedbackBody>{client.name} reviewed recent work</FeedbackBody>
                      <ClientMeta>{client.lastActivityLabel}</ClientMeta>
                    </FeedbackCopy>
                    <ClientMeta>{formatDate(client.lastActivityDate)}</ClientMeta>
                  </ActivityRow>
                ))
              ) : (
                <EmptyState>
                  <strong>No client activity</strong>
                  <p>Client actions will appear here as feedback comes in.</p>
                </EmptyState>
              )}
            </ActivityList>
          </Panel>

          {canManage ? (
            <QuickActions>
              <PanelTitle>Quick Actions</PanelTitle>
              <QuickButton href="/team" $primary>
                <ActionIcon>
                  <IconPlus />
                </ActionIcon>
                <span>Invite Client</span>
              </QuickButton>
              <QuickButton href="/team">
                <ActionIcon>
                  <IconUser />
                </ActionIcon>
                <span>Add Contact</span>
              </QuickButton>
              <QuickButton href="/projects">
                <ActionIcon>
                  <IconUpload />
                </ActionIcon>
                <span>Upload File</span>
              </QuickButton>
              <QuickButton href="/projects/new">
                <ActionIcon>
                  <IconFolder />
                </ActionIcon>
                <span>Create Project</span>
              </QuickButton>
            </QuickActions>
          ) : null}
        </DesktopBottom>
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
  font-size: clamp(1.7rem, 4vw, 2.5rem);
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

const SearchWrap = styled.div`
  position: relative;

  ${desktop} {
    flex: 1;
  }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 18px;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translateY(-50%);
  color: var(--color-text-light);

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  min-height: 56px;
  padding: 0 18px 0 46px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
  font-size: 0.94rem;
`;

const InviteButton = styled.button`
  min-height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 20px;
  border: 0;
  border-radius: 16px;
  background: #1f4339;
  color: #fff;
  font-size: 0.95rem;
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

const FilterBar = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${desktop} {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
`;

const FilterScroll = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const FilterChip = styled.button<{ $active: boolean }>`
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? "rgba(24, 62, 51, 0.16)" : "var(--color-border)")};
  background: ${({ $active }) => ($active ? "#203f35" : "rgba(255, 255, 255, 0.92)")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--color-text)")};
  font-size: 0.84rem;
  font-weight: 600;
`;

const DesktopControls = styled.div`
  display: none;

  ${desktop} {
    display: flex;
    align-items: center;
    gap: 12px;
  }
`;

const GhostButton = styled.button`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
`;

const SortBadge = styled.span`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.88rem;
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

  span:last-child {
    flex: 0 0 48px;
  }
`;

const TableBody = styled.div`
  display: flex;
  flex-direction: column;
`;

const DesktopRow = styled.article`
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
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

const ContactAvatar = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
`;

const PendingText = styled.span`
  flex: 0 0 110px;
  color: #e06457;
  font-size: 0.84rem;
  font-weight: 700;
`;

const MoreButton = styled.button`
  width: 40px;
  height: 40px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: #fff;
  color: var(--color-text-muted);
  font-size: 1rem;
  font-weight: 700;
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

const MobileFeedbackPanel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;

  ${desktop} {
    display: none;
  }
`;

const DesktopBottom = styled.section`
  display: none;

  ${desktop} {
    display: flex;
    gap: 16px;
    align-items: stretch;
  }
`;

const Panel = styled.section`
  ${cardSurface}
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 22px;
`;

const QuickActions = styled(Panel)`
  flex: 0 0 280px;
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

const PanelLink = styled(Link)`
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
`;

const FeedbackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FeedbackRow = styled.article`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const FeedbackCopy = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FeedbackBody = styled.p`
  margin: 0;
  color: var(--color-text);
  font-size: 0.88rem;
  line-height: 1.4;
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ActivityRow = styled.article`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const QuickButton = styled(Link)<{ $primary?: boolean }>`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: ${({ $primary }) => ($primary ? "#1f4339" : "#fff")};
  color: ${({ $primary }) => ($primary ? "#fff" : "var(--color-text)")};
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;
`;

const FooterLink = styled(Link)`
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-end;
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 600;
  text-decoration: none;

  svg {
    width: 16px;
    height: 16px;
  }
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

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
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

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 18.5h14" />
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
