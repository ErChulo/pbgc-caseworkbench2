import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import type {
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WorkbookValidationInput,
} from "./models";
import { validatePopulationApplication } from "./population-validator";

export async function validateWorkbook(
  input: WorkbookValidationInput,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const workbook = input.workbook;
  const canonicalSupportSheets = ["Summary", "Tables", "UD Table"];
  const sheetNames = workbook.sheets.map((sheet) => sheet.name);

  for (const supportSheet of canonicalSupportSheets) {
    if (!sheetNames.includes(supportSheet)) {
      errors.push(
        error(
          "MISSING_SUPPORT_SHEET",
          `Required support sheet ${supportSheet} is missing.`,
          [],
          [supportSheet],
          "Regenerate the workbook after correcting the generator.",
        ),
      );
    }
  }

  const namedRangeErrors = validateNamedRanges(workbook);
  errors.push(...namedRangeErrors);

  const formulaErrors = validateFormulaCells(workbook);
  errors.push(...formulaErrors);

  const circularDepErrors = detectCircularDependencies(workbook);
  errors.push(...circularDepErrors);

  const unreachableCellErrors = detectUnreachableCells(workbook);
  errors.push(...unreachableCellErrors);

  const populationErrors = validatePopulationApplication(workbook);
  errors.push(...populationErrors);

  if (workbook.formulaCells.length === 0) {
    warnings.push({
      code: "NO_FORMULA_CELLS",
      severity: "warning",
      affectedCells: [],
      message: "Workbook contains no formula cells.",
      detail:
        "The workbook may be structurally valid but cannot produce calculations.",
    });
  }

  const sortedErrors = [...errors].sort(compareFinding);
  const sortedWarnings = [...warnings].sort(compareFinding);

  const affectedComponentIds: string[] = [];
  for (const err of sortedErrors) {
    affectedComponentIds.push(...err.affectedCells);
    affectedComponentIds.push(...err.affectedNames);
  }

  const deterministicPayload = {
    validationType: "workbook" as const,
    status:
      sortedErrors.length > 0
        ? "invalid"
        : sortedWarnings.length > 0
          ? "warnings"
          : "valid",
    errors: sortedErrors,
    warnings: sortedWarnings,
    affectedComponentIds: [...new Set(affectedComponentIds)].sort(),
    schemaVersion: "1.0.0" as const,
  } as const;

  const validationContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "WorkbookValidationResult",
  })) as Sha256;

  return {
    validationId: validationContentSha256,
    ...deterministicPayload,
    validatedAt: input.validatedAt,
    validationContentSha256,
  };
}

function validateNamedRanges(
  workbook: Parameters<typeof validateWorkbook>[0]["workbook"],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const rangeKeys = new Map<string, string[]>();

  for (const range of workbook.namedRanges) {
    const normalizedAddress = normalizeCellAddress(range.cellAddress);
    if (normalizedAddress === null) {
      errors.push(
        error(
          "INVALID_NAMED_RANGE_TARGET",
          `Named range ${range.rangeName} has an invalid target address.`,
          [range.cellAddress],
          [range.rangeName],
          "Correct the architecture named-range target and regenerate.",
        ),
      );
      continue;
    }

    const scope =
      range.scope === "sheet"
        ? `sheet:${range.tabName.toUpperCase()}`
        : "workbook";
    const key = `${scope}:${range.rangeName.toUpperCase()}`;

    if (!rangeKeys.has(key)) {
      rangeKeys.set(key, []);
    }
    const duplicates = rangeKeys.get(key) ?? [];
    duplicates.push(range.cellAddress);

    if (duplicates.length > 1) {
      errors.push(
        error(
          "DUPLICATE_NAMED_RANGE",
          `Named range ${range.rangeName} (scope: ${scope}) is duplicated.`,
          [...duplicates],
          [range.rangeName],
          "Correct the BuildSpec named-range definitions and regenerate.",
        ),
      );
    }

    if (
      range.scope === "sheet" &&
      !workbook.sheets.some((s) => s.name === range.tabName)
    ) {
      errors.push(
        error(
          "INVALID_NAMED_RANGE_SCOPE",
          `Named range ${range.rangeName} references non-existent sheet ${range.tabName}.`,
          [range.cellAddress],
          [range.rangeName],
          "Verify the sheet name in the architecture definition and regenerate.",
        ),
      );
    }
  }

  return errors;
}

function validateFormulaCells(
  workbook: Parameters<typeof validateWorkbook>[0]["workbook"],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const formulaIds = new Set(workbook.formulaCells.map((f) => f.formulaId));
  const cellAddresses = new Set<string>();

  for (const formula of workbook.formulaCells) {
    const normalizedAddress = normalizeCellAddress(formula.cellAddress);
    if (normalizedAddress === null) {
      errors.push(
        error(
          "INVALID_FORMULA_TARGET",
          `Formula ${formula.formulaId} has an invalid target address.`,
          [formula.cellAddress],
          [],
          "Correct the BuildSpec formula target and regenerate.",
        ),
      );
      continue;
    }

    if (cellAddresses.has(formula.cellAddress)) {
      errors.push(
        error(
          "DUPLICATE_FORMULA_CELL",
          `Formula cell at ${formula.cellAddress} is defined multiple times.`,
          [formula.cellAddress],
          [],
          "Correct the BuildSpec formula definitions and regenerate.",
        ),
      );
    }
    cellAddresses.add(formula.cellAddress);

    for (const dependency of formula.dependencies) {
      if (!formulaIds.has(dependency.formulaId)) {
        errors.push(
          error(
            "UNSATISFIED_FORMULA_DEPENDENCY",
            `Formula ${formula.formulaId} depends on unknown formula ${dependency.formulaId}.`,
            [formula.cellAddress],
            [],
            "Correct the BuildSpec dependency graph and regenerate.",
          ),
        );
      }
    }
  }

  return errors;
}

function detectCircularDependencies(
  workbook: Parameters<typeof validateWorkbook>[0]["workbook"],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const dependencyMap = new Map<string, Set<string>>();

  for (const formula of workbook.formulaCells) {
    dependencyMap.set(
      formula.formulaId,
      new Set(formula.dependencies.map((d) => d.formulaId)),
    );
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  const hasCycle = (formulaId: string, path: string[]): boolean => {
    if (stack.has(formulaId)) {
      const cycleStart = path.indexOf(formulaId);
      const cycle = [...path.slice(cycleStart), formulaId];
      errors.push(
        error(
          "CIRCULAR_DEPENDENCY",
          `Circular dependency detected: ${cycle.join(" → ")}.`,
          workbook.formulaCells
            .filter((f) => cycle.includes(f.formulaId))
            .map((f) => f.cellAddress),
          [],
          "Review the BuildSpec dependency graph for circular references and regenerate.",
        ),
      );
      return true;
    }

    if (visited.has(formulaId)) return false;

    stack.add(formulaId);
    const dependencies = dependencyMap.get(formulaId) ?? new Set();

    for (const dep of dependencies) {
      if (hasCycle(dep, [...path, formulaId])) {
        return true;
      }
    }

    stack.delete(formulaId);
    visited.add(formulaId);
    return false;
  };

  for (const formulaId of dependencyMap.keys()) {
    if (!visited.has(formulaId)) {
      visited.clear();
      stack.clear();
      hasCycle(formulaId, []);
    }
  }

  return errors;
}

function detectUnreachableCells(
  workbook: Parameters<typeof validateWorkbook>[0]["workbook"],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const reachable = new Set<string>();

  const cellMappings = workbook.cellMappings;
  for (const mapping of cellMappings) {
    reachable.add(mapping.cellAddress);
  }

  const dependencyMap = new Map<string, string[]>();
  for (const formula of workbook.formulaCells) {
    dependencyMap.set(
      formula.formulaId,
      formula.dependencies.map((d) => d.formulaId),
    );
  }

  const formulaIdToCell = new Map<string, string>();
  for (const formula of workbook.formulaCells) {
    formulaIdToCell.set(formula.formulaId, formula.cellAddress);
  }

  const visited = new Set<string>();
  const visit = (formulaId: string): void => {
    if (visited.has(formulaId)) return;
    visited.add(formulaId);
    const cellAddress = formulaIdToCell.get(formulaId);
    if (cellAddress) {
      reachable.add(cellAddress);
    }
    for (const dep of dependencyMap.get(formulaId) ?? []) {
      visit(dep);
    }
  };

  for (const formula of workbook.formulaCells) {
    if (workbook.cellMappings.some((m) => m.formulaId === formula.formulaId)) {
      visit(formula.formulaId);
    }
  }

  const unreachable = workbook.formulaCells.filter(
    (f) => !reachable.has(f.cellAddress),
  );
  for (const formula of unreachable) {
    errors.push(
      error(
        "UNREACHABLE_FORMULA_CELL",
        `Formula cell ${formula.cellAddress} is not reachable from any mapped output.`,
        [formula.cellAddress],
        [],
        "Review the BuildSpec formula definitions and cell mappings; remove unused formulas or map them as outputs.",
      ),
    );
  }

  return errors;
}

function error(
  code: string,
  message: string,
  affectedCells: readonly string[],
  affectedNames: readonly string[],
  remediation: string,
): ValidationError {
  return {
    code,
    severity: "error",
    affectedCells,
    affectedNames,
    message,
    detail: message,
    remediation,
  };
}

function compareFinding(
  left: { readonly code: string; readonly message: string },
  right: { readonly code: string; readonly message: string },
): number {
  return (
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}
