import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";
import type { HumanActor } from "../quarantine/models";
import type { SourceRole } from "../evidence/models";
import type { EvidenceRelationship } from "../classification/models";

export const planRuleRuleSetVersion = "feature-001-plan-rule-v1";
export const planRuleSchemaVersion = "1.0.0" as const;
export type PlanRuleSchemaVersion = typeof planRuleSchemaVersion;

export type CandidateStatus = "proposed" | "unresolved";

export interface ProvisionCandidate {
  readonly candidateId: Uuid;
  readonly artifactSha256: Sha256;
  readonly artifactLocator: string;
  readonly provisionIdentifier: string;
  readonly verbatimText: string;
  readonly normalizedRestatement: string;
  readonly extractedEffectiveDate: string | null;
  readonly extractedAdoptionDate: string | null;
  readonly dateExtractionConvention:
    "explicit" | "inferred-from-context" | "unknown";
  readonly confidence: number;
  readonly classifierId: string;
  readonly classifierVersion: string;
  readonly ruleSetVersion: string;
  readonly status: CandidateStatus;
  readonly candidateContentSha256: Sha256;
  readonly linkedUnresolvedItemIds?: readonly Uuid[];
}

export interface NearDuplicateRelationship {
  readonly predecessorCandidateId: Uuid;
  readonly successorCandidateId: Uuid;
  readonly similarity: number;
}

export interface SupersessionProposal extends EvidenceRelationship {
  readonly predecessorCandidateId: Uuid;
  readonly successorCandidateId: Uuid;
  readonly effectiveDate: string;
  readonly confidence: number;
  readonly predecessorCandidateContentSha256: Sha256;
  readonly successorCandidateContentSha256: Sha256;
  readonly relationshipType: "supersession" | "amendment";
  readonly status: "proposed";
}

export interface RuleCitation {
  readonly artifactSha256: Sha256;
  readonly artifactLocator: string;
  readonly sourceRole: SourceRole;
  readonly provisionIdentifier: string | null;
  readonly citationLocator: string;
}

export type ApplicabilityDimension =
  | "participant-group"
  | "benefit-purpose"
  | "service-definition"
  | "actuarial-equivalence-purpose"
  | "freeze-or-restriction"
  | "amendment-period";

export interface ApplicabilityCondition {
  readonly dimension: ApplicabilityDimension;
  readonly value: string;
  readonly evidence: readonly RuleCitation[];
}

export type SupersessionLinkType =
  | "initial"
  | "supersession"
  | "amendment"
  | "re-authoring"
  | "repeal"
  | "reinstate"
  | "branch";

export interface SupersessionLink {
  readonly ordinal: number;
  readonly predecessorRuleId: Uuid | null;
  readonly predecessorRuleContentSha256: Sha256 | null;
  readonly effectiveDate: string;
  readonly linkType: SupersessionLinkType;
}

export interface PlanRuleRecord {
  readonly ruleId: Uuid;
  readonly governingRestatement: string;
  readonly affectedScope: string;
  readonly primaryCitation: RuleCitation;
  readonly supportingCitations: readonly RuleCitation[];
  readonly effectiveDate: string;
  readonly endDate: string | null;
  readonly adoptionOrExecutionDate: string | null;
  readonly applicabilityConditions: readonly ApplicabilityCondition[];
  readonly supersessionChain: readonly SupersessionLink[];
  readonly confidence: number;
  readonly authorityOverrideId: Uuid | null;
  readonly authorHuman: HumanActor;
  readonly authoredAt: UtcTimestamp;
  readonly reviewStatus: "human-approved" | "provisional";
  readonly approvalRationale: string;
  readonly linkedUnresolvedItemIds: readonly Uuid[];
  readonly ruleSetVersion: string;
  readonly schemaVersion: PlanRuleSchemaVersion;
  readonly ruleContentSha256: Sha256;
}

export interface Interpretation {
  readonly interpretationId: Uuid;
  readonly statement: string;
  readonly evidence: readonly RuleCitation[];
  readonly sourceCandidateId: Uuid | null;
}

export interface ResolutionEvent {
  readonly eventId: Uuid;
  readonly appendOrdinal: number;
  readonly priorEventId: Uuid | null;
  readonly priorEventContentSha256: Sha256 | null;
  readonly decisionType: "accept" | "supersede" | "reject" | "branch";
  readonly resultingStatus: "open" | "resolved" | "superseded";
  readonly selectedInterpretationId: Uuid | null;
  readonly actor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly consumedAssumptions: readonly Uuid[];
  readonly eventContentSha256: Sha256;
}

export interface UnresolvedItem {
  readonly itemId: Uuid;
  readonly kind:
    | "ambiguous-text"
    | "conflicting-provisions"
    | "missing-sequencing"
    | "undefined-term"
    | "hidden-content-flag"
    | "stale-source"
    | "superseded-source"
    | "missing-required-value"
    | "ambiguous-source-role"
    | "other";
  readonly affectedScope: string;
  readonly competingInterpretations: readonly Interpretation[];
  readonly consequence: string;
  readonly linkedUnresolvedItemIds: readonly Uuid[];
  readonly reviewerHuman: HumanActor | null;
  readonly assignee: HumanActor | null;
  readonly openAt: UtcTimestamp;
  readonly resolutionHistory: readonly ResolutionEvent[];
  readonly itemContentSha256: Sha256;
  readonly status: "open" | "resolved" | "superseded";
  readonly revisionOrdinal: number;
  readonly priorRevisionContentSha256: Sha256 | null;
  readonly revisionContentSha256: Sha256;
}

export interface OverrideSupersessionLink {
  readonly ordinal: number;
  readonly priorOverrideId: Uuid | null;
  readonly priorOverrideContentSha256: Sha256 | null;
  readonly linkType: "initial" | "supersession" | "repeal";
}

export interface AuthorityOverride {
  readonly overrideId: Uuid;
  readonly caseId: Uuid;
  readonly affectedRuleScope: string;
  readonly authorizedSourceRole: SourceRole;
  readonly authorizedArtifactSha256: Sha256;
  readonly scopeRationale: string;
  readonly defaultAuthorityOrder: readonly SourceRole[];
  readonly issuer: HumanActor;
  readonly issuedAt: UtcTimestamp;
  readonly overrideContentSha256: Sha256;
  readonly supersessionChain: readonly OverrideSupersessionLink[];
  readonly schemaVersion: PlanRuleSchemaVersion;
}

export interface ConflictRecord {
  readonly selectedInterpretation: Interpretation;
  readonly nonSelectedInterpretations: readonly Interpretation[];
  readonly rationale: string;
}

export type AuthoringError =
  | { readonly code: "BLOCKED_BY_UNRESOLVED_ITEM"; readonly message: string }
  | { readonly code: "INVALID_PRIMARY_CITATION"; readonly message: string }
  | { readonly code: "AUTHORITY_OVERRIDE_REQUIRED"; readonly message: string }
  | { readonly code: "EFFECTIVE_DATE_VIOLATION"; readonly message: string }
  | { readonly code: "APPLICABILITY_INVALID"; readonly message: string }
  | { readonly code: "SUPERSESSION_CHAIN_INVALID"; readonly message: string }
  | { readonly code: "HASH_COMPUTATION_FAILED"; readonly message: string };
