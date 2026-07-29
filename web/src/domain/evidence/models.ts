import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export const evidenceRuleSetVersion = "feature-001-evidence-ingestion-v1";
export const evidenceSchemaVersion = "1.0.0" as const;
export type EvidenceSchemaVersion = typeof evidenceSchemaVersion;

export type SourceRole =
  | "executed-plan-document"
  | "amendment"
  | "collective-bargaining-agreement"
  | "notice"
  | "actuarial-report"
  | "formal-determination"
  | "approved-plan-summary"
  | "certified-case-report"
  | "supporting-administrative-report"
  | "approved-historical-calculation-artifact"
  | "regulation"
  | "training-reference"
  | "inference"
  | "other";

export interface EvidenceArtifact {
  readonly artifactId: Uuid;
  readonly sha256: Sha256;
  readonly sizeBytes: number;
  readonly locator: string;
  readonly mediaType: string | null;
  readonly receiptId: Uuid;
  readonly receiptIds: readonly Uuid[];
  readonly exactDuplicateOfSha256: Sha256 | null;
  readonly containedBySha256: Sha256 | null;
  readonly sourceRole: SourceRole;
  readonly reviewStatus: "provisional" | "released" | "stale";
  readonly importedAt: UtcTimestamp;
}

export interface ExcludedQuarantinedEntry {
  readonly artifactId: Uuid;
  readonly sha256: Sha256;
  readonly quarantineDecisionId: Uuid;
  readonly linkedUnresolvedItemId: Uuid;
}

export interface EvidenceCatalog {
  readonly catalogId: Uuid;
  readonly caseId: Uuid;
  readonly builtAt: UtcTimestamp;
  readonly schemaVersion: EvidenceSchemaVersion;
  readonly caseEvidence: readonly EvidenceArtifact[];
  readonly referenceOnly: readonly EvidenceArtifact[];
  readonly excludedQuarantined: readonly ExcludedQuarantinedEntry[];
  readonly catalogContentSha256: Sha256;
  readonly ruleSetVersion?: string;
}

export type CatalogBuildError =
  | { readonly code: "EMPTY_INVENTORY"; readonly message: string }
  | { readonly code: "INVALID_SCREENED_OUTCOME"; readonly message: string }
  | { readonly code: "HASH_COMPUTATION_FAILED"; readonly message: string };
