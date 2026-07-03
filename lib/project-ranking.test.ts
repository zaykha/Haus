import { describe, expect, it } from "vitest";
import {
  compareProjectsByWorkflowPriority,
  getProjectWorkflowRank,
  isProjectCompleted,
  isProjectOnHold,
  isProjectPendingReview,
} from "@/lib/project-ranking";

describe("project-ranking", () => {
  it("detects completed project states", () => {
    expect(isProjectCompleted({ status: "done" })).toBe(true);
    expect(isProjectCompleted({ status: "approved" })).toBe(true);
    expect(isProjectCompleted({ status: "Complete" })).toBe(true);
    expect(isProjectCompleted({ status: "active", stage: "Complete" })).toBe(true);
    expect(isProjectCompleted({ status: "active", stage: "WIP" })).toBe(false);
  });

  it("detects on-hold project states", () => {
    expect(isProjectOnHold({ status: "On Hold" })).toBe(true);
    expect(isProjectOnHold({ status: "active", stage: "On Hold" })).toBe(true);
    expect(isProjectOnHold({ status: "active", stage: "WIP" })).toBe(false);
  });

  it("detects pending-review project states", () => {
    expect(isProjectPendingReview({ status: "review" })).toBe(true);
    expect(isProjectPendingReview({ status: "revision" })).toBe(true);
    expect(isProjectPendingReview({ status: "Pending Review" })).toBe(true);
    expect(isProjectPendingReview({ status: "active", stage: "Pending Review" })).toBe(true);
    expect(isProjectPendingReview({ status: "active", stage: "WIP" })).toBe(false);
  });

  it("assigns workflow priority ranks in the expected order", () => {
    expect(getProjectWorkflowRank({ status: "review" })).toBe(0);
    expect(getProjectWorkflowRank({ status: "revision" })).toBe(1);
    expect(getProjectWorkflowRank({ status: "active" })).toBe(2);
    expect(getProjectWorkflowRank({ status: "Waiting List" })).toBe(3);
    expect(getProjectWorkflowRank({ status: "On Hold" })).toBe(4);
    expect(getProjectWorkflowRank({ status: "Complete" })).toBe(5);
    expect(getProjectWorkflowRank({ status: "something_else" })).toBe(6);
  });

  it("sorts projects by workflow rank first", () => {
    const projects = [
      { name: "Done", status: "Complete" },
      { name: "Review", status: "review" },
      { name: "WIP", status: "active" },
      { name: "Revision", status: "revision" },
    ];

    const sorted = [...projects].sort(compareProjectsByWorkflowPriority);

    expect(sorted.map((project) => project.name)).toEqual([
      "Review",
      "Revision",
      "WIP",
      "Done",
    ]);
  });

  it("sorts same-rank projects by due date, then requested date, then name", () => {
    const projects = [
      {
        name: "B Project",
        status: "active",
        dueDate: "2026-08-10",
        requestedDate: "2026-07-02",
      },
      {
        name: "A Project",
        status: "active",
        dueDate: "2026-08-10",
        requestedDate: "2026-07-01",
      },
      {
        name: "C Project",
        status: "active",
        dueDate: "2026-08-01",
        requestedDate: "2026-07-03",
      },
    ];

    const sorted = [...projects].sort(compareProjectsByWorkflowPriority);

    expect(sorted.map((project) => project.name)).toEqual([
      "C Project",
      "A Project",
      "B Project",
    ]);
  });
});