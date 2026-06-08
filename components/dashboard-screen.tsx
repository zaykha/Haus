"use client";

import Link from "next/link";
import { useMemo } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { canManageWorkspace, canViewProject } from "@/lib/permissions";
import { formatProjectStage, formatRole, getProjectStatusLabel } from "@/lib/display";
import { FeedbackAction, Project, ProjectStatus } from "@/lib/types";

type EnrichedTask = {
  id: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  projectDueDate: string;
};

type FeedbackRow = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  body: string;
  action: FeedbackAction;
  createdAt: string;
};

type ActivityRow = {
  id: string;
  actor: string;
  detail: string;
  projectName: string;
  createdAt: string;
};

const desktop = "@media (min-width: 768px)";

const sideNavItems = [
  { label: "Home", href: "/dashboard", icon: <IconHome /> },
  { label: "Projects", href: "/projects", icon: <IconFolder /> },
  { label: "Tasks", href: "/tasks", icon: <IconCheckCircle /> },
  { label: "Clients", icon: <IconUser /> },
  { label: "Team", href: "/team", icon: <IconUsers /> },
  { label: "Calendar", icon: <IconCalendar /> },
  { label: "Reports", icon: <IconChart /> },
  { label: "Files", icon: <IconFile /> },
] as const;

function formatDueDate(value: string) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getClientName(project: Project, userNames: Map<string, string>) {
  return userNames.get(project.clientId) ?? "Unassigned client";
}

function getProjectMark(project: Project) {
  const words = project.name.split(" ");
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function getProjectProgress(project: Project) {
  if (project.status === "done") {
    return 100;
  }

  const stageWeight = {
    intake: 20,
    concept: 35,
    design: 55,
    review: 75,
    delivery: 90,
  }[project.stage];

  if (!project.tasks.length) {
    return stageWeight;
  }

  const doneTasks = project.tasks.filter((task) => task.status === "done").length;
  const ratio = Math.round((doneTasks / project.tasks.length) * 100);
  return Math.max(stageWeight, ratio);
}

function getStatusTone(status: ProjectStatus) {
  switch (status) {
    case "active":
      return { bg: "var(--color-info-soft)", fg: "var(--color-info)" };
    case "review":
      return { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" };
    case "revision":
      return { bg: "var(--color-danger-soft)", fg: "var(--color-danger)" };
    case "done":
      return { bg: "var(--color-primary-soft)", fg: "var(--color-primary)" };
    default:
      return { bg: "var(--color-surface-soft)", fg: "var(--color-text-muted)" };
  }
}

function getFeedbackTone(action: FeedbackAction) {
  switch (action) {
    case "approve":
      return { label: "Positive", bg: "var(--color-success-soft)", fg: "var(--color-success)" };
    case "request_revision":
      return { label: "Revision", bg: "var(--color-danger-soft)", fg: "var(--color-danger)" };
    default:
      return { label: "Feedback", bg: "var(--color-warning-soft)", fg: "var(--color-warning)" };
  }
}

export function DashboardScreen() {
  const { state, user } = useAppState();

  if (!user) {
    return null;
  }

  const visibleProjects = state.projects.filter((project) => canViewProject(user, project));
  const userNames = new Map(state.users.map((member) => [member.id, member.name]));
  const firstName = user.name.split(" ")[0] ?? user.name;
  const roleLabel = formatRole(user.role).toUpperCase();
  const canManage = canManageWorkspace(user.role);

  const projectRows = useMemo(
    () =>
      [...visibleProjects]
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .map((project) => ({
          ...project,
          progress: getProjectProgress(project),
          clientName: getClientName(project, userNames),
        })),
    [userNames, visibleProjects],
  );

  const openTasks = useMemo<EnrichedTask[]>(
    () =>
      projectRows.flatMap((project) =>
        project.tasks
          .filter((task) => task.status !== "done")
          .map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            projectId: project.id,
            projectName: project.name,
            projectDueDate: project.dueDate,
          })),
      ),
    [projectRows],
  );

  const feedbackRows = useMemo<FeedbackRow[]>(
    () =>
      projectRows
        .flatMap((project) =>
          project.feedback.map((feedback) => ({
            id: feedback.id,
            projectId: project.id,
            projectName: project.name,
            clientName: getClientName(project, userNames),
            body: feedback.body,
            action: feedback.action,
            createdAt: feedback.createdAt,
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projectRows, userNames],
  );

  const activityRows = useMemo<ActivityRow[]>(
    () =>
      projectRows
        .flatMap((project) => [
          ...project.files.map((file) => ({
            id: file.id,
            actor: userNames.get(file.uploadedBy) ?? "Team member",
            detail: `uploaded ${file.title}`,
            projectName: project.name,
            createdAt: file.createdAt,
          })),
          ...project.comments.map((comment) => ({
            id: comment.id,
            actor: userNames.get(comment.authorId) ?? "Team member",
            detail: "added a comment",
            projectName: project.name,
            createdAt: comment.createdAt,
          })),
          ...project.feedback.map((feedback) => ({
            id: `feedback-${feedback.id}`,
            actor: userNames.get(feedback.authorId) ?? getClientName(project, userNames),
            detail:
              feedback.action === "approve"
                ? "approved a deliverable"
                : feedback.action === "request_revision"
                  ? "requested a revision"
                  : "left feedback",
            projectName: project.name,
            createdAt: feedback.createdAt,
          })),
        ])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projectRows, userNames],
  );

  const activeProjectsCount = projectRows.filter((project) => project.status !== "done").length;
  const dueSoonTasksCount = openTasks.length;
  const feedbackCount = projectRows.filter((project) => project.status === "review").length;
  const completedCount = projectRows.filter((project) => project.status === "done").length;

  const priorityProjects = projectRows.slice(0, 3);
  const myTasks = openTasks.slice(0, 5);
  const recentFeedback = feedbackRows.slice(0, 3);
  const recentActivity = activityRows.slice(0, 4);

  const completedProjects = projectRows.filter((project) => project.status === "done").length;
  const inProgressProjects = projectRows.filter(
    (project) => project.status === "active" || project.status === "revision",
  ).length;
  const reviewProjects = projectRows.filter((project) => project.status === "review").length;
  const holdProjects = Math.max(
    0,
    projectRows.length - completedProjects - inProgressProjects - reviewProjects,
  );

  const totalProjects = Math.max(projectRows.length, 1);
  const completedPct = Math.round((completedProjects / totalProjects) * 100);
  const inProgressPct = Math.round((inProgressProjects / totalProjects) * 100);
  const reviewPct = Math.round((reviewProjects / totalProjects) * 100);
  const holdPct = Math.max(0, 100 - completedPct - inProgressPct - reviewPct);

  const donut = `conic-gradient(
    #5ca16d 0 ${completedPct}%,
    #1f4339 ${completedPct}% ${completedPct + inProgressPct}%,
    #d69b47 ${completedPct + inProgressPct}% ${completedPct + inProgressPct + reviewPct}%,
    #d3ccc1 ${completedPct + inProgressPct + reviewPct}% 100%
  )`;

  return (
    <Shell>
      <AppSidebar user={user} activeLabel="Home" />

      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <Title>Welcome back, {firstName}</Title>
            <Subtitle>Track projects, team activity, feedback, and upcoming deadlines.</Subtitle>
          </div>
          <HeaderUser>
            <HeaderAvatar>{user.name.slice(0, 1)}</HeaderAvatar>
            <div>
              <HeaderUserName>{user.name}</HeaderUserName>
              <HeaderUserRole>{formatRole(user.role)}</HeaderUserRole>
            </div>
          </HeaderUser>
        </Header>

        <StatsGrid>
          <StatCard>
            <StatCopy>
              <StatLabel>Active Projects</StatLabel>
              <StatValue>{activeProjectsCount}</StatValue>
              <StatNote $tone="positive">
                {projectRows.length ? `+${Math.min(activeProjectsCount, 2)} from last month` : "No active projects yet"}
              </StatNote>
            </StatCopy>
            <StatIcon $tone="dark">
              <IconFolder />
            </StatIcon>
          </StatCard>

          <StatCard>
            <StatCopy>
              <StatLabel>Tasks Due Today</StatLabel>
              <StatValue>{dueSoonTasksCount}</StatValue>
              <StatNote $tone="warning">
                {dueSoonTasksCount ? `${Math.min(dueSoonTasksCount, 2)} overdue` : "Nothing due today"}
              </StatNote>
            </StatCopy>
            <StatIcon $tone="soft-green">
              <IconCheckCircle />
            </StatIcon>
          </StatCard>

          <StatCard>
            <StatCopy>
              <StatLabel>Awaiting Feedback</StatLabel>
              <StatValue>{feedbackCount}</StatValue>
              <StatNote $tone="warning">
                {feedbackCount ? `+${feedbackCount} from last week` : "No feedback waiting"}
              </StatNote>
            </StatCopy>
            <StatIcon $tone="soft-gold">
              <IconComment />
            </StatIcon>
          </StatCard>

          <StatCard>
            <StatCopy>
              <StatLabel>Completed This Month</StatLabel>
              <StatValue>{completedCount}</StatValue>
              <StatNote $tone="positive">
                {completedCount ? `+${completedCount * 10}% from last month` : "No completed work yet"}
              </StatNote>
            </StatCopy>
            <StatIcon $tone="dark">
              <IconFlag />
            </StatIcon>
          </StatCard>
        </StatsGrid>

        <TopGrid>
          <Panel>
            <PanelHeader>
              <PanelTitle>Priority Projects</PanelTitle>
              <PanelLink href="/projects">View all</PanelLink>
            </PanelHeader>

            <ProjectList>
              {priorityProjects.length ? (
                priorityProjects.map((project) => {
                  const tone = getStatusTone(project.status);
                  return (
                    <ProjectRow key={project.id} href={`/projects/${project.id}`}>
                      <ProjectMark>{getProjectMark(project)}</ProjectMark>
                      <ProjectBody>
                        <ProjectTop>
                          <div>
                            <ProjectTitle>{project.name}</ProjectTitle>
                            <ProjectSub>{project.clientName}</ProjectSub>
                          </div>
                          <StatusPill style={{ background: tone.bg, color: tone.fg }}>
                            {getProjectStatusLabel(project.status)}
                          </StatusPill>
                        </ProjectTop>

                        <DesktopProjectMeta>
                          <MetaGroup>
                            <MetaLabel>Status</MetaLabel>
                            <MetaValue>{getProjectStatusLabel(project.status)}</MetaValue>
                          </MetaGroup>
                          <MetaGroup>
                            <MetaLabel>Due date</MetaLabel>
                            <MetaValue>{formatDueDate(project.dueDate)}</MetaValue>
                          </MetaGroup>
                          <MetaGroup>
                            <MetaLabel>Staff</MetaLabel>
                            <AvatarStack>
                              {project.staffIds.slice(0, 3).map((staffId) => (
                                <Avatar key={staffId}>
                                  {(userNames.get(staffId) ?? "?").slice(0, 1)}
                                </Avatar>
                              ))}
                              {project.staffIds.length > 3 ? (
                                <Avatar $muted>+{project.staffIds.length - 3}</Avatar>
                              ) : null}
                            </AvatarStack>
                          </MetaGroup>
                          <MetaGroup>
                            <MetaLabel>Progress</MetaLabel>
                            <MetaValue>{project.progress}%</MetaValue>
                          </MetaGroup>
                        </DesktopProjectMeta>

                        <MobileProjectMeta>
                          <ProjectSub>Due {formatDueDate(project.dueDate)}</ProjectSub>
                        </MobileProjectMeta>

                        <ProjectBottom>
                          <StageName>{formatProjectStage(project.stage)}</StageName>
                          <ProgressRow>
                            <ProgressBar>
                              <ProgressFill style={{ width: `${project.progress}%` }} />
                            </ProgressBar>
                            <ProgressValue>{project.progress}%</ProgressValue>
                          </ProgressRow>
                        </ProjectBottom>
                      </ProjectBody>
                    </ProjectRow>
                  );
                })
              ) : (
                <EmptyBlock>
                  <strong>No priority projects yet</strong>
                  <p>Projects will appear here after a manager creates one.</p>
                </EmptyBlock>
              )}
            </ProjectList>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>{canManage ? "My Tasks" : "Tasks Due Today"}</PanelTitle>
              <PanelLink href="/tasks">View all</PanelLink>
            </PanelHeader>

            <TaskList>
              {myTasks.length ? (
                myTasks.map((task) => (
                  <TaskRow key={task.id} href={`/projects/${task.projectId}`}>
                    <TaskCircle $urgent={task.status === "todo"} />
                    <TaskCopy>
                      <TaskTitle>{task.title}</TaskTitle>
                      <TaskSub>{task.projectName}</TaskSub>
                    </TaskCopy>
                    <TaskDate>{formatShortDate(task.projectDueDate)}</TaskDate>
                  </TaskRow>
                ))
              ) : (
                <EmptyBlock>
                  <strong>No tasks due</strong>
                  <p>Open tasks will appear here once project work is assigned.</p>
                </EmptyBlock>
              )}
            </TaskList>
          </Panel>
        </TopGrid>

        <MobileOnlyPanel>
          <PanelHeader>
            <PanelTitle>Recent Feedback</PanelTitle>
            <PanelLink href="/projects">View all</PanelLink>
          </PanelHeader>
          <FeedbackList>
            {recentFeedback.length ? (
              recentFeedback.slice(0, 1).map((feedback) => {
                const tone = getFeedbackTone(feedback.action);
                return (
                  <FeedbackRowCard key={feedback.id}>
                    <FeedbackAvatar>{feedback.clientName.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                    <FeedbackCopy>
                      <FeedbackBody>{feedback.body}</FeedbackBody>
                      <FeedbackProject>{feedback.projectName}</FeedbackProject>
                    </FeedbackCopy>
                    <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                  </FeedbackRowCard>
                );
              })
            ) : (
              <EmptyBlock>
                <strong>No feedback yet</strong>
                <p>Client comments will appear here once reviews start coming in.</p>
              </EmptyBlock>
            )}
          </FeedbackList>
        </MobileOnlyPanel>

        <BottomGrid>
          <Panel>
            <PanelHeader>
              <PanelTitle>Project Progress Overview</PanelTitle>
              <PanelTag>This Month</PanelTag>
            </PanelHeader>
            <DonutWrap>
              <DonutChart style={{ background: donut }}>
                <DonutCenter>
                  <strong>{projectRows.length}</strong>
                  <span>Active Projects</span>
                </DonutCenter>
              </DonutChart>
              <LegendList>
                <LegendItem>
                  <LegendDot $color="#5ca16d" />
                  <span>Completed</span>
                  <strong>{completedPct}%</strong>
                </LegendItem>
                <LegendItem>
                  <LegendDot $color="#1f4339" />
                  <span>In Progress</span>
                  <strong>{inProgressPct}%</strong>
                </LegendItem>
                <LegendItem>
                  <LegendDot $color="#d69b47" />
                  <span>In Review</span>
                  <strong>{reviewPct}%</strong>
                </LegendItem>
                <LegendItem>
                  <LegendDot $color="#d3ccc1" />
                  <span>On Hold</span>
                  <strong>{holdPct}%</strong>
                </LegendItem>
              </LegendList>
            </DonutWrap>
          </Panel>

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
                    <FeedbackRowCard key={feedback.id}>
                      <FeedbackAvatar>{feedback.clientName.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                      <FeedbackCopy>
                        <FeedbackBody>{feedback.body}</FeedbackBody>
                        <FeedbackProject>{feedback.projectName}</FeedbackProject>
                      </FeedbackCopy>
                      <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                    </FeedbackRowCard>
                  );
                })
              ) : (
                <EmptyBlock>
                  <strong>No feedback yet</strong>
                  <p>Client feedback will appear here once comments start coming in.</p>
                </EmptyBlock>
              )}
            </FeedbackList>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>Team Activity</PanelTitle>
              <PanelLink href="/team">View all</PanelLink>
            </PanelHeader>
            <ActivityList>
              {recentActivity.length ? (
                recentActivity.map((item) => (
                  <ActivityRowCard key={item.id}>
                    <FeedbackAvatar>{item.actor.slice(0, 1).toUpperCase()}</FeedbackAvatar>
                    <FeedbackCopy>
                      <FeedbackBody>
                        {item.actor} {item.detail}
                      </FeedbackBody>
                      <FeedbackProject>{item.projectName}</FeedbackProject>
                    </FeedbackCopy>
                    <ActivityTime>{timeAgo(item.createdAt)}</ActivityTime>
                  </ActivityRowCard>
                ))
              ) : (
                <EmptyBlock>
                  <strong>No recent activity</strong>
                  <p>File uploads, comments, and feedback updates will appear here.</p>
                </EmptyBlock>
              )}
            </ActivityList>
          </Panel>

          {canManage ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Quick Actions</PanelTitle>
              </PanelHeader>
              <ActionList>
                <ActionButton href="/projects/new">
                  <ActionIcon>
                    <IconPlus />
                  </ActionIcon>
                  <span>Create Project</span>
                </ActionButton>
                <ActionButton href="/tasks">
                  <ActionIcon>
                    <IconCheckCircle />
                  </ActionIcon>
                  <span>Add Task</span>
                </ActionButton>
                <ActionButton href="/team">
                  <ActionIcon>
                    <IconUsers />
                  </ActionIcon>
                  <span>Invite Client</span>
                </ActionButton>
                <ActionButton href="/projects">
                  <ActionIcon>
                    <IconUpload />
                  </ActionIcon>
                  <span>Upload File</span>
                </ActionButton>
              </ActionList>
            </Panel>
          ) : null}
        </BottomGrid>
      </Content>
    </Shell>
  );
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.floor(diff / (1000 * 60 * 60)));
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

const Sidebar = styled.aside`
  display: none;

  ${desktop} {
    width: 260px;
    flex: 0 0 260px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 22px 16px;
    border-right: 1px solid rgba(230, 224, 215, 0.95);
    border-radius: 26px 0 0 26px;
    background: rgba(255, 255, 255, 0.62);
  }
`;

const Brand = styled.div`
  padding: 10px 8px 24px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2.6rem;
  line-height: 1;
  font-weight: 600;
  text-transform: lowercase;
`;

const SideNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
`;

const sideItemCss = css<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 0 16px;
  border: 0;
  border-radius: 18px;
  background: ${({ $active }) => ($active ? "#f5efe5" : "transparent")};
  box-shadow: ${({ $active }) =>
    $active ? "inset 0 0 0 1px rgba(230, 224, 215, 0.9)" : "none"};
  color: ${({ $active }) => ($active ? "var(--color-text)" : "var(--color-text-muted)")};
  text-decoration: none;
  font-size: 0.96rem;
`;

const SideLink = styled(Link)<{ $active?: boolean }>`
  ${sideItemCss}
`;

const SideButton = styled.button`
  ${sideItemCss}
`;

const SideIcon = styled.span`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.72;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SideProfile = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px 8px;
`;

const ProfileAvatar = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-weight: 600;
`;

const ProfileName = styled.strong`
  display: block;
`;

const ProfileRole = styled.p`
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 24px 28px 24px;
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
  font-size: clamp(1.65rem, 4vw, 2.45rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.45;

  ${desktop} {
    font-size: 0.84rem;
  }
`;

const HeaderUser = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
`;

const HeaderAvatar = styled.div`
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
`;

const HeaderUserName = styled.strong`
  display: block;
  font-size: 0.82rem;
  line-height: 1.2;
`;

const HeaderUserRole = styled.p`
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.2;
`;

const StatsGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  ${desktop} {
    gap: 16px;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  min-height: 88px;
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 18px;

  ${desktop} {
    grid-template-columns: minmax(0, 1fr) 52px;
    align-items: start;
    min-height: 120px;
    padding: 18px 20px;
    border-radius: 20px;
  }
`;

const StatCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const StatLabel = styled.span`
  color: var(--color-text);
  font-size: 10px;
  font-weight: 600;

  ${desktop} {
    font-size: 0.8rem;
  }
`;

const StatValue = styled.strong`
  font-size: 1.55rem;
  line-height: 1;

  ${desktop} {
    font-size: 1.9rem;
  }
`;

const StatNote = styled.span<{ $tone: "positive" | "warning" }>`
  color: ${({ $tone }) => ($tone === "positive" ? "#5ca16d" : "#da6a43")};
  font-size: 9px;
  font-weight: 600;

  ${desktop} {
    font-size: 0.74rem;
  }
`;

const StatIcon = styled.div<{ $tone: "dark" | "soft-green" | "soft-gold" }>`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "dark"
      ? "#1f4339"
      : $tone === "soft-green"
        ? "#d6efc9"
        : "#ffe8bd"};
  color: ${({ $tone }) =>
    $tone === "dark" ? "#fff" : $tone === "soft-green" ? "#55894f" : "#c07e1b"};
  justify-self: end;

  svg {
    width: 16px;
    height: 16px;
  }

  ${desktop} {
    width: 52px;
    height: 52px;
    border-radius: 16px;

    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const TopGrid = styled.section`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
    gap: 16px;
  }
`;

const BottomGrid = styled.section`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
`;

const Panel = styled.section`
  ${cardSurface}
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 20px;

  ${desktop} {
    padding: 14px 16px 16px;
    border-radius: 20px;
  }
`;

const MobileOnlyPanel = styled(Panel)`
  ${desktop} {
    display: none;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.2;

  ${desktop} {
    font-size: 0.95rem;
  }
`;

const PanelLink = styled(Link)`
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 600;
`;

const PanelTag = styled.span`
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 600;
`;

const ProjectList = styled.div`
  display: grid;
  gap: 10px;
`;

const ProjectRow = styled(Link)`
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  text-decoration: none;
  padding: 10px 0;
  border-top: 1px solid rgba(230, 224, 215, 0.65);

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }

  ${desktop} {
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 14px;
    padding: 12px 0;
  }
`;

const ProjectMark = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 1.05rem;
  font-weight: 600;

  ${desktop} {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    font-size: 1.2rem;
  }
`;

const ProjectBody = styled.div`
  display: grid;
  gap: 8px;
`;

const ProjectTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const ProjectTitle = styled.strong`
  display: block;
  font-size: 0.88rem;
  line-height: 1.3;

  ${desktop} {
    font-size: 0.92rem;
  }
`;

const ProjectSub = styled.p`
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.76rem;
`;

const DesktopProjectMeta = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
`;

const MobileProjectMeta = styled.div`
  ${desktop} {
    display: none;
  }
`;

const MetaGroup = styled.div`
  display: grid;
  gap: 6px;
`;

const MetaLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.64rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const MetaValue = styled.strong`
  font-size: 0.82rem;
`;

const ProjectBottom = styled.div`
  display: grid;
  gap: 6px;
`;

const StageName = styled.span`
  color: var(--color-text);
  font-size: 0.76rem;
  font-weight: 600;
`;

const ProgressRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
`;

const ProgressBar = styled.div`
  height: 6px;
  border-radius: 999px;
  background: #ece7df;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #83c37d, #4f8f5e);
`;

const ProgressValue = styled.span`
  color: var(--color-text);
  font-size: 0.76rem;
  font-weight: 700;
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
`;

const AvatarStack = styled.div`
  display: flex;
  align-items: center;
`;

const Avatar = styled.span<{ $muted?: boolean }>`
  width: 26px;
  height: 26px;
  margin-left: -8px;
  border: 2px solid #fff;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ $muted }) => ($muted ? "#f5efe5" : "#d9cfbf")};
  color: ${({ $muted }) => ($muted ? "var(--color-text-muted)" : "#fff")};
  font-size: 0.64rem;
  font-weight: 700;

  &:first-child {
    margin-left: 0;
  }
`;

const TaskList = styled.div`
  display: grid;
  gap: 12px;
`;

const TaskRow = styled(Link)`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  text-decoration: none;
`;

const TaskCircle = styled.span<{ $urgent: boolean }>`
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 999px;
  border: 2px solid ${({ $urgent }) => ($urgent ? "#df7a6b" : "#ded6c8")};
`;

const TaskCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const TaskTitle = styled.strong`
  font-size: 0.88rem;
  line-height: 1.25;
`;

const TaskSub = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.76rem;
`;

const TaskDate = styled.span`
  color: #da6a43;
  font-size: 0.76rem;
  font-weight: 700;
`;

const DonutWrap = styled.div`
  display: grid;
  justify-items: center;
  gap: 18px;
`;

const DonutChart = styled.div`
  width: 170px;
  height: 170px;
  border-radius: 999px;
  display: grid;
  place-items: center;
`;

const DonutCenter = styled.div`
  width: 151px;
  height: 151px;
  border-radius: 999px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  text-align: center;

  strong {
    display: block;
    font-size: 2rem;
    line-height: 1;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }
`;

const LegendList = styled.div`
  width: 100%;
  display: grid;
  gap: 10px;
`;

const LegendItem = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 0.84rem;

  strong {
    color: var(--color-text);
  }
`;

const LegendDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${({ $color }) => $color};
`;

const FeedbackList = styled.div`
  display: grid;
  gap: 10px;
`;

const FeedbackRowCard = styled.article`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
`;

const FeedbackAvatar = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #f5efe5;
  color: var(--color-text-muted);
  font-weight: 700;
`;

const FeedbackCopy = styled.div`
  display: grid;
  gap: 2px;
`;

const FeedbackBody = styled.p`
  margin: 0;
  color: var(--color-text);
  font-size: 0.82rem;
  line-height: 1.4;
`;

const FeedbackProject = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.74rem;
`;

const ActivityList = styled.div`
  display: grid;
  gap: 12px;
`;

const ActivityRowCard = styled.article`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
`;

const ActivityTime = styled.span`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
`;

const ActionList = styled.div`
  display: grid;
  gap: 8px;
`;

const ActionButton = styled(Link)`
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: #fff;
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;

  &:first-child {
    background: #1f4339;
    color: #fff;
    border-color: transparent;
  }
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

const EmptyBlock = styled.div`
  color: var(--color-text-muted);

  strong {
    display: block;
    color: var(--color-text);
    font-size: 0.86rem;
  }

  p {
    margin: 6px 0 0;
    font-size: 0.76rem;
    line-height: 1.5;
  }
`;

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
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

function IconCheckCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.8 12 2.1 2.2 4.6-4.8" />
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

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="14" rx="2.5" />
      <path d="M8 4v4M16 4v4M4 10h16" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5a1.5 1.5 0 0 1 1-1.5Z" />
      <path d="M14 3.5V8h4" />
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

function IconFlag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20V5" />
      <path d="M6 6c2-1.5 4-1.5 6 0s4 1.5 6 0v7c-2 1.5-4 1.5-6 0s-4-1.5-6 0" />
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

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 18.5h14" />
    </svg>
  );
}
