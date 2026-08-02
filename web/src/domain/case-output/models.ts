import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";

export type CaseworkOutputStageKey =
  | "evidence"
  | "plan-rules"
  | "population-profile"
  | "v1-architecture"
  | "build-spec"
  | "compiled-formulas"
  | "workbook"
  | "validation-reconciliation"
  | "section-436";

export type CaseworkOutputStageStatus = "ready" | "blocked" | "not-required";

export type CaseworkMaturityLevel =
  | "specified"
  | "implemented"
  | "tested"
  | "independently-validated"
  | "externally-executed"
  | "human-approved";

export type CaseworkOutputArtifactType =
  | "evidence-manifest"
  | "plan-rule-record"
  | "population-profile"
  | "v1-architecture"
  | "build-spec"
  | "compiled-formula-artifact"
  | "v1-workbook"
  | "validation-result"
  | "reconciliation-result"
  | "section-436-evaluation";

export interface CaseworkOutputArtifactReference {
  readonly artifactType: CaseworkOutputArtifactType;
  readonly artifactId: string;
  readonly contentSha256: Sha256;
  readonly mediaType: string;
  readonly storagePath: string | null;
  readonly description: string;
}

export interface CaseworkOutputStage {
  readonly stageKey: CaseworkOutputStageKey;
  readonly label: string;
  readonly required: boolean;
  readonly status: CaseworkOutputStageStatus;
  readonly maturityLevel: CaseworkMaturityLevel;
  readonly artifactSha256Values: readonly Sha256[];
  readonly blockers: readonly string[];
}

export interface CaseworkOutputUnresolvedItemSummary {
  readonly itemId: string;
  readonly scope: string;
  readonly downstreamConsequence: string;
  readonly status: string;
}

export interface CaseworkMaturityClaim {
  readonly subject: string;
  readonly level: CaseworkMaturityLevel;
  readonly evidence: string;
  readonly externalExecutionClaimed: boolean;
}

export interface CaseworkLineageEdge {
  readonly fromArtifactSha256: Sha256;
  readonly toArtifactSha256: Sha256;
  readonly relationship: string;
}

export interface FinalCaseworkOutputDeterministicPayload {
  readonly schemaVersion: "1.0.0";
  readonly caseId: Uuid;
  readonly packagePurpose: "production-v1-casework-output";
  readonly packageStatus: "complete" | "blocked";
  readonly section436Required: boolean;
  readonly stages: readonly CaseworkOutputStage[];
  readonly artifacts: readonly CaseworkOutputArtifactReference[];
  readonly unresolvedItems: readonly CaseworkOutputUnresolvedItemSummary[];
  readonly maturityClaims: readonly CaseworkMaturityClaim[];
  readonly lineage: readonly CaseworkLineageEdge[];
}

export interface FinalCaseworkOutputPackage {
  readonly schemaVersion: "1.0.0";
  readonly artifactType: "final-casework-output-package";
  readonly deterministicPayload: FinalCaseworkOutputDeterministicPayload;
  readonly contentSha256: Sha256;
  readonly operationalMetadata: {
    readonly createdAt: UtcTimestamp;
    readonly createdBy: string | null;
    readonly generatorVersion: "case-output-package-v1.0.0";
  };
}

export interface CaseworkOutputArtifactInput {
  readonly artifactType: CaseworkOutputArtifactType;
  readonly artifactId: string;
  readonly contentSha256: Sha256;
  readonly mediaType: string;
  readonly storagePath?: string | null;
  readonly description: string;
  readonly maturityLevel?: CaseworkMaturityLevel;
}

export interface CaseworkPlanRuleInput {
  readonly ruleId: string;
  readonly ruleContentSha256: Sha256;
  readonly reviewStatus: string;
  readonly storagePath?: string | null;
}

export interface FinalCaseworkOutputInput {
  readonly caseId: Uuid;
  readonly evidenceManifestSha256: Sha256 | null;
  readonly planRules: readonly CaseworkPlanRuleInput[];
  readonly populationProfileContentSha256: Sha256 | null;
  readonly architecture: CaseworkOutputArtifactInput | null;
  readonly buildSpec: CaseworkOutputArtifactInput | null;
  readonly compiledFormulas: CaseworkOutputArtifactInput | null;
  readonly workbook: CaseworkOutputArtifactInput | null;
  readonly validation: CaseworkOutputArtifactInput | null;
  readonly reconciliation: CaseworkOutputArtifactInput | null;
  readonly section436: CaseworkOutputArtifactInput | null;
  readonly section436Required: boolean;
  readonly unresolvedItems: readonly CaseworkOutputUnresolvedItemSummary[];
  readonly createdAt: UtcTimestamp;
  readonly createdBy: string | null;
}
