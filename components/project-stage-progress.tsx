"use client";

import styled from "styled-components";
import { formatProjectStage } from "@/lib/display";
import { ProjectStage } from "@/lib/types";

const STAGE_COLORS = {
  1: "#9f9486",
  2: "#4770d8",
  3: "#ca8a22",
  4: "#5ca16d",
} as const;

export function getProjectStageStep(stage: ProjectStage | string) {
  switch (stage) {
    case "Waiting List":
    case "intake":
      return 1;
    case "WIP":
    case "concept":
    case "design":
      return 2;
    case "Pending Review":
    case "review":
      return 3;
    case "Complete":
    case "delivery":
      return 4;
    case "On Hold":
      return 2;
    default:
      return 1;
  }
}

export function getProjectStagePercent(stage: ProjectStage | string) {
  return getProjectStageStep(stage) * 25;
}

function getStageColor(stage: ProjectStage | string) {
  return STAGE_COLORS[getProjectStageStep(stage)];
}

type ProjectStageProgressProps = {
  stage: ProjectStage | string;
  size?: "sm" | "md";
  showStageLabel?: boolean;
};

export function ProjectStageProgress({
  stage,
  size = "md",
  showStageLabel = true,
}: ProjectStageProgressProps) {
  const step = getProjectStageStep(stage);
  const percent = getProjectStagePercent(stage);
  const color = getStageColor(stage);
  const stageLabel = formatProjectStage(stage as ProjectStage);

  return (
    <ProgressWrap $size={size}>
      <Segments aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Segment
            key={index}
            $active={index < step}
            $color={color}
            $size={size}
          />
        ))}
      </Segments>
      <MetaText $size={size}>
        <PercentText $size={size}>{percent}%</PercentText>
        {showStageLabel ? <StageText $size={size}>{stageLabel}</StageText> : null}
      </MetaText>
    </ProgressWrap>
  );
}

const ProgressWrap = styled.div<{ $size: "sm" | "md" }>`
  width: 100%;
  min-width: ${({ $size }) => ($size === "sm" ? "164px" : "208px")};
  display: flex;
  align-items: center;
  gap: ${({ $size }) => ($size === "sm" ? "8px" : "10px")};
`;

const MetaText = styled.div<{ $size: "sm" | "md" }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ $size }) => ($size === "sm" ? "5px" : "6px")};
  white-space: nowrap;
  flex: 0 0 auto;
`;

const Segments = styled.div`
  flex: 1 1 auto;
  min-width: 72px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
`;

const Segment = styled.span<{
  $active: boolean;
  $color: string;
  $size: "sm" | "md";
}>`
  height: ${({ $size }) => ($size === "sm" ? "6px" : "8px")};
  border-radius: 999px;
  background: ${({ $active, $color }) => ($active ? $color : "#ece7df")};
  transition: background 160ms ease;
`;

const PercentText = styled.span<{ $size: "sm" | "md" }>`
  color: #2e2a27;
  font-size: ${({ $size }) => ($size === "sm" ? "0.72rem" : "0.8rem")};
  line-height: 1;
  font-weight: 700;
`;

const StageText = styled.span<{ $size: "sm" | "md" }>`
  color: #7d7266;
  font-size: ${({ $size }) => ($size === "sm" ? "0.68rem" : "0.76rem")};
  line-height: 1;
  font-weight: 600;
`;
