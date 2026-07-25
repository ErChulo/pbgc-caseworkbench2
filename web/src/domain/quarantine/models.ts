import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export const screeningRuleSetVersion = "feature-009-screening-v1";

export type ScreeningCategory =
  | "authorized-pii"
  | "unauthorized-pii"
  | "secret"
  | "executable"
  | "macro"
  | "embedded-object"
  | "external-link"
  | "archive-risk"
  | "media-mismatch"
  | "unsupported"
  | "other";

export type ScreeningOutcome =
  "passed" | "failed" | "blocked" | "inconclusive" | "unsupported" | "error";

export type ProvisionalSafetyState =
  | "screening-pending"
  | "rescreen-required"
  | "provisional-quarantine"
  | "provisional-safety-block";

export interface ScreeningFinding {
  readonly findingId: string;
  readonly artifactSha256: Sha256;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly category: ScreeningCategory;
  readonly outcome: ScreeningOutcome;
  readonly severity: "informational" | "warning" | "error" | "critical";
  readonly evidence: readonly string[];
  readonly limitations: readonly string[];
  readonly blocksDownstream: boolean;
}

export interface ScreeningResult {
  readonly artifactSha256: Sha256;
  readonly findings: readonly ScreeningFinding[];
  readonly provisionalState: ProvisionalSafetyState;
  readonly downstreamBlocked: true;
  readonly ruleSetVersion: string;
}

export interface HumanActor {
  readonly actorType: "human";
  readonly actorKey: string;
  readonly displayName: string;
  readonly authorityContext: string;
}

export type QuarantineAction =
  | "final-quarantine"
  | "continue-quarantine"
  | "release"
  | "reject"
  | "revoke"
  | "inherit-release"
  | "supersede";

export type FinalDisposition =
  "released" | "final-quarantine" | "rejected" | "revoked" | "superseded";

export interface QuarantineDecision {
  readonly decisionId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: Uuid | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly artifactSha256: Sha256;
  readonly findingIds: readonly string[];
  readonly action: QuarantineAction;
  readonly reviewer: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly resultingStatus: FinalDisposition;
  readonly ruleSetVersion: string;
  readonly schemaVersion: "1.0.0";
}

export interface ArtifactEligibilityProjection {
  readonly artifactSha256: Sha256;
  readonly eligible: boolean;
  readonly effectiveStatus: FinalDisposition | "provisional" | "blocked";
  readonly effectiveDecisionId: Uuid | null;
  readonly provenance: readonly Uuid[];
}

export interface ArtifactEligibilityDecision {
  readonly decisionId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: Uuid | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly artifactSha256: Sha256;
  readonly action:
    "approve" | "block" | "revoke" | "supersede" | "inherit-approval";
  readonly resultingStatus: "eligible" | "blocked" | "revoked" | "superseded";
  readonly sourceQuarantineDecisionId: Uuid | null;
  readonly sourceQuarantineDecisionContentSha256: Sha256 | null;
  readonly actor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly ruleSetVersion: string;
  readonly schemaVersion: "1.0.0";
}

export function isBlockingOutcome(outcome: ScreeningOutcome): boolean {
  return (
    outcome === "blocked" ||
    outcome === "inconclusive" ||
    outcome === "unsupported" ||
    outcome === "error"
  );
}
