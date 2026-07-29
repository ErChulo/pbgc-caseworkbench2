import type { SourceRole } from "./models";

export const SOURCE_ROLES = [
  "executed-plan-document",
  "amendment",
  "collective-bargaining-agreement",
  "notice",
  "actuarial-report",
  "formal-determination",
  "approved-plan-summary",
  "certified-case-report",
  "supporting-administrative-report",
  "approved-historical-calculation-artifact",
  "regulation",
  "training-reference",
  "inference",
  "other",
] as const satisfies readonly SourceRole[];

const sourceRoleLabels: Readonly<Record<SourceRole, string>> = {
  "executed-plan-document": "Executed Plan Document",
  amendment: "Amendment",
  "collective-bargaining-agreement": "Collective Bargaining Agreement",
  notice: "Notice",
  "actuarial-report": "Actuarial Report",
  "formal-determination": "Formal Legal, PBGC, or Actuarial Determination",
  "approved-plan-summary": "Approved Plan Summary",
  "certified-case-report": "Certified Case Report",
  "supporting-administrative-report": "Supporting Administrative Report",
  "approved-historical-calculation-artifact":
    "Approved Historical Calculation Artifact",
  regulation: "Regulation",
  "training-reference": "Training Reference",
  inference: "Inference",
  other: "Other",
};

const sourceRoleSet: ReadonlySet<string> = new Set(SOURCE_ROLES);

const defaultAuthorityOrderArray: readonly SourceRole[] = Object.freeze([
  "executed-plan-document",
  "amendment",
  "collective-bargaining-agreement",
  "formal-determination",
  "approved-plan-summary",
  "certified-case-report",
  "supporting-administrative-report",
  "actuarial-report",
  "notice",
  "approved-historical-calculation-artifact",
  "inference",
  "regulation",
  "training-reference",
  "other",
]);

const authorityRank: ReadonlyMap<SourceRole, number> = new Map([
  ["executed-plan-document", 0],
  ["amendment", 0],
  ["collective-bargaining-agreement", 0],
  ["formal-determination", 1],
  ["approved-plan-summary", 2],
  ["certified-case-report", 3],
  ["supporting-administrative-report", 4],
  ["actuarial-report", 4],
  ["notice", 4],
  ["approved-historical-calculation-artifact", 5],
  ["inference", 6],
  ["regulation", 7],
  ["training-reference", 7],
  ["other", 7],
]);

export function sourceRoleLabel(role: SourceRole): string {
  return sourceRoleLabels[role];
}

export function isValidSourceRole(value: string): value is SourceRole {
  return sourceRoleSet.has(value);
}

export function defaultAuthorityOrder(): readonly SourceRole[] {
  return defaultAuthorityOrderArray;
}

export function authorityRankOf(role: SourceRole): number {
  return authorityRank.get(role) ?? Infinity;
}

export function hasHigherAuthority(
  current: SourceRole,
  candidate: SourceRole,
): boolean {
  return authorityRankOf(candidate) < authorityRankOf(current);
}

export function requiresAuthorityOverride(role: SourceRole): boolean {
  return (
    role === "regulation" || role === "training-reference" || role === "other"
  );
}
