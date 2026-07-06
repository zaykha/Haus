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
    avatarPath?: string | null;
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
  avatarPath?: string | null;
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

export type PrimaryContactLeadRow = {
  id: string;
  name: string;
  phone: string | null;
  clientOrganizationId: string;
  clientOrganizationName: string;
  projectCount: number;
  projectIds: string[];
  projectNames: string[];
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
            assigneeName: task.assigneeId ? staffById.get(task.assigneeId) ?? "Unassigned" : "Open for all",
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
        avatarPath: "avatarPath" in member ? member.avatarPath ?? null : null,
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
      avatarPath: "avatarPath" in member ? member.avatarPath ?? null : null,
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
        avatarPath: member.avatarPath ?? null,
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

export function buildPrimaryContactLeadRows(state: DemoState): PrimaryContactLeadRow[] {
  const organizationById = new Map(state.clientOrganizations.map((organization) => [organization.id, organization]));
  const liaisonKeys = new Set(
    state.users
      .filter((member) => member.role === "client")
      .flatMap((member) => {
        const membershipIds =
          member.clientOrganizationIds && member.clientOrganizationIds.length > 0
            ? member.clientOrganizationIds
            : member.clientOrganizationId
              ? [member.clientOrganizationId]
              : [];

        return membershipIds.map((organizationId) =>
          `${organizationId}::${member.name.trim().toLowerCase()}`,
        );
      }),
  );

  const leads = new Map<string, PrimaryContactLeadRow>();

  for (const project of state.projects) {
    const organizationId = project.clientOrganizationId?.trim() ?? "";
    const contactName = project.contactPerson?.trim() ?? "";
    const contactNumber = project.contactNumber?.trim() ?? "";
    if (!organizationId || !contactName) {
      continue;
    }

    if (liaisonKeys.has(`${organizationId}::${contactName.toLowerCase()}`)) {
      continue;
    }

    const organizationName = organizationById.get(organizationId)?.name ?? "Unknown organization";
    const leadId = `${organizationId}::${contactName.toLowerCase()}::${contactNumber.toLowerCase()}`;
    const existing = leads.get(leadId);
    const projectName = project.projectRequestName?.trim() || project.name.trim();
    const projectActivityDate =
      project.createdAt ??
      project.requestedDate ??
      project.finalDeliverableDate ??
      project.dueDate ??
      null;

    if (existing) {
      existing.projectCount += 1;
      if (!existing.projectIds.includes(project.id)) {
        existing.projectIds.push(project.id);
      }
      if (projectName && !existing.projectNames.includes(projectName)) {
        existing.projectNames.push(projectName);
      }
      if (
        projectActivityDate &&
        (!existing.lastActivityDate ||
          new Date(projectActivityDate).getTime() > new Date(existing.lastActivityDate).getTime())
      ) {
        existing.lastActivityDate = projectActivityDate;
      }
      continue;
    }

    leads.set(leadId, {
      id: leadId,
      name: contactName,
      phone: contactNumber || null,
      clientOrganizationId: organizationId,
      clientOrganizationName: organizationName,
      projectCount: 1,
      projectIds: [project.id],
      projectNames: projectName ? [projectName] : [],
      lastActivityDate: projectActivityDate,
    });
  }

  return [...leads.values()].sort((left, right) => {
    const leftTime = left.lastActivityDate ? new Date(left.lastActivityDate).getTime() : 0;
    const rightTime = right.lastActivityDate ? new Date(right.lastActivityDate).getTime() : 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.name.localeCompare(right.name);
  });
}
