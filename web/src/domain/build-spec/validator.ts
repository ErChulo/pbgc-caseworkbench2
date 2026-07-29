import type {
  BuildSpecV2,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from "./models";
import type { UtcTimestamp } from "../shared/types";
import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import { computeExecutionOrder } from "./execution-order";
import { compareCodePoint } from "./identity";

export function validateBuildSpec(config: {
  readonly buildSpec: BuildSpecV2;
  readonly validatedAt?: UtcTimestamp;
}): ValidationResult {
  const { buildSpec } = config;
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const formulaIds = new Set<string>();
  for (const formula of buildSpec.formulas) {
    if (formulaIds.has(formula.formulaId))
      add(
        errors,
        "DUPLICATE_FORMULA",
        "Formula identity is duplicated.",
        formula.genericField,
        formula.formulaId,
        {},
      );
    formulaIds.add(formula.formulaId);
    validateCellAddress(
      errors,
      formula.cellAddress,
      formula.genericField,
      formula.formulaId,
      "formula",
    );
    validateCellAddress(
      errors,
      formula.provenance.formulaApproval.target.cellAddress,
      formula.genericField,
      formula.formulaId,
      "formulaApproval.target",
    );
    if (!formula.formulaText.trim())
      add(
        errors,
        "MISSING_FORMULA",
        "Formula text is empty.",
        formula.genericField,
        formula.formulaId,
        {},
      );
    for (const dependency of formula.dependencies)
      if (!buildSpec.formulas.some((item) => item.formulaId === dependency))
        add(
          errors,
          "UNSATISFIED_DEPENDENCY",
          "Formula dependency is not defined.",
          formula.genericField,
          formula.formulaId,
          { dependency },
        );
    if (
      formula.provenance.sourcePlanRules.filter(
        (rule) =>
          rule.relationship === "governing" &&
          rule.reviewStatus === "human-approved" &&
          rule.linkedUnresolvedItemIds.length === 0,
      ).length !== 1 ||
      formula.provenance.formulaApproval.resultingStatus !== "approved" ||
      formula.provenance.formulaApproval.affectedTestIds.length === 0 ||
      !formula.provenance.formulaApproval.regenerationImpact.trim() ||
      formula.provenance.formulaApproval.validationOracleIds.length === 0
    )
      add(
        errors,
        "FORMULA_PROVENANCE_INVALID",
        "Formula provenance is incomplete or unapproved.",
        formula.genericField,
        formula.formulaId,
        {},
      );
    if (formula.formulaText.length > 1_000)
      warnings.push({
        code: "LARGE_FORMULA",
        message: "Formula exceeds 1,000 characters.",
        field: formula.genericField,
        context: { formulaId: formula.formulaId },
      });
  }
  const mappingIds = new Set<string>();
  const mappingCells = new Set<string>();
  const mappingFields = new Set<string>();
  for (const mapping of buildSpec.cellMappings) {
    validateCellAddress(
      errors,
      mapping.cellAddress,
      mapping.field,
      mapping.formulaId,
      "cellMapping",
    );
    const cellIdentity = `${mapping.scenarioId}\u0000${mapping.tabName.toUpperCase()}\u0000${mapping.cellAddress.toUpperCase()}`;
    const fieldIdentity = `${mapping.scenarioId}\u0000${mapping.tabName.toUpperCase()}\u0000${mapping.field.toUpperCase()}`;
    if (
      mappingIds.has(mapping.mappingId) ||
      mappingCells.has(cellIdentity) ||
      mappingFields.has(fieldIdentity)
    )
      add(
        errors,
        "DUPLICATE_MAPPING",
        "Cell mapping identity, target, or field is duplicated.",
        mapping.field,
        mapping.formulaId,
        { mappingId: mapping.mappingId },
      );
    mappingIds.add(mapping.mappingId);
    mappingCells.add(cellIdentity);
    mappingFields.add(fieldIdentity);
    const expectsFormula =
      mapping.iobClassification === "O" || mapping.iobClassification === "B";
    const expectsInput =
      mapping.iobClassification === "I" || mapping.iobClassification === "B";
    if (
      expectsFormula &&
      (!mapping.formulaId || !formulaIds.has(mapping.formulaId))
    )
      add(
        errors,
        "MISSING_FORMULA",
        "O/B mapping lacks its exact formula.",
        mapping.field,
        mapping.formulaId,
        { mappingId: mapping.mappingId },
      );
    if (!expectsFormula && mapping.formulaId)
      add(
        errors,
        "MAPPING_MISMATCH",
        "Non-O/B mapping must not identify a compiled formula.",
        mapping.field,
        mapping.formulaId,
        {},
      );
    if (expectsInput && !mapping.dataSource)
      add(
        errors,
        "MISSING_DATA_SOURCE",
        "I/B mapping lacks an exact input data source.",
        mapping.field,
        mapping.formulaId,
        { mappingId: mapping.mappingId },
      );
    if (!expectsInput && mapping.dataSource)
      add(
        errors,
        "MAPPING_MISMATCH",
        "Non-I/B mapping must not identify an input data source.",
        mapping.field,
        mapping.formulaId,
        {},
      );
  }
  for (const formula of buildSpec.formulas) {
    const matches = buildSpec.cellMappings.filter(
      (mapping) =>
        mapping.formulaId === formula.formulaId &&
        mapping.scenarioId === formula.scenarioId &&
        mapping.tabName === formula.tabName &&
        mapping.cellAddress === formula.cellAddress &&
        mapping.field === formula.genericField &&
        mapping.iobClassification === formula.iobClassification,
    );
    if (matches.length !== 1)
      add(
        errors,
        "MAPPING_MISMATCH",
        "Formula must have exactly one exact cell mapping.",
        formula.genericField,
        formula.formulaId,
        { mappingCount: matches.length },
      );
  }
  const ranges = new Set<string>();
  for (const range of buildSpec.namedRanges) {
    validateCellAddress(
      errors,
      range.cellAddress,
      range.genericField,
      null,
      "namedRange",
    );
    const identity = `${range.scope}\u0000${range.scope === "sheet" ? range.tabName.toUpperCase() : ""}\u0000${range.rangeName.toUpperCase()}`;
    if (ranges.has(identity))
      add(
        errors,
        "DUPLICATE_RANGE",
        "Named range identity is duplicated within scope.",
        range.genericField,
        null,
        { identity },
      );
    ranges.add(identity);
  }
  if (buildSpec.executionOrder.hasCycles)
    for (const id of buildSpec.executionOrder.cycleNodes)
      add(
        errors,
        "CIRCULAR_DEPENDENCY",
        "Formula dependency cycle detected.",
        null,
        id,
        { cycleNodes: buildSpec.executionOrder.cycleNodes },
      );
  const suppliedIds = buildSpec.executionOrder.order;
  const positions = new Map(
    buildSpec.executionOrder.order.map((id, index) => [id, index]),
  );
  const unknownIds = [
    ...new Set(suppliedIds.filter((id) => !formulaIds.has(id))),
  ].sort(compareCodePoint);
  const missingIds = [...formulaIds]
    .filter((id) => !positions.has(id))
    .sort(compareCodePoint);
  const duplicateIds = [
    ...new Set(
      suppliedIds.filter((id, index) => suppliedIds.indexOf(id) !== index),
    ),
  ].sort(compareCodePoint);
  if (unknownIds.length > 0 || missingIds.length > 0 || duplicateIds.length > 0)
    add(
      errors,
      "UNSATISFIED_DEPENDENCY",
      "Execution order does not contain every formula exactly once.",
      null,
      null,
      { duplicateIds, missingIds, unknownIds },
    );
  for (const formula of buildSpec.formulas)
    for (const dependency of formula.dependencies)
      if (
        (positions.get(dependency) ?? Number.MAX_SAFE_INTEGER) >=
        (positions.get(formula.formulaId) ?? -1)
      )
        add(
          errors,
          "UNSATISFIED_DEPENDENCY",
          "Execution order does not satisfy a declared dependency.",
          formula.genericField,
          formula.formulaId,
          { dependency },
        );
  const recomputedOrder = computeExecutionOrder({
    formulas: buildSpec.formulas,
  });
  if (
    !sameStrings(buildSpec.executionOrder.order, recomputedOrder.order) ||
    !sameStrings(
      buildSpec.executionOrder.cycleNodes,
      recomputedOrder.cycleNodes,
    ) ||
    buildSpec.executionOrder.hasCycles !== recomputedOrder.hasCycles ||
    buildSpec.executionOrder.levelCount !== recomputedOrder.levelCount ||
    buildSpec.executionOrder.maxDepth !== recomputedOrder.maxDepth
  )
    add(
      errors,
      "UNSATISFIED_DEPENDENCY",
      "Execution metadata does not match deterministic recomputation.",
      null,
      null,
      { recomputed: recomputedOrder },
    );
  if (buildSpec.executionOrder.maxDepth > 10)
    warnings.push({
      code: "DEEP_DEPENDENCY",
      message: "Formula dependency depth exceeds 10.",
      field: null,
      context: { maxDepth: buildSpec.executionOrder.maxDepth },
    });
  const sortedErrors = [...errors].sort((a, b) =>
    compareCodePoint(
      `${a.code}\u0000${a.formulaId ?? ""}\u0000${JSON.stringify(a.context)}`,
      `${b.code}\u0000${b.formulaId ?? ""}\u0000${JSON.stringify(b.context)}`,
    ),
  );
  return {
    isValid: sortedErrors.length === 0,
    errors: sortedErrors,
    warnings: [...warnings].sort((a, b) => compareCodePoint(a.code, b.code)),
    validatedAt: config.validatedAt ?? buildSpec.generatedAt,
  };
}

function validateCellAddress(
  errors: ValidationError[],
  address: string,
  field: string | null,
  formulaId: string | null,
  source: string,
): void {
  if (normalizeCellAddress(address) === address) return;
  add(
    errors,
    "INVALID_CELL_ADDRESS",
    "Cell address must be canonical A1 notation within the Excel grid.",
    field,
    formulaId,
    { address, source },
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function add(
  errors: ValidationError[],
  code: ValidationError["code"],
  message: string,
  field: string | null,
  formulaId: string | null,
  context: Readonly<Record<string, unknown>>,
): void {
  errors.push({ code, message, field, formulaId, context });
}
