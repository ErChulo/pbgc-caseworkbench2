import type { Sha256, UtcTimestamp } from "../shared/types";

export type ValidationOutcome =
  "passed" | "failed" | "blocked" | "inconclusive" | "unsupported" | "error";

export interface ValidationResult {
  readonly validationKey: Sha256;
  readonly subjectKey: string;
  readonly findingCode: string;
  readonly outcome: ValidationOutcome;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly checkPerformed: string;
  readonly evidence: readonly unknown[];
  readonly limitations: readonly string[];
  readonly blocksDownstream: boolean;
  readonly affectedArtifactSha256: Sha256 | null;
  readonly ruleSetVersion: string;
  readonly deterministicResultPayload: unknown;
}

export interface NormalizedObservation {
  readonly observationKey: Sha256;
  readonly sourceArtifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly rawValue: unknown;
  readonly normalizedValue: unknown;
  readonly sourceState:
    | "present"
    | "missing"
    | "blank"
    | "malformed"
    | "literal-zero"
    | "formula-text";
  readonly convention: string | null;
  readonly confidence: number;
  readonly validationStatus: ValidationOutcome;
}

export interface NormalizedEvidence {
  readonly schemaVersion: "1.0.0";
  readonly sourceSha256: Sha256;
  readonly sourceLocator: string;
  readonly normalizerIdentity: string;
  readonly normalizerVersion: string;
  readonly ruleSetVersion: string;
  readonly status: "proposed" | "unresolved" | "blocked";
  readonly deterministicPayload: {
    readonly observations: readonly NormalizedObservation[];
  };
  readonly contentHash: Sha256;
  readonly validationResults: readonly ValidationResult[];
  readonly operationalMetadata: {
    readonly generatedAt: UtcTimestamp;
    readonly runId: string;
  };
}
