import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as importProjects } from "@/app/api/workspace/projects/bulk/route";
import { POST as createProject } from "@/app/api/workspace/projects/route";
import { POST as createTask } from "@/app/api/workspace/projects/[id]/tasks/route";
import { requireWorkspaceUser, type WorkspaceProfile } from "@/app/api/workspace/_auth";
import { createFakeSupabaseAdminClient } from "@/test/support/fake-supabase-admin";

vi.mock("@/app/api/workspace/_auth", () => ({
  requireWorkspaceUser: vi.fn(),
}));

const mockedRequireWorkspaceUser = vi.mocked(requireWorkspaceUser);

function createJsonRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeUser(overrides: Partial<WorkspaceProfile>): WorkspaceProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    role: "communication_manager",
    avatarPath: null,
    company: "Haus",
    phone: null,
    jobTitle: null,
    department: "Accounts",
    clientOrganizationId: null,
    clientOrganizationIds: [],
    ...overrides,
  };
}

describe("workspace project flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manager creates a project with an auto-created task", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
            type: "external",
            project_prefix: "ACM",
          },
        ],
        projects: [],
        tasks: [],
      },
    });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({ id: "manager-1" }),
    });

    const response = await createProject(
      createJsonRequest("http://localhost/api/workspace/projects", {
        projectRequestName: "Acme Launch Campaign",
        requestedDate: "2026-07-03",
        requestStatus: "WIP",
        departmentName: "Marketing",
        contactPerson: "Nora",
        contactNumber: "0912345678",
        projectType: "Campaign",
        priorityLevel: "High",
        firstDraftDate: "2026-07-10",
        finalDeliverableDate: "2026-07-15",
        description: "Launch work",
        clientOrganizationId: "org-1",
        autoCreateTask: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: expect.any(String),
    });

    expect(supabase.state.projects).toHaveLength(1);
    expect(supabase.state.tasks).toHaveLength(1);
    expect(supabase.state.projects[0]).toMatchObject({
      name: "Acme Launch Campaign",
      project_code: "ACM001",
      client_organization_id: "org-1",
      stage: "WIP",
      due_date: "2026-07-15",
    });
    expect(supabase.state.tasks[0]).toMatchObject({
      project_id: supabase.state.projects[0]?.id,
      title: "Acme Launch Campaign (Task)",
      assignee_id: null,
      status: "todo",
      manager_review_status: "internal",
      priority: "high",
    });
  });

  it("bulk upload creates projects with mixed statuses and auto-creates tasks only for WIP and review", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
            type: "external",
            project_prefix: "ACM",
          },
        ],
        projects: [],
        tasks: [],
        profiles: [],
        client_organization_liaisons: [],
      },
    });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({ id: "manager-1" }),
    });

    const response = await importProjects(
      createJsonRequest("http://localhost/api/workspace/projects/bulk", {
        autoCreateTask: true,
        rows: [
          {
            projectId: "",
            requestedDate: "2026-07-01",
            projectRequestName: "Waitlisted Project",
            requestStatus: "waiting list",
            departmentName: "Ops",
            contactPerson: "May",
            contactNumber: "01",
            projectType: "Design",
            priorityLevel: "medium",
            firstDraftDate: "2026-07-09",
            finalDeliverableDate: "2026-07-12",
            projectObjective: "",
            projectBrief: "",
            creativeAdvice: "",
            description: "",
            referenceAttachmentUrl: "",
            clientOrganizationName: "Acme Foods",
          },
          {
            projectId: "",
            requestedDate: "2026-07-01",
            projectRequestName: "WIP Project",
            requestStatus: "wip",
            departmentName: "Ops",
            contactPerson: "May",
            contactNumber: "02",
            projectType: "Design",
            priorityLevel: "high",
            firstDraftDate: "2026-07-09",
            finalDeliverableDate: "2026-07-12",
            projectObjective: "",
            projectBrief: "",
            creativeAdvice: "",
            description: "",
            referenceAttachmentUrl: "",
            clientOrganizationName: "Acme Foods",
          },
          {
            projectId: "",
            requestedDate: "2026-07-01",
            projectRequestName: "Review Project",
            requestStatus: "pending review/feedback",
            departmentName: "Ops",
            contactPerson: "May",
            contactNumber: "03",
            projectType: "Design",
            priorityLevel: "urgent",
            firstDraftDate: "2026-07-09",
            finalDeliverableDate: "2026-07-12",
            projectObjective: "",
            projectBrief: "",
            creativeAdvice: "",
            description: "",
            referenceAttachmentUrl: "",
            clientOrganizationName: "Acme Foods",
          },
          {
            projectId: "",
            requestedDate: "2026-07-01",
            projectRequestName: "Complete Project",
            requestStatus: "complete",
            departmentName: "Ops",
            contactPerson: "May",
            contactNumber: "04",
            projectType: "Design",
            priorityLevel: "low",
            firstDraftDate: "2026-07-09",
            finalDeliverableDate: "2026-07-12",
            projectObjective: "",
            projectBrief: "",
            creativeAdvice: "",
            description: "",
            referenceAttachmentUrl: "",
            clientOrganizationName: "Acme Foods",
          },
          {
            projectId: "",
            requestedDate: "2026-07-01",
            projectRequestName: "Hold Project",
            requestStatus: "on hold",
            departmentName: "Ops",
            contactPerson: "May",
            contactNumber: "05",
            projectType: "Design",
            priorityLevel: "medium",
            firstDraftDate: "2026-07-09",
            finalDeliverableDate: "2026-07-12",
            projectObjective: "",
            projectBrief: "",
            creativeAdvice: "",
            description: "",
            referenceAttachmentUrl: "",
            clientOrganizationName: "Acme Foods",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      createdCount: 5,
    });

    expect(supabase.state.projects.map((project) => project.stage)).toEqual([
      "Waiting List",
      "WIP",
      "Pending Review",
      "Complete",
      "On Hold",
    ]);
    expect(supabase.state.tasks).toHaveLength(2);
    expect(supabase.state.tasks.map((task) => task.title)).toEqual([
      "WIP Project (Task)",
      "Review Project (Task)",
    ]);
  });

  it("blocks clients from manager-only create routes", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        projects: [{ id: "project-1", stage: "Waiting List" }],
      },
    });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({
        id: "client-1",
        role: "client",
        company: null,
        clientOrganizationId: "org-1",
        clientOrganizationIds: ["org-1"],
      }),
    });

    const bulkResponse = await importProjects(
      createJsonRequest("http://localhost/api/workspace/projects/bulk", {
        rows: [
          {
            projectId: "",
            requestedDate: "2026-07-01",
            projectRequestName: "Blocked",
            requestStatus: "wip",
            departmentName: "Ops",
            contactPerson: "May",
            contactNumber: "01",
            projectType: "Design",
            priorityLevel: "medium",
            firstDraftDate: "2026-07-09",
            finalDeliverableDate: "2026-07-12",
            projectObjective: "",
            projectBrief: "",
            creativeAdvice: "",
            description: "",
            referenceAttachmentUrl: "",
            clientOrganizationName: "Acme Foods",
          },
        ],
      }),
    );

    const taskResponse = await createTask(
      createJsonRequest("http://localhost/api/workspace/projects/project-1/tasks", {
        title: "Blocked Task",
        assigneeId: null,
        status: "todo",
        dueDate: "2026-07-12",
        priority: "medium",
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );

    expect(bulkResponse.status).toBe(403);
    await expect(bulkResponse.json()).resolves.toMatchObject({
      error: "Only managers can create projects",
    });

    expect(taskResponse.status).toBe(403);
    await expect(taskResponse.json()).resolves.toMatchObject({
      error: "Only managers can create tasks",
    });
  });

  it("blocks duplicate bulk upload submissions from creating the same project twice", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        client_organizations: [
          {
            id: "org-1",
            name: "Acme Foods",
            type: "external",
            project_prefix: "ACM",
          },
        ],
        projects: [],
        tasks: [],
        profiles: [],
        client_organization_liaisons: [],
      },
    });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({ id: "manager-1" }),
    });

    const payload = {
      autoCreateTask: false,
      rows: [
        {
          projectId: "ACM077",
          requestedDate: "2026-07-01",
          projectRequestName: "Duplicate Check",
          requestStatus: "waiting list",
          departmentName: "Ops",
          contactPerson: "May",
          contactNumber: "01",
          projectType: "Design",
          priorityLevel: "medium",
          firstDraftDate: "2026-07-09",
          finalDeliverableDate: "2026-07-12",
          projectObjective: "",
          projectBrief: "",
          creativeAdvice: "",
          description: "",
          referenceAttachmentUrl: "",
          clientOrganizationName: "Acme Foods",
        },
      ],
    };

    const firstResponse = await importProjects(
      createJsonRequest("http://localhost/api/workspace/projects/bulk", payload),
    );
    const secondResponse = await importProjects(
      createJsonRequest("http://localhost/api/workspace/projects/bulk", payload),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(400);
    await expect(secondResponse.json()).resolves.toMatchObject({
      error: "Bulk import validation failed",
      details: ['Row 2: Project ID "ACM077" already exists.'],
    });
    expect(supabase.state.projects).toHaveLength(1);
  });
});
