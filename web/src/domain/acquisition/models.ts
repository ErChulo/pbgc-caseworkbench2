import type { Sha256, UtcTimestamp } from "../shared/types";

export interface MissingFactDeclaration {
  readonly factKey: string;
  readonly description: string;
  readonly requiredByModule: string;
}

export interface SourcePriorityRecommendation {
  readonly priority: number;
  readonly sourceType: string;
  readonly rationale: string;
}

export interface ExtractionRegistration {
  readonly registrationId: string;
  readonly version: string;
  readonly contentSha256: Sha256;
}

export interface RerunTrigger {
  readonly triggerKey: string;
  readonly requestingModuleId: string;
  readonly reason: string;
  readonly requiredInputHashes: readonly Sha256[];
}

export interface DeterministicRequestPayload {
  readonly requestingModuleId: string;
  readonly missingFacts: readonly MissingFactDeclaration[];
  readonly candidateDocumentOrReportTypes: readonly string[];
  readonly sourcePriorityRecommendations: readonly SourcePriorityRecommendation[];
  readonly extractionSchemaRegistrations: readonly ExtractionRegistration[];
  readonly extractionInstructionRegistrations: readonly ExtractionRegistration[];
  readonly rerunTrigger: RerunTrigger | null;
}

export interface DeterministicPackagePayload {
  readonly requestPayloadSha256: Sha256;
  readonly artifactSha256Values: readonly Sha256[];
  readonly extractionSchemaRegistrations: readonly ExtractionRegistration[];
  readonly extractionInstructionRegistrations: readonly ExtractionRegistration[];
  readonly policy: "local-only-no-transmission";
}

export interface SourceCitation {
  readonly citationId: string;
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
}

export interface ProposedExtractedFact {
  readonly factKey: string;
  readonly value: unknown;
  readonly citationIds: readonly string[];
}

export interface DeterministicProposalPayload {
  readonly requestPayloadSha256: Sha256;
  readonly packagePayloadSha256: Sha256;
  readonly artifactSha256Values: readonly Sha256[];
  readonly proposedExtractedFacts: readonly ProposedExtractedFact[];
  readonly sourceCitations: readonly SourceCitation[];
  readonly uncertainties: readonly string[];
  readonly conflicts: readonly string[];
  readonly rerunTrigger: RerunTrigger | null;
}

export interface AcquisitionRecord {
  readonly schemaVersion: "1.0.0";
  readonly deterministicRequestPayload: DeterministicRequestPayload;
  readonly requestPayloadSha256: Sha256;
  readonly deterministicPackagePayload: DeterministicPackagePayload;
  readonly packagePayloadSha256: Sha256;
  readonly deterministicProposalPayload: DeterministicProposalPayload | null;
  readonly proposalPayloadSha256: Sha256 | null;
  readonly operationalMetadata: {
    readonly requestRecordId: string;
    readonly createdAt: UtcTimestamp;
    readonly storagePath: string | null;
    readonly runtimeStatus: string;
  };
}

export type ProposalGovernedStatus =
  "approved" | "rejected" | "revoked" | "superseded";

export interface ProposalDecisionRecord {
  readonly decisionId: string;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: string | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly proposalSha256: Sha256;
  readonly decisionType: "approve" | "reject" | "revoke" | "supersede";
  readonly humanActor: {
    readonly actorType: "human";
    readonly actorId: string;
    readonly displayName: string;
  };
  readonly rationale: string;
  readonly decisionTimestamp: UtcTimestamp;
  readonly resultingGovernedStatus: ProposalGovernedStatus;
  readonly ruleSetVersion: string;
  readonly schemaVersion: string;
}

export interface PromotedFact {
  readonly promotionKey: Sha256;
  readonly factKey: string;
  readonly factJsonPointer: string;
  readonly factContentSha256: Sha256;
  readonly sourceProposalSha256: Sha256;
  readonly effectiveApprovalDecisionId: string;
  readonly artifactSha256Values: readonly Sha256[];
  readonly citationIds: readonly string[];
  readonly targetGovernedRecordType: string;
  readonly targetGovernedRecordId: string;
  readonly ruleSetVersion: string;
  readonly schemaVersion: string;
}

export type AcquisitionLineageNodeType =
  | "request"
  | "package"
  | "schema-registration"
  | "instruction-registration"
  | "proposal"
  | "decision"
  | "promoted-fact"
  | "rerun-trigger";

export interface AcquisitionLineageNode {
  readonly nodeId: string;
  readonly nodeType: AcquisitionLineageNodeType;
  readonly contentSha256: Sha256;
  readonly artifactSha256Values: readonly Sha256[];
  readonly requestingModuleId: string;
}
