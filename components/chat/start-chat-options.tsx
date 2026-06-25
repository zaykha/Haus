"use client";

import { useMemo, useState } from "react";
import styled from "styled-components";
import type { ClientOrganization, Role, User } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";

const mobileOnly = "@media (max-width: 1099px)";

export default function StartChatOptions({
  currentUser,
  users,
  clientOrganizations,
  clientOrganizationIds,
  existingDirectUserIds,
  existingOrganizationIds,
  disabled = false,
  mode,
  onModeChange,
  onStartDirectChat,
  onStartOrganizationChat,
}: {
  currentUser: User;
  users: User[];
  clientOrganizations: ClientOrganization[];
  clientOrganizationIds: string[];
  existingDirectUserIds: string[];
  existingOrganizationIds: string[];
  disabled?: boolean;
  mode: "direct" | "org";
  onModeChange: (m: "direct" | "org") => void;
  onStartDirectChat: (targetUserId: string) => void;
  onStartOrganizationChat: (organizationId: string) => void;
}) {
  const role = currentUser.role;

const [search, setSearch] = useState("");

const currentUserOrgIds = useMemo(
  () =>
    currentUser.clientOrganizationIds ??
    (currentUser.clientOrganizationId ? [currentUser.clientOrganizationId] : []),
  [currentUser.clientOrganizationId, currentUser.clientOrganizationIds],
);

const isManager = role === "communication_manager" || role === "creative_manager";
const existingDirectUserIdSet = useMemo(() => new Set(existingDirectUserIds), [existingDirectUserIds]);
const existingOrganizationIdSet = useMemo(() => new Set(existingOrganizationIds), [existingOrganizationIds]);

const availableUsers = useMemo(() => {
  return users
    .filter((candidate) => candidate.id !== currentUser.id)
    .filter((candidate) => !existingDirectUserIdSet.has(candidate.id))
    .filter((candidate) => {
      if (isManager) {
        return true;
      }

      if (role === "designer") {
        return (
          candidate.role === "communication_manager" ||
          candidate.role === "creative_manager" ||
          candidate.role === "designer"
        );
      }

      if (role === "client") {
        const candidateOrgIds =
          candidate.clientOrganizationIds ??
          (candidate.clientOrganizationId ? [candidate.clientOrganizationId] : []);

        const sameOrg = candidateOrgIds.some((orgId) => currentUserOrgIds.includes(orgId));

        return (
          candidate.role === "communication_manager" ||
          candidate.role === "creative_manager" ||
          (candidate.role === "client" && sameOrg)
        );
      }

      return false;
    })
    .filter((candidate) => {
      const searchText = [
        candidate.name,
        candidate.email,
        candidate.role,
        candidate.jobTitle,
        candidate.department,
        candidate.company,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchText.includes(search.trim().toLowerCase());
    });
}, [users, currentUser, currentUserOrgIds, existingDirectUserIdSet, isManager, role, search]);

const availableOrganizations = useMemo(() => {
  if (role === "designer") {
    return [];
  }

  const orgs = isManager
    ? clientOrganizations
    : clientOrganizations.filter((organization) => currentUserOrgIds.includes(organization.id));

  return orgs.filter((organization) => {
    if (existingOrganizationIdSet.has(organization.id)) {
      return false;
    }

    const memberCount = users.filter((candidate) => {
      const candidateOrgIds =
        candidate.clientOrganizationIds ??
        (candidate.clientOrganizationId ? [candidate.clientOrganizationId] : []);

      return candidate.role === "client" && candidateOrgIds.includes(organization.id);
    }).length;

    if (memberCount === 0) {
      return false;
    }

    const searchText = [
      organization.name,
      organization.type,
      organization.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchText.includes(search.trim().toLowerCase());
  });
}, [clientOrganizations, currentUserOrgIds, existingOrganizationIdSet, isManager, role, search, users]);
  const allowed = useMemo(() => {
    if (role === "designer") {
      return { direct: true, org: false };
    }

    if (role === "client") {
      return { direct: true, org: true };
    }

    // Managers
    return { direct: true, org: true };
  }, [role]);

  const resolvedMode: "direct" | "org" = allowed.org ? mode : "direct";

  return (
    <StartChatWrapper>
      <ModePicker>
        {allowed.direct ? (
          <ModeButton
            type="button"
            $active={resolvedMode === "direct"}
            disabled={disabled}
            onClick={() => onModeChange("direct")}
          >
            <IconIndividuals />
            Individuals
          </ModeButton>
        ) : null}

        {allowed.org ? (
          <ModeButton
            type="button"
            $active={resolvedMode === "org"}
            disabled={disabled}
            onClick={() => onModeChange("org")}
          >
            <IconOrganization />
            Organization groups
          </ModeButton>
        ) : null}
      </ModePicker>

        <SearchInput
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search people or organizations..."
        />

        <PickerTitle>
          {resolvedMode === "direct" ? "Available individuals" : "Available organization groups"}
        </PickerTitle>

        <CardList>
          {resolvedMode === "direct"
            ? availableUsers.map((candidate) => (
                <RecipientCard
                  key={candidate.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onStartDirectChat(candidate.id)}
                >
                  <RecipientAvatarWrap>
                    <UserAvatar user={candidate} />
                  </RecipientAvatarWrap>
                  <RecipientMeta>
                    <RecipientName>{candidate.name}</RecipientName>
                    <RecipientDetail>
                      {formatRoleLabel(candidate.role)}
                      {candidate.jobTitle ? ` · ${candidate.jobTitle}` : ""}
                      {candidate.department ? ` · ${candidate.department}` : ""}
                    </RecipientDetail>
                    <RecipientSub>{candidate.email}</RecipientSub>
                  </RecipientMeta>
                </RecipientCard>
              ))
            : availableOrganizations.map((organization) => {
                const memberCount = users.filter((candidate) => {
                  const candidateOrgIds =
                    candidate.clientOrganizationIds ??
                    (candidate.clientOrganizationId ? [candidate.clientOrganizationId] : []);

                  return candidate.role === "client" && candidateOrgIds.includes(organization.id);
                }).length;

                return (
                  <RecipientCard
                    key={organization.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onStartOrganizationChat(organization.id)}
                  >
                    <OrgAvatar>{getOrgInitials(organization.name)}</OrgAvatar>
                    <RecipientMeta>
                      <RecipientName>{organization.name}</RecipientName>
                      <RecipientDetail>
                        {organization.type ?? "organization"}
                        {organization.status ? ` · ${organization.status}` : ""}
                      </RecipientDetail>
                      <RecipientSub>{memberCount} liaison{memberCount === 1 ? "" : "s"}</RecipientSub>
                    </RecipientMeta>
                  </RecipientCard>
                );
              })}

          {resolvedMode === "direct" && availableUsers.length === 0 ? (
            <EmptyResult>No matching people found.</EmptyResult>
          ) : null}

          {resolvedMode === "org" && availableOrganizations.length === 0 ? (
            <EmptyResult>No matching organizations found.</EmptyResult>
          ) : null}
        </CardList>

        {role === "client" && clientOrganizationIds.length === 0 ? (
          <EmptyResult>No linked client organizations found.</EmptyResult>
        ) : null}

    </StartChatWrapper>
  );
}

function roleLabel(role: Role) {
  switch (role) {
    case "communication_manager":
      return "Manager";
    case "creative_manager":
      return "Manager";
    case "designer":
      return "Designer";
    case "client":
      return "Client";
    default:
      return "User";
  }
}
function formatRoleLabel(role: User["role"]) {
  switch (role) {
    case "communication_manager":
      return "Communication Manager";
    case "creative_manager":
      return "Creative Manager";
    case "designer":
      return "Designer";
    case "client":
      return "Client Liaison";
    default:
      return "User";
  }
}

function getOrgInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function IconIndividuals() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M4.5 18a5.5 5.5 0 0 1 9 0" />
      <path d="M14.5 18a4.5 4.5 0 0 1 5-3.7" />
    </svg>
  );
}

function IconOrganization() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16" />
      <path d="M6 20V7.5L12 4l6 3.5V20" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M9 14h.01" />
      <path d="M15 14h.01" />
      <path d="M11 20v-3h2v3" />
    </svg>
  );
}


const SearchInput = styled.input`
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 1rem;
  outline: none;

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 4px rgba(47, 93, 80, 0.1);
  }

  ${mobileOnly} {
    min-height: 36px;
    padding: 0 12px;
    font-size: 16px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`;

const CardList = styled.div`
  display: grid;
  gap: 10px;
  min-height: 0;
  max-height: min(40vh, 440px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 8px 12px 0;

  ${mobileOnly} {
    gap: 8px;
    max-height: min(46dvh, 380px);
    padding: 2px 4px 8px 0;
  }
`;

const RecipientCard = styled.button`
  width: 100%;
  min-width: 0;
  height: 74px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface);
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
  }

  &:disabled {
    opacity: 0.62;
    cursor: wait;
  }

  ${mobileOnly} {
    height: 64px;
    border-radius: 16px;
    padding: 10px 12px;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 10px;
  }
`;

const RecipientAvatarWrap = styled.div`
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  max-width: 48px;
  max-height: 48px;
  border-radius: 16px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--color-accent-soft);
  color: var(--color-text);
  font-weight: 900;
  flex: 0 0 auto;

  img,
  picture,
  svg {
    width: 48px !important;
    height: 48px !important;
    max-width: 48px !important;
    max-height: 48px !important;
    object-fit: cover;
    display: block;
  }

  > * {
    width: 48px !important;
    height: 48px !important;
    max-width: 48px !important;
    max-height: 48px !important;
  }

  ${mobileOnly} {
    width: 42px;
    height: 42px;
    min-width: 42px;
    min-height: 42px;
    max-width: 42px;
    max-height: 42px;
    border-radius: 14px;

    img,
    picture,
    svg,
    > * {
      width: 42px !important;
      height: 42px !important;
      max-width: 42px !important;
      max-height: 42px !important;
    }
  }
`;

const RecipientMeta = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;
`;

const RecipientName = styled.div`
  min-width: 0;
  font-weight: 900;
  font-size: 0.94rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${mobileOnly} {
    font-size: 0.84rem;
  }
`;

const RecipientDetail = styled.div`
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${mobileOnly} {
    font-size: 0.72rem;
  }
`;

const RecipientSub = styled.div`
  min-width: 0;
  color: var(--color-text-light);
  font-size: 0.74rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${mobileOnly} {
    font-size: 0.68rem;
  }
`;

const OrgAvatar = styled.div`
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  max-width: 48px;
  max-height: 48px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 900;
  font-size: 0.82rem;
  flex: 0 0 auto;
  overflow: hidden;

  ${mobileOnly} {
    width: 42px;
    height: 42px;
    min-width: 42px;
    min-height: 42px;
    max-width: 42px;
    max-height: 42px;
    border-radius: 14px;
    font-size: 0.76rem;
  }
`;

const EmptyResult = styled.div`
  border: 1px dashed var(--color-border-strong);
  border-radius: 16px;
  padding: 14px;
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
  font-size: 0.84rem;

  ${mobileOnly} {
    padding: 12px;
    border-radius: 14px;
    font-size: 0.76rem;
  }
`;

const StartChatWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;

  ${mobileOnly} {
    gap: 10px;
  }
`;

const ModePicker = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ModeButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: ${({ $active }) => ($active ? "rgba(245, 239, 229, 0.95)" : "rgba(255, 255, 255, 0.92)")};
  color: var(--color-text);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 900;
  font-size: 0.84rem;

  ${mobileOnly} {
    padding: 7px 10px;
    font-size: 0.76rem;
  }

  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`;

const PickerTitle = styled.div`
  font-weight: 900;
  color: var(--color-text);
  margin-bottom: 6px;
  font-size: 0.88rem;

  ${mobileOnly} {
    margin-bottom: 2px;
    font-size: 0.78rem;
  }
`;
