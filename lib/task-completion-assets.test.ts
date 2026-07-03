import { describe, expect, it } from "vitest";
import {
  getCurrentTaskCompletionLabel,
  getTaskCompletionLabel,
  isTaskCompletionImage,
  isTaskCompletionLink,
  parseTaskCompletionAssets,
  parseTaskCompletionState,
  recordSubmittedTaskCompletionSnapshot,
  sameTaskCompletionAssets,
  serializeTaskCompletionAssets,
} from "@/lib/task-completion-assets";

describe("task-completion-assets", () => {
  it("parses empty values as no assets", () => {
    expect(parseTaskCompletionAssets(null)).toEqual([]);
    expect(parseTaskCompletionAssets(undefined)).toEqual([]);
    expect(parseTaskCompletionAssets("")).toEqual([]);
  });

  it("parses old JSON array format", () => {
    const value = JSON.stringify([" image-a.png ", "", "image-b.webp"]);

    expect(parseTaskCompletionAssets(value)).toEqual(["image-a.png", "image-b.webp"]);
  });

  it("treats plain non-json value as one asset", () => {
    expect(parseTaskCompletionAssets("https://example.com/file.png")).toEqual([
      "https://example.com/file.png",
    ]);
  });

  it("serializes zero, one, and multiple assets correctly", () => {
    expect(serializeTaskCompletionAssets([])).toBeNull();
    expect(serializeTaskCompletionAssets([" image.png "])).toBe("image.png");
    expect(serializeTaskCompletionAssets(["a.png", "b.png"])).toBe(
      JSON.stringify(["a.png", "b.png"]),
    );
  });

  it("compares assets regardless of order and blank values", () => {
    expect(sameTaskCompletionAssets(["a.png", "b.png"], [" b.png ", "a.png"])).toBe(true);
    expect(sameTaskCompletionAssets(["a.png"], ["a.png", "b.png"])).toBe(false);
  });

  it("records submitted snapshots and bumps submitted version", () => {
    const state = parseTaskCompletionState(null);
    const nextState = recordSubmittedTaskCompletionSnapshot(state, ["final.png"]);

    expect(nextState.currentVersionKind).toBe("submitted");
    expect(nextState.currentAssets).toEqual(["final.png"]);
    expect(nextState.submittedVersion).toBe(2);
    expect(nextState.history).toHaveLength(1);
    expect(nextState.history[0]).toMatchObject({
      id: "SV1",
      label: "SV1",
      kind: "submitted",
      number: 1,
      assets: ["final.png"],
    });
  });

  it("returns current version label", () => {
    const state = parseTaskCompletionState(null);

    expect(getCurrentTaskCompletionLabel(state)).toBe("IV1");

    const submittedState = recordSubmittedTaskCompletionSnapshot(state, ["final.png"]);

    expect(getCurrentTaskCompletionLabel(submittedState)).toBe("SV2");
  });

  it("detects image assets by extension", () => {
    expect(isTaskCompletionImage("image.png")).toBe(true);
    expect(isTaskCompletionImage("https://example.com/folder/image.webp")).toBe(true);
    expect(isTaskCompletionImage("https://example.com/file.pdf")).toBe(false);
  });

  it("detects web links", () => {
    expect(isTaskCompletionLink("https://example.com")).toBe(true);
    expect(isTaskCompletionLink("http://example.com")).toBe(true);
    expect(isTaskCompletionLink("file.png")).toBe(false);
  });

  it("extracts readable labels from URLs", () => {
    expect(getTaskCompletionLabel("https://example.com/uploads/final%20design.png")).toBe(
      "final design.png",
    );

    expect(getTaskCompletionLabel("local-file.png")).toBe("local-file.png");
  });
});