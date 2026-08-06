import type { Sha256, UtcTimestamp, Uuid } from "../../domain/shared/types";
import { parseSha256 } from "../../domain/shared/types";
import type { ManifestExportSummary } from "../../components/inventory/ManifestExport";
import type { PopulationReviewItem } from "../../components/review/PopulationReview";
import type {
  CaseworkOutputArtifactInput,
  CaseworkOutputUnresolvedItemSummary,
  FinalCaseworkOutputInput,
} from "../../domain/case-output/models";
import type {
  PlanRuleRecord,
  UnresolvedItem,
} from "../../domain/plan-rules/models";

const CASE_OUTPUT_ARTIFACT_TYPES = [
  "population-profile",
  "v1-architecture",
  "build-spec",
  "compiled-formula-artifact",
  "v1-workbook",
  "validation-result",
  "reconciliation-result",
  "section-436-evaluation",
] as const;

const CASE_OUTPUT_MATURITY_LEVELS = [
  "implemented",
  "tested",
  "independently-validated",
  "human-approved",
] as const;

export function createFinalOutputInput({
  caseRecord,
  manifestSummary,
  previewRules,
  populationItems,
  caseOutputArtifacts,
  unresolvedItems,
  createdAt,
  createdBy,
}: {
  readonly caseRecord: { readonly caseId: Uuid };
  readonly manifestSummary: ManifestExportSummary | null;
  readonly previewRules: readonly PlanRuleRecord[];
  readonly populationItems: readonly PopulationReviewItem[];
  readonly caseOutputArtifacts: readonly CaseworkOutputArtifactInput[];
  readonly unresolvedItems: readonly UnresolvedItem[];
  readonly createdAt: UtcTimestamp;
  readonly createdBy: string | null;
}): FinalCaseworkOutputInput {
  const linked = linkedCaseOutputArtifacts(caseOutputArtifacts);
  return {
    caseId: caseRecord.caseId,
    evidenceManifestSha256: manifestSha256(manifestSummary),
    planRules: previewRules.map((rule) => ({
      ruleId: rule.ruleId,
      ruleContentSha256: rule.ruleContentSha256,
      reviewStatus: rule.reviewStatus,
      storagePath: `cases/${caseRecord.caseId}/evidence/rule-records.jsonl`,
    })),
    populationProfileContentSha256:
      approvedPopulationProfileHash(populationItems) ??
      linked.get("population-profile")?.contentSha256 ??
      null,
    architecture: linked.get("v1-architecture") ?? null,
    buildSpec: linked.get("build-spec") ?? null,
    compiledFormulas: linked.get("compiled-formula-artifact") ?? null,
    workbook: linked.get("v1-workbook") ?? null,
    validation: linked.get("validation-result") ?? null,
    reconciliation: linked.get("reconciliation-result") ?? null,
    section436: linked.get("section-436-evaluation") ?? null,
    section436Required: true,
    unresolvedItems: unresolvedItems.map(unresolvedItemSummary),
    createdAt,
    createdBy,
  };
}

function manifestSha256(
  manifestSummary: ManifestExportSummary | null,
): Sha256 | null {
  if (manifestSummary === null) return null;
  const parsed = parseSha256(manifestSummary.deterministicManifestHash);
  return parsed.ok ? parsed.value : null;
}

function approvedPopulationProfileHash(
  populationItems: readonly PopulationReviewItem[],
): Sha256 | null {
  for (const item of populationItems) {
    if (
      item.projection.status === "approved" &&
      item.projection.effectiveWorkbookProfileContentSha256 !== null
    ) {
      return item.projection.effectiveWorkbookProfileContentSha256;
    }
  }
  return null;
}

function unresolvedItemSummary(
  item: UnresolvedItem,
): CaseworkOutputUnresolvedItemSummary {
  return {
    itemId: item.itemId,
    scope: item.affectedScope,
    downstreamConsequence: item.consequence,
    status: item.status,
  };
}

function linkedCaseOutputArtifacts(
  artifacts: readonly CaseworkOutputArtifactInput[],
): ReadonlyMap<
  CaseworkOutputArtifactInput["artifactType"],
  CaseworkOutputArtifactInput
> {
  return new Map(
    artifacts.map((artifact) => [artifact.artifactType, artifact] as const),
  );
}

export function parseCaseOutputArtifactReferences(
  value: unknown,
): readonly CaseworkOutputArtifactInput[] {
  if (!Array.isArray(value)) return [];
  const references: CaseworkOutputArtifactInput[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (
      !isCaseOutputArtifactType(record.artifactType) ||
      typeof record.artifactId !== "string" ||
      typeof record.mediaType !== "string" ||
      typeof record.description !== "string" ||
      !isCaseOutputMaturityLevel(record.maturityLevel)
    ) {
      continue;
    }
    const parsedHash =
      typeof record.contentSha256 === "string"
        ? parseSha256(record.contentSha256)
        : { ok: false as const };
    if (!parsedHash.ok) continue;
    if (record.storagePath !== null && typeof record.storagePath !== "string") {
      continue;
    }
    references.push({
      artifactType: record.artifactType,
      artifactId: record.artifactId,
      contentSha256: parsedHash.value,
      mediaType: record.mediaType,
      storagePath: record.storagePath,
      description: record.description,
      maturityLevel: record.maturityLevel,
    });
  }
  return references.sort(compareCaseOutputArtifacts);
}

function isCaseOutputArtifactType(
  value: unknown,
): value is CaseworkOutputArtifactInput["artifactType"] {
  return (
    typeof value === "string" &&
    CASE_OUTPUT_ARTIFACT_TYPES.includes(
      value as (typeof CASE_OUTPUT_ARTIFACT_TYPES)[number],
    )
  );
}

function isCaseOutputMaturityLevel(
  value: unknown,
): value is NonNullable<CaseworkOutputArtifactInput["maturityLevel"]> {
  return (
    typeof value === "string" &&
    CASE_OUTPUT_MATURITY_LEVELS.includes(
      value as (typeof CASE_OUTPUT_MATURITY_LEVELS)[number],
    )
  );
}

export function compareCaseOutputArtifacts(
  left: CaseworkOutputArtifactInput,
  right: CaseworkOutputArtifactInput,
): number {
  return (
    left.artifactType.localeCompare(right.artifactType) ||
    left.artifactId.localeCompare(right.artifactId) ||
    left.contentSha256.localeCompare(right.contentSha256)
  );
}

export function normalizeWorkspacePath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized === "" || normalized.startsWith("/")) return null;
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return normalized;
}
