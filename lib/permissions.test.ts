import { describe, expect, it } from "vitest";
import {
  canCreateProjectForOrganization,
  canManageProjects,
  canUpdateTaskStatus,
  canUploadFiles,
  canViewProject,
  getUserClientOrganizationIds,
  getVisibleTasksForUser,
  isManagerRole,
} from "@/lib/permissions";
import type { Project, Task, User } from "@/lib/types";

function makeUser(overrides: Partial<User>): User {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    role: "designer",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Test Task",
    assigneeId: null,
    status: "todo",
    dueDate: "2026-07-10",
    priority: "medium",
    clientVisible: false,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: "project-1",
    name: "Test Project",
    ownerId: "owner-1",
    description: "",
    category: "Design",
    stage: "WIP",
    status: "active",
    dueDate: "2026-07-10",
    staffIds: [],
    tasks: [],
    files: [],
    comments: [],
    feedback: [],
    activities: [],
    ...overrides,
  };
}

describe("permissions", () => {
  it("detects manager roles", () => {
    expect(isManagerRole("communication_manager")).toBe(true);
    expect(isManagerRole("creative_manager")).toBe(true);
    expect(isManagerRole("designer")).toBe(false);
    expect(isManagerRole("client")).toBe(false);
  });

  it("allows only managers to manage projects", () => {
    expect(canManageProjects("communication_manager")).toBe(true);
    expect(canManageProjects("creative_manager")).toBe(true);
    expect(canManageProjects("designer")).toBe(false);
    expect(canManageProjects("client")).toBe(false);
  });

  it("resolves client organization ids from multi-membership first", () => {
    const user = makeUser({
      role: "client",
      clientOrganizationId: "org-single",
      clientOrganizationIds: ["org-a", "org-b"],
    });

    expect(getUserClientOrganizationIds(user)).toEqual(["org-a", "org-b"]);
  });

  it("falls back to single client organization id", () => {
    const user = makeUser({
      role: "client",
      clientOrganizationId: "org-single",
      clientOrganizationIds: [],
    });

    expect(getUserClientOrganizationIds(user)).toEqual(["org-single"]);
  });

  it("allows managers to create projects for any organization", () => {
    const user = makeUser({ role: "communication_manager" });

    expect(canCreateProjectForOrganization(user, "org-a")).toBe(true);
  });

  it("allows clients to create projects only for their own organization", () => {
    const user = makeUser({
      role: "client",
      clientOrganizationIds: ["org-a"],
    });

    expect(canCreateProjectForOrganization(user, "org-a")).toBe(true);
    expect(canCreateProjectForOrganization(user, "org-b")).toBe(false);
  });

  it("allows managers to view every project", () => {
    const user = makeUser({ role: "creative_manager" });
    const project = makeProject({ clientOrganizationId: "org-a" });

    expect(canViewProject(user, project)).toBe(true);
  });

  it("allows designers to view projects where they are staff", () => {
    const user = makeUser({ id: "designer-1", role: "designer" });
    const project = makeProject({ staffIds: ["designer-1"] });

    expect(canViewProject(user, project)).toBe(true);
  });

  it("allows designers to view projects with assigned or unassigned tasks", () => {
    const user = makeUser({ id: "designer-1", role: "designer" });
    const project = makeProject({
      tasks: [
        makeTask({ assigneeId: "designer-1" }),
        makeTask({ id: "task-2", assigneeId: null }),
      ],
    });

    expect(canViewProject(user, project)).toBe(true);
  });

  it("allows clients to view only projects from their organization", () => {
    const user = makeUser({
      role: "client",
      clientOrganizationIds: ["org-a"],
    });

    expect(canViewProject(user, makeProject({ clientOrganizationId: "org-a" }))).toBe(true);
    expect(canViewProject(user, makeProject({ clientOrganizationId: "org-b" }))).toBe(false);
  });

  it("filters visible tasks for designers", () => {
    const user = makeUser({ id: "designer-1", role: "designer" });
    const project = makeProject({
      tasks: [
        makeTask({ id: "assigned", assigneeId: "designer-1" }),
        makeTask({ id: "unassigned", assigneeId: null }),
        makeTask({ id: "other", assigneeId: "designer-2" }),
      ],
    });

    expect(getVisibleTasksForUser(user, project).map((task) => task.id)).toEqual([
      "assigned",
      "unassigned",
    ]);
  });

  it("filters visible tasks for clients", () => {
    const user = makeUser({ role: "client" });
    const project = makeProject({
      tasks: [
        makeTask({ id: "visible", clientVisible: true }),
        makeTask({ id: "approved", status: "approved", clientVisible: false }),
        makeTask({ id: "internal", status: "todo", clientVisible: false }),
      ],
    });

    expect(getVisibleTasksForUser(user, project).map((task) => task.id)).toEqual([
      "visible",
      "approved",
    ]);
  });

  it("allows designers to update only their todo or in-progress tasks", () => {
    const user = makeUser({ id: "designer-1", role: "designer" });
    const project = makeProject({
      staffIds: ["designer-1"],
    });

    expect(
      canUpdateTaskStatus(user, project, makeTask({ assigneeId: "designer-1", status: "todo" })),
    ).toBe(true);

    expect(
      canUpdateTaskStatus(user, project, makeTask({ assigneeId: "designer-1", status: "review" })),
    ).toBe(false);

    expect(
      canUpdateTaskStatus(user, project, makeTask({ assigneeId: "designer-2", status: "todo" })),
    ).toBe(false);
  });

  it("does not allow clients to upload files", () => {
    expect(canUploadFiles("communication_manager")).toBe(true);
    expect(canUploadFiles("creative_manager")).toBe(true);
    expect(canUploadFiles("designer")).toBe(true);
    expect(canUploadFiles("client")).toBe(false);
  });
});