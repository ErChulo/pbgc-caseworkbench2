import type { Sha256, UtcTimestamp } from "../shared/types";
import type { V1Workbook } from "../workbook-builder/models";
import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "../shared/validation-result";

export type { ValidationResult, ValidationError, ValidationWarning };

export interface ReconciliationOracle {
  readonly oracleId: string;
  readonly oracleType:
    | "external-execution"
    | "reference-calculation"
    | "prior-validated-run"
    | "independent-oracle";
  readonly toolName: "ValTool" | "Runtime" | "ATPBGC" | "BCV" | "Custom" | null;
  readonly executedAt: UtcTimestamp;
  readonly executionVersion: string;
  readonly populationSnapshot: Sha256;
  readonly buildSpecSnapshot: Sha256;
  readonly results: readonly OracleFormulaResult[];
  readonly reliability: "trusted" | "provisional" | "unknown";
  readonly executionEvidence: string | null;
}

export interface OracleFormulaResult {
  readonly formulaId: string;
  readonly cellAddress: string;
  readonly computedValue: unknown;
  readonly computedType: "number" | "text" | "date" | "boolean" | "error";
  readonly error: string | null;
  readonly precision: number | null;
}

export interface ToleranceProfile {
  readonly profileId: string;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
  readonly roundingMethod: "banker's" | "away-from-zero" | "down";
  readonly effectiveDate: string;
  readonly cellLevelOverrides: Readonly<Record<string, number>>;
}

export interface ReconciliationMismatch {
  readonly cellAddress: string;
  readonly formulaId: string;
  readonly formulaText: string;
  readonly expectedValue: unknown;
  readonly actualValue: unknown;
  readonly difference: number | string;
  readonly withinTolerance: boolean;
  readonly severity: "error" | "warning";
  readonly diagnostics: readonly string[];
}

export interface ReconciliationResult {
  readonly reconciliationId: string;
  readonly workbookContentSha256: Sha256;
  readonly validationId: Sha256;
  readonly oracleId: string;
  readonly oracleExecutedAt: UtcTimestamp;
  readonly reconciliationStatus:
    | "complete"
    | "mismatches"
    | "oracle-unavailable"
    | "oracle-error";
  readonly mismatches: readonly ReconciliationMismatch[];
  readonly tolerance: ToleranceProfile;
  readonly matchCount: number;
  readonly mismatchCount: number;
  readonly errorCount: number;
  readonly reviewedBy: string | null;
  readonly reviewRationale: string | null;
  readonly reconciliationContentSha256: Sha256;
}

export interface WorkbookValidationInput {
  readonly workbook: V1Workbook;
  readonly validatorVersion: string;
  readonly validatedAt: UtcTimestamp;
}

export interface ReconciliationInput {
  readonly workbook: V1Workbook;
  readonly validation: ValidationResult;
  readonly oracle: ReconciliationOracle | null;
  readonly tolerance: ToleranceProfile;
  readonly actualValues: Readonly<Record<string, unknown>>;
}
