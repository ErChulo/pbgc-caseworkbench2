import type { V1ArchitectureLineage } from "../architecture/models";
import type { PlanRuleRecord } from "../plan-rules/models";
import type { HumanActor } from "../quarantine/models";
import type { Sha256, Uuid, UtcTimestamp } from "../shared/types";

export type IoBValue = "I" | "O" | "B" | "N" | "P" | "";
export type DataSourceType = "population" | "case-control" | "evidence";
export type NamedRangeScope = "workbook" | "sheet";

export interface FormulaCitation {
  readonly artifactSha256: Sha256;
  readonly sourceRole: string;
  readonly locator: string;
}

export interface FormulaRuleProvenance extends PlanRuleRecord {
  readonly relationship: "governing" | "supporting";
  readonly citation: FormulaCitation;
  readonly supersedesRuleId: Uuid | null;
  readonly unresolvedItemIds: readonly Uuid[];
}

export interface FormulaApprovalRecord {
  readonly decisionId: Uuid;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: Uuid | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly decisionType: "approve" | "revoke" | "supersede";
  readonly resultingStatus: "approved" | "revoked" | "superseded";
  readonly formulaText: string;
  readonly target: {
    readonly tabName: string;
    readonly cellAddress: string;
    readonly genericField: string;
  };
  readonly scenarioId: string;
  readonly iobClassification: "O" | "B";
  readonly sourcePlanRules: readonly {
    readonly ruleId: Uuid;
    readonly ruleContentSha256: Sha256;
    readonly relationship: "governing" | "supporting";
  }[];
  readonly derivationDescription: string;
  readonly affectedTestIds: readonly string[];
  readonly regenerationImpact: string;
  readonly validationOracleIds: readonly string[];
  readonly humanActor: HumanActor;
  readonly rationale: string;
  readonly decidedAt: UtcTimestamp;
  readonly schemaVersion: "1.0.0";
}

export interface FormulaProvenance {
  readonly sourcePlanRules: readonly FormulaRuleProvenance[];
  readonly derivationDescription: string;
  readonly formulaApproval: FormulaApprovalRecord;
  readonly affectedTestIds: readonly string[];
  readonly regenerationImpact: string;
  readonly validationOracleIds: readonly string[];
}

export interface FormulaDefinitionV2 {
  readonly formulaId: string;
  readonly scenarioId: string;
  readonly tabName: string;
  readonly genericField: string;
  readonly formulaText: string;
  readonly cellAddress: string;
  readonly dependencies: readonly string[];
  readonly iobClassification: IoBValue;
  readonly justification: string;
  readonly formulaKind: "scalar";
  readonly provenance: FormulaProvenance;
}

export type FormulaDefinition = FormulaDefinitionV2;

export interface FormulaGovernanceEntry {
  readonly cellKey: string;
  readonly scenarioId: string;
  readonly approvalDecisions: readonly FormulaApprovalRecord[];
}

export interface FormulaGovernanceInput {
  readonly approvedPlanRules: readonly PlanRuleRecord[];
  readonly formulas: readonly FormulaGovernanceEntry[];
}

export interface NamedRangeDefinition {
  readonly rangeName: string;
  readonly cellAddress: string;
  readonly tabName: string;
  readonly scope: NamedRangeScope;
  readonly genericField: string | null;
  readonly scenarioId: string | null;
  readonly provenance: {
    readonly source: "architecture";
    readonly architectureNamedRange: string;
  };
}

export interface DataSourceReference {
  readonly sourceType: DataSourceType;
  readonly sourceTab: string;
  readonly sourceField: string;
  readonly evidenceKey: Sha256 | null;
}

export interface CellMapping {
  readonly mappingId: Uuid;
  readonly field: string;
  readonly tabName: string;
  readonly cellAddress: string;
  readonly iobClassification: IoBValue;
  readonly dataSource: DataSourceReference | null;
  readonly formulaId: string | null;
  readonly scenarioId: string;
}

export interface ExecutionOrder {
  readonly order: readonly string[];
  readonly levelCount: number;
  readonly maxDepth: number;
  readonly hasCycles: boolean;
  readonly cycleNodes: readonly string[];
}

export type ValidationErrorCode =
  | "ARCHITECTURE_HASH_MISMATCH"
  | "ARCHITECTURE_INVALID"
  | "ARCHITECTURE_RULE_SET_MISMATCH"
  | "CIRCULAR_DEPENDENCY"
  | "DUPLICATE_FORMULA"
  | "DUPLICATE_MAPPING"
  | "DUPLICATE_RANGE"
  | "FORMULA_GOVERNANCE_INVALID"
  | "FORMULA_PROVENANCE_INVALID"
  | "INVALID_CELL_ADDRESS"
  | "MAPPING_MISMATCH"
  | "MISSING_DATA_SOURCE"
  | "MISSING_FORMULA"
  | "SCHEMA_VALIDATION_FAILED"
  | "UNSATISFIED_DEPENDENCY";

export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly message: string;
  readonly field: string | null;
  readonly formulaId: string | null;
  readonly context: Readonly<Record<string, unknown>>;
}

export type ValidationWarningCode = "DEEP_DEPENDENCY" | "LARGE_FORMULA";
export interface ValidationWarning {
  readonly code: ValidationWarningCode;
  readonly message: string;
  readonly field: string | null;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly validatedAt: UtcTimestamp;
}

export const buildSpecSchemaVersion = "2.0.0" as const;
export type BuildSpecSchemaVersion = typeof buildSpecSchemaVersion;

export interface BuildSpecV2 {
  readonly schemaVersion: BuildSpecSchemaVersion;
  readonly buildSpecId: Uuid;
  readonly architectureId: Uuid;
  readonly architectureContentSha256: Sha256;
  readonly caseId: Uuid;
  readonly ruleSetVersion: string;
  readonly generatedAt: UtcTimestamp;
  readonly architectureLineage: V1ArchitectureLineage;
  readonly formulas: readonly FormulaDefinitionV2[];
  readonly namedRanges: readonly NamedRangeDefinition[];
  readonly cellMappings: readonly CellMapping[];
  readonly executionOrder: ExecutionOrder;
  readonly validation: ValidationResult;
  readonly buildSpecContentSha256: Sha256;
}

export type BuildSpec = BuildSpecV2;

export interface ExportMetadata {
  readonly exportedAt: UtcTimestamp;
  readonly exportedBy: string;
  readonly toolVersion: string;
}

export interface BuildSpecExport {
  readonly buildSpec: BuildSpecV2;
  readonly exportMetadata: ExportMetadata;
  readonly contentSha256: Sha256;
}

export interface ImportMetadata {
  readonly importedAt: UtcTimestamp;
  readonly importedBy: string;
  readonly sourceHash: Sha256;
  readonly verified: true;
}

export interface BuildSpecImport {
  readonly buildSpec: BuildSpecV2;
  readonly importMetadata: ImportMetadata;
  readonly contentSha256: Sha256;
}

export type BuildSpecImportError =
  | {
      readonly code: "BUILD_SPEC_SCHEMA_INVALID";
      readonly issues: readonly string[];
    }
  | {
      readonly code: "BUILD_SPEC_HASH_MISMATCH";
      readonly expected: Sha256;
      readonly actual: Sha256;
    };

export type BuildSpecError = ValidationError;
