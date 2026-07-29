import {
  acquisitionPackage,
  cloneFixture,
  deidentifiedExport,
  humanActor,
  SHA_A,
  SHA_B,
  syntheticExport,
  UUID_A,
  UUID_B,
} from "./schema-cases";

export interface SemanticCase {
  readonly name: string;
  readonly contract: string;
  readonly value: unknown;
  readonly relatedRecords?: readonly unknown[];
  readonly expectedValid: boolean;
  readonly expectedCode: string;
}

const systemActor = { ...humanActor, actorType: "system" };

const initialQuarantineRelease = {
  decisionId: UUID_A,
  decisionContentSha256: SHA_A,
  appendOrdinal: 1,
  priorDecisionId: null,
  priorDecisionContentSha256: null,
  artifactSha256: SHA_A,
  findingKeys: ["synthetic-finding"],
  action: "release",
  actor: humanActor,
  decidedAt: "2026-07-25T12:00:00.000Z",
  rationale: "Synthetic release.",
  priorStatus: "provisional-quarantine",
  resultingStatus: "released",
};

const inheritedEligibility = {
  decisionId: UUID_B,
  decisionContentSha256: SHA_B,
  appendOrdinal: 1,
  priorDecisionId: null,
  priorDecisionContentSha256: null,
  artifactSha256: SHA_A,
  decisionType: "inherit-approval",
  actor: humanActor,
  decidedAt: "2026-07-25T12:01:00.000Z",
  rationale: "Same-byte synthetic release.",
  resultingGovernedStatus: "eligible",
  ruleSetVersion: "1.0.0",
  schemaVersion: "1.0.0",
  sourceQuarantineDecisionId: UUID_A,
  sourceQuarantineDecisionContentSha256: SHA_A,
};

export const semanticCases: readonly SemanticCase[] = [
  {
    name: "accepts a valid initial inherit-approval bound to same-byte release",
    contract: "artifactEligibilityDecision",
    value: inheritedEligibility,
    relatedRecords: [initialQuarantineRelease],
    expectedValid: true,
    expectedCode: "ELIGIBILITY_INHERITED",
  },
  {
    name: "rejects inherit-approval for changed artifact bytes",
    contract: "artifactEligibilityDecision",
    value: { ...inheritedEligibility, artifactSha256: SHA_B },
    relatedRecords: [initialQuarantineRelease],
    expectedValid: false,
    expectedCode: "ARTIFACT_HASH_MISMATCH",
  },
  {
    name: "rejects a final decision made by a system actor",
    contract: "quarantineDecision",
    value: { ...initialQuarantineRelease, actor: systemActor },
    expectedValid: false,
    expectedCode: "HUMAN_ACTOR_REQUIRED",
  },
  {
    name: "rejects noninitial quarantine without immediate predecessor",
    contract: "quarantineDecision",
    value: {
      ...initialQuarantineRelease,
      appendOrdinal: 2,
      action: "revoke",
      resultingStatus: "revoked",
    },
    expectedValid: false,
    expectedCode: "PREDECESSOR_REQUIRED",
  },
  {
    name: "accepts reopened to resolved with valid immediate predecessor",
    contract: "unresolvedItemDecisionChain",
    value: [
      {
        decisionId: UUID_A,
        decisionContentSha256: SHA_A,
        appendOrdinal: 1,
        priorDecisionId: null,
        priorDecisionContentSha256: null,
        itemKey: "synthetic-item",
        decision: "resolved",
        actor: humanActor,
        priorStatus: "open",
        resultingStatus: "resolved",
      },
      {
        decisionId: UUID_B,
        decisionContentSha256: SHA_B,
        appendOrdinal: 2,
        priorDecisionId: UUID_A,
        priorDecisionContentSha256: SHA_A,
        itemKey: "synthetic-item",
        decision: "reopened",
        actor: humanActor,
        priorStatus: "resolved",
        resultingStatus: "reopened",
      },
      {
        decisionId: "33333333-3333-4333-8333-333333333333",
        decisionContentSha256: "c".repeat(64),
        appendOrdinal: 3,
        priorDecisionId: UUID_B,
        priorDecisionContentSha256: SHA_B,
        itemKey: "synthetic-item",
        decision: "resolved",
        actor: humanActor,
        priorStatus: "reopened",
        resultingStatus: "resolved",
      },
    ],
    expectedValid: true,
    expectedCode: "UNRESOLVED_ITEM_RESOLVED",
  },
  {
    name: "rejects unresolved-item ordinal gap",
    contract: "unresolvedItemDecisionChain",
    value: [
      {
        decisionId: UUID_A,
        decisionContentSha256: SHA_A,
        appendOrdinal: 1,
        priorDecisionId: null,
        priorDecisionContentSha256: null,
        itemKey: "synthetic-item",
        decision: "resolved",
        actor: humanActor,
      },
      {
        decisionId: UUID_B,
        decisionContentSha256: SHA_B,
        appendOrdinal: 3,
        priorDecisionId: UUID_A,
        priorDecisionContentSha256: SHA_A,
        itemKey: "synthetic-item",
        decision: "reopened",
        actor: humanActor,
      },
    ],
    expectedValid: false,
    expectedCode: "DECISION_ORDINAL_GAP",
  },
  {
    name: "rejects provisional source records carrying final status",
    contract: "unresolvedItem",
    value: {
      itemKey: "synthetic-item",
      scope: {},
      subjectKeys: ["artifact:synthetic"],
      issueType: "missing-input",
      evidence: [],
      competingPossibilities: [],
      downstreamConsequence: "Processing blocked.",
      status: "resolved",
    },
    expectedValid: false,
    expectedCode: "PROPOSAL_ONLY_STATUS",
  },
  {
    name: "rejects upper-case candidate key",
    contract: "populationCandidateDecision",
    value: { candidateKey: "A".repeat(64) },
    expectedValid: false,
    expectedCode: "LOWERCASE_SHA256_REQUIRED",
  },
  {
    name: "rejects missing population evidence observation",
    contract: "evidenceManifest",
    value: { candidateKey: SHA_A, evidenceKey: SHA_B, observations: [] },
    expectedValid: false,
    expectedCode: "EVIDENCE_OBSERVATION_NOT_FOUND",
  },
  {
    name: "rejects authority after linked classification approval is revoked",
    contract: "authorityDecisionProjection",
    value: {
      artifactSha256: SHA_A,
      classificationApprovalContentSha256: SHA_B,
    },
    relatedRecords: [{ status: "revoked", artifactSha256: SHA_A }],
    expectedValid: false,
    expectedCode: "CLASSIFICATION_APPROVAL_INEFFECTIVE",
  },
  {
    name: "rejects de-identified export approval hash mismatch",
    contract: "deidentifiedExport",
    value: {
      ...cloneFixture(deidentifiedExport),
      operationalMetadata: {
        ...cloneFixture(deidentifiedExport.operationalMetadata),
        humanApprovalHistory: [
          {
            ...deidentifiedExport.operationalMetadata.humanApprovalHistory[0],
            deterministicPayloadSha256: SHA_B,
          },
        ],
      },
    },
    expectedValid: false,
    expectedCode: "APPROVAL_HASH_MISMATCH",
  },
  {
    name: "rejects prohibited direct identifier in export record",
    contract: "deidentifiedExport",
    value: {
      ...cloneFixture(syntheticExport),
      deterministicPayload: {
        ...cloneFixture(syntheticExport.deterministicPayload),
        records: [{ generalKey: "mock-001", name: "PROHIBITED" }],
      },
    },
    expectedValid: false,
    expectedCode: "DIRECT_IDENTIFIER_PROHIBITED",
  },
  {
    name: "rejects nonascending source priorities",
    contract: "evidenceAcquisition",
    value: {
      ...cloneFixture(acquisitionPackage),
      deterministicRequestPayload: {
        ...cloneFixture(acquisitionPackage.deterministicRequestPayload),
        sourcePriorityRecommendations: [
          {
            documentOrReportType: "secondary",
            priority: 2,
            rationale: "Synthetic.",
            recommendationOnly: true,
          },
          {
            documentOrReportType: "primary",
            priority: 1,
            rationale: "Synthetic.",
            recommendationOnly: true,
          },
        ],
      },
    },
    expectedValid: false,
    expectedCode: "SOURCE_PRIORITY_ORDER_INVALID",
  },
];

export const governedDecisionFamilies = [
  "acquisition-proposal",
  "quarantine",
  "artifact-eligibility",
  "classification",
  "authority",
  "evidence-relationship",
  "population-candidate",
  "export-approval",
  "unresolved-item",
] as const;

export const universalInvalidChainConditions = [
  "ordinal-gap",
  "duplicate-ordinal",
  "branch",
  "cycle",
  "broken-predecessor",
  "stale-predecessor-hash",
  "cross-subject-predecessor",
  "invalid-transition",
  "ineffective-supersession",
] as const;

export const permittedTransitions = {
  "acquisition-proposal": [
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ],
  quarantine: [
    "none->final-quarantine",
    "none->release",
    "none->reject",
    "final-quarantine->continue-quarantine",
    "final-quarantine->release",
    "final-quarantine->supersede",
    "released->revoke",
    "released->inherit-release",
    "released->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ],
  "artifact-eligibility": [
    "none->approve",
    "none->inherit-approval",
    "none->reject",
    "eligible->revoke",
    "eligible->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ],
  classification: [
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ],
  authority: [
    "none->approved",
    "none->rejected",
    "approved->revoked",
    "approved->superseded",
    "rejected->superseded",
    "revoked->superseded",
  ],
  "evidence-relationship": [
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ],
  "population-candidate": [
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ],
  "export-approval": ["none->approved", "none->rejected", "approved->revoked"],
  "unresolved-item": [
    "none->resolved",
    "none->accepted-risk",
    "resolved->reopened",
    "accepted-risk->reopened",
    "reopened->resolved",
    "reopened->accepted-risk",
    "reopened->superseded",
    "resolved->superseded",
    "accepted-risk->superseded",
  ],
} as const;
