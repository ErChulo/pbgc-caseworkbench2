import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";
import type { HumanActor } from "../quarantine/models";

export const classificationRuleSetVersion = "feature-009-classification-v1";
export const classificationSchemaVersion = "1.0.0" as const;

export type ClassificationDimension = "document-category" | "source-role";
export type ProposalStatus = "proposed" | "unresolved";
export type GovernedStatus = "approved" | "rejected" | "revoked" | "superseded";

export interface ClassificationEvidence {
  readonly evidenceType: "filename" | "media-type" | "text" | "metadata";
  readonly value: string;
  readonly sourceLocator: string;
}

export interface ClassificationProposal {
  readonly proposalKey: string;
  readonly artifactSha256: Sha256;
  readonly dimension: ClassificationDimension;
  readonly proposedValue: string;
  readonly status: ProposalStatus;
  readonly authorityCandidate: boolean;
  readonly confidence: number;
  readonly supportingEvidence: readonly ClassificationEvidence[];
  readonly classifierId: string;
  readonly classifierVersion: string;
  readonly ruleSetVersion: string;
}

export type ClassificationDecisionType =
  "approve" | "reject" | "revoke" | "supersede";

export interface ClassificationApproval {
  readonly approvalId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorApprovalId: Uuid | null;
  readonly priorApprovalContentSha256: Sha256 | null;
  readonly proposalKey: string;
  readonly artifactSha256: Sha256;
  readonly decisionType: ClassificationDecisionType;
  readonly status: GovernedStatus;
  readonly actor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly ruleSetVersion: string;
  readonly schemaVersion: "1.0.0";
}

export type RelationshipType =
  | "exact-duplicate"
  | "near-duplicate"
  | "amendment"
  | "supersession"
  | "replacement"
  | "authority"
  | "conflict"
  | "effective-period";

export interface EvidenceRelationship {
  readonly relationshipKey: string;
  readonly fromSha256: Sha256;
  readonly toSha256: Sha256;
  readonly relationshipType: RelationshipType;
  readonly status: ProposalStatus;
  readonly confidence: number | null;
  readonly supportingEvidence: readonly ClassificationEvidence[];
  readonly ruleSetVersion: string;
}

export interface RelationshipDecision {
  readonly decisionId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: Uuid | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly relationshipKey: string;
  readonly fromSha256: Sha256;
  readonly toSha256: Sha256;
  readonly decisionType: ClassificationDecisionType;
  readonly actor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly evidenceConsidered: readonly ClassificationEvidence[];
  readonly resultingGovernedStatus: GovernedStatus;
  readonly ruleSetVersion: string;
  readonly schemaVersion: "1.0.0";
}

export interface DateCandidate {
  readonly candidateKey: string;
  readonly artifactSha256: Sha256;
  readonly dateKind:
    | "effective-date"
    | "adoption-date"
    | "execution-date"
    | "issue-date"
    | "unknown";
  readonly rawValue: string;
  readonly normalizedValue: string | null;
  readonly convention:
    "YYYY-MM-DD" | "MM/DD/YYYY" | "Month D, YYYY" | "unrecognized";
  readonly valid: boolean;
  readonly sourceLocator: string;
  readonly status: "proposed" | "unresolved";
  readonly ruleSetVersion: string;
}

export interface DateSelectionDecision {
  readonly decisionId: Uuid;
  readonly artifactSha256: Sha256;
  readonly selectedCandidateKey: string;
  readonly actor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly ruleSetVersion: string;
}

export interface DecisionProjection {
  readonly status: GovernedStatus | "provisional";
  readonly effectiveDecisionId: Uuid | null;
  readonly provenance: readonly Uuid[];
}

export interface AuthorityDecision {
  readonly authorityDecisionId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: Uuid | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly sourceRoleProposalId: string;
  readonly sourceRoleProposalContentSha256: Sha256;
  readonly classificationApprovalId: Uuid;
  readonly classificationApprovalContentSha256: Sha256;
  readonly artifactSha256: Sha256;
  readonly sourceRoleProposalArtifactSha256: Sha256;
  readonly classificationApprovalArtifactSha256: Sha256;
  readonly approver: HumanActor;
  readonly decision: GovernedStatus;
  readonly decisionTimestamp: UtcTimestamp;
  readonly rationale: string;
  readonly ruleSetVersion: string;
  readonly schemaVersion: "1.0.0";
}

export interface AuthorityProjection extends DecisionProjection {
  readonly authoritative: boolean;
  readonly artifactSha256: Sha256;
}

export interface ClassificationReplayError {
  readonly code:
    | "INVALID_ACTOR"
    | "INVALID_CHAIN"
    | "INVALID_HASH"
    | "INVALID_PROPOSAL"
    | "INVALID_TRANSITION"
    | "MISMATCHED_ARTIFACT"
    | "MISMATCHED_SUBJECT"
    | "INEFFECTIVE_APPROVAL"
    | "INCOMPLETE_CONTEXT";
  readonly safeMessage: string;
}
