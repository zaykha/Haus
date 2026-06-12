"use client";

import styled from "styled-components";
import { useAppState } from "@/components/app-state";
import { formatRole } from "@/lib/display";

export function ProfileScreen() {
  const { user, logout, mode } = useAppState();

  if (!user) {
    return null;
  }

  const userInitial = user.name.trim().charAt(0).toUpperCase() || "U";

  return (
    <ProfilePage>
      <ProfileShell>
        <ProfileCard>
          <ProfileHero>
            <Avatar>{userInitial}</Avatar>

            <ProfileCopy>
              <Eyebrow>Account</Eyebrow>
              <ProfileName>{user.name}</ProfileName>
              <ProfileEmail>{user.email}</ProfileEmail>
            </ProfileCopy>
          </ProfileHero>

          <InfoGrid>
            <InfoItem>
              <InfoLabel>Role</InfoLabel>
              <RoleBadge>{formatRole(user.role)}</RoleBadge>
            </InfoItem>

            <InfoItem>
              <InfoLabel>Email</InfoLabel>
              <InfoValue>{user.email}</InfoValue>
            </InfoItem>
          </InfoGrid>

          <Divider />

          <ActionArea>
            <ActionCopy>
              <ActionTitle>Session</ActionTitle>
              <ActionText>Sign out when you are done using this workspace.</ActionText>
            </ActionCopy>

            <SignOutButton type="button" onClick={() => logout()}>
              Sign out
            </SignOutButton>
          </ActionArea>
        </ProfileCard>
      </ProfileShell>
    </ProfilePage>
  );
}

const ProfilePage = styled.main`
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

const ProfileShell = styled.div`
  width: 100%;
  max-width: 680px;
`;

const ProfileCard = styled.section`
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

const ProfileHero = styled.div`
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 16px;
  align-items: center;

  @media (min-width: 768px) {
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 20px;
  }
`;

const Avatar = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 24px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #5e4c37;
  font-size: 1.85rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);

  @media (min-width: 768px) {
    width: 88px;
    height: 88px;
    border-radius: 28px;
    font-size: 2.15rem;
  }
`;

const ProfileCopy = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.p`
  margin: 0 0 6px;
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const ProfileName = styled.h1`
  margin: 0;
  color: #1f1f1f;
  font-size: clamp(1.45rem, 4vw, 2.15rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
`;

const ProfileEmail = styled.p`
  margin: 8px 0 0;
  color: #6f6a63;
  font-size: 0.92rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
`;

const InfoGrid = styled.div`
  display: grid;
  gap: 10px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const InfoItem = styled.div`
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(251, 250, 247, 0.9);
  padding: 14px;
  display: grid;
  align-content: start;
  gap: 10px;
`;

const InfoLabel = styled.span`
  color: #7f7468;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const InfoValue = styled.strong`
  color: #2e2a27;
  font-size: 0.95rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const RoleBadge = styled.strong`
  width: fit-content;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #e6f0ec;
  color: #2f5d50;
  font-size: 0.86rem;
  line-height: 1;
`;

const Divider = styled.hr`
  width: 100%;
  height: 1px;
  border: 0;
  background: rgba(230, 224, 215, 0.95);
  margin: 0;
`;

const ActionArea = styled.div`
  display: grid;
  gap: 16px;

  @media (min-width: 640px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
`;

const ActionCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const ActionTitle = styled.h2`
  margin: 0;
  color: #1f1f1f;
  font-size: 1rem;
  line-height: 1.2;
`;

const ActionText = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.88rem;
  line-height: 1.45;
`;

const SignOutButton = styled.button`
  min-height: 46px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: #fff;
  color: #b42318;
  padding: 0 18px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(31, 31, 31, 0.06);

  &:hover {
    background: #fdecec;
    border-color: rgba(180, 35, 24, 0.16);
  }

  @media (max-width: 639px) {
    width: 100%;
  }
`;