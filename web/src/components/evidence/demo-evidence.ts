import type { EvidenceCatalog } from "../../domain/evidence/models";
import type {
  NearDuplicateRelationship,
  SupersessionProposal,
  UnresolvedItem,
} from "../../domain/plan-rules/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../domain/shared/types";
import type { RuleAuthorCandidate } from "./PlanRuleAuthor";

const planHash = sha(
  "4aef9feb502cfea4803ee55e71c532ead202186ff78f371fef14feafc05e4f74",
);
const amendmentHash = sha(
  "3c8eee121ae9ea1ebb2787c1ac9b108f7453e3aec9dc5f14e80c8ae4346ac50c",
);
const referenceHash = sha(
  "6721271a5c83b2226a229d3f0d50ae1b150bb1a3acc6c2e01b055837071a8e75",
);
const quarantinedHash = sha(
  "10379427d322dfdcd644229d2f0e32070d962a4d8f7ecfda32e1a643c4505c50",
);

const planCandidate: RuleAuthorCandidate = {
  candidate: {
    candidateId: uuid("101"),
    artifactSha256: planHash,
    artifactLocator: "synthetic/plan-document.txt#line-18",
    provisionIdentifier: "4.1",
    verbatimText:
      "The monthly benefit equals the accrued benefit payable at normal retirement date.",
    normalizedRestatement:
      "Monthly benefit equals accrued benefit payable at normal retirement date.",
    extractedEffectiveDate: "2020-01-01",
    extractedAdoptionDate: "2019-12-15",
    dateExtractionConvention: "explicit",
    confidence: 0.94,
    classifierId: "deterministic-synthetic-extractor",
    classifierVersion: "1.0.0",
    ruleSetVersion: "feature-001-plan-rule-v1",
    status: "proposed",
    candidateContentSha256: sha(
      "a1e207803025809c48891db7700ceec4600c2b581a10f2f7bc31b20026d5c5fc",
    ),
  },
  citation: {
    artifactSha256: planHash,
    artifactLocator: "synthetic/plan-document.txt#line-18",
    sourceRole: "executed-plan-document",
    provisionIdentifier: "4.1",
    citationLocator: "line:18",
  },
};

const amendmentCandidate: RuleAuthorCandidate = {
  candidate: {
    candidateId: uuid("102"),
    artifactSha256: amendmentHash,
    artifactLocator: "synthetic/amendment-01.txt#line-7",
    provisionIdentifier: "4.1",
    verbatimText:
      "Effective July 31, 2020, Section 4.1 is amended to freeze additional accruals.",
    normalizedRestatement:
      "Section 4.1 freezes additional accruals effective 2020-07-31.",
    extractedEffectiveDate: "2020-07-31",
    extractedAdoptionDate: "2020-07-15",
    dateExtractionConvention: "explicit",
    confidence: 0.91,
    classifierId: "deterministic-synthetic-extractor",
    classifierVersion: "1.0.0",
    ruleSetVersion: "feature-001-plan-rule-v1",
    status: "proposed",
    candidateContentSha256: sha(
      "ea19173809db917d1cb2b8bc4670fae4212c9cfa2c8d9ee636cfce825248ad61",
    ),
    linkedUnresolvedItemIds: [uuid("401")],
  },
  citation: {
    artifactSha256: amendmentHash,
    artifactLocator: "synthetic/amendment-01.txt#line-7",
    sourceRole: "amendment",
    provisionIdentifier: "4.1",
    citationLocator: "line:7",
  },
};

export const evidenceReviewDemo: {
  readonly catalog: EvidenceCatalog;
  readonly candidates: readonly RuleAuthorCandidate[];
  readonly nearDuplicates: readonly NearDuplicateRelationship[];
  readonly supersessions: readonly SupersessionProposal[];
  readonly unresolvedItems: readonly UnresolvedItem[];
} = {
  catalog: {
    catalogId: uuid("001"),
    caseId: uuid("002"),
    builtAt: timestamp("2026-07-29T12:00:00.000Z"),
    schemaVersion: "1.0.0",
    caseEvidence: [
      {
        artifactId: uuid("011"),
        sha256: planHash,
        sizeBytes: 18_240,
        locator: "synthetic/plan-document.txt#line-18",
        mediaType: "text/plain",
        receiptId: uuid("021"),
        receiptIds: [uuid("021")],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "executed-plan-document",
        reviewStatus: "released",
        importedAt: timestamp("2026-07-29T11:00:00.000Z"),
      },
      {
        artifactId: uuid("012"),
        sha256: amendmentHash,
        sizeBytes: 6_104,
        locator: "synthetic/amendment-01.txt#line-7",
        mediaType: "text/plain",
        receiptId: uuid("022"),
        receiptIds: [uuid("022")],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "amendment",
        reviewStatus: "released",
        importedAt: timestamp("2026-07-29T11:01:00.000Z"),
      },
    ],
    referenceOnly: [
      {
        artifactId: uuid("013"),
        sha256: referenceHash,
        sizeBytes: 9_880,
        locator: "synthetic/reference-training.txt",
        mediaType: "text/plain",
        receiptId: uuid("023"),
        receiptIds: [uuid("023")],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "training-reference",
        reviewStatus: "stale",
        importedAt: timestamp("2026-07-29T11:02:00.000Z"),
      },
    ],
    excludedQuarantined: [
      {
        artifactId: uuid("014"),
        sha256: quarantinedHash,
        quarantineDecisionId: uuid("031"),
        linkedUnresolvedItemId: uuid("401"),
      },
    ],
    catalogContentSha256: sha(
      "5c793c559fec6a708a018ca60e0f56f5bb78f92aa4136afd26ceaa83b9951051",
    ),
    ruleSetVersion: "feature-001-evidence-ingestion-v1",
  },
  candidates: [planCandidate, amendmentCandidate],
  nearDuplicates: [
    {
      predecessorCandidateId: planCandidate.candidate.candidateId,
      successorCandidateId: amendmentCandidate.candidate.candidateId,
      similarity: 0.78,
    },
  ],
  supersessions: [
    {
      relationshipKey: sha(
        "8c19700ca0d74f6f40fcf0d1768658bc9bd3f7dba5b859485a33283696d0e442",
      ),
      fromSha256: planCandidate.candidate.candidateContentSha256,
      toSha256: amendmentCandidate.candidate.candidateContentSha256,
      predecessorCandidateId: planCandidate.candidate.candidateId,
      successorCandidateId: amendmentCandidate.candidate.candidateId,
      predecessorCandidateContentSha256:
        planCandidate.candidate.candidateContentSha256,
      successorCandidateContentSha256:
        amendmentCandidate.candidate.candidateContentSha256,
      effectiveDate: "2020-07-31",
      confidence: 0.89,
      relationshipType: "amendment",
      status: "proposed",
      supportingEvidence: [
        {
          evidenceType: "metadata",
          value: "successor-effective-date:2020-07-31",
          sourceLocator: amendmentCandidate.candidate.artifactLocator,
        },
      ],
      ruleSetVersion: "feature-001-plan-rule-v1",
    },
  ],
  unresolvedItems: [
    {
      itemId: uuid("401"),
      kind: "ambiguous-text",
      affectedScope: "benefit/accrual-freeze/participant-group",
      competingInterpretations: [
        {
          interpretationId: uuid("411"),
          statement: "The freeze applies to all participants on 2020-07-31.",
          evidence: [amendmentCandidate.citation],
          sourceCandidateId: amendmentCandidate.candidate.candidateId,
        },
        {
          interpretationId: uuid("412"),
          statement:
            "The freeze applies only to active participants on 2020-07-31.",
          evidence: [amendmentCandidate.citation],
          sourceCandidateId: amendmentCandidate.candidate.candidateId,
        },
      ],
      consequence:
        "Participant-group scope cannot be authored without an explicit interpretation.",
      linkedUnresolvedItemIds: [],
      reviewerHuman: null,
      assignee: null,
      openAt: timestamp("2026-07-29T12:05:00.000Z"),
      resolutionHistory: [],
      itemContentSha256: sha(
        "f50c38512c7e493b968214b77222d1af8ffd264a32f74338605d8d0625138b7d",
      ),
      status: "open",
      revisionOrdinal: 1,
      priorRevisionContentSha256: null,
      revisionContentSha256: sha(
        "280bad3b9b347536ef7254ee7ec087225d422ed98723630fb7df32a372a41579",
      ),
    },
  ],
};

function uuid(suffix: string) {
  const parsed = parseUuid(
    `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
  );
  if (!parsed.ok) throw new Error("Synthetic UUID is invalid.");
  return parsed.value;
}

function sha(value: string) {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Synthetic SHA-256 is invalid.");
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseUtcTimestamp(value);
  if (!parsed.ok) throw new Error("Synthetic timestamp is invalid.");
  return parsed.value;
}
