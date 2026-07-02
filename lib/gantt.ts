import { Project } from "@/lib/types";
import { isProjectCompleted } from "@/lib/project-ranking";

export type GanttRangeMode = "weeks" | "month" | "overview" | "months" | "year";

export type GanttMilestone = {
  key: "intake" | "first_draft" | "completed";
  label: "Project Intake" | "First Draft" | "Completed";
  date: Date;
};

export type ProjectTimeline = {
  projectId: string;
  intakeDate: Date | null;
  firstDraftDate: Date | null;
  completedDate: Date | null;
  startDate: Date;
  endDate: Date;
  milestones: GanttMilestone[];
};

const DAY_MS = 1000 * 60 * 60 * 24;

export function parseValidDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function formatGanttDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(value);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, value.getDate());
}

export function getProjectCompletionActivityDate(project: Project) {
  const latestCompletionActivity =
    [...project.activities]
      .filter(
        (activity) =>
          activity.action === "workflow_updated" &&
          activity.message.toLowerCase().includes("updated project status to complete"),
      )
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  return latestCompletionActivity ? parseValidDate(latestCompletionActivity.createdAt) : null;
}

export function getProjectTimeline(project: Project): ProjectTimeline | null {
  const intakeDate = parseValidDate(project.requestedDate) ?? parseValidDate(project.createdAt);
  const firstDraftDate = parseValidDate(project.firstDraftDate);
  // `finalDeliverableDate` is the preferred completion/final milestone.
  // If it is missing, we reuse the existing completion activity signal for completed projects,
  // then fall back to `dueDate` so ongoing projects can still render a timeline span.
  const completedDate =
    parseValidDate(project.finalDeliverableDate) ??
    (isProjectCompleted(project) ? getProjectCompletionActivityDate(project) : null) ??
    parseValidDate(project.dueDate);

  const milestoneCandidates: GanttMilestone[] = [
    intakeDate
      ? {
          key: "intake",
          label: "Project Intake",
          date: intakeDate,
        }
      : null,
    firstDraftDate
      ? {
          key: "first_draft",
          label: "First Draft",
          date: firstDraftDate,
        }
      : null,
    completedDate
      ? {
          key: "completed",
          label: "Completed",
          date: completedDate,
        }
      : null,
  ].filter((value): value is GanttMilestone => Boolean(value));

  if (milestoneCandidates.length === 0) {
    return null;
  }

  const sortedMilestones = milestoneCandidates
    .slice()
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const startDate = intakeDate ?? firstDraftDate ?? completedDate ?? sortedMilestones[0].date;
  const endDate = completedDate ?? firstDraftDate ?? intakeDate ?? sortedMilestones[sortedMilestones.length - 1].date;

  return {
    projectId: project.id,
    intakeDate,
    firstDraftDate,
    completedDate,
    startDate: startDate.getTime() <= endDate.getTime() ? startDate : endDate,
    endDate: endDate.getTime() >= startDate.getTime() ? endDate : startDate,
    milestones: sortedMilestones,
  };
}

export function buildTimelineRange(
  projects: Project[],
  compact = false,
  rangeMode: GanttRangeMode = "months",
) {
  const now = new Date();
  const isWeekRange = rangeMode === "weeks";
  const monthSpan = rangeMode === "year" ? 11 : rangeMode === "months" ? 5 : rangeMode === "overview" ? 1 : 0;
  const anchorStart = isWeekRange ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1);
  const anchorEnd = isWeekRange ? addDays(anchorStart, 41) : endOfMonth(addMonths(anchorStart, monthSpan));
  const rangeStart = anchorStart;
  const rangeEnd = anchorEnd;

  const days: Date[] = [];
  for (let cursor = startOfDay(rangeStart); cursor.getTime() <= startOfDay(rangeEnd).getTime(); cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  return days;
}

export function getDayIndexMap(days: Date[]) {
  return new Map(days.map((day, index) => [startOfDay(day).getTime(), index]));
}

export function getSpanLength(start: Date, end: Date) {
  const startTime = startOfDay(start).getTime();
  const endTime = startOfDay(end).getTime();
  return Math.max(1, Math.round((endTime - startTime) / DAY_MS) + 1);
}
