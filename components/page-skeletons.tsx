"use client";

import styled, { css, keyframes } from "styled-components";

const desktop = "@media (min-width: 768px)";

export function DashboardScreenSkeleton({
  variant = "generic",
}: {
  variant?: "manager" | "client" | "generic";
}) {
  if (variant === "client") {
    return (
      <Shell>
        <Content>
          <HeaderBlock>
            <HeaderBrandRow>
              <LogoBlock />
              <HeaderCopy>
                <Line $w="220px" $h="30px" />
                <PillRow>
                  <PillStub />
                  <PillStub />
                </PillRow>
              </HeaderCopy>
            </HeaderBrandRow>
            <Line $w="280px" $h="14px" />
          </HeaderBlock>

          <MobileStatsRail>
            {Array.from({ length: 4 }, (_, index) => (
              <CompactStatCard key={index}>
                <Line $w="44px" $h="18px" />
                <Line $w="72px" $h="10px" />
              </CompactStatCard>
            ))}
          </MobileStatsRail>

          <StatsGrid>
            {Array.from({ length: 4 }, (_, index) => (
              <StatCard key={index}>
                <AvatarBlock />
                <StatCopy>
                  <Line $w="64px" $h="24px" />
                  <Line $w="96px" $h="12px" />
                </StatCopy>
              </StatCard>
            ))}
          </StatsGrid>

          <PanelGrid>
            <PanelCard>
              <PanelHeader>
                <Line $w="128px" $h="18px" />
                <Line $w="54px" $h="12px" />
              </PanelHeader>
              <Stack>
                {Array.from({ length: 3 }, (_, rowIndex) => (
                  <ProjectRowCard key={rowIndex}>
                    <LogoBlock $small />
                    <ListCopy>
                      <Line $w="48%" $h="16px" />
                      <Line $w="34%" $h="12px" />
                      <PillRow>
                        <PillStub />
                        <PillStub />
                      </PillRow>
                    </ListCopy>
                  </ProjectRowCard>
                ))}
              </Stack>
            </PanelCard>

            {Array.from({ length: 3 }, (_, index) => (
              <PanelCard key={index}>
                <PanelHeader>
                  <Line $w={index === 0 ? "148px" : "116px"} $h="18px" />
                  <Line $w="54px" $h="12px" />
                </PanelHeader>
                <Stack>
                  {Array.from({ length: 3 }, (_, rowIndex) => (
                    <RowCard key={rowIndex}>
                      <AvatarBlock />
                      <Stack>
                        <Line $w="62%" $h="14px" />
                        <Line $w="42%" $h="12px" />
                      </Stack>
                    </RowCard>
                  ))}
                </Stack>
              </PanelCard>
            ))}
          </PanelGrid>
        </Content>
      </Shell>
    );
  }

  return (
    <Shell>
      <Content>
        <HeaderBlock>
          <Line $w="84px" $h="12px" />
          <Line $w="180px" $h="30px" />
          <Line $w="280px" $h="14px" />
        </HeaderBlock>

        <MobileStatsRail>
          {Array.from({ length: 4 }, (_, index) => (
            <CompactStatCard key={index}>
              <Line $w="44px" $h="18px" />
              <Line $w="72px" $h="10px" />
            </CompactStatCard>
          ))}
        </MobileStatsRail>

        <StatsGrid>
          {Array.from({ length: 4 }, (_, index) => (
            <StatCard key={index}>
              <AvatarBlock />
              <StatCopy>
                <Line $w="64px" $h="24px" />
                <Line $w="96px" $h="12px" />
              </StatCopy>
            </StatCard>
          ))}
        </StatsGrid>

        <PanelGrid>
          {Array.from({ length: variant === "manager" ? 4 : 3 }, (_, index) => (
            <PanelCard key={index}>
              <PanelHeader>
                <Line $w="140px" $h="18px" />
                <Line $w="54px" $h="12px" />
              </PanelHeader>
              <Stack>
                {Array.from({ length: 3 }, (_, rowIndex) => (
                  <RowCard key={rowIndex}>
                    <AvatarBlock />
                    <Stack>
                      <Line $w="62%" $h="14px" />
                      <Line $w="42%" $h="12px" />
                    </Stack>
                  </RowCard>
                ))}
              </Stack>
            </PanelCard>
          ))}
        </PanelGrid>
      </Content>
    </Shell>
  );
}

export function ListScreenSkeleton({
  title,
  showStats = true,
}: {
  title: string;
  showStats?: boolean;
}) {
  return (
    <Shell>
      <Content>
        <HeaderBlock>
          <Line $w="96px" $h="12px" />
          <Line $w={`${Math.max(140, title.length * 12)}px`} $h="30px" />
          <Line $w="300px" $h="14px" />
        </HeaderBlock>

        <Toolbar>
          <SearchStub />
          <ActionStub />
          <ActionStub />
        </Toolbar>

        {showStats ? (
          <StatsGrid>
            {Array.from({ length: 4 }, (_, index) => (
              <StatCard key={index}>
                <AvatarBlock />
                <StatCopy>
                  <Line $w="54px" $h="22px" />
                  <Line $w="80px" $h="12px" />
                </StatCopy>
              </StatCard>
            ))}
          </StatsGrid>
        ) : null}

        <Stack>
          {Array.from({ length: 6 }, (_, index) => (
            <ListCard key={index}>
              <AvatarBlock />
              <ListCopy>
                <Line $w={index % 2 === 0 ? "34%" : "42%"} $h="16px" />
                <Line $w="28%" $h="12px" />
                <PillRow>
                  <PillStub />
                  <PillStub />
                  <PillStub />
                </PillRow>
              </ListCopy>
            </ListCard>
          ))}
        </Stack>
      </Content>
    </Shell>
  );
}

const shimmer = keyframes`
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -100% 0;
  }
`;

const shimmerBlock = css`
  background: linear-gradient(
    90deg,
    rgba(236, 231, 223, 0.9) 0%,
    rgba(247, 243, 237, 0.98) 50%,
    rgba(236, 231, 223, 0.9) 100%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.2s linear infinite;
`;

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 28px rgba(31, 31, 31, 0.06);
`;

const Shell = styled.main`
  display: block;
  min-height: 100vh;
  padding: 16px 14px 20px;

  ${desktop} {
    padding: 18px 20px 24px;
    background: rgba(255, 255, 255, 0.58);
  }
`;

const Content = styled.section`
  display: grid;
  gap: 14px;

  ${desktop} {
    max-width: 1200px;
    margin: 0 auto;
  }
`;

const HeaderBlock = styled.div`
  display: grid;
  gap: 8px;
`;

const HeaderBrandRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const HeaderCopy = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px 92px;
  gap: 10px;

  ${desktop} {
    grid-template-columns: minmax(0, 1fr) 140px 140px;
  }
`;

const SearchStub = styled.div`
  ${cardSurface}
  ${shimmerBlock}
  height: 42px;
  border-radius: 12px;
`;

const ActionStub = styled(SearchStub)``;

const StatsGrid = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
`;

const StatCard = styled.div`
  ${cardSurface}
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
`;

const CompactStatCard = styled(StatCard)`
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 128px;
  padding: 14px;
`;

const StatCopy = styled.div`
  display: grid;
  gap: 6px;
`;

const MobileStatsRail = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(128px, 1fr);
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;

  ${desktop} {
    display: none;
  }
`;

const PanelGrid = styled.div`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const PanelCard = styled.section`
  ${cardSurface}
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Stack = styled.div`
  display: grid;
  gap: 12px;
`;

const RowCard = styled.div`
  ${cardSurface}
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
`;

const ProjectRowCard = styled(RowCard)`
  align-items: flex-start;
`;

const ListCard = styled.div`
  ${cardSurface}
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
`;

const ListCopy = styled.div`
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 8px;
`;

const PillRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const PillStub = styled.span`
  ${shimmerBlock}
  width: 72px;
  height: 22px;
  border-radius: 999px;
`;

const AvatarBlock = styled.div`
  ${shimmerBlock}
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 12px;
`;

const LogoBlock = styled(AvatarBlock)<{ $small?: boolean }>`
  width: ${({ $small }) => ($small ? "46px" : "54px")};
  height: ${({ $small }) => ($small ? "46px" : "54px")};
  flex: 0 0 ${({ $small }) => ($small ? "46px" : "54px")};
  border-radius: ${({ $small }) => ($small ? "14px" : "16px")};
`;

const Line = styled.div<{ $w: string; $h: string }>`
  ${shimmerBlock}
  width: ${({ $w }) => $w};
  max-width: 100%;
  height: ${({ $h }) => $h};
  border-radius: 999px;
`;
