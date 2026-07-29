import { catalogContentSha256 } from "../evidence/catalog";
import type { EvidenceCatalog } from "../evidence/models";
import { requiresAuthorityOverride } from "../evidence/source-roles";
import { canonicalize, hashTyped } from "../manifests/canonical-json";
import type { HumanActor } from "../quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type {
  ApplicabilityCondition,
  ApplicabilityDimension,
  AuthorityOverride,
  AuthoringError,
  PlanRuleRecord,
  ProvisionCandidate,
  RuleCitation,
  SupersessionLink,
  SupersessionLinkType,
  UnresolvedItem,
} from "./models";
import { effectiveAuthorityOverrides } from "./authority-override";
import { projectLatestUnresolvedItems } from "./unresolved-items";

export interface GovernanceDependencies {
  readonly now: () => string;
  readonly uuid: () => string;
}

export const systemGovernanceDependencies: GovernanceDependencies = {
  now: () => new Date().toISOString(),
  uuid: () => globalThis.crypto.randomUUID(),
};

export interface GovernedRuleAuthoringInput {
  readonly proposedCandidates: readonly ProvisionCandidate[];
  readonly primaryCitation: RuleCitation;
  readonly catalog: EvidenceCatalog;
  readonly unresolvedRecords: readonly UnresolvedItem[];
  readonly authorityOverrides: readonly AuthorityOverride[];
  readonly supportingCitations?: readonly RuleCitation[];
  readonly governingRestatement: string;
  readonly effectiveDate: string;
  readonly endDate: string | null;
  readonly adoptionOrExecutionDate?: string | null;
  readonly applicabilityConditions: readonly ApplicabilityCondition[];
  readonly requiredApplicabilityDimensions: readonly ApplicabilityDimension[];
  readonly affectedScope: string;
  readonly reviewer: HumanActor;
  readonly approvalRationale: string;
  readonly confidence: number;
  readonly predecessor?: PlanRuleRecord | null;
  readonly linkType?: Exclude<SupersessionLinkType, "initial" | "branch">;
  readonly ruleSetVersion: string;
}

export async function authorRule(
  input: GovernedRuleAuthoringInput,
  dependencies: GovernanceDependencies = systemGovernanceDependencies,
): Promise<Result<PlanRuleRecord, AuthoringError>> {
  const ruleId = parseUuid(dependencies.uuid());
  const authoredAt = parseUtcTimestamp(dependencies.now());
  if (!ruleId.ok || !authoredAt.ok) {
    return authoringFailure(
      "HASH_COMPUTATION_FAILED",
      "Injected rule identity or timestamp is invalid.",
    );
  }
  if (
    input.governingRestatement.trim() === "" ||
    input.affectedScope.trim() === "" ||
    input.approvalRationale.trim() === "" ||
    input.proposedCandidates.length === 0 ||
    input.proposedCandidates.some(
      (candidate) => candidate.status !== "proposed",
    ) ||
    !input.proposedCandidates.some(
      (candidate) =>
        candidate.artifactSha256 === input.primaryCitation.artifactSha256 &&
        candidate.artifactLocator === input.primaryCitation.artifactLocator,
    )
  ) {
    return authoringFailure(
      "INVALID_PRIMARY_CITATION",
      "Exactly one released primary citation must identify a proposed candidate.",
    );
  }
  if (
    !validDate(input.effectiveDate) ||
    (input.endDate !== null &&
      (!validDate(input.endDate) || input.effectiveDate > input.endDate)) ||
    (input.adoptionOrExecutionDate != null &&
      !validDate(input.adoptionOrExecutionDate))
  ) {
    return authoringFailure(
      "EFFECTIVE_DATE_VIOLATION",
      "Rule dates must be real ISO dates and effectiveDate must not exceed endDate.",
    );
  }
  if (input.confidence < 0 || input.confidence > 1) {
    return authoringFailure(
      "INVALID_PRIMARY_CITATION",
      "Confidence must be between zero and one.",
    );
  }
  const applicabilityError = validateApplicability(
    input.applicabilityConditions,
    input.requiredApplicabilityDimensions,
  );
  if (applicabilityError !== null) {
    return authoringFailure("APPLICABILITY_INVALID", applicabilityError);
  }
  const catalogValidation = await validateCatalog(input.catalog);
  if (!catalogValidation.ok) {
    return authoringFailure(
      "INVALID_PRIMARY_CITATION",
      catalogValidation.error,
    );
  }
  const blockers = await validateRuleUnresolvedBlockers(
    input.affectedScope,
    input.unresolvedRecords,
  );
  if (!blockers.ok) {
    return authoringFailure("BLOCKED_BY_UNRESOLVED_ITEM", blockers.error);
  }
  const governance = await authenticateRuleGovernance(
    input.primaryCitation,
    input.affectedScope,
    input.catalog,
    input.authorityOverrides,
  );
  if (!governance.ok) {
    return authoringFailure(
      governance.error.requiresOverride
        ? "AUTHORITY_OVERRIDE_REQUIRED"
        : "INVALID_PRIMARY_CITATION",
      governance.error.message,
    );
  }

  const supersessionChain = input.predecessor
    ? appendSupersessionLink(
        input.predecessor,
        input.effectiveDate,
        input.linkType,
      )
    : ({ ok: true, value: [] } as const);
  if (!supersessionChain.ok) return supersessionChain;
  const supportingCitations = sortCanonical(input.supportingCitations ?? []);
  if (
    supportingCitations.some(
      (citation) =>
        canonicalize(citation) === canonicalize(input.primaryCitation),
    )
  ) {
    return authoringFailure(
      "INVALID_PRIMARY_CITATION",
      "The primary citation cannot also be a supporting citation.",
    );
  }

  const deterministicPayload = {
    ruleId: ruleId.value,
    governingRestatement: input.governingRestatement,
    affectedScope: input.affectedScope,
    primaryCitation: input.primaryCitation,
    supportingCitations,
    effectiveDate: input.effectiveDate,
    endDate: input.endDate,
    adoptionOrExecutionDate: input.adoptionOrExecutionDate ?? null,
    applicabilityConditions: sortCanonical(input.applicabilityConditions),
    supersessionChain: supersessionChain.value,
    confidence: input.confidence,
    authorityOverrideId: governance.value?.overrideId ?? null,
    linkedUnresolvedItemIds: [] as readonly Uuid[],
    ruleSetVersion: input.ruleSetVersion,
    schemaVersion: "1.0.0" as const,
  };
  const withoutHash = {
    ...deterministicPayload,
    authorHuman: input.reviewer,
    authoredAt: authoredAt.value,
    reviewStatus: "human-approved" as const,
    approvalRationale: input.approvalRationale,
  };
  const ruleContentSha256 = await ruleContentHash(withoutHash);
  return {
    ok: true,
    value: deepFreeze({
      ...withoutHash,
      ruleContentSha256,
    }),
  };
}

export async function validateRuleGovernance(
  record: PlanRuleRecord,
  catalog: EvidenceCatalog,
  overrides: readonly AuthorityOverride[],
): Promise<Result<void, string>> {
  const catalogValidation = await validateCatalog(catalog);
  if (!catalogValidation.ok) return catalogValidation;
  const governance = await authenticateRuleGovernance(
    record.primaryCitation,
    record.affectedScope,
    catalog,
    overrides,
  );
  if (!governance.ok) return { ok: false, error: governance.error.message };
  if ((governance.value?.overrideId ?? null) !== record.authorityOverrideId) {
    return {
      ok: false,
      error:
        "Rule authorityOverrideId does not identify the effective authenticated override.",
    };
  }
  return { ok: true, value: undefined };
}

export async function validateRuleUnresolvedBlockers(
  affectedScope: string,
  unresolvedRecords: readonly UnresolvedItem[],
): Promise<Result<void, string>> {
  const latest = await projectLatestUnresolvedItems(unresolvedRecords);
  if (!latest.ok) return latest;
  const blockers = latest.value.filter(
    (item) =>
      item.status === "open" &&
      scopesIntersect(item.affectedScope, affectedScope),
  );
  return blockers.length === 0
    ? { ok: true, value: undefined }
    : {
        ok: false,
        error: `Rule scope is blocked by open unresolved item(s): ${blockers
          .map((item) => item.itemId)
          .join(", ")}.`,
      };
}

export async function ruleContentHash(
  record: Omit<PlanRuleRecord, "ruleContentSha256">,
): Promise<Sha256> {
  const parsed = parseSha256(
    await hashTyped(record, {
      schemaId: "plan-rule-record.schema.json",
      typeName: "PlanRuleRecordContent",
    }),
  );
  if (!parsed.ok) throw new Error("Canonical rule SHA-256 computation failed.");
  return parsed.value;
}

export async function validateRuleRecord(
  record: PlanRuleRecord,
): Promise<Result<void, string>> {
  if (
    record.reviewStatus !== "human-approved" ||
    record.approvalRationale.trim() === ""
  ) {
    return { ok: false, error: "Final rule approval fields are invalid." };
  }
  const { ruleContentSha256, ...payload } = record;
  if ((await ruleContentHash(payload)) !== ruleContentSha256) {
    return { ok: false, error: "Rule content hash is invalid." };
  }
  const chain = record.supersessionChain;
  for (let index = 0; index < chain.length; index += 1) {
    const link = chain[index];
    if (link?.ordinal !== index + 1 || !validDate(link.effectiveDate)) {
      return {
        ok: false,
        error: "Rule supersession ordinals or dates are invalid.",
      };
    }
    if (
      (link.predecessorRuleId === null) !==
      (link.predecessorRuleContentSha256 === null)
    ) {
      return {
        ok: false,
        error: "Rule supersession predecessor linkage is incomplete.",
      };
    }
  }
  return { ok: true, value: undefined };
}

function appendSupersessionLink(
  predecessor: PlanRuleRecord,
  effectiveDate: string,
  linkType: GovernedRuleAuthoringInput["linkType"],
): Result<readonly SupersessionLink[], AuthoringError> {
  if (
    effectiveDate <= predecessor.effectiveDate ||
    (predecessor.endDate !== null && predecessor.endDate > effectiveDate)
  ) {
    return authoringFailure(
      "SUPERSESSION_CHAIN_INVALID",
      "A successor must have a later unambiguous effective date and cannot overlap its predecessor.",
    );
  }
  return {
    ok: true,
    value: deepFreeze([
      ...predecessor.supersessionChain,
      {
        ordinal: predecessor.supersessionChain.length + 1,
        predecessorRuleId: predecessor.ruleId,
        predecessorRuleContentSha256: predecessor.ruleContentSha256,
        effectiveDate,
        linkType: linkType ?? "supersession",
      },
    ]),
  };
}

async function validateCatalog(
  catalog: EvidenceCatalog,
): Promise<Result<void, string>> {
  const { catalogContentSha256: expected, ...content } = catalog;
  return (await catalogContentSha256(content)) === expected
    ? { ok: true, value: undefined }
    : { ok: false, error: "Evidence catalog content hash is invalid." };
}

async function authenticateRuleGovernance(
  citation: RuleCitation,
  affectedScope: string,
  catalog: EvidenceCatalog,
  overrides: readonly AuthorityOverride[],
): Promise<
  Result<
    AuthorityOverride | null,
    { readonly message: string; readonly requiresOverride: boolean }
  >
> {
  const caseMatches = catalog.caseEvidence.filter(
    (artifact) => artifact.sha256 === citation.artifactSha256,
  );
  const referenceMatches = catalog.referenceOnly.filter(
    (artifact) => artifact.sha256 === citation.artifactSha256,
  );
  const matches = [...caseMatches, ...referenceMatches];
  const artifact = matches[0];
  if (
    matches.length !== 1 ||
    artifact?.locator !== citation.artifactLocator ||
    artifact.sourceRole !== citation.sourceRole ||
    artifact.reviewStatus !== "released"
  ) {
    return {
      ok: false,
      error: {
        message:
          "Primary citation must resolve to exactly one matching released catalog artifact.",
        requiresOverride: false,
      },
    };
  }
  const effective = await effectiveAuthorityOverrides(overrides, catalog);
  if (!effective.ok) {
    return {
      ok: false,
      error: { message: effective.error, requiresOverride: true },
    };
  }
  const overrideRequired =
    referenceMatches.length === 1 ||
    requiresAuthorityOverride(citation.sourceRole);
  const matchingOverrides = effective.value.filter(
    (override) =>
      override.authorizedArtifactSha256 === citation.artifactSha256 &&
      override.authorizedSourceRole === citation.sourceRole &&
      scopesEqual(override.affectedRuleScope, affectedScope),
  );
  if (overrideRequired && matchingOverrides.length !== 1) {
    return {
      ok: false,
      error: {
        message:
          "Reference or restricted primary evidence requires exactly one effective matching AuthorityOverride.",
        requiresOverride: true,
      },
    };
  }
  if (!overrideRequired && matchingOverrides.length > 0) {
    return {
      ok: false,
      error: {
        message:
          "An AuthorityOverride cannot be linked where default authority already permits the source.",
        requiresOverride: false,
      },
    };
  }
  return { ok: true, value: matchingOverrides[0] ?? null };
}

function validateApplicability(
  conditions: readonly ApplicabilityCondition[],
  required: readonly ApplicabilityDimension[],
): string | null {
  const dimensions = new Set<ApplicabilityDimension>();
  for (const condition of conditions) {
    if (condition.value.trim() === "" || condition.evidence.length === 0) {
      return "Every applicability condition requires a value and supporting evidence.";
    }
    if (dimensions.has(condition.dimension)) {
      return `Applicability dimension ${condition.dimension} is duplicated.`;
    }
    dimensions.add(condition.dimension);
  }
  const missing = [...new Set(required)].filter(
    (dimension) => !dimensions.has(dimension),
  );
  return missing.length === 0
    ? null
    : `Affected applicability dimensions are missing: ${missing.join(", ")}.`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function scopesEqual(left: string, right: string): boolean {
  return normalizeScope(left) === normalizeScope(right);
}

function scopesIntersect(left: string, right: string): boolean {
  const a = normalizeScope(left);
  const b = normalizeScope(right);
  return (
    a === "*" ||
    b === "*" ||
    a === b ||
    b.startsWith(`${a}/`) ||
    a.startsWith(`${b}/`)
  );
}

function normalizeScope(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, "-")
    .replaceAll(":", "/");
}

function sortCanonical<T>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) =>
    canonicalize(left).localeCompare(canonicalize(right)),
  );
}

function authoringFailure<Code extends AuthoringError["code"]>(
  code: Code,
  message: string,
): Result<never, Extract<AuthoringError, { readonly code: Code }>> {
  return { ok: false, error: { code, message } } as Result<
    never,
    Extract<AuthoringError, { readonly code: Code }>
  >;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
