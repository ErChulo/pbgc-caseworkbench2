import type { Sha256, UtcTimestamp } from "./types";

export type ValidationErrorSeverity = "error" | "warning";

export interface ValidationError {
  readonly code: string;
  readonly severity: "error";
  readonly affectedCells: readonly string[];
  readonly affectedNames: readonly string[];
  readonly message: string;
  readonly detail: string;
  readonly remediation: string;
}

export interface ValidationWarning {
  readonly code: string;
  readonly severity: "warning";
  readonly affectedCells: readonly string[];
  readonly message: string;
  readonly detail: string;
}

export type ValidationFinding = ValidationError | ValidationWarning;

export type ValidationType =
  | "workbook"
  | "buildSpec"
  | "population"
  | "rule"
  | "architecture";
export type ValidationStatus = "valid" | "invalid" | "warnings";

export interface ValidationResult {
  readonly validationId: Sha256;
  readonly validationType: ValidationType;
  readonly status: ValidationStatus;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly affectedComponentIds: readonly string[];
  readonly validatedAt: UtcTimestamp;
  readonly schemaVersion: "1.0.0";
  readonly validationContentSha256: Sha256;
}

export function validationPasses(result: ValidationResult): boolean {
  return result.status === "valid" || result.status === "warnings";
}

export function validationBlocks(result: ValidationResult): boolean {
  return result.status === "invalid";
}
