import type { BuildSpecV2 } from "../build-spec/models";
import type { PopulationDecisionProjection } from "../population/population-profile";
import type { ValidationError, ValidationWarning } from "./models";

export interface ValidationState {
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
}

export function validateBuildSpec(buildSpec: BuildSpecV2): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!buildSpec.buildSpecId) {
    errors.push({
      code: "MISSING_BUILD_SPEC_ID",
      message: "BuildSpec must have a valid ID",
      affectedCells: [],
      severity: "error",
    });
  }

  if (!buildSpec.formulas || buildSpec.formulas.length === 0) {
    warnings.push({
      code: "NO_FORMULAS",
      message: "BuildSpec contains no formulas",
      affectedCells: null,
      severity: "warning",
    });
  }

  if (!buildSpec.namedRanges || buildSpec.namedRanges.length === 0) {
    warnings.push({
      code: "NO_NAMED_RANGES",
      message: "BuildSpec contains no named ranges",
      affectedCells: null,
      severity: "warning",
    });
  }

  if (!buildSpec.cellMappings || buildSpec.cellMappings.length === 0) {
    warnings.push({
      code: "NO_CELL_MAPPINGS",
      message: "BuildSpec contains no cell mappings",
      affectedCells: null,
      severity: "warning",
    });
  }

  if (!buildSpec.validation || buildSpec.validation.errors.length > 0) {
    errors.push({
      code: "BUILD_SPEC_INVALID",
      message: "BuildSpec failed internal validation",
      affectedCells: [],
      severity: "error",
      detail: buildSpec.validation?.errors
        .map((e) => `${e.code}: ${e.message}`)
        .join("; "),
    });
  }

  return { errors, warnings };
}

export function validatePopulationProfile(
  profile: PopulationDecisionProjection,
): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (
    profile.status !== "approved" &&
    profile.status !== "rejected" &&
    profile.status !== "revoked" &&
    profile.status !== "superseded"
  ) {
    errors.push({
      code: "POPULATION_UNAPPROVED",
      message: "Population profile must have an approved decision",
      affectedCells: [],
      severity: "error",
    });
  }

  if (!profile.effectiveDecisionId) {
    errors.push({
      code: "MISSING_POPULATION_DECISION",
      message: "Population profile must have an effective decision",
      affectedCells: [],
      severity: "error",
    });
  }

  return { errors, warnings };
}

export function validateDataSources(
  buildSpec: BuildSpecV2,
  populationSensitivity: string,
): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!buildSpec.cellMappings) {
    return { errors, warnings };
  }

  const inputMappings = buildSpec.cellMappings.filter(
    (m) => m.iobClassification === "I" || m.iobClassification === "B",
  );

  for (const mapping of inputMappings) {
    if (!mapping.dataSource) {
      errors.push({
        code: "MISSING_DATA_SOURCE",
        message: `Cell ${mapping.cellAddress} requires a population data source`,
        affectedCells: [mapping.cellAddress],
        severity: "error",
      });
    }
  }

  return { errors, warnings };
}

export function aggregateValidationResults(
  ...states: ValidationState[]
): ValidationState {
  const allErrors = states.flatMap((s) => s.errors);
  const allWarnings = states.flatMap((s) => s.warnings);

  const uniqueErrors = Array.from(
    new Map(allErrors.map((e) => [JSON.stringify(e), e])).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  const uniqueWarnings = Array.from(
    new Map(allWarnings.map((w) => [JSON.stringify(w), w])).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  return {
    errors: uniqueErrors,
    warnings: uniqueWarnings,
  };
}
