import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import type {
  ValidationError,
  WorkbookValidationEvidence,
  ValidationWarning,
  WorkbookValidationInput,
} from "./models";
import { computeWorkbookContentHash } from "../workbook-builder/workbook-hash";
import { validateCalculationSheetNames } from "../workbook-builder/sheet-policy";
import { validatePopulationApplication } from "./population-validator";

export async function validateWorkbook(
  input: WorkbookValidationInput,
): Promise<WorkbookValidationEvidence> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const workbook = input.workbook;
  const actualWorkbookHash = await computeWorkbookContentHash(workbook);
  if (actualWorkbookHash !== workbook.workbookContentSha256) {
    errors.push(
      error(
        "WORKBOOK_HASH_MISMATCH",
        "The workbook content does not match its recorded hash.",
        [],
        [],
        "Regenerate or restore the workbook before validation.",
      ),
    );
  }
  if (input.validatorVersion.trim() === "") {
    errors.push(
      error(
        "MISSING_VALIDATOR_VERSION",
        "The validator version is required.",
        [],
        [],
        "Record the validator version and validate again.",
      ),
    );
  }
  errors.push(...validateSupportSheets(workbook));

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
    workbookContentSha256: actualWorkbookHash,
    buildSpecContentSha256: workbook.buildSpecContentSha256,
    architectureContentSha256: workbook.architectureContentSha256,
    populationProfileContentSha256: workbook.populationProfileContentSha256,
    validatorVersion: input.validatorVersion,
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

function validateSupportSheets(
  workbook: WorkbookValidationInput["workbook"],
): ValidationError[] {
  const errors: ValidationError[] = [];
  // Runtime workbooks can come from untrusted storage despite the static type.
  const support = workbook.support as Partial<
    WorkbookValidationInput["workbook"]["support"]
  > | null;
  const entries = [
    { label: "Summary", present: support?.summarySheet != null },
    {
      label: "Tables",
      present:
        support?.tablesSheet != null &&
        Array.isArray(support.tablesSheet.rules),
    },
    {
      label: "UD Table",
      present:
        support?.udTableSheet != null &&
        Array.isArray(support.udTableSheet.namedRanges) &&
        Array.isArray(support.udTableSheet.cellMappings),
    },
  ];
  for (const entry of entries) {
    if (!entry.present)
      errors.push(
        error(
          "MISSING_SUPPORT_SHEET",
          `Required support sheet ${entry.label} has no valid support content.`,
          [],
          [entry.label],
          "Regenerate the workbook after correcting the generator.",
        ),
      );
  }
  const summary = support?.summarySheet;
  if (
    summary != null &&
    (summary.caseId !== workbook.caseId ||
      summary.buildSpecId !== workbook.buildSpecId ||
      summary.buildSpecContentSha256 !== workbook.buildSpecContentSha256 ||
      summary.architectureId !== workbook.architectureId ||
      summary.architectureContentSha256 !==
        workbook.architectureContentSha256 ||
      summary.populationProfileDecisionId !==
        workbook.populationProfileDecisionId ||
      summary.populationProfileContentSha256 !==
        workbook.populationProfileContentSha256 ||
      summary.generatedAt !== workbook.generatedAt ||
      typeof summary.generatorVersion !== "string" ||
      !summary.generatorVersion.trim())
  ) {
    errors.push(
      error(
        "SUPPORT_SUMMARY_MISMATCH",
        "Summary metadata does not match the workbook.",
        [],
        ["Summary"],
        "Regenerate the workbook with consistent lineage.",
      ),
    );
  }
  errors.push(
    ...validateCalculationSheetNames(
      workbook.sheets.map((sheet) => sheet.name),
    ),
  );
  return errors;
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
      !workbook.sheets.some((s) => s.name === range.tabName) &&
      !["Summary", "Tables", "UD Table"].includes(range.tabName)
    ) {
      errors.push(
        error(
          "INVALID_NAMED_RANGE_TARGET_SHEET",
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
  const seenIds = new Set<string>();
  const sheetCells = new Map<
    string,
    import("../workbook-builder/models").WorkbookCell
  >();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const address = normalizeCellAddress(cell.address);
      if (address === null) {
        errors.push(
          error(
            "INVALID_WORKSHEET_CELL",
            "A worksheet cell has an invalid address.",
            [cell.address],
            [],
            "Correct the workbook cell and regenerate.",
          ),
        );
        continue;
      }
      const key = `${sheet.name.toUpperCase()}\u0000${address.replaceAll("$", "")}`;
      if (sheetCells.has(key)) {
        errors.push(
          error(
            "DUPLICATE_WORKSHEET_CELL",
            "A worksheet has multiple cells at the same address.",
            [cell.address],
            [],
            "Correct the workbook cell mappings and regenerate.",
          ),
        );
      } else sheetCells.set(key, cell);
    }
  }
  const formulaTargets = new Set<string>();

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

    const key = `${formula.tabName.toUpperCase()}\u0000${normalizedAddress.replaceAll("$", "")}`;
    if (seenIds.has(formula.formulaId)) {
      errors.push(
        error(
          "DUPLICATE_FORMULA_ID",
          "A formula ID is defined more than once.",
          [formula.cellAddress],
          [formula.formulaId],
          "Correct the formula definitions and regenerate.",
        ),
      );
    }
    seenIds.add(formula.formulaId);
    if (cellAddresses.has(key)) {
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
    cellAddresses.add(key);
    formulaTargets.add(key);
    const mappings = workbook.cellMappings.filter(
      (mapping) => mapping.formulaId === formula.formulaId,
    );
    if (
      mappings.length !== 1 ||
      mappings[0]?.tabName.toUpperCase() !== formula.tabName.toUpperCase() ||
      normalizeCellAddress(mappings[0].cellAddress)?.replaceAll("$", "") !==
        normalizedAddress.replaceAll("$", "") ||
      (mappings[0].iobClassification !== "O" &&
        mappings[0].iobClassification !== "B")
    ) {
      errors.push(
        error(
          "FORMULA_MAPPING_MISMATCH",
          "Formula metadata does not match exactly one output mapping.",
          [formula.cellAddress],
          [formula.formulaId],
          "Correct the formula mappings and regenerate.",
        ),
      );
    }
    const cell = sheetCells.get(key);
    if (
      cell?.kind !== "formula" ||
      cell.formulaText !== formula.formulaText ||
      !formula.formulaText.startsWith("=") ||
      !formula.formulaText.slice(1).trim() ||
      (cell.value !== null && cell.value !== undefined)
    ) {
      errors.push(
        error(
          "FORMULA_WORKSHEET_MISMATCH",
          "Formula metadata does not match its worksheet cell.",
          [formula.cellAddress],
          [formula.formulaId],
          "Regenerate the workbook from verified compiled formulas.",
        ),
      );
    }

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

  for (const [key, cell] of sheetCells) {
    if (cell.kind === "formula" && !formulaTargets.has(key)) {
      errors.push(
        error(
          "UNTRACKED_WORKSHEET_FORMULA",
          "A worksheet formula has no matching formula metadata.",
          [cell.address],
          [],
          "Regenerate the workbook from verified compiled formulas.",
        ),
      );
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

  const dependencyMap = new Map<string, string[]>();
  for (const formula of workbook.formulaCells) {
    dependencyMap.set(
      formula.formulaId,
      formula.dependencies.map((d) => d.formulaId),
    );
  }

  const visited = new Set<string>();
  const visit = (formulaId: string): void => {
    if (visited.has(formulaId)) return;
    visited.add(formulaId);
    reachable.add(formulaId);
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
    (f) => !reachable.has(f.formulaId),
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
