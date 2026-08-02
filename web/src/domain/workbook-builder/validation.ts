import type { BuildSpecV2 } from "../build-spec/models";
import type { PopulationDecisionProjection } from "../population/population-profile";
import type {
  ValidationError,
  ValidationWarning,
} from "../shared/validation-result";

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
      affectedNames: [],
      severity: "error",
      detail: "BuildSpec identifier is required for deterministic lineage.",
      remediation: "Regenerate the BuildSpec with a valid deterministic ID.",
    });
  }

  if (buildSpec.formulas.length === 0) {
    warnings.push({
      code: "NO_FORMULAS",
      message: "BuildSpec contains no formulas",
      affectedCells: [],
      severity: "warning",
      detail: "A BuildSpec without formulas may be incomplete for workbook generation.",
    });
  }

  if (buildSpec.namedRanges.length === 0) {
    warnings.push({
      code: "NO_NAMED_RANGES",
      message: "BuildSpec contains no named ranges",
      affectedCells: [],
      severity: "warning",
      detail: "Named ranges are expected for workbook interoperability and traceability.",
    });
  }

  if (buildSpec.cellMappings.length === 0) {
    warnings.push({
      code: "NO_CELL_MAPPINGS",
      message: "BuildSpec contains no cell mappings",
      affectedCells: [],
      severity: "warning",
      detail: "Cell mappings are expected to connect formulas and population inputs.",
    });
  }

  if (buildSpec.validation.errors.length > 0) {
    errors.push({
      code: "BUILD_SPEC_INVALID",
      message: "BuildSpec failed internal validation",
      affectedCells: [],
      affectedNames: [],
      severity: "error",
      detail: buildSpec.validation.errors.map((e) => `${e.code}: ${e.message}`).join("; "),
      remediation: "Resolve BuildSpec validation issues before workbook generation.",
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
      affectedNames: [],
      severity: "error",
      detail: "Workbook generation requires a governed population decision status.",
      remediation: "Approve, reject, revoke, or supersede the population profile explicitly.",
    });
  }

  if (!profile.effectiveDecisionId) {
    errors.push({
      code: "MISSING_POPULATION_DECISION",
      message: "Population profile must have an effective decision",
      affectedCells: [],
      affectedNames: [],
      severity: "error",
      detail: "Effective population decision ID is required for workbook lineage.",
      remediation: "Record an effective population decision before generating the workbook.",
    });
  }

  return { errors, warnings };
}

export function validateDataSources(buildSpec: BuildSpecV2): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const inputMappings = buildSpec.cellMappings.filter(
    (m) => m.iobClassification === "I" || m.iobClassification === "B",
  );

  for (const mapping of inputMappings) {
    if (!mapping.dataSource) {
      errors.push({
        code: "MISSING_DATA_SOURCE",
        message: `Cell ${mapping.cellAddress} requires a population data source`,
        affectedCells: [mapping.cellAddress],
        affectedNames: [],
        severity: "error",
        detail: "Input or biflow cells require an explicit governed data source.",
        remediation: "Add a population data source to the BuildSpec cell mapping.",
      });
    }
  }

  return { errors, warnings };
}

export function validateFormulaReferences(buildSpec: BuildSpecV2): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const formulaIds = new Set(buildSpec.formulas.map((f) => f.formulaId));

  for (const formula of buildSpec.formulas) {
    for (const dep of formula.dependencies) {
      if (!formulaIds.has(dep)) {
        errors.push({
          code: "BROKEN_REFERENCE",
          message: `Formula ${formula.formulaId} depends on unknown formula ${dep}`,
          affectedCells: [formula.cellAddress],
          affectedNames: [formula.formulaId],
          severity: "error",
          detail: "Every formula dependency must reference an existing formula in the BuildSpec.",
          remediation: "Add the missing formula or remove the invalid dependency.",
        });
      }
    }
  }

  return { errors, warnings };
}

export function validateNoCycles(buildSpec: BuildSpecV2): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (buildSpec.executionOrder.hasCycles) {
    const cycleNodes = [...buildSpec.executionOrder.cycleNodes].sort();
    errors.push({
      code: "CYCLE_DETECTED",
      message: `Circular dependency detected involving ${String(cycleNodes.length)} formula(s)`,
      affectedCells: [],
      affectedNames: cycleNodes,
      severity: "error",
      detail: `Circular dependencies: ${cycleNodes.join(", ")}`,
      remediation: "Break the circular dependency by removing or restructuring formula dependencies.",
    });
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
