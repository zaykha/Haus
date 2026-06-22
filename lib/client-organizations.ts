import { DemoState } from "@/lib/types";

export type ClientOrganizationRow = {
  id: string;
  organizationId: string | null;
  name: string;
  company: string;
  type: "internal" | "external";
  status: "active" | "inactive" | null;
  isUnassigned?: boolean;
  members: Array<{
    id: string;
    name: string;
    email: string;
    company?: string;
    clientOrganizationId?: string | null;
    clientOrganizationIds?: string[];
    clientOrganizationNames?: string[];
    deletableUserId?: string | null;
  }>;
  memberCount: number;
  projectCount: number;
  activeProjectCount: number;
  lastActivityDate: string | null;
  lastActivityLabel: string;
  pendingCount: number;
  pendingProjects: Array<{
    id: string;
    name: string;
    status: "review" | "revision";
    dueDate: string;
  }>;
  openTasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string;
    priority: string;
    projectId: string;
    projectName: string;
    assigneeName: string;
  }>;
  latestFeedback: Array<{
    id: string;
    body: string;
    action: "approve" | "request_revision" | "comment";
    createdAt: string;
  }>;
  recentProjects: Array<{
    id: string;
    name: string;
    dueDate: string;
    status: string;
  }>;
};

export type LiaisonRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string | null;
  phone: string | null;
  company: string;
  jobTitle: string | null;
  department: string | null;
  clientOrganizationId: string | null;
  clientOrganizationIds: string[];
  clientOrganizationNames: string[];
  organizationName: string;
  organizationType: "internal" | "external";
  organizationStatus: "active" | "inactive" | null;
  hasActiveOrganizations: boolean;
  hasInactiveOrganizations: boolean;
  isUnassigned: boolean;
  projectCount: number;
  activeProjectCount: number;
  lastActivityDate: string | null;
};

export function getClientOrganizationMark(name: string) {
  const words = name.split(" ");
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function getClientOrganizationStatusLabel(row: ClientOrganizationRow) {
  if (row.isUnassigned) {
    return "Unassigned";
  }

  if (row.status === "active") {
    return "Active";
  }

  if (row.status === "inactive") {
    return "Inactive";
  }

  return null;
}

export function buildClientOrganizationRows(state: DemoState): ClientOrganizationRow[] {
  const existingClients = state.users.filter((member) => member.role === "client");
  const knownEmails = new Set(existingClients.map((member) => member.email.toLowerCase()));
  const acceptedInviteClients = state.invitations
    .filter(
      (invitation) =>
        invitation.role === "client" &&
        invitation.status === "accepted" &&
        !knownEmails.has(invitation.email.toLowerCase()),
    )
    .map((invitation) => ({
      id: `accepted-invite:${invitation.id}`,
      name: invitation.name,
      email: invitation.email,
      company: "Client account",
      clientOrganizationId: invitation.clientOrganizationId ?? null,
    }));
  const allClientMembers = [...existingClients, ...acceptedInviteClients];
  const staffById = new Map(state.users.map((member) => [member.id, member.name]));
  const organizationById = new Map(state.clientOrganizations.map((organization) => [organization.id, organization]));
  const getMembershipIds = (member: {
    clientOrganizationId?: string | null;
    clientOrganizationIds?: string[];
  }) =>
    member.clientOrganizationIds && member.clientOrganizationIds.length > 0
      ? member.clientOrganizationIds
      : member.clientOrganizationId
        ? [member.clientOrganizationId]
        : [];

  const buildRow = ({
    id,
    organizationId,
    name,
    members,
    isUnassigned = false,
    organizationType,
    organizationStatus,
  }: {
    id: string;
    organizationId: string | null;
    name: string;
    members: ClientOrganizationRow["members"];
    isUnassigned?: boolean;
    organizationType?: "internal" | "external";
    organizationStatus?: "active" | "inactive" | null;
  }): ClientOrganizationRow => {
    const organizationProjects = state.projects.filter((project) =>
      organizationId
        ? project.clientOrganizationId === organizationId
        : members.some(
            (member) =>
              member.company?.trim().toLowerCase() === name.trim().toLowerCase() ||
              member.name.trim().toLowerCase() === (project.contactPerson ?? "").trim().toLowerCase(),
          ),
    );

    const latestProject = [...organizationProjects].sort(
      (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
    )[0];
    const activeProjectCount = organizationProjects.filter((project) => project.status !== "done").length;

    const latestFeedback = organizationProjects
      .flatMap((project) =>
        project.feedback.map((feedback) => ({
          id: feedback.id,
          body: feedback.body,
          action: feedback.action,
          createdAt: feedback.createdAt,
        })),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pendingProjects = organizationProjects
      .filter(
        (project): project is typeof project & { status: "review" | "revision" } =>
          project.status === "review" || project.status === "revision",
      )
      .map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        dueDate: project.dueDate,
      }));

    const openTasks = organizationProjects
      .flatMap((project) =>
        project.tasks
          .filter((task) => task.clientVisible && task.status === "review")
          .map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            dueDate: task.dueDate,
            priority: task.priority,
            projectId: project.id,
            projectName: project.name,
            assigneeName: staffById.get(task.assigneeId) ?? "Unassigned",
          })),
      )
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const recentProjects = organizationProjects
      .slice()
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
      .slice(0, 3)
      .map((project) => ({
        id: project.id,
        name: project.name,
        dueDate: project.dueDate,
        status: project.status,
      }));

    return {
      id,
      organizationId,
      name,
      company: members[0]?.company ?? name,
      type: isUnassigned ? "external" : organizationType ?? "external",
      status: isUnassigned ? null : organizationStatus ?? null,
      isUnassigned,
      members,
      memberCount: members.length,
      projectCount: organizationProjects.length,
      activeProjectCount,
      lastActivityDate: latestFeedback[0]?.createdAt ?? latestProject?.dueDate ?? null,
      lastActivityLabel:
        latestFeedback[0]?.action === "approve"
          ? "Latest deliverable approved"
          : latestFeedback[0]?.action === "request_revision"
            ? "Revision requested"
            : latestProject
              ? `${latestProject.name} updated`
              : "No recent activity",
      pendingCount: pendingProjects.length,
      pendingProjects,
      openTasks,
      latestFeedback,
      recentProjects,
    };
  };

  const rows = state.clientOrganizations.map((organization) => {
    const members = allClientMembers
      .filter((member) => getMembershipIds(member).includes(organization.id))
      .map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        company: member.company ?? undefined,
        clientOrganizationId: member.clientOrganizationId ?? null,
        clientOrganizationIds: getMembershipIds(member),
        clientOrganizationNames: getMembershipIds(member)
          .map((organizationId) => organizationById.get(organizationId)?.name ?? "")
          .filter(Boolean),
        deletableUserId: member.id.startsWith("accepted-invite:") ? null : member.id,
      }));

    return buildRow({
      id: organization.id,
      organizationId: organization.id,
      name: organization.name,
      members,
      organizationType: organization.type,
      organizationStatus: organization.status ?? null,
    });
  });

  const unassignedMembers = allClientMembers
    .filter((member) => getMembershipIds(member).length === 0)
    .map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      company: member.company ?? undefined,
      clientOrganizationId: member.clientOrganizationId ?? null,
      clientOrganizationIds: getMembershipIds(member),
      clientOrganizationNames: getMembershipIds(member)
        .map((organizationId) => organizationById.get(organizationId)?.name ?? "")
        .filter(Boolean),
      deletableUserId: member.id.startsWith("accepted-invite:") ? null : member.id,
    }));

  if (unassignedMembers.length) {
    rows.push(
      buildRow({
        id: "unassigned-clients",
        organizationId: null,
        name: "Unassigned Clients",
        members: unassignedMembers,
        isUnassigned: true,
      }),
    );
  }

  return rows;
}

export function buildLiaisonRows(state: DemoState): LiaisonRow[] {
  const organizationById = new Map(state.clientOrganizations.map((organization) => [organization.id, organization]));

  return state.users
    .filter((member) => member.role === "client")
    .map((member) => {
      const membershipIds =
        member.clientOrganizationIds && member.clientOrganizationIds.length > 0
          ? member.clientOrganizationIds
          : member.clientOrganizationId
            ? [member.clientOrganizationId]
            : [];
      const primaryOrganizationId = membershipIds[0] ?? null;
      const organization = primaryOrganizationId
        ? organizationById.get(primaryOrganizationId) ?? null
        : null;
      const organizationNames = membershipIds
        .map((organizationId) => organizationById.get(organizationId)?.name ?? "")
        .filter(Boolean);
      const membershipOrganizations = membershipIds
        .map((organizationId) => organizationById.get(organizationId) ?? null)
        .filter(
          (
            membershipOrganization,
          ): membershipOrganization is NonNullable<typeof membershipOrganization> =>
            Boolean(membershipOrganization),
        );
      const hasActiveOrganizations = membershipOrganizations.some(
        (membershipOrganization) => membershipOrganization.status === "active",
      );
      const hasInactiveOrganizations = membershipOrganizations.some(
        (membershipOrganization) => membershipOrganization.status === "inactive",
      );

      const relatedProjects = state.projects.filter((project) =>
        membershipIds.length > 0
          ? Boolean(project.clientOrganizationId && membershipIds.includes(project.clientOrganizationId))
          : Boolean(
              member.company?.trim().toLowerCase() &&
                member.company.trim().toLowerCase() ===
                  (organizationById.get(project.clientOrganizationId ?? "")?.name.trim().toLowerCase() ??
                    ""),
            ),
      );

      const activeProjectCount = relatedProjects.filter(
        (project) => project.stage !== "Complete" && project.stage !== "On Hold",
      ).length;

      const lastActivityDate = relatedProjects
        .flatMap((project) => [
          project.finalDeliverableDate ?? project.dueDate,
          ...project.feedback.map((feedback) => feedback.createdAt),
          ...project.activities.map((activity) => activity.createdAt),
        ])
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        createdAt: member.createdAt ?? null,
        phone: member.phone ?? null,
        company: member.company ?? organization?.name ?? "Client liaison",
        jobTitle: member.jobTitle ?? null,
        department: member.department ?? null,
        clientOrganizationId: primaryOrganizationId,
        clientOrganizationIds: membershipIds,
        clientOrganizationNames: organizationNames,
        organizationName: organization?.name ?? member.company ?? "Unassigned Clients",
        organizationType: organization?.type ?? "external",
        organizationStatus: organization?.status ?? null,
        hasActiveOrganizations,
        hasInactiveOrganizations,
        isUnassigned: !organization,
        projectCount: relatedProjects.length,
        activeProjectCount,
        lastActivityDate,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
