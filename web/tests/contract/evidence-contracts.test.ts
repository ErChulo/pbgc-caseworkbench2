import { describe, expect, it } from "vitest";

import { validateContract } from "../../src/contracts/schema-validator";

const ids = {
  one: "00000000-0000-4000-8000-000000000001",
  two: "00000000-0000-4000-8000-000000000002",
  three: "00000000-0000-4000-8000-000000000003",
};
const sha = "a".repeat(64);
const actor = {
  actorType: "human",
  actorKey: "synthetic-reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "synthetic test authority",
};
const citation = {
  artifactSha256: sha,
  artifactLocator: "synthetic/plan.txt",
  sourceRole: "executed-plan-document",
  provisionIdentifier: "section-1",
  citationLocator: "line:1",
};

const documents = {
  evidenceCatalog: {
    catalogId: ids.one,
    caseId: ids.two,
    builtAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: "1.0.0",
    caseEvidence: [
      {
        artifactId: ids.three,
        sha256: sha,
        sizeBytes: 10,
        locator: "synthetic/plan.txt",
        mediaType: "text/plain",
        receiptId: ids.one,
        receiptIds: [ids.one],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "executed-plan-document",
        reviewStatus: "released",
        importedAt: "2026-07-28T11:00:00.000Z",
      },
    ],
    referenceOnly: [],
    excludedQuarantined: [],
    catalogContentSha256: sha,
  },
  provisionCandidate: {
    candidateId: ids.one,
    artifactSha256: sha,
    artifactLocator: "synthetic/plan.txt#line:1",
    provisionIdentifier: "section-1",
    verbatimText: "Synthetic plan provision.",
    normalizedRestatement: "Synthetic plan provision.",
    extractedEffectiveDate: "2026-01-01",
    extractedAdoptionDate: null,
    dateExtractionConvention: "explicit",
    confidence: 1,
    classifierId: "synthetic-classifier",
    classifierVersion: "1.0.0",
    ruleSetVersion: "feature-001-evidence-ingestion-v1",
    status: "proposed",
    candidateContentSha256: sha,
  },
  planRuleRecord: {
    ruleId: ids.one,
    governingRestatement: "Synthetic plan provision.",
    affectedScope: "benefit/monthly",
    primaryCitation: citation,
    supportingCitations: [],
    effectiveDate: "2026-01-01",
    endDate: null,
    adoptionOrExecutionDate: null,
    applicabilityConditions: [
      {
        dimension: "participant-group",
        value: "synthetic-group",
        evidence: [citation],
      },
    ],
    supersessionChain: [],
    confidence: 1,
    authorityOverrideId: null,
    authorHuman: actor,
    authoredAt: "2026-07-28T12:00:00.000Z",
    reviewStatus: "human-approved",
    approvalRationale: "Synthetic contract approval.",
    linkedUnresolvedItemIds: [],
    ruleSetVersion: "feature-001-plan-rule-v1",
    schemaVersion: "1.0.0",
    ruleContentSha256: sha,
  },
  evidenceUnresolvedItem: {
    itemId: ids.one,
    kind: "ambiguous-text",
    affectedScope: "synthetic section 1",
    competingInterpretations: [
      {
        interpretationId: ids.two,
        statement: "Interpretation A",
        evidence: [citation],
        sourceCandidateId: null,
      },
      {
        interpretationId: ids.three,
        statement: "Interpretation B",
        evidence: [citation],
        sourceCandidateId: null,
      },
    ],
    consequence: "Synthetic calculation treatment remains blocked.",
    linkedUnresolvedItemIds: [],
    reviewerHuman: actor,
    assignee: null,
    openAt: "2026-07-28T12:00:00.000Z",
    resolutionHistory: [],
    itemContentSha256: sha,
    status: "open",
    revisionOrdinal: 1,
    priorRevisionContentSha256: null,
    revisionContentSha256: sha,
  },
  authorityOverride: {
    overrideId: ids.one,
    caseId: ids.two,
    affectedRuleScope: "synthetic section 1",
    authorizedSourceRole: "training-reference",
    authorizedArtifactSha256: sha,
    scopeRationale: "Synthetic contract fixture.",
    defaultAuthorityOrder: ["executed-plan-document", "training-reference"],
    issuer: actor,
    issuedAt: "2026-07-28T12:00:00.000Z",
    overrideContentSha256: sha,
    supersessionChain: [],
    schemaVersion: "1.0.0",
  },
} as const;

describe("Feature 001 source contracts", () => {
  it.each(Object.entries(documents))(
    "accepts a valid %s",
    (contract, value) => {
      expect(validateContract(contract, value)).toEqual({
        valid: true,
        issues: [],
      });
    },
  );

  it.each(Object.entries(documents))(
    "rejects a missing required field for %s",
    (contract, value) => {
      const [required] = Object.keys(value);
      const invalid = Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== required),
      );
      expect(validateContract(contract, invalid).valid).toBe(false);
    },
  );

  it("rejects an open item with fewer than two interpretations", () => {
    const invalid = {
      ...documents.evidenceUnresolvedItem,
      competingInterpretations: [
        documents.evidenceUnresolvedItem.competingInterpretations[0],
      ],
    };
    expect(validateContract("evidenceUnresolvedItem", invalid).valid).toBe(
      false,
    );
  });

  it("requires resolution events to preserve the selected interpretation identity", () => {
    const resolution = {
      eventId: ids.one,
      appendOrdinal: 1,
      priorEventId: null,
      priorEventContentSha256: null,
      decisionType: "accept",
      resultingStatus: "resolved",
      actor,
      decidedAt: "2026-07-28T13:00:00.000Z",
      rationale: "Synthetic human resolution.",
      consumedAssumptions: [],
      eventContentSha256: sha,
    };
    expect(
      validateContract("evidenceUnresolvedItem", {
        ...documents.evidenceUnresolvedItem,
        resolutionHistory: [resolution],
        status: "resolved",
      }).valid,
    ).toBe(false);
    expect(
      validateContract("evidenceUnresolvedItem", {
        ...documents.evidenceUnresolvedItem,
        resolutionHistory: [
          { ...resolution, selectedInterpretationId: ids.two },
        ],
        status: "resolved",
      }).valid,
    ).toBe(true);
  });

  it("fails closed for an unknown runtime contract", () => {
    expect(validateContract("not-registered", {}).issues[0]?.code).toBe(
      "CONTRACT_UNKNOWN",
    );
  });

  it("structurally requires an override relation for restricted primary roles", () => {
    expect(
      validateContract("planRuleRecord", {
        ...documents.planRuleRecord,
        primaryCitation: {
          ...documents.planRuleRecord.primaryCitation,
          sourceRole: "regulation",
        },
        authorityOverrideId: null,
      }).valid,
    ).toBe(false);
  });

  it("rejects receipt provenance whose canonical receipt is not first", () => {
    const invalid = {
      ...documents.evidenceCatalog,
      caseEvidence: [
        {
          ...documents.evidenceCatalog.caseEvidence[0],
          receiptIds: [ids.two, ids.one],
        },
      ],
    };
    expect(validateContract("evidenceCatalog", invalid).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CANONICAL_RECEIPT_INVALID" }),
      ]),
    );
  });
});
