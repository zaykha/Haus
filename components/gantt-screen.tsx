"use client";

import { useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { GanttChart } from "@/components/gantt-chart";
import { HeaderProfileAvatarLink } from "@/components/header-profile-avatar-link";
import { useAppState } from "@/components/app-state";
import { DashboardScreenSkeleton } from "@/components/page-skeletons";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { formatRole } from "@/lib/display";
import { compareProjectsByWorkflowPriority } from "@/lib/project-ranking";
import { canViewProject } from "@/lib/permissions";
import { GanttRangeMode } from "@/lib/gantt";

const desktop = "@media (min-width: 1100px)";

export function GanttScreen() {
  const { ready, workspaceReady, state, user } = useAppState();
  const [rangeMode, setRangeMode] = useState<GanttRangeMode>("month");
  const { scopedHref } = useActiveClientOrganization(user, state.clientOrganizations);

  const visibleProjects = useMemo(
    () =>
      user
        ? state.projects
            .filter((project) => canViewProject(user, project))
            .slice()
            .sort(compareProjectsByWorkflowPriority)
        : [],
    [state.projects, user],
  );

  if (!ready || (user ? !workspaceReady : false)) {
    return <DashboardScreenSkeleton variant={user?.role === "client" ? "client" : "manager"} />;
  }

  if (!user) {
    return null;
  }

  return (
    <Shell>
      <SidebarSlot>
        <AppSidebar user={user} activeLabel="Gantt" pinToViewport />
      </SidebarSlot>
      <Content>
        <Header>
          <div>
            <Eyebrow>{formatRole(user.role).toUpperCase()}</Eyebrow>
            <Title>Gantt Timeline</Title>
            <Subtitle>Timeline view across visible projects using intake, first draft, and final/completion dates.</Subtitle>
          </div>
          <HeaderActions>
            <RangeToggle>
              <RangeButton type="button" $active={rangeMode === "month"} onClick={() => setRangeMode("month")}>
                1 Month
              </RangeButton>
              <RangeButton type="button" $active={rangeMode === "months"} onClick={() => setRangeMode("months")}>
                6 Months
              </RangeButton>
            </RangeToggle>
            <HeaderProfileAvatarLink user={user} />
          </HeaderActions>
        </Header>

        <TimelineCard>
          <CardHeader>
            <div>
              <CardTitle>Project Schedule</CardTitle>
              <CardCopy>
                Showing {visibleProjects.length} visible project{visibleProjects.length === 1 ? "" : "s"}.
              </CardCopy>
            </div>
            <CardTag>
              {rangeMode === "months" ? "Current + next 6 months" : "Current month"}
            </CardTag>
          </CardHeader>
          <GanttChart
            projects={visibleProjects}
            clientOrganizations={state.clientOrganizations}
            rangeMode={rangeMode}
            hrefBuilder={(project) => scopedHref(`/projects/${project.id}`)}
          />
        </TimelineCard>
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

const SidebarSlot = styled.div`
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
    min-height: calc(100vh - 16px);
    max-height: calc(100vh - 16px);
    padding: 24px 28px;
    border-radius: 0 26px 26px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.68), transparent 18%),
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
  margin: 0 0 6px;
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(1.3rem, 2.4vw, 1.9rem);
  line-height: 1.05;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 8px 0 0;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1.45;
  max-width: 64ch;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const RangeToggle = styled.div`
  ${cardSurface}
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
`;

const RangeButton = styled.button<{ $active?: boolean }>`
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "#1f4339" : "transparent")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--color-text-muted)")};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
`;

const TimelineCard = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 16px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 18px;
  border-radius: 26px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const CardTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
`;

const CardCopy = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
`;

const CardTag = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.92);
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
`;
