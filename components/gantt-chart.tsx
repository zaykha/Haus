"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { ClientTitleLogo } from "@/components/client-title-logo";
import {
  buildTimelineRange,
  formatGanttDate,
  getDayIndexMap,
  getProjectTimeline,
  GanttMilestone,
  GanttRangeMode,
} from "@/lib/gantt";
import { formatProjectStage } from "@/lib/display";
import { getProjectWorkflowRank, isProjectCompleted, isProjectOnHold, isProjectPendingReview } from "@/lib/project-ranking";
import { ClientOrganization, Project } from "@/lib/types";

type GanttChartProps = {
  projects: Project[];
  clientOrganizations?: ClientOrganization[];
  compact?: boolean;
  rangeMode?: GanttRangeMode;
  hrefBuilder?: (project: Project) => string;
  title?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  maxVisibleRows?: number;
};

type RowModel = {
  project: Project;
  startIndex: number;
  endIndex: number;
  spanLength: number;
  isOverdue: boolean;
  overdueDays: number;
  isCompleted: boolean;
  firstDraftDate: Date | null;
  targetDate: Date | null;
  milestones: Array<{
    key: GanttMilestone["key"];
    label: GanttMilestone["label"];
    index: number;
    date: Date;
  }>;
  stageStops: Array<{
    color: string;
    percent: number;
  }>;
};

function getVisibleIndex(date: Date, dayIndexMap: Map<number, number>, days: Date[]) {
  const direct = dayIndexMap.get(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime());
  if (direct !== undefined) {
    return direct;
  }

  if (!dayIndexMap.size || !days.length) {
    return undefined;
  }

  if (date.getTime() < days[0].getTime()) {
    return 0;
  }

  if (date.getTime() > days[days.length - 1].getTime()) {
    return days.length - 1;
  }

  return undefined;
}

const INTAKE_COLOR = "#7f61d7";
const FIRST_DRAFT_COLOR = "#d69b47";
const COMPLETED_COLOR = "#5ca16d";
const HOLD_COLOR = "#c97a64";
const REVIEW_COLOR = "#d69b47";
const WIP_COLOR = "#1f4339";
const WAITLIST_COLOR = "#8f98af";
const HOVER_BORDER_COLOR = "rgba(31, 67, 57, 0.46)";

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatDetailedDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function isProjectOverdue(project: Project) {
  if (isProjectCompleted(project)) {
    return false;
  }

  const dueValue = project.finalDeliverableDate ?? project.dueDate;
  if (!dueValue) {
    return false;
  }

  const dueDate = new Date(dueValue);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const today = new Date();
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  return dueDate.getTime() < endOfToday.getTime();
}

function getProjectOverdueDays(project: Project) {
  if (isProjectCompleted(project)) {
    return 0;
  }

  const dueValue = project.finalDeliverableDate ?? project.dueDate;
  if (!dueValue) {
    return 0;
  }

  const dueDate = new Date(dueValue);
  if (Number.isNaN(dueDate.getTime())) {
    return 0;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diff = startOfToday.getTime() - startOfDue.getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

function getProjectStatusColor(project: Project) {
  if (isProjectCompleted(project)) {
    return COMPLETED_COLOR;
  }

  if (isProjectOnHold(project)) {
    return HOLD_COLOR;
  }

  if (isProjectPendingReview(project)) {
    return REVIEW_COLOR;
  }

  if (project.status === "Waiting List" || project.stage === "Waiting List") {
    return WAITLIST_COLOR;
  }

  return WIP_COLOR;
}

function buildStageStops(project: Project, milestones: RowModel["milestones"], startIndex: number, endIndex: number) {
  const span = Math.max(1, endIndex - startIndex);
  const sortedMilestones = milestones.slice().sort((left, right) => left.index - right.index);
  const stops: Array<{ color: string; percent: number }> = [];

  const pushStop = (color: string, percent: number) => {
    const normalizedPercent = clampPercentage(percent);
    const previous = stops[stops.length - 1];

    if (previous && previous.color === color && Math.abs(previous.percent - normalizedPercent) < 0.001) {
      return;
    }

    stops.push({ color, percent: normalizedPercent });
  };

  pushStop(INTAKE_COLOR, 0);

  const firstDraft = sortedMilestones.find((milestone) => milestone.key === "first_draft");
  const completed = sortedMilestones.find((milestone) => milestone.key === "completed");

  if (firstDraft) {
    const percent = ((firstDraft.index - startIndex) / span) * 100;
    pushStop(INTAKE_COLOR, percent);
    pushStop(FIRST_DRAFT_COLOR, percent);
  }

  if (completed) {
    const percent = ((completed.index - startIndex) / span) * 100;
    pushStop(FIRST_DRAFT_COLOR, percent);
    pushStop(COMPLETED_COLOR, percent);
    pushStop(COMPLETED_COLOR, 100);
    return stops;
  }

  pushStop(getProjectStatusColor(project), 100);

  return stops;
}

export function GanttChart({
  projects,
  clientOrganizations = [],
  compact = false,
  rangeMode = "months",
  hrefBuilder,
  title,
  viewAllHref,
  viewAllLabel = "View full Gantt",
  maxVisibleRows,
}: GanttChartProps) {
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const days = useMemo(() => buildTimelineRange(projects, compact, rangeMode), [compact, projects, rangeMode]);
  const todayKey = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);
  const dayIndexMap = useMemo(() => getDayIndexMap(days), [days]);
  const daySize = compact ? 16 : 20;
  const labelColumnWidth = compact ? 168 : 248;
  const rowHeight = compact ? 46 : 58;
  const headerHeight = compact ? 26 : 34;
  const lineLeft = hoveredDayIndex !== null ? hoveredDayIndex * daySize + daySize / 2 : null;
  const chartStyle = useMemo(
    () =>
      ({
        ["--gantt-label-width" as string]: `${labelColumnWidth}px`,
        ["--gantt-day-size" as string]: `${daySize}px`,
      }) as CSSProperties,
    [daySize, labelColumnWidth],
  );

  const rows = useMemo<RowModel[]>(() => {
    const nextRows: RowModel[] = [];

    for (const project of projects) {
      const timeline = getProjectTimeline(project);
      if (!timeline) {
        continue;
      }

      const startIndex = getVisibleIndex(timeline.startDate, dayIndexMap, days);
      const endIndex = getVisibleIndex(timeline.endDate, dayIndexMap, days);

      if (startIndex === undefined || endIndex === undefined) {
        continue;
      }

      const milestones: RowModel["milestones"] = [];

      for (const milestone of timeline.milestones) {
        const index = dayIndexMap.get(
          new Date(milestone.date.getFullYear(), milestone.date.getMonth(), milestone.date.getDate()).getTime(),
        );
        if (index === undefined) {
          continue;
        }

        milestones.push({
          key: milestone.key,
          label: milestone.label,
          index,
          date: milestone.date,
        });
      }

      nextRows.push({
        project,
        startIndex,
        endIndex,
        spanLength: Math.max(1, endIndex - startIndex + 1),
        isOverdue: isProjectOverdue(project),
        overdueDays: getProjectOverdueDays(project),
        isCompleted: isProjectCompleted(project),
        firstDraftDate: timeline.firstDraftDate,
        targetDate: timeline.completedDate,
        milestones,
        stageStops: buildStageStops(project, milestones, startIndex, endIndex),
      });
    }

    return nextRows.sort((left, right) => {
      const rankCompare = getProjectWorkflowRank(left.project) - getProjectWorkflowRank(right.project);
      if (rankCompare !== 0) {
        return rankCompare;
      }

      return left.startIndex - right.startIndex;
    });
  }, [dayIndexMap, days, projects]);

  const monthHeaders = useMemo(() => {
    if (!days.length) {
      return [] as Array<{ key: string; label: string; span: number }>;
    }

    const groups: Array<{ key: string; label: string; span: number }> = [];
    days.forEach((day) => {
      const key = `${day.getFullYear()}-${day.getMonth()}`;
      const label = new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: compact ? undefined : "numeric",
      }).format(day);

      const current = groups[groups.length - 1];
      if (current?.key === key) {
        current.span += 1;
        return;
      }

      groups.push({ key, label, span: 1 });
    });

    return groups;
  }, [compact, days]);

  const organizationsById = useMemo(
    () => new Map(clientOrganizations.map((organization) => [organization.id, organization])),
    [clientOrganizations],
  );

  const viewportHeight = useMemo(() => {
    if (!maxVisibleRows) {
      return undefined;
    }

    return 24 + headerHeight * 2 + rowHeight * maxVisibleRows + 6;
  }, [headerHeight, maxVisibleRows, rowHeight]);

  const updateHoveredIndex = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const nextIndex = Math.round(offsetX / daySize - 0.5);
    if (nextIndex < 0 || nextIndex >= days.length) {
      setHoveredDayIndex(null);
      return;
    }

    setHoveredDayIndex(nextIndex);
  };

  if (!rows.length) {
    return (
      <EmptyState $compact={compact}>
        <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
        <strong>No timeline yet</strong>
        <p>Add project dates to see the chart.</p>
      </EmptyState>
    );
  }

  return (
    <ChartShell>
      {title || viewAllHref ? (
        <ChartTopBar>
          {title ? <ChartTitleBadge>{title}</ChartTitleBadge> : <span />}
          {viewAllHref ? <ChartTopLink href={viewAllHref}>{viewAllLabel}</ChartTopLink> : null}
        </ChartTopBar>
      ) : null}
      <ChartScroll $viewportHeight={viewportHeight} $compact={compact}>
        <ChartGrid style={chartStyle}>
          <MonthHeaderSpacer />
          <MonthHeaderTrack $columns={days.length} onMouseMove={updateHoveredIndex} onMouseLeave={() => setHoveredDayIndex(null)}>
            {monthHeaders.map((group) => (
              <MonthHeaderCell key={group.key} style={{ gridColumn: `span ${group.span}` }}>
                {group.label}
              </MonthHeaderCell>
            ))}
            {lineLeft !== null ? <GuideLine $left={lineLeft} /> : null}
          </MonthHeaderTrack>

          <DayHeaderLabel>Projects</DayHeaderLabel>
          <DayHeaderTrack $columns={days.length} onMouseMove={updateHoveredIndex} onMouseLeave={() => setHoveredDayIndex(null)}>
            {days.map((day) => (
              <DayCell key={day.toISOString()} $today={new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() === todayKey}>
                <span>{day.getDate()}</span>
              </DayCell>
            ))}
            {lineLeft !== null ? <GuideLine $left={lineLeft} /> : null}
          </DayHeaderTrack>

          {rows.map((row, rowIndex) => {
            const organization =
              row.project.clientOrganizationId ? organizationsById.get(row.project.clientOrganizationId) ?? null : null;
            const labelContent = (
              <>
                <ProjectGlyph organization={organization} />
                <ProjectLabelCopy>
                  <strong>{row.project.projectRequestName || row.project.name}</strong>
                  <span>{formatProjectStage(row.project.stage)}</span>
                </ProjectLabelCopy>
              </>
            );
            const tooltipTitle = row.project.projectRequestName || row.project.name;
            const detailHref = hrefBuilder ? hrefBuilder(row.project) : null;

            return (
              <Fragment key={row.project.id}>
                <ProjectLabelCell
                  $hovered={hoveredRowId === row.project.id}
                  $overdue={row.isOverdue}
                  $completed={row.isCompleted}
                  onMouseEnter={() => setHoveredRowId(row.project.id)}
                  onMouseLeave={() => setHoveredRowId((current) => (current === row.project.id ? null : current))}
                >
                  {detailHref ? <ProjectLink href={detailHref}>{labelContent}</ProjectLink> : <ProjectLabelInner>{labelContent}</ProjectLabelInner>}
                </ProjectLabelCell>
                <TimelineCell
                  $columns={days.length}
                  $hovered={hoveredRowId === row.project.id}
                  $overdue={row.isOverdue}
                  $completed={row.isCompleted}
                  onMouseEnter={() => setHoveredRowId(row.project.id)}
                  onMouseLeave={() => {
                    setHoveredDayIndex(null);
                    setHoveredRowId((current) => (current === row.project.id ? null : current));
                  }}
                  onMouseMove={updateHoveredIndex}
                >
                  {days.map((day) => (
                    <TimelineDay
                      key={`${row.project.id}:${day.toISOString()}`}
                      $today={new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() === todayKey}
                    />
                  ))}
                  {lineLeft !== null ? <GuideLine $left={lineLeft} /> : null}
                  {row.startIndex === row.endIndex ? (
                    <SinglePointWrap style={{ gridColumn: `${row.startIndex + 1} / span 1` }}>
                      <SinglePointBar
                        $background={getProjectStatusColor(row.project)}
                        title={`${tooltipTitle} milestone`}
                      />
                    </SinglePointWrap>
                  ) : detailHref ? (
                    <TimelineBarLink
                      href={detailHref}
                      style={{ gridColumn: `${row.startIndex + 1} / span ${row.spanLength}` }}
                      title={`${tooltipTitle}: ${formatGanttDate(days[row.startIndex])} to ${formatGanttDate(days[Math.min(row.endIndex, days.length - 1)])}`}
                    >
                      <TimelineBar $background={`linear-gradient(90deg, ${row.stageStops
                        .map((stop) => `${stop.color} ${stop.percent.toFixed(2)}%`)
                        .join(", ")})`} />
                    </TimelineBarLink>
                  ) : (
                    <TimelineBarWrap style={{ gridColumn: `${row.startIndex + 1} / span ${row.spanLength}` }}>
                      <TimelineBar $background={`linear-gradient(90deg, ${row.stageStops
                        .map((stop) => `${stop.color} ${stop.percent.toFixed(2)}%`)
                        .join(", ")})`} />
                    </TimelineBarWrap>
                  )}
                  {row.milestones.map((milestone) => (
                    <MilestoneMarker
                      key={`${row.project.id}:${milestone.key}`}
                      title={milestone.label}
                      style={{ gridColumn: `${milestone.index + 1} / span 1` }}
                      $kind={milestone.key}
                    />
                  ))}
                  {hoveredRowId === row.project.id ? (
                    <RowTooltip $compact={compact} $placement={rowIndex === 0 ? "bottom" : "top"}>
                      <TooltipTitle>{tooltipTitle}</TooltipTitle>
                      <TooltipMeta>{formatProjectStage(row.project.stage)}</TooltipMeta>
                      {row.isOverdue ? <TooltipAlert>Overdue by {row.overdueDays} day{row.overdueDays === 1 ? "" : "s"}</TooltipAlert> : null}
                      <TooltipMilestones>
                        <TooltipMilestone>
                          <span>First Draft</span>
                          <strong>{row.firstDraftDate ? formatDetailedDate(row.firstDraftDate) : "N/A"}</strong>
                        </TooltipMilestone>
                        <TooltipMilestone>
                          <span>To be completed by</span>
                          <strong>{row.targetDate ? formatDetailedDate(row.targetDate) : "N/A"}</strong>
                        </TooltipMilestone>
                      </TooltipMilestones>
                      {!compact ? (
                        organization?.name ? <TooltipMeta>{organization.name}</TooltipMeta> : null
                      ) : null}
                    </RowTooltip>
                  ) : null}
                </TimelineCell>
              </Fragment>
            );
          })}
        </ChartGrid>
      </ChartScroll>
    </ChartShell>
  );
}

const emptySurface = css<{ $compact?: boolean }>`
  display: grid;
  place-items: center;
  min-height: ${({ $compact }) => ($compact ? "180px" : "320px")};
  padding: 20px;
  border: 1px dashed rgba(220, 210, 199, 0.95);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.7);
  text-align: center;

  strong,
  p {
    margin: 0;
  }

  p {
    max-width: 36ch;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }
`;

const EmptyState = styled.div<{ $compact?: boolean }>`
  ${emptySurface}
  gap: 10px;
`;

const EmptyImage = styled.img`
  width: 78px;
  height: 78px;
  object-fit: contain;
  opacity: 0.92;
`;

const ChartShell = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
`;

const ChartTopBar = styled.div`
  position: absolute;
  top: -1px;
  left: 10px;
  right: 10px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  pointer-events: none;
`;

const topBadgeCss = css`
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(230, 224, 215, 0.96);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 20px rgba(68, 53, 35, 0.08);
`;

const ChartTitleBadge = styled.strong`
  ${topBadgeCss}
  color: var(--color-text);
  font-size: 0.76rem;
  line-height: 1;
`;

const ChartTopLink = styled(Link)`
  ${topBadgeCss}
  pointer-events: auto;
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease,
    background-color 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    color: #1f4339;
    background: rgba(255, 248, 239, 0.96);
    box-shadow: 0 14px 24px rgba(68, 53, 35, 0.12);
  }
`;

const ChartScroll = styled.div<{ $viewportHeight?: number; $compact?: boolean }>`
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-bottom: 2px;
  height: ${({ $viewportHeight }) => ($viewportHeight ? `${$viewportHeight}px` : "auto")};
  min-height: ${({ $viewportHeight }) => ($viewportHeight ? `${$viewportHeight}px` : "0")};
  max-height: ${({ $viewportHeight }) => ($viewportHeight ? `${$viewportHeight}px` : "none")};

  ${({ $compact }) =>
    $compact
      ? css`
          scrollbar-width: none;

          &::-webkit-scrollbar {
            width: 0;
            height: 0;
          }

          &:hover {
            scrollbar-width: thin;
            scrollbar-color: rgba(162, 153, 140, 0.82) transparent;
          }

          &:hover::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }

          &:hover::-webkit-scrollbar-track {
            background: transparent;
          }

          &:hover::-webkit-scrollbar-thumb {
            border-radius: 999px;
            background: rgba(162, 153, 140, 0.82);
          }
        `
      : ""}
`;

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: var(--gantt-label-width) minmax(max-content, 1fr);
  min-width: calc(var(--gantt-label-width) + 840px);
`;

const headerSurface = css`
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(250, 247, 242, 0.995);
  backdrop-filter: blur(8px);
`;

const MonthHeaderSpacer = styled.div`
  ${headerSurface}
  position: sticky;
  left: 0;
  z-index: 22;
  width: var(--gantt-label-width);
  min-width: var(--gantt-label-width);
  max-width: var(--gantt-label-width);
  min-height: 26px;
  border-bottom: 1px solid rgba(235, 229, 220, 0.95);
  border-right: 1px solid rgba(235, 229, 220, 0.95);
`;

const MonthHeaderTrack = styled.div<{ $columns: number }>`
  ${headerSurface}
  position: sticky;
  top: 0;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, var(--gantt-day-size));
  min-height: 26px;
  border-bottom: 1px solid rgba(235, 229, 220, 0.95);
  overflow: hidden;
`;

const MonthHeaderCell = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const DayHeaderLabel = styled.div`
  ${headerSurface}
  position: sticky;
  top: 26px;
  left: 0;
  z-index: 22;
  width: var(--gantt-label-width);
  min-width: var(--gantt-label-width);
  max-width: var(--gantt-label-width);
  display: flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-right: 1px solid rgba(235, 229, 220, 0.95);
  border-bottom: 1px solid rgba(235, 229, 220, 0.95);
  color: var(--color-text-light);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const DayHeaderTrack = styled.div<{ $columns: number }>`
  ${headerSurface}
  position: sticky;
  top: 26px;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, var(--gantt-day-size));
  min-height: 28px;
  border-bottom: 1px solid rgba(235, 229, 220, 0.95);
  overflow: hidden;
`;

const DayCell = styled.div<{ $today?: boolean }>`
  display: grid;
  place-items: center;
  min-height: 28px;
  color: ${({ $today }) => ($today ? "#356fd6" : "var(--color-text-light)")};
  font-size: 0.64rem;
  font-weight: 700;
  background: ${({ $today }) => ($today ? "rgba(70, 124, 222, 0.12)" : "transparent")};
  border-left: 1px solid rgba(244, 239, 233, 0.95);
`;

const ProjectLabelCell = styled.div<{ $hovered?: boolean; $overdue?: boolean; $completed?: boolean }>`
  position: sticky;
  left: 0;
  z-index: 12;
  width: var(--gantt-label-width);
  min-width: var(--gantt-label-width);
  max-width: var(--gantt-label-width);
  display: flex;
  align-items: center;
  min-height: 46px;
  padding: 8px 12px;
  border-right: 1px solid rgba(235, 229, 220, 0.95);
  border-bottom: 1px solid rgba(244, 239, 233, 0.95);
  background: ${({ $completed, $overdue, $hovered }) =>
    $overdue
      ? $hovered
        ? "rgba(255, 228, 228, 0.98)"
        : "rgba(255, 238, 238, 0.98)"
      : $completed
        ? $hovered
          ? "rgba(232, 246, 236, 0.98)"
          : "rgba(239, 249, 242, 0.98)"
        : $hovered
          ? "rgba(255, 248, 239, 0.96)"
          : "rgba(255, 255, 255, 0.97)"};
  transition: background-color 0.14s ease;
`;

const ProjectLabelInner = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
`;

const ProjectLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
`;

const ProjectGlyph = styled(ClientTitleLogo)`
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 9px;
  border: 1px solid rgba(228, 219, 208, 0.92);
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  box-shadow: 0 8px 18px rgba(112, 91, 62, 0.08);
  color: #8c7040;
  font-size: 0.72rem;
  font-weight: 700;
  object-fit: cover;
`;

const ProjectLabelCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.8rem;
    color: var(--color-text);
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.67rem;
  }
`;

const TimelineCell = styled.div<{ $columns: number; $hovered?: boolean; $overdue?: boolean; $completed?: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, var(--gantt-day-size));
  min-height: 46px;
  border-bottom: 1px solid rgba(244, 239, 233, 0.95);
  background: ${({ $completed, $overdue, $hovered }) =>
    $overdue
      ? $hovered
        ? "rgba(255, 228, 228, 0.72)"
        : "rgba(255, 238, 238, 0.72)"
      : $completed
        ? $hovered
          ? "rgba(232, 246, 236, 0.72)"
          : "rgba(239, 249, 242, 0.72)"
        : $hovered
          ? "rgba(255, 248, 239, 0.72)"
          : "rgba(255, 255, 255, 0.72)"};
  transition: background-color 0.14s ease;
`;

const TimelineDay = styled.div<{ $today?: boolean }>`
  border-left: 1px solid rgba(244, 239, 233, 0.95);
  background: ${({ $today }) => ($today ? "rgba(70, 124, 222, 0.08)" : "transparent")};
`;

const GuideLine = styled.div<{ $left: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => `${$left}px`};
  z-index: 6;
  width: 2px;
  height: 100%;
  background: rgba(102, 102, 102, 0.72);
  transform: translateX(-50%);
  pointer-events: none;
`;

const TimelineBarWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  margin: 0 1px;
  z-index: 3;

  &:hover {
    z-index: 14;
  }

  &:hover > div:first-child {
    border-color: transparent;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.24),
      0 6px 12px rgba(66, 52, 33, 0.08);
  }
`;

const TimelineBarLink = styled(Link)`
  position: relative;
  display: flex;
  align-items: center;
  margin: 0 1px;
  color: inherit;
  text-decoration: none;
  z-index: 3;

  &:hover {
    z-index: 14;
  }

  &:hover > div:first-child {
    border-color: transparent;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.24),
      0 6px 12px rgba(66, 52, 33, 0.08);
  }
`;

const TimelineBar = styled.div<{ $background: string }>`
  width: 100%;
  height: 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: ${({ $background }) => $background};
  transition:
    border-color 0.14s ease,
    box-shadow 0.14s ease;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.24),
    0 6px 12px rgba(66, 52, 33, 0.08);
`;

const SinglePointWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
`;

const SinglePointBar = styled.div<{ $background: string }>`
  width: 14px;
  height: 10px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 999px;
  background: ${({ $background }) => $background};
  box-shadow:
    0 0 0 1px rgba(134, 117, 93, 0.18),
    0 6px 12px rgba(66, 52, 33, 0.1);
`;

const RowTooltip = styled.div<{ $compact?: boolean; $placement?: "top" | "bottom" }>`
  position: absolute;
  left: 18px;
  ${({ $placement }) => ($placement === "bottom" ? "top: calc(100% + 10px);" : "bottom: calc(100% + 10px);")}
  z-index: 40;
  min-width: ${({ $compact }) => ($compact ? "190px" : "240px")};
  max-width: ${({ $compact }) => ($compact ? "220px" : "300px")};
  padding: ${({ $compact }) => ($compact ? "10px 11px" : "12px 13px")};
  border: 1px solid rgba(225, 216, 206, 0.96);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 34px rgba(43, 31, 19, 0.16);
  transform: translateY(0);
  pointer-events: none;
`;

const TooltipTitle = styled.strong`
  display: block;
  margin-bottom: 4px;
  color: var(--color-text);
  font-size: 0.8rem;
  line-height: 1.25;
`;

const TooltipMeta = styled.div`
  color: var(--color-text-muted);
  font-size: 0.7rem;
  line-height: 1.4;
`;

const TooltipAlert = styled.div`
  color: #d15252;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.4;
`;

const TooltipMilestones = styled.div`
  display: grid;
  gap: 5px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(238, 231, 223, 0.95);
`;

const TooltipMilestone = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 0.68rem;

  strong {
    color: var(--color-text);
    font-size: 0.68rem;
    font-weight: 700;
  }
`;

const MilestoneBase = css`
  width: 10px;
  height: 10px;
  align-self: center;
  justify-self: center;
  border-radius: 999px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(161, 146, 126, 0.2);
  z-index: 2;
`;

const MilestoneDot = styled.div`
  ${MilestoneBase}
  background: #1f4339;
`;

const MilestoneMarker = styled.div<{ $kind: string }>`
  ${MilestoneBase}
  background: ${({ $kind }) =>
    $kind === "intake" ? INTAKE_COLOR : $kind === "first_draft" ? FIRST_DRAFT_COLOR : COMPLETED_COLOR};
`;
