"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { canCreateTask, canViewProject } from "@/lib/permissions";
import { formatRole } from "@/lib/display";
import { Project, TaskStatus } from "@/lib/types";

type FilterKey =
  | "all"
  | "todo"
  | "in_progress"
  | "in_review"
  | "waiting_feedback"
  | "completed";

type SortKey = "due_date" | "priority" | "name";
type DerivedPriority = "high" | "medium" | "low";
type DerivedTaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "waiting_feedback"
  | "completed";

type TaskRow = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  projectId: string;
  projectName: string;
  projectMark: string;
  dueDate: string;
  status: DerivedTaskStatus;
  priority: DerivedPriority;
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

const filterOptions: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "waiting_feedback", label: "Waiting Feedback" },
  { key: "completed", label: "Completed" },
] as const;

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getProjectMark(project: Project) {
  const words = project.name.split(" ");
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function deriveTaskStatus(taskStatus: TaskStatus, project: Project): DerivedTaskStatus {
  if (taskStatus === "done") {
    return "completed";
  }

  if (project.status === "review") {
    return "waiting_feedback";
  }

  if (project.stage === "review" || project.status === "revision") {
    return "in_review";
  }

  if (taskStatus === "in_progress") {
    return "in_progress";
  }

  return "todo";
}

function derivePriority(dueDate: string, taskStatus: TaskStatus): DerivedPriority {
  if (taskStatus === "done") {
    return "low";
  }

  const today = startOfDay(new Date());
  const due = startOfDay(new Date(dueDate));
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 2) {
    return "high";
  }

  if (diffDays <= 5) {
    return "medium";
  }

  return "low";
}

function getStatusTone(status: DerivedTaskStatus) {
  switch (status) {
    case "in_progress":
      return { bg: "#e6efff", fg: "#4770d8", label: "In Progress" };
    case "in_review":
      return { bg: "#efe7ff", fg: "#7f61d7", label: "In Review" };
    case "waiting_feedback":
      return { bg: "#fff1da", fg: "#ca8a22", label: "Waiting Feedback" };
    case "completed":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Completed" };
    default:
      return { bg: "#f4f1ed", fg: "#8d857b", label: "To Do" };
  }
}

function getPriorityTone(priority: DerivedPriority) {
  switch (priority) {
    case "high":
      return { bg: "#ffe7e5", fg: "#e06457", label: "High" };
    case "medium":
      return { bg: "#fff1da", fg: "#ca8a22", label: "Medium" };
    default:
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Low" };
  }
}

export function TasksScreen() {
  const { state, user } = useAppState();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("due_date");

  if (!user) {
    return null;
  }

  const visibleProjects = state.projects.filter((project) => canViewProject(user, project));
  const userNames = new Map(state.users.map((member) => [member.id, member.name]));
  const roleLabel = formatRole(user.role).toUpperCase();
  const canManage = canCreateTask(user.role);

  const allTasks = useMemo<TaskRow[]>(
    () =>
      visibleProjects.flatMap((project) =>
        project.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          assigneeId: task.assigneeId,
          assigneeName: userNames.get(task.assigneeId) ?? "Unassigned",
          projectId: project.id,
          projectName: project.name,
          projectMark: getProjectMark(project),
          dueDate: project.dueDate,
          status: deriveTaskStatus(task.status, project),
          priority: derivePriority(project.dueDate, task.status),
        })),
      ),
    [userNames, visibleProjects],
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = allTasks.filter((task) => {
      const matchesFilter = filter === "all" ? true : task.status === filter;
      const matchesSearch =
        !q ||
        task.title.toLowerCase().includes(q) ||
        task.projectName.toLowerCase().includes(q) ||
        task.assigneeName.toLowerCase().includes(q);

      return matchesFilter && matchesSearch;
    });

    return [...next].sort((a, b) => {
      if (sort === "name") {
        return a.title.localeCompare(b.title);
      }

      if (sort === "priority") {
        const weight = { high: 0, medium: 1, low: 2 };
        return weight[a.priority] - weight[b.priority];
      }

      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [allTasks, filter, search, sort]);

  const today = startOfDay(new Date());
  const openCount = allTasks.filter((task) => task.status !== "completed").length;
  const dueTodayCount = allTasks.filter(
    (task) => task.status !== "completed" && startOfDay(new Date(task.dueDate)) === today,
  ).length;
  const overdueCount = allTasks.filter(
    (task) => task.status !== "completed" && startOfDay(new Date(task.dueDate)) < today,
  ).length;
  const completedCount = allTasks.filter((task) => task.status === "completed").length;

  const focusTasks = filteredTasks.filter((task) => task.status !== "completed").slice(0, 3);
  const upcomingTasks = [...filteredTasks].slice(0, 3);

  return (
    <Shell>
      <AppSidebar user={user} activeLabel="Tasks" />

      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <Title>Tasks</Title>
            <Subtitle>
              Manage deliverables, assign staff, and track project work across all active
              projects.
            </Subtitle>
          </div>
          <BellButton type="button" aria-label="Notifications">
            <IconBell />
            <BellBadge>1</BellBadge>
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
              placeholder="Search tasks, projects, or staff..."
            />
          </SearchWrap>

          {canManage ? (
            <CreateButton type="button">
              <ActionIcon>
                <IconPlus />
              </ActionIcon>
              <span>Create Task</span>
            </CreateButton>
          ) : null}
        </Toolbar>

        <StatsGrid>
          <StatCard>
            <StatLeft>
              <StatIcon $tone="soft-green">
                <IconFolder />
              </StatIcon>
            </StatLeft>
            <StatCopy>
              <StatLabel>Open Tasks</StatLabel>
              <StatValue>{openCount}</StatValue>
              <StatNote $tone="positive">+6 from last week</StatNote>
            </StatCopy>
          </StatCard>

          <StatCard>
            <StatLeft>
              <StatIcon $tone="soft-gold">
                <IconCalendar />
              </StatIcon>
            </StatLeft>
            <StatCopy>
              <StatLabel>Due Today</StatLabel>
              <StatValue>{dueTodayCount}</StatValue>
              <StatNote $tone="positive">+2 from yesterday</StatNote>
            </StatCopy>
          </StatCard>

          <StatCard>
            <StatLeft>
              <StatIcon $tone="soft-red">
                <IconAlert />
              </StatIcon>
            </StatLeft>
            <StatCopy>
              <StatLabel>Overdue</StatLabel>
              <StatValue>{overdueCount}</StatValue>
              <StatNote $tone="warning">-1 from yesterday</StatNote>
            </StatCopy>
          </StatCard>

          <DesktopOnlyCard>
            <StatLeft>
              <StatIcon $tone="soft-green">
                <IconCheckCircle />
              </StatIcon>
            </StatLeft>
            <StatCopy>
              <StatLabel>Completed This Week</StatLabel>
              <StatValue>{completedCount}</StatValue>
              <StatNote $tone="positive">+20% from last week</StatNote>
            </StatCopy>
          </DesktopOnlyCard>
        </StatsGrid>

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
            <SortWrap>
              <span>Sort:</span>
              <SortSelect value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                <option value="due_date">Due date</option>
                <option value="priority">Priority</option>
                <option value="name">Name</option>
              </SortSelect>
            </SortWrap>
          </DesktopControls>
        </FilterBar>

        <DesktopPanel>
          <TaskTableHeader>
            <span />
            <span>Task</span>
            <span>Project</span>
            <span>Assignee</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Due Date</span>
            <span />
          </TaskTableHeader>

          <TaskTable>
            {filteredTasks.length ? (
              filteredTasks.map((task) => {
                const statusTone = getStatusTone(task.status);
                const priorityTone = getPriorityTone(task.priority);
                return (
                  <DesktopTaskRow href={`/projects/${task.projectId}`} key={task.id}>
                    <CheckCell>
                      <CheckboxStub />
                    </CheckCell>
                    <TaskCell>
                      <TaskTitle>{task.title}</TaskTitle>
                      <TaskMeta>{task.projectName}</TaskMeta>
                    </TaskCell>
                    <ProjectCell>
                      <ProjectMark>{task.projectMark}</ProjectMark>
                      <TaskMeta>{task.projectName}</TaskMeta>
                    </ProjectCell>
                    <AssigneeCell>
                      <Avatar>{task.assigneeName.slice(0, 1)}</Avatar>
                      <TaskMeta>{task.assigneeName}</TaskMeta>
                    </AssigneeCell>
                    <PillCell>
                      <Pill style={{ background: statusTone.bg, color: statusTone.fg }}>
                        {statusTone.label}
                      </Pill>
                    </PillCell>
                    <PillCell>
                      <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                        {priorityTone.label}
                      </Pill>
                    </PillCell>
                    <DueCell>{formatDueDate(task.dueDate)}</DueCell>
                    <ArrowCell>
                      <ArrowButton>
                        <IconArrowRight />
                      </ArrowButton>
                    </ArrowCell>
                  </DesktopTaskRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No tasks found</strong>
                <p>Try another search term or adjust the selected status filter.</p>
              </EmptyState>
            )}
          </TaskTable>
        </DesktopPanel>

        <MobileTaskList>
          {filteredTasks.length ? (
            filteredTasks.map((task) => {
              const statusTone = getStatusTone(task.status);
              const priorityTone = getPriorityTone(task.priority);
              return (
                <MobileTaskCard href={`/projects/${task.projectId}`} key={task.id}>
                  <MobileTaskTop>
                    <CheckboxStub />
                    <MobileTopCopy>
                      <TaskTitle>{task.title}</TaskTitle>
                      <TaskMeta>{task.projectName}</TaskMeta>
                    </MobileTopCopy>
                    <Pill style={{ background: statusTone.bg, color: statusTone.fg }}>
                      {statusTone.label}
                    </Pill>
                  </MobileTaskTop>

                  <MobileTaskBottom>
                    <AssigneeRow>
                      <Avatar>{task.assigneeName.slice(0, 1)}</Avatar>
                      <TaskMeta>{task.assigneeName}</TaskMeta>
                    </AssigneeRow>
                    <DateRow>
                      <MiniIcon>
                        <IconCalendar />
                      </MiniIcon>
                      <TaskMeta>{formatDueDate(task.dueDate)}</TaskMeta>
                    </DateRow>
                    <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                      {priorityTone.label}
                    </Pill>
                  </MobileTaskBottom>
                </MobileTaskCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No tasks found</strong>
              <p>Try another search term or adjust the selected status filter.</p>
            </EmptyState>
          )}
        </MobileTaskList>

        <DesktopBottomGrid>
          <Panel>
            <PanelHeader>
              <PanelTitle>Today's Focus</PanelTitle>
            </PanelHeader>
            <FocusList>
              {focusTasks.length ? (
                focusTasks.map((task) => {
                  const priorityTone = getPriorityTone(task.priority);
                  return (
                    <FocusRow key={task.id}>
                      <FocusBullet />
                      <FocusCopy>
                        <TaskTitle>{task.title}</TaskTitle>
                        <TaskMeta>{task.projectName}</TaskMeta>
                      </FocusCopy>
                      <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                        {priorityTone.label}
                      </Pill>
                    </FocusRow>
                  );
                })
              ) : (
                <EmptyState>
                  <strong>No focus tasks</strong>
                  <p>There are no open tasks in the current filter.</p>
                </EmptyState>
              )}
            </FocusList>
            <PanelFooterLink href="/tasks">
              <span>View my tasks</span>
              <IconArrowRight />
            </PanelFooterLink>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>Upcoming Deadlines</PanelTitle>
            </PanelHeader>
            <FocusList>
              {upcomingTasks.length ? (
                upcomingTasks.map((task) => {
                  const priorityTone = getPriorityTone(task.priority);
                  return (
                    <DeadlineRow key={task.id}>
                      <DeadlineDate>{formatShortDate(task.dueDate)}</DeadlineDate>
                      <FocusCopy>
                        <TaskTitle>{task.title}</TaskTitle>
                        <TaskMeta>{task.projectName}</TaskMeta>
                      </FocusCopy>
                      <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                        {priorityTone.label}
                      </Pill>
                    </DeadlineRow>
                  );
                })
              ) : (
                <EmptyState>
                  <strong>No deadlines found</strong>
                  <p>Upcoming deadlines will appear here as tasks are created.</p>
                </EmptyState>
              )}
            </FocusList>
            <PanelFooterLink href="/projects">
              <span>View calendar</span>
              <IconArrowRight />
            </PanelFooterLink>
          </Panel>
        </DesktopBottomGrid>
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

const Sidebar = styled.aside`
  display: none;

  ${desktop} {
    width: 260px;
    flex: 0 0 260px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 22px 18px;
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
  display: grid;
  gap: 12px;

  ${desktop} {
    display: flex;
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

const CreateButton = styled.button`
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
    flex: 0 0 220px;
  }
`;

const StatsGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  ${desktop} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  min-height: 96px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 18px;

  ${desktop} {
    min-height: 132px;
    grid-template-columns: 52px minmax(0, 1fr);
    padding: 18px 20px;
    border-radius: 20px;
  }
`;

const DesktopOnlyCard = styled(StatCard)`
  display: none;

  ${desktop} {
    display: grid;
  }
`;

const StatLeft = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StatIcon = styled.div<{ $tone: "soft-green" | "soft-gold" | "soft-red" }>`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "soft-green" ? "#dff1dd" : $tone === "soft-gold" ? "#fff0d5" : "#ffe6e4"};
  color: ${({ $tone }) =>
    $tone === "soft-green" ? "#5ca16d" : $tone === "soft-gold" ? "#ca8a22" : "#e06457"};

  svg {
    width: 18px;
    height: 18px;
  }

  ${desktop} {
    width: 44px;
    height: 44px;
  }
`;

const StatCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const StatLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 600;

  ${desktop} {
    font-size: 0.84rem;
  }
`;

const StatValue = styled.strong`
  font-size: 1.65rem;
  line-height: 1;

  ${desktop} {
    font-size: 2rem;
  }
`;

const StatNote = styled.span<{ $tone: "positive" | "warning" }>`
  color: ${({ $tone }) => ($tone === "positive" ? "#5ca16d" : "#e06457")};
  font-size: 0.7rem;
  font-weight: 600;

  ${desktop} {
    font-size: 0.76rem;
  }
`;

const FilterBar = styled.section`
  display: grid;
  gap: 12px;

  ${desktop} {
    display: flex;
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

const SortWrap = styled.label`
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

const SortSelect = styled.select`
  width: auto;
  min-height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
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

const TaskTableHeader = styled.div`
  display: grid;
  grid-template-columns: 40px 1.6fr 1.4fr 1.2fr 1fr 1fr 1fr 60px;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const TaskTable = styled.div`
  display: flex;
  flex-direction: column;
`;

const DesktopTaskRow = styled(Link)`
  display: grid;
  grid-template-columns: 40px 1.6fr 1.4fr 1.2fr 1fr 1fr 1fr 60px;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  text-decoration: none;
`;

const CheckCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const CheckboxStub = styled.span`
  width: 18px;
  height: 18px;
  border: 2px solid #d6cec3;
  border-radius: 5px;
`;

const TaskCell = styled.div`
  display: grid;
  gap: 4px;
`;

const ProjectCell = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const AssigneeCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const PillCell = styled.div`
  display: flex;
`;

const DueCell = styled.div`
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 500;
`;

const ArrowCell = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const ArrowButton = styled.span`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  color: var(--color-text-muted);

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MobileTaskList = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    display: none;
  }
`;

const MobileTaskCard = styled(Link)`
  ${cardSurface}
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  text-decoration: none;
`;

const MobileTaskTop = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
`;

const MobileTopCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const MobileTaskBottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const AssigneeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DesktopBottomGrid = styled.section`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
`;

const Panel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  border-radius: 22px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.2;
`;

const FocusList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FocusRow = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
`;

const DeadlineRow = styled.div`
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
`;

const FocusBullet = styled.span`
  width: 18px;
  height: 18px;
  border: 2px solid #ded6c8;
  border-radius: 999px;
`;

const FocusCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const DeadlineDate = styled.span`
  color: #da6a43;
  font-size: 0.84rem;
  font-weight: 700;
`;

const PanelFooterLink = styled(Link)`
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-end;
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const TaskTitle = styled.strong`
  font-size: 0.92rem;
  line-height: 1.3;
`;

const TaskMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
`;

const ProjectMark = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 1rem;
  font-weight: 700;
`;

const Avatar = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #d9cfbf;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
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

const MiniIcon = styled.span`
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-light);

  svg {
    width: 100%;
    height: 100%;
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

const EmptyState = styled.div`
  ${cardSurface}
  display: grid;
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

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
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
