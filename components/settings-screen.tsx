"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { useAppState } from "@/components/app-state";
import { formatRole } from "@/lib/display";

export function SettingsScreen() {
  const router = useRouter();
  const { user } = useAppState();

  if (!user) {
    return null;
  }

  const canManageTrash = user.role !== "client" && user.role !== "designer";

  return (
    <SettingsPage>
      <SettingsShell>
        <BackButton
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/profile");
          }}
        >
          <BackIcon aria-hidden="true">←</BackIcon>
          <span>Back</span>
        </BackButton>

        <SettingsCard>
          <Header>
            <div>
              <Eyebrow>{formatRole(user.role)}</Eyebrow>
              <Title>Settings</Title>
              <Subtitle>Workspace administration, recovery tools, and scheduled cleanup settings.</Subtitle>
            </div>
          </Header>

          <Grid>
            <SectionCard>
              <SectionTitle>Trash & Recovery</SectionTitle>
              <SectionText>
                Deleted projects, tasks, team members, client organizations, and liaisons are now archived first.
              </SectionText>
              <PillRow>
                <Pill>30-day retention</Pill>
                <Pill>Restore support next</Pill>
              </PillRow>
              {canManageTrash ? (
                <PrimaryLink href="/settings/trash">Open Trash Log</PrimaryLink>
              ) : (
                <MutedNote>Manager-only access</MutedNote>
              )}
            </SectionCard>

            <SectionCard>
              <SectionTitle>Scheduled Cleanup</SectionTitle>
              <SectionText>
                Storage files should be purged by a daily Supabase Edge Function after the 30-day retention window.
              </SectionText>
              <PillRow>
                <Pill>Daily edge function</Pill>
                <Pill>Queued storage cleanup</Pill>
              </PillRow>
              <MutedNote>Next step: deploy the cleanup function and connect a daily schedule.</MutedNote>
            </SectionCard>
          </Grid>
        </SettingsCard>
      </SettingsShell>
    </SettingsPage>
  );
}

const SettingsPage = styled.main`
  min-height: 100vh;
  padding: 18px 14px 28px;
  display: flex;
  align-items: flex-start;
  justify-content: center;

  @media (min-width: 768px) {
    padding: 48px 24px;
    align-items: center;
  }
`;

const SettingsShell = styled.div`
  width: 100%;
  max-width: 880px;
  display: grid;
  gap: 14px;
`;

const BackButton = styled.button`
  width: fit-content;
  min-height: 42px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: #4b443c;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(31, 31, 31, 0.06);

  &:hover {
    background: #fff7ef;
  }
`;

const BackIcon = styled.span`
  font-size: 1rem;
  line-height: 1;
`;

const SettingsCard = styled.section`
  width: 100%;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(243, 234, 219, 0.9), transparent 34%),
    rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(31, 31, 31, 0.1);
  padding: 20px;
  display: grid;
  gap: 20px;

  @media (min-width: 768px) {
    padding: 28px;
    gap: 24px;
  }
`;

const Header = styled.div`
  display: grid;
  gap: 8px;
`;

const Eyebrow = styled.p`
  margin: 0;
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  color: #1f1f1f;
  font-size: clamp(1.45rem, 4vw, 2.15rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.92rem;
  line-height: 1.5;
`;

const Grid = styled.div`
  display: grid;
  gap: 14px;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SectionCard = styled.div`
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 20px;
  background: rgba(251, 250, 247, 0.9);
  padding: 18px;
  display: grid;
  gap: 12px;
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: #1f1f1f;
  font-size: 1rem;
  line-height: 1.2;
`;

const SectionText = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.9rem;
  line-height: 1.5;
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Pill = styled.span`
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #f1e8d9;
  color: #7d6338;
  font-size: 0.8rem;
  font-weight: 700;
`;

const PrimaryLink = styled(Link)`
  min-height: 44px;
  width: fit-content;
  padding: 0 16px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #2f5d50;
  color: #fff;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 800;
  box-shadow: 0 14px 28px rgba(47, 93, 80, 0.18);
`;

const MutedNote = styled.p`
  margin: 0;
  color: #7f7468;
  font-size: 0.82rem;
  line-height: 1.45;
`;
