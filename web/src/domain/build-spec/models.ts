import type { Sha256, Uuid, UtcTimestamp } from "../shared/types";

export type IoBValue = "I" | "O" | "B" | "N" | "P" | "";

export type DataSourceType = "population" | "case-control" | "evidence";

export type NamedRangeScope = "workbook" | "sheet";

export interface FormulaDefinition {
  readonly formulaId: string;
  readonly scenarioId: string;
  readonly tabName: string;
  readonly genericField: string;
  readonly formulaText: string;
  readonly cellAddress: string;
  readonly dependencies: readonly string[];
  readonly iobClassification: IoBValue;
  readonly justification: string;
}

export interface FormulaCitation {
  readonly artifactSha256: Sha256;
  readonly sourceRole: string;
  readonly locator: string;
}

export interface FormulaRuleProvenance {
  readonly ruleId: Uuid;
  readonly ruleContentSha256: Sha256;
  readonly relationship: "governing" | "supporting";
  readonly citation: FormulaCitation;
  readonly effectiveDate: string;
  readonly endDate: string | null;
  readonly adoptionOrExecutionDate: string | null;
  readonly applicabilityConditions: readonly {
    readonly dimension: string;
    readonly value: string;
  }[];
  readonly supersedesRuleId: Uuid | null;
  readonly confidence: number;
  readonly reviewStatus: "human-approved" | "provisional";
  readonly authorityOverrideId: Uuid | null;
  readonly unresolvedItemIds: readonly Uuid[];
}

export interface FormulaProvenance {
  readonly sourcePlanRules: readonly FormulaRuleProvenance[];
  readonly derivationDescription: string;
  readonly approvalRecordId: string;
  readonly affectedTestIds: readonly string[];
  readonly regenerationImpact: string;
  readonly validationOracleIds: readonly string[];
}

export interface FormulaDefinitionV2 extends FormulaDefinition {
  readonly formulaKind: "scalar";
  readonly provenance: FormulaProvenance;
}

export interface NamedRangeDefinition {
  readonly rangeName: string;
  readonly cellAddress: string;
  readonly tabName: string;
  readonly scope: NamedRangeScope;
  readonly genericField: string;
  readonly scenarioId: string | null;
  readonly provenance: NamedRangeProvenance;
}

export interface NamedRangeProvenance {
  readonly source: string;
  readonly architectureNamedRange: string;
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
  | "MISSING_FORMULA"
  | "DUPLICATE_RANGE"
  | "UNSATISFIED_DEPENDENCY"
  | "CIRCULAR_DEPENDENCY"
  | "INVALID_CELL_ADDRESS"
  | "MISSING_DATA_SOURCE";

export type ValidationWarningCode =
  "UNUSED_RANGE" | "DEEP_DEPENDENCY" | "LARGE_FORMULA";

export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly message: string;
  readonly field: string | null;
  readonly formulaId: string | null;
  readonly context: Record<string, unknown>;
}

export interface ValidationWarning {
  readonly code: ValidationWarningCode;
  readonly message: string;
  readonly field: string | null;
  readonly context: Record<string, unknown>;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly validatedAt: UtcTimestamp;
}

export const buildSpecSchemaVersion = "1.0.0" as const;
export type BuildSpecSchemaVersion = typeof buildSpecSchemaVersion;
export const buildSpecSchemaVersion2 = "2.0.0" as const;

export interface BuildSpec {
  readonly schemaVersion: BuildSpecSchemaVersion;
  readonly buildSpecId: Uuid;
  readonly architectureId: Uuid;
  readonly caseId: Uuid;
  readonly ruleSetVersion: string;
  readonly generatedAt: UtcTimestamp;
  readonly formulas: readonly FormulaDefinition[];
  readonly namedRanges: readonly NamedRangeDefinition[];
  readonly cellMappings: readonly CellMapping[];
  readonly executionOrder: ExecutionOrder;
  readonly validation: ValidationResult;
  readonly buildSpecContentSha256: Sha256;
}

export interface BuildSpecV2 extends Omit<
  BuildSpec,
  "schemaVersion" | "formulas"
> {
  readonly schemaVersion: typeof buildSpecSchemaVersion2;
  readonly formulas: readonly FormulaDefinitionV2[];
}

export interface ExportMetadata {
  readonly exportedAt: UtcTimestamp;
  readonly exportedBy: string;
  readonly schemaVersion: string;
  readonly toolVersion: string;
}

export interface BuildSpecExport {
  readonly buildSpec: BuildSpec | BuildSpecV2;
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
  readonly buildSpec: BuildSpec | BuildSpecV2;
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

export type BuildSpecError =
  | { readonly code: "CIRCULAR_DEPENDENCY"; readonly cycle: readonly string[] }
  | { readonly code: "MISSING_FORMULA"; readonly field: string }
  | { readonly code: "DUPLICATE_RANGE"; readonly rangeName: string }
  | {
      readonly code: "UNSATISFIED_DEPENDENCY";
      readonly formulaId: string;
      readonly dependency: string;
    }
  | {
      readonly code: "SCHEMA_VALIDATION_FAILED";
      readonly errors: readonly string[];
    }
  | {
      readonly code: "HASH_MISMATCH";
      readonly expected: string;
      readonly actual: string;
    };
