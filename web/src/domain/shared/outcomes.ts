import type { Sha256 } from "./types";

export type ErrorSeverity = "warning" | "error" | "critical";

export type DomainErrorCategory =
  | "validation"
  | "integrity"
  | "unsupported"
  | "security"
  | "storage"
  | "worker"
  | "interrupted"
  | "unknown";

export interface DomainError {
  readonly code: string;
  readonly category: DomainErrorCategory;
  readonly severity: ErrorSeverity;
  readonly safeMessage: string;
  readonly blocksDownstream: boolean;
  readonly subjectKey: string | null;
  readonly affectedArtifactSha256: Sha256 | null;
  readonly retryable: boolean;
}

export interface Limitation {
  readonly limitationKey: string;
  readonly code: string;
  readonly scope: string;
  readonly description: string;
  readonly affectedArtifactSha256: Sha256 | null;
  readonly blocksDownstream: boolean;
  readonly requiredReviewOrEvidence: string | null;
}

export type ValidationSeverity =
  "informational" | "warning" | "error" | "critical";

export type ValidationOutcome =
  "passed" | "failed" | "blocked" | "inconclusive" | "unsupported" | "error";

export type ValidationCheckIdentity =
  | {
      readonly checkPerformed: string;
      readonly checkDefinitionId?: string;
      readonly checkDefinitionVersion?: string;
    }
  | {
      readonly checkPerformed?: never;
      readonly checkDefinitionId: string;
      readonly checkDefinitionVersion: string;
    };

interface ValidationResultBase {
  readonly validationKey: string;
  readonly subjectKey: string;
  readonly findingCode: string;
  readonly severity: ValidationSeverity;
  readonly evidence: readonly Readonly<Record<string, unknown>>[];
  readonly limitations: readonly string[];
  readonly affectedArtifactSha256: Sha256 | null;
  readonly ruleSetVersion: string;
  readonly deterministicResultPayload: Readonly<Record<string, unknown>> | null;
}

export type ValidationResult = ValidationResultBase &
  ValidationCheckIdentity &
  (
    | {
        readonly outcome: "passed" | "failed";
        readonly blocksDownstream: boolean;
      }
    | {
        readonly outcome: "blocked" | "inconclusive" | "unsupported" | "error";
        readonly blocksDownstream: true;
      }
  );

export type UnresolvedItemStatus = "open" | "assigned";

export interface UnresolvedItem {
  readonly itemKey: string;
  readonly scope: Readonly<Record<string, unknown>>;
  readonly subjectKeys: readonly string[];
  readonly issueType: string;
  readonly evidence: readonly Readonly<Record<string, unknown>>[];
  readonly competingPossibilities: readonly Readonly<Record<string, unknown>>[];
  readonly downstreamConsequence: string;
  readonly responsibleQueueOrReviewer: string | null;
  readonly status: UnresolvedItemStatus;
}

export type PackageOutcomeStatus =
  "complete" | "partial" | "blocked" | "failed" | "interrupted";

export type ArtifactOutcomeStatus =
  | "pending"
  | "preserved"
  | "screening"
  | "quarantined"
  | "extracting"
  | "normalized"
  | "unsupported"
  | "unreadable"
  | "failed"
  | "completed";

export interface ArtifactProcessingOutcome {
  readonly artifactSha256: Sha256;
  readonly status: ArtifactOutcomeStatus;
  readonly blocksDownstream: boolean;
  readonly errors: readonly DomainError[];
  readonly limitations: readonly Limitation[];
}

export interface PackageReconciliationCounts {
  readonly discovered: number;
  readonly completed: number;
  readonly blocked: number;
  readonly failed: number;
  readonly pending: number;
}

export interface PartialPackageOutcome {
  readonly status: PackageOutcomeStatus;
  readonly artifactOutcomes: readonly ArtifactProcessingOutcome[];
  readonly counts: PackageReconciliationCounts;
  readonly errors: readonly DomainError[];
  readonly limitations: readonly Limitation[];
  readonly unaffectedArtifactsMayContinue: boolean;
}
