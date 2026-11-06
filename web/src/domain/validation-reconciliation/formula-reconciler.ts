import { hashTyped } from "../manifests/canonical-json";
import { parseUtcTimestamp, type Sha256 } from "../shared/types";
import type {
  OracleFormulaResult,
  ReconciliationInput,
  ReconciliationMismatch,
  ReconciliationResult,
} from "./models";
import {
  evaluateNumericTolerance,
  validateToleranceProfile,
} from "./tolerance";
import { validateOracleContract } from "./oracle-integration";
import { validateWorkbook } from "./structural-validator";

export async function reconcileWorkbook(
  suppliedInput: ReconciliationInput,
): Promise<ReconciliationResult> {
  // Capture all values before the first await; caller mutations cannot change a
  // partially validated workbook or oracle while the result is being built.
  const input = structuredClone(suppliedInput);
  const toleranceErrors = validateToleranceProfile(input.tolerance);
  if (toleranceErrors.length > 0) {
    throw new Error(
      `Invalid reconciliation tolerance: ${toleranceErrors.join(" ")}`,
    );
  }
  if (input.oracle === null) {
    return createResult(input, [], "oracle-unavailable", 0, 0, 1);
  }
  const issues: string[] = validateOracleContract(input.oracle);
  if (
    (input.validation.status !== "valid" &&
      input.validation.status !== "warnings") ||
    input.validation.errors.length > 0 ||
    input.validation.validationType !== "workbook"
  ) {
    issues.push("A passing workbook validation is required.");
  }
  // Re-run validation rather than trusting an unkeyed hash or a status label.
  // Legacy results without workbook-bound metadata cannot authorize reconciliation.
  const candidate = input.validation as Partial<
    import("./models").WorkbookValidationEvidence
  >;
  if (
    typeof candidate.validatorVersion !== "string" ||
    candidate.validatorVersion.trim() === ""
  ) {
    issues.push("Workbook-bound validation evidence is required.");
  } else {
    try {
      const current = await validateWorkbook({
        workbook: input.workbook,
        validatorVersion: candidate.validatorVersion,
        validatedAt: input.validation.validatedAt,
      });
      const evidenceHash = await hashTyped(
        {
          validationType: candidate.validationType,
          workbookContentSha256: candidate.workbookContentSha256,
          buildSpecContentSha256: candidate.buildSpecContentSha256,
          architectureContentSha256: candidate.architectureContentSha256,
          populationProfileContentSha256:
            candidate.populationProfileContentSha256,
          validatorVersion: candidate.validatorVersion,
          status: candidate.status,
          errors: candidate.errors,
          warnings: candidate.warnings,
          affectedComponentIds: candidate.affectedComponentIds,
          schemaVersion: candidate.schemaVersion,
        },
        { typeName: "WorkbookValidationResult" },
      );
      if (
        current.status === "invalid" ||
        current.validationContentSha256 !== evidenceHash ||
        evidenceHash !== input.validation.validationContentSha256 ||
        evidenceHash !== input.validation.validationId
      ) {
        issues.push(
          "Workbook validation evidence is stale, invalid, or does not match the current workbook.",
        );
      }
    } catch {
      issues.push("Workbook validation evidence could not be verified.");
    }
  }
  if (
    input.oracle.populationSnapshot !==
      input.workbook.populationProfileContentSha256 ||
    input.oracle.buildSpecSnapshot !== input.workbook.buildSpecContentSha256
  ) {
    issues.push("Oracle snapshots do not match the workbook inputs.");
  }
  if (
    input.oracle.reliability !== "trusted" ||
    typeof input.oracle.executionEvidence !== "string" ||
    !input.oracle.executionEvidence.trim()
  ) {
    issues.push("A trusted oracle with documented evidence is required.");
  }
  if (
    !Array.isArray(input.oracle.results) ||
    input.oracle.results.length === 0 ||
    input.workbook.formulaCells.length === 0
  ) {
    issues.push("Formula results and workbook formulas are required.");
  }
  const formulaCells = input.workbook.formulaCells;
  const overrideTargets = new Set<string>();
  for (const key of Object.keys(input.tolerance.cellLevelOverrides)) {
    const targets = formulaCells.filter(
      (formula) => formula.formulaId === key || formula.cellAddress === key,
    );
    if (
      targets.length !== 1 ||
      targets[0] === undefined ||
      overrideTargets.has(targets[0].formulaId)
    ) {
      issues.push(
        "Tolerance override must identify one unique workbook formula without duplicate aliases.",
      );
    } else {
      overrideTargets.add(targets[0].formulaId);
    }
  }
  const formulaIds = new Set(formulaCells.map((formula) => formula.formulaId));
  if (Object.keys(input.actualValues).some((key) => !formulaIds.has(key)))
    issues.push("Actual values contain unknown formula identifiers.");
  if (issues.length > 0) {
    return createResult(
      input,
      issues.map(globalMismatch),
      "oracle-error",
      0,
      issues.length,
      issues.length,
    );
  }

  const formulaById = new Map(
    input.workbook.formulaCells.map((formula) => [formula.formulaId, formula]),
  );
  const mismatches: ReconciliationMismatch[] = [];
  let matchCount = 0;
  let errorCount = 0;
  const seen = new Set<string>();
  if (formulaById.size !== input.workbook.formulaCells.length) {
    mismatches.push(
      globalMismatch("Workbook formula identifiers are not unique."),
    );
    errorCount += 1;
  }

  for (const oracleResult of input.oracle.results) {
    if (seen.has(oracleResult.formulaId)) {
      mismatches.push(
        globalMismatch(
          `Duplicate oracle formula identifier: ${oracleResult.formulaId}.`,
        ),
      );
      errorCount += 1;
      continue;
    }
    seen.add(oracleResult.formulaId);
    const formula = formulaById.get(oracleResult.formulaId);
    if (!formula) {
      errorCount += 1;
      mismatches.push({
        cellAddress: oracleResult.cellAddress,
        formulaId: oracleResult.formulaId,
        formulaText: "",
        expectedValue: isComparableValue(oracleResult.computedValue)
          ? oracleResult.computedValue
          : null,
        actualValue: null,
        difference: "missing-formula",
        withinTolerance: false,
        severity: "error",
        diagnostics: ["Oracle result references an unknown workbook formula."],
      });
      continue;
    }

    if (oracleResult.cellAddress !== formula.cellAddress) {
      mismatches.push(
        globalMismatch(
          `Oracle cell address does not match formula ${formula.formulaId}.`,
        ),
      );
      errorCount += 1;
      continue;
    }
    const hasActual = Object.prototype.hasOwnProperty.call(
      input.actualValues,
      formula.formulaId,
    );
    const actualValue = hasActual
      ? input.actualValues[formula.formulaId]
      : undefined;
    if (
      !isComparableValue(actualValue) ||
      !isComparableValue(oracleResult.computedValue) ||
      !oracleTypeMatches(oracleResult)
    ) {
      mismatches.push({
        cellAddress: formula.cellAddress,
        formulaId: formula.formulaId,
        formulaText: formula.formulaText,
        expectedValue: isComparableValue(oracleResult.computedValue)
          ? oracleResult.computedValue
          : null,
        actualValue: isComparableValue(actualValue) ? actualValue : null,
        difference: !hasActual ? "missing-actual" : "invalid-value",
        withinTolerance: false,
        severity: "error",
        diagnostics: [
          "Missing, blank, malformed, or non-finite values cannot be reconciled.",
        ],
      });
      continue;
    }
    const compared = compareValues(
      oracleResult,
      actualValue,
      input.tolerance,
      formula.cellAddress,
      formula.formulaId,
    );
    if (compared.withinTolerance) {
      matchCount += 1;
    } else {
      mismatches.push({
        cellAddress: formula.cellAddress,
        formulaId: formula.formulaId,
        formulaText: formula.formulaText,
        expectedValue: oracleResult.computedValue,
        actualValue,
        difference: compared.difference,
        withinTolerance: false,
        severity: "error",
        diagnostics: compared.diagnostics,
      });
    }
  }

  for (const formula of input.workbook.formulaCells) {
    if (!seen.has(formula.formulaId)) {
      mismatches.push({
        cellAddress: formula.cellAddress,
        formulaId: formula.formulaId,
        formulaText: formula.formulaText,
        expectedValue: null,
        actualValue: null,
        difference: "missing-oracle-result",
        withinTolerance: false,
        severity: "error",
        diagnostics: [
          "No oracle result was provided for this workbook formula.",
        ],
      });
    }
  }

  const status =
    errorCount > 0
      ? "oracle-error"
      : mismatches.length > 0
        ? "mismatches"
        : "complete";

  return createResult(
    input,
    [...mismatches].sort(compareMismatch),
    status,
    matchCount,
    mismatches.length,
    errorCount,
  );
}

function isComparableValue(value: unknown): value is string | number | boolean {
  return (
    (typeof value === "string" && value.trim() !== "") ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function oracleTypeMatches(oracle: OracleFormulaResult): boolean {
  switch (oracle.computedType) {
    case "number":
      return typeof oracle.computedValue === "number";
    case "boolean":
      return typeof oracle.computedValue === "boolean";
    case "text":
      return typeof oracle.computedValue === "string";
    case "date": {
      const value = oracle.computedValue;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
        return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.valueOf()) &&
        date.toISOString().slice(0, 10) === value
      );
    }
    case "error":
      return false;
  }
}

function globalMismatch(message: string): ReconciliationMismatch {
  return {
    cellAddress: "",
    formulaId: "",
    formulaText: "",
    expectedValue: null,
    actualValue: null,
    difference: "oracle-error",
    withinTolerance: false,
    severity: "error",
    diagnostics: [message],
  };
}

function compareValues(
  oracle: OracleFormulaResult,
  actualValue: unknown,
  tolerance: ReconciliationInput["tolerance"],
  cellAddress: string,
  formulaId: string,
): {
  readonly withinTolerance: boolean;
  readonly difference: number | string;
  readonly diagnostics: readonly string[];
} {
  if (oracle.error !== null) {
    return {
      withinTolerance: false,
      difference: oracle.error,
      diagnostics: ["Oracle execution returned an error."],
    };
  }

  const override =
    tolerance.cellLevelOverrides[formulaId] ??
    tolerance.cellLevelOverrides[cellAddress];
  const absoluteTolerance = override ?? tolerance.absoluteTolerance;

  if (
    typeof oracle.computedValue === "number" &&
    typeof actualValue === "number"
  ) {
    const difference = Math.abs(oracle.computedValue - actualValue);
    if (!Number.isFinite(difference)) {
      return {
        withinTolerance: false,
        difference: "non-finite-difference",
        diagnostics: ["Numeric difference is outside the supported range."],
      };
    }
    const { withinTolerance } = evaluateNumericTolerance(
      oracle.computedValue,
      actualValue,
      absoluteTolerance,
      tolerance.relativeTolerance,
    );
    return {
      withinTolerance,
      difference,
      diagnostics: withinTolerance
        ? []
        : [
            `Difference ${String(difference)} exceeded tolerance ${String(absoluteTolerance)} or relative tolerance ${String(tolerance.relativeTolerance)}.`,
          ],
    };
  }

  const same = oracle.computedValue === actualValue;
  return {
    withinTolerance: same,
    difference: same ? 0 : "value-mismatch",
    diagnostics: same ? [] : ["Non-numeric values did not match exactly."],
  };
}

async function createResult(
  input: ReconciliationInput,
  mismatches: readonly ReconciliationMismatch[],
  reconciliationStatus: ReconciliationResult["reconciliationStatus"],
  matchCount: number,
  mismatchCount: number,
  errorCount: number,
): Promise<ReconciliationResult> {
  const oracleContentSha256 =
    input.oracle === null
      ? null
      : await hashInput(input.oracle, "ReconciliationOracleInput");
  const actualValuesContentSha256 = await hashInput(
    input.actualValues,
    "ReconciliationActualValues",
  );
  if (
    reconciliationStatus === "complete" &&
    (oracleContentSha256 === null || actualValuesContentSha256 === null)
  )
    throw new Error(
      "Complete reconciliation requires hashable exact input evidence.",
    );
  const deterministicPayload = {
    workbookContentSha256: input.workbook.workbookContentSha256,
    validationId: input.validation.validationId,
    oracleId:
      typeof input.oracle?.oracleId === "string" &&
      input.oracle.oracleId.trim() !== ""
        ? input.oracle.oracleId
        : "oracle-unavailable",
    oracleExecutedAt:
      typeof input.oracle?.executedAt === "string" &&
      parseUtcTimestamp(input.oracle.executedAt).ok
        ? input.oracle.executedAt
        : input.validation.validatedAt,
    oracleContentSha256,
    actualValuesContentSha256,
    reconciliationStatus,
    mismatches,
    tolerance: input.tolerance,
    matchCount,
    mismatchCount,
    errorCount,
    reviewedBy: null,
    reviewRationale: null,
  } as const;
  const reconciliationContentSha256 = (await hashTyped(deterministicPayload, {
    typeName: "WorkbookReconciliationResult",
  })) as Sha256;
  return {
    reconciliationId: reconciliationContentSha256,
    ...deterministicPayload,
    reconciliationContentSha256,
  };
}

async function hashInput(
  value: unknown,
  typeName: string,
): Promise<Sha256 | null> {
  try {
    return (await hashTyped(value, { typeName })) as Sha256;
  } catch {
    return null;
  }
}

function compareMismatch(
  left: ReconciliationMismatch,
  right: ReconciliationMismatch,
): number {
  return (
    left.formulaId.localeCompare(right.formulaId) ||
    left.cellAddress.localeCompare(right.cellAddress)
  );
}
