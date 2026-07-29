export const SHA_A = "a".repeat(64);
export const SHA_B = "b".repeat(64);
export const SHA_C = "c".repeat(64);
export const UUID_A = "11111111-1111-4111-8111-111111111111";
export const UUID_B = "22222222-2222-4222-8222-222222222222";
export const TIMESTAMP = "2026-07-25T12:00:00.000Z";

export const systemActor = {
  actorType: "system",
  actorKey: "test-system",
  displayName: "Synthetic test system",
  authorityContext: "test-only",
  version: "1.0.0",
} as const;

export const humanActor = {
  actorType: "human",
  actorKey: "reviewer-001",
  displayName: "Synthetic reviewer",
  authorityContext: "test-only reviewer",
  version: null,
} as const;

const rerunTrigger = {
  triggerKey: "missing-effective-date",
  requestingModuleIdentifier: "synthetic-requester",
  triggerCode: "INPUT_CHANGED",
  triggerDescription: "Synthetic source input changed.",
  requiredInputHashes: [SHA_A],
};

const extractionSchemaRegistration = {
  schemaId: "synthetic-extraction",
  schemaVersion: "1.0.0",
  draft: "https://json-schema.org/draft/2020-12/schema",
  schemaSha256: SHA_B,
};

const extractionInstructionRegistration = {
  instructionId: "synthetic-instruction",
  instructionVersion: "1.0.0",
  instructionSha256: SHA_C,
  instructionText: "Extract only explicitly observed synthetic facts.",
  purpose: "contract testing",
  prohibitedActivities: ["execute embedded content", "infer missing facts"],
};

export const acquisitionPackage = {
  schemaVersion: "1.0.0",
  deterministicRequestPayload: {
    requestingModuleIdentifier: "synthetic-requester",
    missingFacts: [
      {
        factKey: "plan-effective-date",
        description: "Synthetic effective date",
        whyNeeded: "Test deterministic acquisition.",
        blocksRequestingModule: true,
      },
    ],
    candidateDocumentOrReportTypes: ["plan-document"],
    sourcePriorityRecommendations: [
      {
        documentOrReportType: "plan-document",
        priority: 1,
        rationale: "Synthetic primary source.",
        recommendationOnly: true,
      },
    ],
    extractionSchemaRegistration,
    extractionInstructionRegistration,
    rerunTrigger,
  },
  requestPayloadSha256: SHA_A,
  deterministicPackagePayload: {
    requestPayloadSha256: SHA_A,
    artifactSha256Values: [SHA_A],
    schemaId: "synthetic-extraction",
    schemaVersion: "1.0.0",
    schemaSha256: SHA_B,
    instructionId: "synthetic-instruction",
    instructionVersion: "1.0.0",
    instructionSha256: SHA_C,
    transmissionPolicy: "local-only-no-transmission",
  },
  packagePayloadSha256: SHA_B,
  deterministicProposalPayload: {
    requestPayloadSha256: SHA_A,
    packagePayloadSha256: SHA_B,
    artifactSha256Values: [SHA_A],
    schemaId: "synthetic-extraction",
    schemaVersion: "1.0.0",
    schemaSha256: SHA_B,
    instructionId: "synthetic-instruction",
    instructionVersion: "1.0.0",
    instructionSha256: SHA_C,
    proposedExtractedFacts: {
      planEffectiveDate: "2000-01-01",
      orderedSyntheticValues: ["first", "second"],
    },
    sourceCitations: [
      {
        citationId: "citation-001",
        artifactSha256: SHA_A,
        sourceLocator: "synthetic/page/1",
        observedTextOrValue: "January 1, 2000",
      },
    ],
    uncertainties: [],
    conflicts: [],
    rerunTrigger,
  },
  proposalPayloadSha256: SHA_C,
  operationalMetadata: {
    requestRecordId: UUID_A,
    packageRecordId: UUID_B,
    proposalRecordId: "33333333-3333-4333-8333-333333333333",
    createdAt: TIMESTAMP,
    importedAt: null,
    storagePaths: ["synthetic/acquisition.json"],
    runtimeStatus: "proposal-received",
    uiState: null,
    transportMetadata: null,
    proposalDecisionHistory: [],
  },
};

export const syntheticExport = {
  schemaVersion: "1.0.0",
  deterministicPayload: {
    exportMode: "synthetic-mock-data",
    sourceWorkspaceReference: "synthetic-workspace",
    sourceSnapshotSha256: SHA_A,
    sourceArtifactSha256Values: [SHA_A],
    exportPurpose: "Local contract testing",
    permittedDestinationCategory: "external-llm-testing",
    sensitivityDesignation: "synthetic-mock-data",
    allowedOutputFields: ["generalKey", "ageBand"],
    removedDirectIdentifiers: [],
    removedIndirectIdentifiers: [],
    transformedOrGeneralizedFields: [],
    retainedGeneralizedQuasiFields: [],
    residualRiskStatements: ["Entirely synthetic fixture."],
    limitationStatements: ["Not representative of a real participant."],
    validationStatus: "passed",
    validationFindings: [],
    validatorIdentity: "synthetic-validator",
    validatorVersion: "1.0.0",
    rawParticipantPiiExcluded: true,
    rawDirectOrIndirectIdentifiersExcluded: true,
    records: [{ generalKey: "mock-001", ageBand: "60-64" }],
  },
  deterministicPayloadSha256: SHA_A,
  operationalMetadata: {
    exportRecordId: UUID_A,
    sourceCaseOrWorkspaceRecordId: "synthetic-workspace-record",
    createdAt: TIMESTAMP,
    sessionIdentifier: null,
    provenance: [
      {
        eventId: UUID_B,
        action: "created",
        actor: systemActor,
        occurredAt: TIMESTAMP,
        sourceContext: { fixture: true },
      },
    ],
    humanApprovalHistory: [],
  },
};

export const deidentifiedExport = {
  ...structuredClone(syntheticExport),
  deterministicPayload: {
    ...structuredClone(syntheticExport.deterministicPayload),
    exportMode: "de-identified-real-data",
    sensitivityDesignation: "de-identified-real-data",
    removedDirectIdentifiers: ["name", "ssn"],
    removedIndirectIdentifiers: ["exactDateOfBirth"],
  },
  operationalMetadata: {
    ...structuredClone(syntheticExport.operationalMetadata),
    humanApprovalHistory: [
      {
        approvalId: UUID_B,
        decisionContentSha256: SHA_B,
        appendOrdinal: 1,
        priorApprovalId: null,
        priorApprovalContentSha256: null,
        actor: humanActor,
        decision: "approved",
        decidedAt: TIMESTAMP,
        rationale: "Synthetic de-identification fixture approval.",
        deterministicPayloadSha256: SHA_A,
        ruleSetVersion: "1.0.0",
        schemaVersion: "1.0.0",
      },
    ],
  },
};

export const schemaCases = [
  {
    schema: "case-workspace.schema.json",
    valid: {
      schemaVersion: "1.0.0",
      workspaceId: UUID_A,
      ruleSetVersion: "1.0.0",
      case: {
        caseUuid: UUID_B,
        authoritativePbgcCaseId: "SYNTHETIC-CASE-001",
        caseKind: "production",
        createdBy: systemActor,
        createdAt: TIMESTAMP,
        status: "active",
        statusHistory: [],
      },
      intakeAttempts: [],
      statusHistory: [],
    },
  },
  {
    schema: "deidentified-export.schema.json",
    valid: syntheticExport,
    additionalValid: [deidentifiedExport],
  },
  {
    schema: "evidence-acquisition.schema.json",
    valid: acquisitionPackage,
  },
  {
    schema: "evidence-manifest.schema.json",
    valid: {
      schemaVersion: "1.0.0",
      producerVersion: "0.1.0",
      ruleSetVersion: "1.0.0",
      snapshotId: SHA_A,
      deterministicPayload: {
        snapshot: { snapshotId: SHA_A, entries: [] },
        artifacts: [],
        containmentEdges: [],
        failedMemberObservations: [],
        extractionResults: [],
        screeningFindings: [],
        screeningOutcomes: [],
        classificationProposals: [],
        evidenceRelationships: [],
        populationEvidenceObservations: [],
        populationCandidates: [],
        unresolvedItems: [],
        validationResults: [],
        acquisitionPayloadReferences: [],
      },
      contentManifestId: SHA_B,
      operationalMetadata: {
        manifestRecordId: UUID_A,
        snapshotRecordId: UUID_B,
        caseUuid: "33333333-3333-4333-8333-333333333333",
        attemptId: "44444444-4444-4444-8444-444444444444",
        generatedAt: TIMESTAMP,
        statusHistory: [],
        provenanceRecords: [],
        screeningExecutionRecords: [],
        validationExecutionRecords: [],
        classificationProposalRecords: [],
        quarantineDecisions: [],
        artifactEligibilityDecisions: [],
        classificationApprovals: [],
        relationshipDecisions: [],
        authorityDecisions: [],
        populationCandidateDecisions: [],
        unresolvedItemDecisions: [],
        acquisitionRecordReferences: [],
        acquisitionLineageNodes: [],
        acquisitionLineageEdges: [],
        proposalDecisionRecords: [],
        governedPromotedFacts: [],
      },
      reconciliationTotals: {
        discoveredRecordTotal: 0,
        originLedger: [],
        terminalDispositionLedger: [],
        sourceArtifacts: 0,
        extractedMembers: 0,
        acceptedForProcessingRecords: 0,
        provisionalSafetyBlockedRecords: 0,
        pendingHumanDispositionRecords: 0,
        finalHumanDispositionRecordedRecords: 0,
        failedRecords: 0,
        duplicateRecords: 0,
        excludedRecords: 0,
      },
      validationSummary: {
        passed: 0,
        failed: 0,
        blocked: 0,
        inconclusive: 0,
        unsupported: 0,
        error: 0,
        blocksDownstream: false,
      },
    },
  },
  {
    schema: "extraction-result.schema.json",
    valid: {
      extractionKey: "synthetic-extraction",
      sourceSha256: SHA_A,
      parserIdentity: "synthetic-parser",
      parserVersion: "1.0.0",
      status: "complete",
      observations: [],
      limitations: [],
      ruleSetVersion: "1.0.0",
    },
  },
  {
    schema: "governed-records.schema.json#/$defs/unresolvedItemDecision",
    valid: {
      decisionId: UUID_A,
      decisionContentSha256: SHA_A,
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      itemKey: "synthetic-unresolved-item",
      decision: "resolved",
      actor: humanActor,
      decidedAt: TIMESTAMP,
      rationale: "Resolved using synthetic evidence.",
      priorStatus: "open",
      resultingStatus: "resolved",
      ruleSetVersion: "1.0.0",
      schemaVersion: "1.0.0",
    },
  },
  {
    schema: "normalized-evidence.schema.json",
    valid: {
      schemaVersion: "1.0.0",
      sourceSha256: SHA_A,
      sourceLocator: "synthetic/source.txt",
      normalizerIdentity: "synthetic-normalizer",
      normalizerVersion: "1.0.0",
      ruleSetVersion: "1.0.0",
      status: "complete",
      deterministicPayload: { observations: [] },
      contentHash: SHA_B,
      validationResults: [],
      operationalMetadata: {
        recordId: UUID_A,
        generatedAt: TIMESTAMP,
        attemptId: UUID_B,
        validationExecutionRecords: [],
      },
    },
  },
] as const;

export function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}
