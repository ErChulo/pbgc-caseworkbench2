/**
 * Population Profile Types
 *
 * Pure type definitions for population profiles, evidence observations,
 * candidate decisions, and governance projections. No runtime code or
 * crypto dependencies — importable without pulling in hashing logic.
 */

import type { Sha256 } from "../shared/types";

export type PopulationCandidateStatus = "proposed" | "unresolved";
export type PopulationGovernedStatus =
  | "approved"
  | "rejected"
  | "revoked"
  | "superseded";

export interface PopulationEvidenceObservation {
  readonly evidenceKey: Sha256;
  readonly citationId: string;
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly evidenceKind: string;
  readonly observedTextOrValue?: unknown;
}

/**
 * Alias for PopulationEvidenceObservation.
 * Both types are structurally identical and refer to the same concept:
 * a content-addressed evidence entry in the population manifest.
 */
export type PopulationEvidenceReference = PopulationEvidenceObservation;

export interface PopulationCandidateProfile {
  readonly candidateKey: Sha256;
  readonly artifactSha256: Sha256;
  readonly candidateStatus: PopulationCandidateStatus;
  readonly detectorIdentity: string;
  readonly detectorVersion: string;
  readonly confidence: number;
  readonly evidence: readonly PopulationEvidenceReference[];
  readonly observedFields: readonly string[];
  readonly recordCounts: readonly number[];
  readonly sensitivity:
    | "authorized-real"
    | "de-identified"
    | "synthetic-mock"
    | "unknown";
  readonly correctionsOrImputationsApplied: false;
}

export interface HumanActor {
  readonly actorType: "human";
  readonly actorId: string;
  readonly displayName: string;
}

export interface PopulationCandidateDecision {
  readonly decisionId: string;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: string | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly candidateKey: Sha256;
  readonly artifactSha256: Sha256;
  readonly workbookProfileContentSha256: Sha256;
  readonly decisionType: "approve" | "reject" | "revoke" | "supersede";
  readonly humanActor: HumanActor;
  readonly rationale: string;
  readonly decisionTimestamp: string;
  readonly resultingStatus: PopulationGovernedStatus;
  readonly ruleSetVersion: string;
  readonly schemaVersion: string;
}

export interface PopulationDecisionProjection {
  readonly status: PopulationGovernedStatus | "provisional";
  readonly effectiveDecisionId: string | null;
  readonly effectiveWorkbookProfileContentSha256: Sha256 | null;
  readonly provenance: readonly string[];
}

export interface PopulationProfileError {
  readonly code:
    | "INVALID_HASH"
    | "INCOMPLETE_MANIFEST"
    | "DUPLICATE_EVIDENCE"
    | "STALE_EVIDENCE"
    | "MISMATCHED_SUBJECT"
    | "INVALID_ACTOR"
    | "INVALID_CHAIN"
    | "INVALID_TRANSITION";
  readonly safeMessage: string;
}
