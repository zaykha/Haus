import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createTask } from "@/app/api/workspace/projects/[id]/tasks/route";
import { PATCH as updateTask } from "@/app/api/workspace/projects/[id]/tasks/[taskId]/route";
import { POST as submitClientApproval } from "@/app/api/workspace/projects/[id]/workflow/client-approval/route";
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

function createPatchRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "PATCH",
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

describe("workspace task and review flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("client submits approval on a client-visible deliverable", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        projects: [{ id: "project-1", stage: "Pending Review", deleted_at: null }],
        tasks: [
          {
            id: "task-1",
            project_id: "project-1",
            title: "Landing Page",
            status: "review",
            client_visible: true,
            manager_review_status: "ready_for_client",
            completion_screenshot_url: "https://example.com/final-deliverable.png",
            deleted_at: null,
          },
        ],
        project_activity: [],
        project_feedback: [],
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

    const response = await submitClientApproval(
      createJsonRequest("http://localhost/api/workspace/projects/project-1/workflow/client-approval", {
        taskId: "task-1",
        decision: "approve",
        rating: 5,
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(supabase.state.tasks[0]).toMatchObject({
      status: "approved",
      client_visible: false,
      manager_review_status: "internal",
    });
    expect(supabase.state.projects[0]).toMatchObject({
      stage: "Complete",
    });
    expect(supabase.state.project_activity).toContainEqual(
      expect.objectContaining({
        project_id: "project-1",
        task_id: "task-1",
        action: "task_approved",
      }),
    );
  });

  it("client cannot review a task without a client-visible deliverable", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        projects: [{ id: "project-1", stage: "Pending Review", deleted_at: null }],
        tasks: [
          {
            id: "task-1",
            project_id: "project-1",
            title: "Landing Page",
            status: "review",
            client_visible: true,
            manager_review_status: "ready_for_client",
            completion_screenshot_url: null,
            deleted_at: null,
          },
        ],
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

    const response = await submitClientApproval(
      createJsonRequest("http://localhost/api/workspace/projects/project-1/workflow/client-approval", {
        taskId: "task-1",
        decision: "request_revision",
        revisionComment: "Needs changes",
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "No client-ready deliverable has been uploaded for this task yet.",
    });
  });

  it("manager creates a task and progresses it through review", async () => {
    const supabase = createFakeSupabaseAdminClient({
      state: {
        profiles: [
          {
            id: "designer-1",
            role: "designer",
            deleted_at: null,
          },
        ],
        projects: [{ id: "project-1", stage: "Waiting List", deleted_at: null }],
        tasks: [],
        project_activity: [],
        project_feedback: [],
      },
    });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({ id: "manager-1", role: "creative_manager" }),
    });

    const createResponse = await createTask(
      createJsonRequest("http://localhost/api/workspace/projects/project-1/tasks", {
        title: "Hero Banner",
        assigneeId: "designer-1",
        status: "todo",
        dueDate: "2026-07-12",
        priority: "high",
        clientVisible: false,
        managerReviewStatus: "internal",
      }),
      { params: Promise.resolve({ id: "project-1" }) },
    );

    expect(createResponse.status).toBe(200);
    const createdTaskId = String(supabase.state.tasks[0]?.id);
    expect(createdTaskId).toBeTruthy();
    expect(supabase.state.projects[0]).toMatchObject({ stage: "WIP" });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({ id: "designer-1", role: "designer", company: "Haus" }),
    });

    const designerResponse = await updateTask(
      createPatchRequest(`http://localhost/api/workspace/projects/project-1/tasks/${createdTaskId}`, {
        status: "done",
        completionScreenshotUrl: "https://example.com/hero-banner.png",
      }),
      { params: Promise.resolve({ id: "project-1", taskId: createdTaskId }) },
    );

    expect(designerResponse.status).toBe(200);
    expect(supabase.state.tasks[0]).toMatchObject({
      status: "done",
    });

    mockedRequireWorkspaceUser.mockResolvedValue({
      supabase: supabase as never,
      user: makeUser({ id: "manager-1", role: "creative_manager" }),
    });

    const reviewResponse = await updateTask(
      createPatchRequest(`http://localhost/api/workspace/projects/project-1/tasks/${createdTaskId}`, {
        title: "Hero Banner",
        assigneeId: "designer-1",
        status: "review",
        dueDate: "2026-07-12",
        priority: "high",
        completionScreenshotUrl: "https://example.com/hero-banner.png",
        clientVisible: true,
        managerReviewStatus: "ready_for_client",
      }),
      { params: Promise.resolve({ id: "project-1", taskId: createdTaskId }) },
    );

    expect(reviewResponse.status).toBe(200);
    expect(supabase.state.tasks[0]).toMatchObject({
      status: "review",
      client_visible: true,
      manager_review_status: "ready_for_client",
    });
    expect(supabase.state.projects[0]).toMatchObject({
      stage: "Pending Review",
    });
    expect(supabase.state.project_activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "task_created" }),
        expect.objectContaining({ action: "task_status_changed" }),
        expect.objectContaining({ action: "task_submitted" }),
      ]),
    );
  });
});
