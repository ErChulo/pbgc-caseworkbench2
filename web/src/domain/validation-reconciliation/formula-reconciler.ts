import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type {
  OracleFormulaResult,
  ReconciliationInput,
  ReconciliationMismatch,
  ReconciliationResult,
} from "./models";

export async function reconcileWorkbook(
  input: ReconciliationInput,
): Promise<ReconciliationResult> {
  if (input.oracle === null) {
    return createResult(input, [], "oracle-unavailable", 0, 0, 1);
  }

  const formulaById = new Map(
    input.workbook.formulaCells.map((formula) => [formula.formulaId, formula]),
  );
  const mismatches: ReconciliationMismatch[] = [];
  let matchCount = 0;
  let errorCount = 0;

  for (const oracleResult of input.oracle.results) {
    const formula = formulaById.get(oracleResult.formulaId);
    if (!formula) {
      errorCount += 1;
      mismatches.push({
        cellAddress: oracleResult.cellAddress,
        formulaId: oracleResult.formulaId,
        formulaText: "",
        expectedValue: oracleResult.computedValue,
        actualValue: null,
        difference: "missing-formula",
        withinTolerance: false,
        severity: "error",
        diagnostics: ["Oracle result references an unknown workbook formula."],
      });
      continue;
    }

    const actualValue = input.actualValues[formula.formulaId] ?? null;
    const compared = compareValues(
      oracleResult,
      actualValue,
      input.tolerance,
      formula.cellAddress,
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

function compareValues(
  oracle: OracleFormulaResult,
  actualValue: unknown,
  tolerance: ReconciliationInput["tolerance"],
  cellAddress: string,
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

  const override = tolerance.cellLevelOverrides[cellAddress];
  const absoluteTolerance = override ?? tolerance.absoluteTolerance;

  if (
    typeof oracle.computedValue === "number" &&
    typeof actualValue === "number"
  ) {
    const difference = Math.abs(oracle.computedValue - actualValue);
    const relative =
      Math.abs(oracle.computedValue) > 0
        ? difference / Math.abs(oracle.computedValue)
        : difference;
    const withinTolerance =
      difference <= absoluteTolerance ||
      relative <= tolerance.relativeTolerance;
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
  const deterministicPayload = {
    workbookContentSha256: input.workbook.workbookContentSha256,
    validationId: input.validation.validationId,
    oracleId: input.oracle?.oracleId ?? "oracle-unavailable",
    oracleExecutedAt: input.oracle?.executedAt ?? input.validation.validatedAt,
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

function compareMismatch(
  left: ReconciliationMismatch,
  right: ReconciliationMismatch,
): number {
  return (
    left.formulaId.localeCompare(right.formulaId) ||
    left.cellAddress.localeCompare(right.cellAddress)
  );
}
