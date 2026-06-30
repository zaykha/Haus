"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { AvatarPicker } from "@/components/avatar-picker";
import { useAppState } from "@/components/app-state";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { UserAvatar } from "@/components/user-avatar";
import { formatRole } from "@/lib/display";
import { defaultProfileAvatarPath } from "@/lib/profile-avatars";

export function ProfileScreen() {
  const router = useRouter();
  const { user, state, logout, updateProfileAvatar } = useAppState();
  const { scopedHref } = useActiveClientOrganization(user, state.clientOrganizations);
  const [selectedAvatarPath, setSelectedAvatarPath] = useState(user?.avatarPath ?? defaultProfileAvatarPath);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  useEffect(() => {
    setSelectedAvatarPath(user?.avatarPath ?? defaultProfileAvatarPath);
  }, [user?.avatarPath]);

  if (!user) {
    return null;
  }

  const avatarChanged = selectedAvatarPath !== (user.avatarPath ?? "");
  const details = [
    { label: "Role", value: <RoleBadge>{formatRole(user.role)}</RoleBadge> },
    { label: "Email", value: <InfoValue>{user.email}</InfoValue> },
    { label: "Contact", value: <InfoValue>{user.phone ?? "Not provided"}</InfoValue> },
    { label: "Job title", value: <InfoValue>{user.jobTitle ?? "Not provided"}</InfoValue> },
    { label: "Department", value: <InfoValue>{user.department ?? "Not provided"}</InfoValue> },
  ] as const;

  const handleSaveAvatar = async () => {
    setSavingAvatar(true);
    setAvatarError("");

    try {
      await updateProfileAvatar(selectedAvatarPath || null);
      return true;
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Unable to update avatar");
      return false;
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAvatarModalClose = () => {
    if (savingAvatar) {
      return;
    }

    setSelectedAvatarPath(user.avatarPath ?? defaultProfileAvatarPath);
    setAvatarError("");
    setShowAvatarModal(false);
  };

  return (
    <ProfilePage>
      <ProfileShell>
        {showAvatarModal ? (
          <ModalBackdrop onClick={handleAvatarModalClose}>
            <ModalCard onClick={(event) => event.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>Choose avatar</ModalTitle>
                <ModalClose type="button" onClick={handleAvatarModalClose} disabled={savingAvatar} aria-label="Close">
                  ×
                </ModalClose>
              </ModalHeader>

              <AvatarPicker
                value={selectedAvatarPath}
                onChange={setSelectedAvatarPath}
                disabled={savingAvatar}
                helperText="Animal avatars are only used for your user profile."
              />

              {avatarError ? <InlineError>{avatarError}</InlineError> : null}

              <ModalActions>
                <SecondaryButton type="button" onClick={handleAvatarModalClose} disabled={savingAvatar}>
                  Cancel
                </SecondaryButton>
                <SaveButton
                  type="button"
                  disabled={!avatarChanged || savingAvatar}
                  onClick={async () => {
                    const saved = await handleSaveAvatar();
                    if (saved) {
                      setShowAvatarModal(false);
                    }
                  }}
                >
                  {savingAvatar ? "Saving..." : "Save avatar"}
                </SaveButton>
              </ModalActions>
            </ModalCard>
          </ModalBackdrop>
        ) : null}

        <BackButton
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push(scopedHref("/dashboard"));
          }}
        >
          <BackIcon aria-hidden="true">←</BackIcon>
          <span>Back</span>
        </BackButton>

        <ProfileCard>
          <ProfileCardHeader>
            <ProfileHero>
              <AvatarButton
                type="button"
                onClick={() => setShowAvatarModal(true)}
                aria-label="Change profile avatar"
              >
                <UserAvatar user={user} />
              </AvatarButton>

              <ProfileCopy>
                <Eyebrow>Account</Eyebrow>
                <ProfileName>{user.name}</ProfileName>
                <ProfileEmail>{user.email}</ProfileEmail>
              </ProfileCopy>
            </ProfileHero>

            <SettingsButton href="/settings">Settings</SettingsButton>
          </ProfileCardHeader>

          <InfoGrid>
            {details.map((detail) => (
              <InfoItem key={detail.label}>
                <InfoLabel>{detail.label}</InfoLabel>
                {detail.value}
              </InfoItem>
            ))}
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

const ProfileCardHeader = styled.div`
  display: grid;
  gap: 14px;

  @media (min-width: 768px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
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

const SettingsButton = styled(Link)`
  min-height: 42px;
  width: fit-content;
  justify-self: start;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: #4b443c;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 800;
  text-decoration: none;
  box-shadow: 0 10px 22px rgba(31, 31, 31, 0.06);

  &:hover {
    background: #fff7ef;
  }

  @media (min-width: 768px) {
    justify-self: end;
  }
`;

const AvatarButton = styled.button`
  width: 72px;
  height: 72px;
  border-radius: 24px;
  overflow: hidden;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: #f7f1e8;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 12px 24px rgba(31, 31, 31, 0.1);
  }

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

const InlineError = styled.p`
  margin: 0;
  color: #b42318;
  font-size: 0.86rem;
  line-height: 1.4;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(21, 18, 14, 0.42);
  backdrop-filter: blur(8px);
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ModalCard = styled.div`
  width: min(680px, 100%);
  max-height: min(80vh, 760px);
  overflow-y: auto;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(243, 234, 219, 0.9), transparent 34%),
    rgba(255, 255, 255, 0.98);
  box-shadow: 0 30px 60px rgba(31, 31, 31, 0.16);
  padding: 22px;
  display: grid;
  gap: 18px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  color: #1f1f1f;
  font-size: 1.1rem;
  line-height: 1.2;
`;

const ModalClose = styled.button`
  width: 38px;
  height: 38px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: #fff;
  color: #4b443c;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;

  @media (max-width: 639px) {
    display: grid;
    grid-template-columns: 1fr;
  }
`;

const SecondaryButton = styled.button`
  min-height: 46px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: #fff;
  color: #4b443c;
  padding: 0 18px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const SaveButton = styled.button`
  min-height: 46px;
  width: fit-content;
  border: 0;
  border-radius: 14px;
  background: #2f5d50;
  color: #fff;
  padding: 0 18px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(47, 93, 80, 0.18);

  &:disabled {
    background: #b8b2aa;
    box-shadow: none;
    cursor: default;
  }

  @media (max-width: 639px) {
    width: 100%;
  }
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
