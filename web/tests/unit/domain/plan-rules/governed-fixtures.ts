import type { HumanActor } from "../../../../src/domain/quarantine/models";
import { buildEvidenceCatalog } from "../../../../src/domain/evidence/catalog";
import { extractProvisionCandidate } from "../../../../src/domain/plan-rules/candidate-extraction";
import type {
  ApplicabilityCondition,
  PlanRuleRecord,
  RuleCitation,
} from "../../../../src/domain/plan-rules/models";
import { authorRule } from "../../../../src/domain/plan-rules/rule-authoring";
import { parseSha256 } from "../../../../src/domain/shared/types";

export const human: HumanActor = {
  actorType: "human",
  actorKey: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "unit-test",
};

export const citation: RuleCitation = {
  artifactSha256: sha("a"),
  artifactLocator: "synthetic/plan.txt",
  sourceRole: "executed-plan-document",
  provisionIdentifier: "4.1",
  citationLocator: "line:1",
};

export const applicability: readonly ApplicabilityCondition[] = [
  {
    dimension: "participant-group",
    value: "all-participants",
    evidence: [citation],
  },
];

export async function candidate(
  text = "The monthly benefit equals accrued benefit.",
) {
  const result = await extractProvisionCandidate({
    artifactSha256: citation.artifactSha256,
    artifactLocator: citation.artifactLocator,
    provisionIdentifier: "4.1",
    verbatimText: text,
    normalizedRestatement: text,
    extractedEffectiveDate: "2020-01-01",
    extractedAdoptionDate: null,
    dateExtractionConvention: "explicit",
    confidence: 0.9,
    classifierId: "synthetic",
    classifierVersion: "1.0.0",
    ruleSetVersion: "feature-001-plan-rule-v1",
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export async function evidenceCatalog(
  sourceRole: RuleCitation["sourceRole"] = citation.sourceRole,
  section: "case" | "reference" = "case",
  reviewStatus: "provisional" | "released" | "stale" = "released",
) {
  const artifact = {
    artifactId: "00000000-0000-4000-8000-000000000203",
    sha256: citation.artifactSha256,
    sizeBytes: 10,
    locator: citation.artifactLocator,
    mediaType: "text/plain",
    receiptId: "00000000-0000-4000-8000-000000000204",
    receiptIds: ["00000000-0000-4000-8000-000000000204"],
    exactDuplicateOfSha256: null,
    containedBySha256: null,
    sourceRole,
    reviewStatus,
    importedAt: "2026-07-28T11:00:00.000Z",
  };
  const result = await buildEvidenceCatalog({
    catalogId: "00000000-0000-4000-8000-000000000205",
    caseId: "00000000-0000-4000-8000-000000000206",
    builtAt: "2026-07-28T12:00:00.000Z",
    caseEvidence: section === "case" ? [artifact] : [],
    referenceOnly: section === "reference" ? [artifact] : [],
    excludedQuarantined: [],
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export async function rule(
  id = "00000000-0000-4000-8000-000000000201",
  at = "2026-07-28T12:00:00.000Z",
  predecessor: PlanRuleRecord | null = null,
): Promise<PlanRuleRecord> {
  const result = await authorRule(
    {
      proposedCandidates: [await candidate()],
      primaryCitation: citation,
      catalog: await evidenceCatalog(),
      unresolvedRecords: [],
      authorityOverrides: [],
      governingRestatement: "The monthly benefit equals accrued benefit.",
      effectiveDate: predecessor === null ? "2020-01-01" : "2022-01-01",
      endDate: null,
      applicabilityConditions: applicability,
      requiredApplicabilityDimensions: ["participant-group"],
      affectedScope: "benefit/monthly",
      reviewer: human,
      approvalRationale: "Synthetic human approval.",
      confidence: 0.95,
      predecessor,
      ruleSetVersion: "feature-001-plan-rule-v1",
    },
    { uuid: () => id, now: () => at },
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export function sha(character: string) {
  const parsed = parseSha256(character.repeat(64));
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}
