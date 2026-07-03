import { describe, expect, it } from "vitest";
import {
  buildNextProjectCode,
  buildOrganizationPrefixSeed,
  buildUniqueOrganizationPrefix,
  getKnownProjectPrefix,
  normalizeCompanyNameKey,
  resolveOrganizationProjectPrefix,
} from "@/lib/project-code";

describe("project-code", () => {
  it("normalizes company names by uppercasing and removing symbols/spaces", () => {
    expect(normalizeCompanyNameKey("Marlar Myaing Public Company Limited")).toBe(
      "MARLARMYAINGPUBLICCOMPANYLIMITED",
    );

    expect(normalizeCompanyNameKey("Haus of Creatives!")).toBe("HAUSOFCREATIVES");
  });

  it("returns known prefixes for configured company names", () => {
    expect(getKnownProjectPrefix("Haus of Creatives")).toBe("HOC");
    expect(getKnownProjectPrefix("Marlar Myaing Public Company Limited")).toBe("MLM");
    expect(getKnownProjectPrefix("Unknown Company")).toBeNull();
  });

  it("builds a 3-character prefix seed from organization name", () => {
    expect(buildOrganizationPrefixSeed("Alpha Company")).toBe("ALP");
    expect(buildOrganizationPrefixSeed("A")).toBe("AXX");
    expect(buildOrganizationPrefixSeed("")).toBe("ORG");
  });

  it("builds unique organization prefixes and avoids used prefixes", () => {
    const usedPrefixes = new Set<string>(["ALP"]);

    expect(buildUniqueOrganizationPrefix("Alpha Company", usedPrefixes)).toBe("AL2");
    expect(usedPrefixes.has("AL2")).toBe(true);
  });

  it("uses existing prefix when provided", () => {
    const usedPrefixes = new Set<string>();

    const result = resolveOrganizationProjectPrefix({
      name: "Any Company",
      type: "internal",
      existingPrefix: " abc ",
      usedPrefixes,
    });

    expect(result).toBe("ABC");
    expect(usedPrefixes.has("ABC")).toBe(true);
  });

  it("uses known prefix before generating a new one", () => {
    const usedPrefixes = new Set<string>();

    const result = resolveOrganizationProjectPrefix({
      name: "Haus of Creatives",
      type: "internal",
      usedPrefixes,
    });

    expect(result).toBe("HOC");
    expect(usedPrefixes.has("HOC")).toBe(true);
  });

  it("generates sequential project codes per prefix", () => {
    const sequenceByPrefix = new Map<string, number>();

    expect(buildNextProjectCode("hoc", sequenceByPrefix)).toBe("HOC001");
    expect(buildNextProjectCode("HOC", sequenceByPrefix)).toBe("HOC002");
    expect(buildNextProjectCode("MLM", sequenceByPrefix)).toBe("MLM001");
  });
});