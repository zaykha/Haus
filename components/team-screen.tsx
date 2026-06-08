"use client";

import { FormEvent, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/components/app-state";
import { canInviteUsers } from "@/lib/permissions";
import { Role } from "@/lib/types";
import { formatRole } from "@/lib/display";

const desktop = "@media (min-width: 768px)";

type MemberStatus = "active" | "away" | "inactive";
type RoleFilter = "all" | Role;
type StatusFilter = "all" | MemberStatus;

const roleOptions: { label: string; value: Role }[] = [
  { label: "Communication Manager", value: "communication_manager" },
  { label: "Creative Manager", value: "creative_manager" },
  { label: "Designer", value: "designer" },
  { label: "Client", value: "client" },
];

function getMemberStatus(projectCount: number, role: Role): MemberStatus {
  if (role === "communication_manager" || role === "creative_manager") {
    return "active";
  }

  if (projectCount >= 3) {
    return "active";
  }

  if (projectCount > 0) {
    return "away";
  }

  return "inactive";
}

function getStatusTone(status: MemberStatus) {
  switch (status) {
    case "active":
      return { bg: "#e5f4e8", fg: "#4c8f5c", label: "Active" };
    case "away":
      return { bg: "#fff1da", fg: "#ca8a22", label: "Away" };
    default:
      return { bg: "#f4f1ed", fg: "#8d857b", label: "Inactive" };
  }
}

function getRoleTone(role: Role) {
  switch (role) {
    case "creative_manager":
      return { bg: "#e9f4ea", fg: "#587f5f" };
    case "communication_manager":
      return { bg: "#eaf0ff", fg: "#5d76b9" };
    case "designer":
      return { bg: "#f8f1e5", fg: "#94754a" };
    default:
      return { bg: "#f3f0ff", fg: "#7760c5" };
  }
}

function invitationPill(status: string) {
  if (status === "accepted") {
    return { bg: "#e5f4e8", fg: "#4c8f5c", label: "Accepted" };
  }

  if (status === "revoked") {
    return { bg: "#f4f1ed", fg: "#8d857b", label: "Revoked" };
  }

  if (status === "expired") {
    return { bg: "#ffe7e5", fg: "#e06457", label: "Expired" };
  }

  return { bg: "#fff1da", fg: "#ca8a22", label: "Pending" };
}

export function TeamScreen() {
  const { state, user, createInvitation, revokeInvitation } = useAppState();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("designer");
  const [projectId, setProjectId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState("2026-06-18");
  const [latestInviteLink, setLatestInviteLink] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [submitError, setSubmitError] = useState("");

  if (!user) {
    return null;
  }

  const canManageInvites = canInviteUsers(user.role);
  const members = useMemo(() => {
    return state.users
      .filter((member) => member.role !== "client")
      .map((member) => {
        const projectCount = state.projects.filter(
          (project) =>
            project.ownerId === member.id ||
            project.staffIds.includes(member.id) ||
            project.tasks.some((task) => task.assigneeId === member.id),
        ).length;

        return {
          ...member,
          projectCount,
          status: getMemberStatus(projectCount, member.role),
        };
      });
  }, [state.projects, state.users]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      const matchesSearch =
        !q ||
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        (member.company ?? "").toLowerCase().includes(q);

      const matchesRole = roleFilter === "all" ? true : member.role === roleFilter;
      const matchesStatus = statusFilter === "all" ? true : member.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, roleFilter, search, statusFilter]);

  const invitationRows = useMemo(
    () =>
      state.invitations
        .filter((invitation) => invitation.role !== "client")
        .map((invitation) => {
          const derivedStatus =
            invitation.status === "pending" && new Date(invitation.expiresAt).getTime() < Date.now()
              ? "expired"
              : invitation.status;

          return {
            ...invitation,
            status: derivedStatus,
            project: state.projects.find((project) => project.id === invitation.projectId) ?? null,
          };
        }),
    [state.invitations, state.projects],
  );

  const totalMembers = members.length;
  const designerCount = members.filter((member) => member.role === "designer").length;
  const managerCount = members.filter(
    (member) =>
      member.role === "creative_manager" || member.role === "communication_manager",
  ).length;
  const othersCount = Math.max(0, totalMembers - designerCount - managerCount);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    try {
      const result = await createInvitation({
        name,
        email,
        role,
        projectId: projectId || null,
        expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
      });

      setLatestInviteLink(result.inviteLink);
      setName("");
      setEmail("");
      setRole("designer");
      setProjectId("");
      setExpiresAt("2026-06-18");
      setCopyState("idle");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create invite");
    }
  };

  const copyLink = async () => {
    if (!latestInviteLink) {
      return;
    }

    await navigator.clipboard.writeText(latestInviteLink);
    setCopyState("copied");
  };

  return (
    <Shell>
      <AppSidebar user={user} activeLabel="Team" />

      <Content>
        <Header>
          <HeaderCopy>
            <Title>Team</Title>
            <Subtitle>Manage your team members, roles, and permissions.</Subtitle>
          </HeaderCopy>
          {canManageInvites ? (
            <InviteButton type="button" onClick={() => setShowInviteForm((current) => !current)}>
              <IconWrap>
                <IconPlus />
              </IconWrap>
              <span>Invite Member</span>
            </InviteButton>
          ) : null}
        </Header>

        <StatsRow>
          <StatCard>
            <StatIcon $tone="green">
              <IconUsers />
            </StatIcon>
            <StatCopy>
              <StatValue>{totalMembers}</StatValue>
              <StatLabel>Total Members</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="olive">
              <IconBriefcase />
            </StatIcon>
            <StatCopy>
              <StatValue>{designerCount}</StatValue>
              <StatLabel>Designers</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="shield">
              <IconShield />
            </StatIcon>
            <StatCopy>
              <StatValue>{managerCount}</StatValue>
              <StatLabel>Managers</StatLabel>
            </StatCopy>
          </StatCard>
          <StatCard>
            <StatIcon $tone="gold">
              <IconUserPlus />
            </StatIcon>
            <StatCopy>
              <StatValue>{othersCount}</StatValue>
              <StatLabel>Others</StatLabel>
            </StatCopy>
          </StatCard>
        </StatsRow>

        {canManageInvites && showInviteForm ? (
          <InvitePanel>
            <PanelHeader>
              <PanelTitle>Invite team member</PanelTitle>
            </PanelHeader>

            <InviteForm onSubmit={handleSubmit}>
              <Field>
                <FieldLabel>Name</FieldLabel>
                <TextInput value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <TextInput
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <TextSelect value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {formatRole(option.value)}
                    </option>
                  ))}
                </TextSelect>
              </Field>
              <Field>
                <FieldLabel>Assigned project</FieldLabel>
                <TextSelect value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">No project yet</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </TextSelect>
              </Field>
              <Field>
                <FieldLabel>Expiry date</FieldLabel>
                <TextInput
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  required
                />
              </Field>
              <FormActions>
                <GhostButton type="button" onClick={() => setShowInviteForm(false)}>
                  Cancel
                </GhostButton>
                <InviteButton type="submit">
                  <span>Generate Invite Link</span>
                </InviteButton>
              </FormActions>
            </InviteForm>

            {submitError ? <InlineError>{submitError}</InlineError> : null}

            {latestInviteLink ? (
              <GeneratedLink>
                <FieldLabel>Copyable invite link</FieldLabel>
                <LinkBox>{latestInviteLink}</LinkBox>
                <GhostButton type="button" onClick={copyLink}>
                  {copyState === "copied" ? "Copied" : "Copy link"}
                </GhostButton>
              </GeneratedLink>
            ) : null}
          </InvitePanel>
        ) : null}

        <ControlsPanel>
          <SearchRow>
            <SearchWrap>
              <SearchIcon>
                <IconSearch />
              </SearchIcon>
              <SearchInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search team members..."
              />
            </SearchWrap>
          </SearchRow>

          <FiltersRow>
            <SelectWrap>
              <TextSelect
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              >
                <option value="all">All Roles</option>
                <option value="creative_manager">Creative Manager</option>
                <option value="communication_manager">Communication Manager</option>
                <option value="designer">Designer</option>
              </TextSelect>
            </SelectWrap>
            <SelectWrap>
              <TextSelect
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="away">Away</option>
                <option value="inactive">Inactive</option>
              </TextSelect>
            </SelectWrap>
            <FilterButton type="button">
              <IconWrap>
                <IconSliders />
              </IconWrap>
            </FilterButton>
          </FiltersRow>
        </ControlsPanel>

        <DesktopTable>
          <TableHeader>
            <HeaderCell $wide>Member</HeaderCell>
            <HeaderCell>Role</HeaderCell>
            <HeaderCell>Projects</HeaderCell>
            <HeaderCell>Status</HeaderCell>
            <HeaderCell>Joined</HeaderCell>
            <HeaderCell $narrow>Actions</HeaderCell>
          </TableHeader>

          <TableBody>
            {filteredMembers.length ? (
              filteredMembers.map((member, index) => {
                const roleTone = getRoleTone(member.role);
                const statusTone = getStatusTone(member.status);

                return (
                  <TableRow key={member.id}>
                    <MemberCell>
                      <Avatar>{member.name.slice(0, 1)}</Avatar>
                      <MemberCopy>
                        <MemberName>{member.name}</MemberName>
                        <MemberEmail>{member.email}</MemberEmail>
                      </MemberCopy>
                    </MemberCell>
                    <RoleCell>
                      <Pill style={{ background: roleTone.bg, color: roleTone.fg }}>
                        {formatRole(member.role)}
                      </Pill>
                    </RoleCell>
                    <CountCell>{member.projectCount || "—"}</CountCell>
                    <StatusCell>
                      <StatusPill style={{ background: statusTone.bg, color: statusTone.fg }}>
                        <StatusDot style={{ background: statusTone.fg }} />
                        <span>{statusTone.label}</span>
                      </StatusPill>
                    </StatusCell>
                    <JoinedCell>{mockJoinDate(index)}</JoinedCell>
                    <ActionCell>...</ActionCell>
                  </TableRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No team members found</strong>
                <p>Try another search term or adjust the selected filters.</p>
              </EmptyState>
            )}
          </TableBody>

          <TableFooter>
            <span>
              Showing 1 to {filteredMembers.length} of {members.length} members
            </span>
            <Pagination>
              <PageButton>{"<"}</PageButton>
              <PageButton $active>1</PageButton>
              <PageButton>2</PageButton>
              <PageButton>{">"}</PageButton>
            </Pagination>
          </TableFooter>
        </DesktopTable>

        <MobileList>
          {filteredMembers.length ? (
            filteredMembers.map((member) => {
              const roleTone = getRoleTone(member.role);
              return (
                <MobileCard key={member.id}>
                  <MobileCardRow>
                    <Avatar>{member.name.slice(0, 1)}</Avatar>
                    <MemberCopy>
                      <MemberName>{member.name}</MemberName>
                      <MemberEmail>{member.email}</MemberEmail>
                      <Pill style={{ background: roleTone.bg, color: roleTone.fg }}>
                        {formatRole(member.role)}
                      </Pill>
                    </MemberCopy>
                    <ActionCell>...</ActionCell>
                  </MobileCardRow>
                </MobileCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No team members found</strong>
              <p>Try another search term or adjust the selected filters.</p>
            </EmptyState>
          )}
        </MobileList>

        {invitationRows.length ? (
          <InvitationPanel>
            <PanelHeader>
              <PanelTitle>Pending invitations</PanelTitle>
            </PanelHeader>
            <InvitationList>
              {invitationRows.slice(0, 4).map((invitation) => {
                const tone = invitationPill(invitation.status);
                return (
                  <InvitationRow key={invitation.id}>
                    <InvitationCopy>
                      <MemberName>{invitation.name}</MemberName>
                      <MemberEmail>{invitation.email}</MemberEmail>
                      <InvitationMeta>
                        {formatRole(invitation.role)} · {invitation.project?.name ?? "No project"}
                      </InvitationMeta>
                    </InvitationCopy>
                    <InvitationActions>
                      <Pill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</Pill>
                      {canManageInvites && invitation.status === "pending" ? (
                        <TinyDangerButton type="button" onClick={() => revokeInvitation(invitation.id)}>
                          Revoke
                        </TinyDangerButton>
                      ) : null}
                    </InvitationActions>
                  </InvitationRow>
                );
              })}
            </InvitationList>
          </InvitationPanel>
        ) : null}
      </Content>
    </Shell>
  );
}

function mockJoinDate(index: number) {
  const dates = [
    "Apr 12, 2024",
    "Mar 18, 2024",
    "May 2, 2024",
    "Feb 28, 2024",
    "Apr 5, 2024",
    "Jun 1, 2024",
    "Jan 10, 2024",
    "Jun 10, 2024",
  ];

  return dates[index % dates.length];
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const controlSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
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

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 18px 22px 22px;
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

const HeaderCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(1.7rem, 4vw, 2.5rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.92rem;
  line-height: 1.45;
`;

const StatsRow = styled.section`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  ${desktop} {
    overflow: visible;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  min-width: 132px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
  }
`;

const StatIcon = styled.div<{ $tone: "green" | "olive" | "shield" | "gold" }>`
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "green"
      ? "#e4f4e7"
      : $tone === "olive"
        ? "#f1efe4"
        : $tone === "shield"
          ? "#edf3ea"
          : "#f8f1e5"};
  color: ${({ $tone }) =>
    $tone === "green"
      ? "#4c8f5c"
      : $tone === "olive"
        ? "#7d7851"
        : $tone === "shield"
          ? "#536f59"
          : "#a47b2e"};

  svg {
    width: 20px;
    height: 20px;
  }
`;

const StatCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatValue = styled.strong`
  font-size: 1.65rem;
  line-height: 1;
`;

const StatLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.86rem;
  font-weight: 600;
`;

const InvitePanel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.96rem;
`;

const InviteForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

const Field = styled.label`
  flex: 1 1 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FieldLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const TextInput = styled.input`
  ${controlSurface}
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 14px;
  color: var(--color-text);
`;

const TextSelect = styled.select`
  ${controlSurface}
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 14px;
  color: var(--color-text);
`;

const FormActions = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const ControlsPanel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 20px;
`;

const SearchRow = styled.div`
  display: flex;
`;

const SearchWrap = styled.div`
  position: relative;
  flex: 1;
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 14px;
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
  ${controlSurface}
  width: 100%;
  min-height: 56px;
  padding: 0 44px 0 44px;
  border-radius: 18px;
  color: var(--color-text);
  font-size: 0.94rem;
`;

const FiltersRow = styled.div`
  display: flex;
  gap: 10px;
`;

const SelectWrap = styled.div`
  flex: 1;
`;

const DesktopTable = styled.section`
  ${cardSurface}
  display: none;
  flex-direction: column;
  border-radius: 22px;
  overflow: hidden;

  ${desktop} {
    display: flex;
  }
`;

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  color: var(--color-text-light);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const HeaderCell = styled.span<{ $wide?: boolean; $narrow?: boolean }>`
  flex: ${({ $wide, $narrow }) => ($wide ? "1.6" : $narrow ? "0 0 52px" : "1")};
`;

const TableBody = styled.div`
  display: flex;
  flex-direction: column;
`;

const TableRow = styled.article`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
`;

const MemberCell = styled.div`
  flex: 1.6;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MemberCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const MemberName = styled.strong`
  font-size: 0.96rem;
`;

const MemberEmail = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.4;
`;

const RoleCell = styled.div`
  flex: 1;
`;

const CountCell = styled.div`
  flex: 1;
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--color-text);
`;

const StatusCell = styled.div`
  flex: 1;
`;

const JoinedCell = styled.div`
  flex: 1;
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 500;
`;

const ActionCell = styled.div`
  flex: 0 0 52px;
  color: var(--color-text-muted);
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
`;

const TableFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  color: var(--color-text-muted);
  font-size: 0.86rem;
`;

const Pagination = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  width: 38px;
  height: 38px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: ${({ $active }) => ($active ? "#1f4339" : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--color-text)")};
  font-size: 0.9rem;
  font-weight: 700;
`;

const MobileList = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${desktop} {
    display: none;
  }
`;

const MobileCard = styled.article`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 20px;
`;

const MobileCardRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const Avatar = styled.div`
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-size: 0.94rem;
  font-weight: 700;
`;

const InvitationPanel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
`;

const InvitationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InvitationRow = styled.article`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(230, 224, 215, 0.8);

  &:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
`;

const InvitationCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InvitationMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
`;

const InvitationActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
`;

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 999px;
`;

const InviteButton = styled.button`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: #1f4339;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(31, 68, 57, 0.16);
`;

const GhostButton = styled.button`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
`;

const FilterButton = styled.button`
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
`;

const IconWrap = styled.span`
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

const GeneratedLink = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const LinkBox = styled.div`
  ${controlSurface}
  padding: 12px 14px;
  border-radius: 14px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.82rem;
`;

const TinyDangerButton = styled.button`
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: #b42318;
  color: #fff;
  font-size: 0.74rem;
  font-weight: 700;
`;

const EmptyState = styled.div`
  ${cardSurface}
  display: flex;
  flex-direction: column;
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

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
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

function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="12" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M4 11.5h16" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.8 18.5 6v5.8c0 4.1-2.8 7.1-6.5 8.4-3.7-1.3-6.5-4.3-6.5-8.4V6z" />
      <path d="m9.5 12 1.7 1.8 3.5-3.8" />
    </svg>
  );
}

function IconUserPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="3" />
      <path d="M4.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8v6" />
      <path d="M15 11h6" />
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

function IconSliders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
