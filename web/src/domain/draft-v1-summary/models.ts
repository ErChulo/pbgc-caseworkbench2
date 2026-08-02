import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export interface ApprovedV1SummaryReference {
  readonly referenceId: string;
  readonly fileName: string;
  readonly workbookName: string;
  readonly contentSha256: Sha256;
  readonly schemaVersion: string;
  readonly keyMode: string;
  readonly sourceTabs: readonly string[];
  readonly runs: readonly string[];
  readonly cellCount: number;
  readonly uniqueFieldCount: number;
  readonly formulaCellCount: number;
  readonly iobCounts: DraftV1SummaryIobCounts;
  readonly genericFields: readonly string[];
}

export interface DraftV1SummaryIobCounts {
  readonly I: number;
  readonly O: number;
  readonly B: number;
  readonly N: number;
  readonly C: number;
  readonly other: number;
}

export interface DraftV1SummarySignalProfile {
  readonly schemaVersion: "1.0.0";
  readonly sourceKind: "r5-summary";
  readonly sourceTabs: readonly string[];
  readonly runs: readonly string[];
  readonly genericFields: readonly string[];
  readonly tokens: readonly string[];
  readonly comparableSignalCounts: {
    readonly sourceTabs: number;
    readonly runs: number;
    readonly genericFields: number;
    readonly tokens: number;
  };
  readonly numericSignals: {
    readonly cellCount: number | null;
    readonly formulaCellCount: number | null;
  };
  readonly normalizationWarnings: readonly string[];
}

export interface DraftV1SummaryMatch {
  readonly referenceId: string;
  readonly fileName: string;
  readonly workbookName: string;
  readonly referenceContentSha256: Sha256;
  readonly scoreBasisPoints: number;
  readonly matchedFieldCount: number;
  readonly matchedRunCount: number;
  readonly matchedSourceTabCount: number;
  readonly cellCountDistance: number | null;
}

export interface DraftV1SummarySelectedScaffold {
  readonly referenceId: string;
  readonly fileName: string;
  readonly workbookName: string;
  readonly referenceContentSha256: Sha256;
  readonly schemaVersion: string;
  readonly keyMode: string;
  readonly sourceTabs: readonly string[];
  readonly runs: readonly string[];
  readonly cellCount: number;
  readonly uniqueFieldCount: number;
  readonly formulaCellCount: number;
  readonly iobCounts: DraftV1SummaryIobCounts;
  readonly matchedFieldCount: number;
  readonly matchedRunCount: number;
  readonly matchedSourceTabCount: number;
}

export interface DraftV1SummaryDraftPayload {
  readonly schemaVersion: "draft-v1-summary-1.0";
  readonly draftStatus: "blocked";
  readonly keyMode: string;
  readonly workbookName: string;
  readonly sourceTabs: readonly string[];
  readonly runs: readonly string[];
  readonly cellCount: number;
  readonly uniqueFieldCount: number;
  readonly formulaCellCount: number;
  readonly fieldPreview: readonly string[];
  readonly omittedCellsReason: string;
}

export interface DraftV1SummaryMaturityClaim {
  readonly subject: string;
  readonly level: "specified";
  readonly evidence: string;
  readonly externalExecutionClaimed: false;
}

export interface DraftV1SummaryLineageEdge {
  readonly fromArtifactSha256: Sha256;
  readonly toArtifactSha256: Sha256;
  readonly relationship: string;
}

export interface DraftV1SummaryDeterministicPayload {
  readonly schemaVersion: "1.0.0";
  readonly caseId: Uuid;
  readonly artifactPurpose: "pre-package-v1-summary-scaffold";
  readonly draftStatus: "blocked";
  readonly r5Source: {
    readonly fileName: string | null;
    readonly contentSha256: Sha256;
    readonly schemaName: "r5-summary.schema.json";
    readonly schemaStrictness: "open-additional-properties";
  };
  readonly referenceCorpus: {
    readonly corpusPath: "reference/approved-v1-summaries";
    readonly indexVersion: "approved-v1-summary-reference-index-v1.0.0";
    readonly referenceCount: number;
  };
  readonly normalizedR5Signals: DraftV1SummarySignalProfile;
  readonly selectedScaffold: DraftV1SummarySelectedScaffold;
  readonly candidateMatches: readonly DraftV1SummaryMatch[];
  readonly draftSummary: DraftV1SummaryDraftPayload;
  readonly blockers: readonly string[];
  readonly maturityClaims: readonly DraftV1SummaryMaturityClaim[];
  readonly lineage: readonly DraftV1SummaryLineageEdge[];
}

export interface DraftV1SummaryArtifact {
  readonly schemaVersion: "1.0.0";
  readonly artifactType: "draft-v1-summary";
  readonly deterministicPayload: DraftV1SummaryDeterministicPayload;
  readonly contentSha256: Sha256;
  readonly operationalMetadata: {
    readonly generatedAt: UtcTimestamp;
    readonly generatedBy: string | null;
    readonly generatorVersion: "draft-v1-summary-generator-v1.0.0";
  };
}

export interface DraftV1SummaryInput {
  readonly caseId: Uuid;
  readonly r5Summary: unknown;
  readonly r5SummaryContentSha256: Sha256;
  readonly r5SummaryFileName: string | null;
  readonly generatedAt: UtcTimestamp;
  readonly generatedBy: string | null;
  readonly references?: readonly ApprovedV1SummaryReference[];
}
