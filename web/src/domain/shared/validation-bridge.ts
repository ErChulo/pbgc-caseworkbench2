import type { ValidationError as BuildSpecValidationError } from "../build-spec/models";
import type { ValidationError } from "../shared/validation-result";

export function toSharedValidationError(
  error: BuildSpecValidationError,
): ValidationError {
  return {
    code: error.code,
    severity: "error",
    affectedCells: error.formulaId !== null ? [error.formulaId] : [],
    affectedNames: error.field !== null ? [error.field] : [],
    message: error.message,
    detail: JSON.stringify(error.context),
    remediation: "Resolve the BuildSpec validation issue before workbook generation.",
  };
}

export function toSharedValidationErrors(
  errors: readonly BuildSpecValidationError[],
): ValidationError[] {
  return errors.map(toSharedValidationError);
}
