const KNOWN_PROJECT_PREFIX_BY_COMPANY_KEY = new Map<string, string>([
  ["AEKARY", "AEK"],
  ["BELLARIEPRODUCTIONISO", "BEL"],
  ["BEYONDTRUST", "BEY"],
  ["GOGREEN", "GOG"],
  ["MPOWER", "MPO"],
  ["MARLARMYIANGAGRICULTUREAGRO", "MLM"],
  ["MARLARMYAINGPUBLICCOMPANYLIMITED", "MLM"],
  ["MARLARMYAINGIRRIGATIONSOLUTION", "MLM"],
  ["MIRAEISO", "MIR"],
  ["MPAY", "MPAY"],
  ["MYANMARGOLDENEAGLEISO", "MGE"],
  ["MYANMARGOLDENPRODUCEISOMGP", "MGP"],
  ["MYANMARPESTICIDESINDUSTRYMPI", "MPI"],
  ["NEWMAYKHA", "NMK"],
  ["TEZEANISO", "TEZ"],
  ["THAWDAASSOCIATE", "TAA"],
  ["UFGUNITEDFERTILIZERGROUP", "UFG"],
  ["HAUSOFCREATIVES", "HOC"],
  ["BAMARGALLERYCOLLECTIONS", "BGC"],
  ["LAKE62", "LAK"],
  ["FOODCOMA", "FOC"],
  ["NATSTHAIKITCHEN", "NTK"],
  ["AMARA", "AMA"],
]);

export function normalizeCompanyNameKey(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function getKnownProjectPrefix(name: string) {
  return KNOWN_PROJECT_PREFIX_BY_COMPANY_KEY.get(normalizeCompanyNameKey(name)) ?? null;
}

export function buildOrganizationPrefixSeed(name: string) {
  const alphanumeric = normalizeCompanyNameKey(name);
  return (alphanumeric.slice(0, 3) || "ORG").padEnd(3, "X");
}

export function buildUniqueOrganizationPrefix(name: string, usedPrefixes: Set<string>) {
  const seed = buildOrganizationPrefixSeed(name);
  if (!usedPrefixes.has(seed)) {
    usedPrefixes.add(seed);
    return seed;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index);
    const candidate = `${seed.slice(0, Math.max(1, 3 - suffix.length))}${suffix}`;
    if (!usedPrefixes.has(candidate)) {
      usedPrefixes.add(candidate);
      return candidate;
    }
  }

  const fallback = `${seed}${Date.now().toString().slice(-3)}`;
  usedPrefixes.add(fallback);
  return fallback;
}

export function buildRandomOrganizationPrefix(usedPrefixes: Set<string>) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (let attempt = 0; attempt < 500; attempt += 1) {
    let candidate = "";
    for (let index = 0; index < 3; index += 1) {
      candidate += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "X";
    }

    if (!usedPrefixes.has(candidate)) {
      usedPrefixes.add(candidate);
      return candidate;
    }
  }

  return buildUniqueOrganizationPrefix(`ORG${Date.now()}`, usedPrefixes);
}

export function resolveOrganizationProjectPrefix({
  name,
  type,
  existingPrefix,
  usedPrefixes,
}: {
  name: string;
  type?: string | null;
  existingPrefix?: string | null;
  usedPrefixes: Set<string>;
}) {
  const normalizedExistingPrefix = String(existingPrefix ?? "").trim().toUpperCase();
  if (normalizedExistingPrefix) {
    usedPrefixes.add(normalizedExistingPrefix);
    return normalizedExistingPrefix;
  }

  const knownPrefix = getKnownProjectPrefix(name);
  if (knownPrefix) {
    usedPrefixes.add(knownPrefix);
    return knownPrefix;
  }

  if (type === "external") {
    return buildRandomOrganizationPrefix(usedPrefixes);
  }

  return buildUniqueOrganizationPrefix(name, usedPrefixes);
}

export function buildNextProjectCode(prefix: string, sequenceByPrefix: Map<string, number>) {
  const normalizedPrefix = prefix.trim().toUpperCase() || "ORG";
  const nextSequence = (sequenceByPrefix.get(normalizedPrefix) ?? 0) + 1;
  sequenceByPrefix.set(normalizedPrefix, nextSequence);
  return `${normalizedPrefix}${String(nextSequence).padStart(3, "0")}`;
}
