import { hashTyped } from "../manifests/canonical-json";
import type { Uuid, Sha256, UtcTimestamp } from "../shared/types";

export interface VersionTransition {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly ruleId: Uuid;
  readonly changedAt: UtcTimestamp;
  readonly changedBy: string;
  readonly changeRationale: string;
  readonly supersedes: Sha256 | null;
}

export interface SupersessionChain {
  readonly ruleId: Uuid;
  readonly links: readonly SupersessionLink[];
}

export interface SupersessionLink {
  readonly ordinal: number;
  readonly predecessorRuleId: Uuid | null;
  readonly predecessorRuleContentSha256: Sha256 | null;
  readonly effectiveDate: string;
  readonly linkType: "initial" | "supersession" | "amendment" | "re-authoring" | "repeal" | "reinstate" | "branch";
}

export function createSupersessionLink(
  predecessorRuleId: Uuid | null,
  predecessorContentSha256: Sha256 | null,
  effectiveDate: string,
  linkType: SupersessionLink["linkType"],
  ordinal: number,
): SupersessionLink {
  return {
    ordinal,
    predecessorRuleId,
    predecessorRuleContentSha256: predecessorContentSha256,
    effectiveDate,
    linkType,
  };
}

export function buildSupersessionChain(
  rule: import("./models").PlanRuleRecord,
): SupersessionChain {
  const links: SupersessionLink[] = [];

  for (const link of rule.supersessionChain) {
    links.push({
      ordinal: link.ordinal,
      predecessorRuleId: link.predecessorRuleId,
      predecessorRuleContentSha256: link.predecessorRuleContentSha256,
      effectiveDate: link.effectiveDate,
      linkType: link.linkType,
    });
  }

  return {
    ruleId: rule.ruleId,
    links: links.sort((a, b) => a.ordinal - b.ordinal),
  };
}

export function validateSemanticVersion(version: string): { valid: boolean; error?: string } {
  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(version)) {
    return { valid: false, error: "Version must follow semantic versioning (major.minor.patch)" };
  }
  return { valid: true };
}

export function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);

  if (aParts.length < 3 || bParts.length < 3) return 0;

  for (let i = 0; i < 3; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart !== undefined && bPart !== undefined && aPart !== bPart) {
      return aPart - bPart;
    }
  }
  return 0;
}

export function getNextPatchVersion(current: string): string {
  const parts = current.split(".").map(Number);
  if (parts.length < 3) return current;
  const major = parts[0];
  const minor = parts[1];
  const patch = parts[2];
  if (major === undefined || minor === undefined || patch === undefined) return current;
  return String(major) + "." + String(minor) + "." + String(patch + 1);
}

export function getNextMinorVersion(current: string): string {
  const parts = current.split(".").map(Number);
  if (parts.length < 2) return current;
  const major = parts[0];
  const minor = parts[1];
  if (major === undefined || minor === undefined) return current;
  return String(major) + "." + String(minor + 1) + ".0";
}

export function getNextMajorVersion(current: string): string {
  const parts = current.split(".").map(Number);
  if (parts.length < 1) return current;
  const major = parts[0];
  if (major === undefined) return current;
  return String(major + 1) + ".0.0";
}

export function isVersionSuperseded(
  version: string,
  chain: readonly { version: string }[],
): boolean {
  return chain.some((v) => compareVersions(v.version, version) > 0);
}

export async function computeRuleVersionHash(
  ruleId: Uuid,
  version: string,
  statement: string,
  supersedes?: Sha256,
): Promise<Sha256> {
  const deterministicPayload = {
    ruleId,
    version,
    statement,
    supersedes: supersedes ?? null,
  } as const;

  return (await hashTyped(deterministicPayload, {
    typeName: "RuleVersionContent",
  })) as import("../shared/types").Sha256;
}

export function validateSupersessionChain(
  chain: readonly SupersessionLink[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (chain.length === 0) {
    errors.push("Supersession chain cannot be empty");
    return { valid: false, errors };
  }

  const firstLink = chain[0];
  if (firstLink && firstLink.linkType !== "initial") {
    errors.push("First link in supersession chain must be 'initial'");
  }

  const seenOrdinals = new Set<number>();
  for (const link of chain) {
    if (seenOrdinals.has(link.ordinal)) {
      errors.push("Duplicate ordinal " + String(link.ordinal) + " in supersession chain");
    }
    seenOrdinals.add(link.ordinal);

    if (link.ordinal > 1 && link.predecessorRuleId === null) {
      errors.push("Link " + String(link.ordinal) + " must have a predecessor");
    }
  }

  const sortedLinks = [...chain].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 1; i < sortedLinks.length; i++) {
    const current = sortedLinks[i];
    const previous = sortedLinks[i - 1];
    if (current && previous && current.effectiveDate <= previous.effectiveDate) {
      errors.push("Effective dates must be strictly increasing in supersession chain");
    }
  }

  return { valid: errors.length === 0, errors };
}