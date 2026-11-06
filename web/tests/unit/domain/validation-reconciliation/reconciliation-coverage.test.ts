import { beforeAll, describe, expect, it } from "vitest";
import { computeWorkbookContentHash } from "../../../../src/domain/workbook-builder/workbook-hash";
import { validateWorkbook } from "../../../../src/domain/validation-reconciliation/structural-validator";
import { reconcileWorkbook } from "../../../../src/domain/validation-reconciliation/formula-reconciler";
import { createDefaultToleranceProfile } from "../../../../src/domain/validation-reconciliation/tolerance";
import type {
  ReconciliationInput,
  ReconciliationOracle,
} from "../../../../src/domain/validation-reconciliation/models";
import type { V1Workbook } from "../../../../src/domain/workbook-builder/models";
import type { ValidationResult } from "../../../../src/domain/shared/validation-result";
import type { Sha256, UtcTimestamp } from "../../../../src/domain/shared/types";

const hash = (v: string) => v.repeat(64) as Sha256;
const time = "2026-01-01T00:00:00.000Z" as UtcTimestamp;
// Hand-calculated synthetic values exercise comparison only, not actuarial calculations.
const formulas = ["f1", "f2"].map((formulaId, i) => ({
  formulaId,
  cellAddress: `A${String(i + 1)}`,
  tabName: "Test",
  formulaText: "=0",
  dependencies: [],
  executionOrder: i,
  executionLevel: 0,
}));
let workbook: V1Workbook;
let validation: ValidationResult;
beforeAll(async () => {
  const draft = {
    workbookContentSha256: hash("a"),
    populationProfileContentSha256: hash("b"),
    buildSpecContentSha256: hash("c"),
    architectureContentSha256: hash("d"),
    formulaCells: formulas,
    sheets: ["Test"].map((name) => ({
      name,
      hidden: false,
      cells: formulas.map((formula) => ({
        address: formula.cellAddress,
        kind: "formula",
        formulaText: formula.formulaText,
        value: null,
        dataSource: null,
        mappingId: null,
      })),
    })),
    caseId: "case",
    buildSpecId: "spec",
    architectureId: "architecture",
    populationProfileDecisionId: "decision",
    generatedAt: time,
    support: {
      summarySheet: {
        caseId: "case",
        buildSpecId: "spec",
        architectureId: "architecture",
        buildSpecContentSha256: hash("c"),
        architectureContentSha256: hash("d"),
        populationProfileContentSha256: hash("b"),
        populationProfileDecisionId: "decision",
        generatedAt: time,
        generatorVersion: "test",
        workbookContentSha256: hash("0"),
      },
      tablesSheet: { rules: [] },
      udTableSheet: { namedRanges: [], cellMappings: [] },
    },
    namedRanges: [],
    cellMappings: formulas.map((formula) => ({
      cellAddress: formula.cellAddress,
      tabName: formula.tabName,
      formulaId: formula.formulaId,
      iobClassification: "O",
      dataSource: null,
    })),
  } as unknown as V1Workbook;
  workbook = {
    ...draft,
    workbookContentSha256: await computeWorkbookContentHash(draft),
  };
  validation = await validateWorkbook({
    workbook,
    validatorVersion: "test-validator-1",
    validatedAt: time,
  });
  if (validation.status !== "valid")
    throw new Error("Synthetic workbook must pass structural validation");
});
const oracle: ReconciliationOracle = {
  oracleId: "synthetic",
  oracleType: "reference-calculation",
  toolName: "Custom",
  executedAt: time,
  executionVersion: "1",
  populationSnapshot: hash("b"),
  buildSpecSnapshot: hash("c"),
  reliability: "trusted",
  executionEvidence: "synthetic hand-calculated test evidence",
  results: [
    {
      formulaId: "f1",
      cellAddress: "A1",
      computedValue: 0,
      computedType: "number",
      error: null,
      precision: null,
    },
    {
      formulaId: "f2",
      cellAddress: "A2",
      computedValue: 100,
      computedType: "number",
      error: null,
      precision: null,
    },
  ],
};
function input(): ReconciliationInput {
  return {
    workbook,
    validation,
    oracle,
    tolerance: {
      ...createDefaultToleranceProfile(),
      absoluteTolerance: 0.125,
      relativeTolerance: 0,
    },
    actualValues: { f1: 0, f2: 100.125 },
  };
}

describe("reconciliation coverage and integrity", () => {
  it("compares all formula results including numeric zero within tolerance", async () => {
    const result = await reconcileWorkbook(input());
    expect(result.reconciliationStatus).toBe("complete");
    expect(result.matchCount).toBe(2);
  });
  it("binds the exact oracle and actual inputs even when comparisons both pass", async () => {
    const original = await reconcileWorkbook(input());
    const actualChanged = await reconcileWorkbook({
      ...input(),
      actualValues: { f1: 0, f2: 100 },
    });
    const first = oracle.results[0];
    if (!first) throw new Error("missing fixture");
    const oracleChanged = await reconcileWorkbook({
      ...input(),
      oracle: {
        ...oracle,
        executionVersion: "2",
        results: [{ ...first }, ...oracle.results.slice(1)],
      },
    });
    expect(
      [original, actualChanged, oracleChanged].every(
        (r) => r.reconciliationStatus === "complete",
      ),
    ).toBe(true);
    expect(original.actualValuesContentSha256).not.toBe(
      actualChanged.actualValuesContentSha256,
    );
    expect(original.reconciliationId).not.toBe(actualChanged.reconciliationId);
    expect(original.oracleContentSha256).not.toBe(
      oracleChanged.oracleContentSha256,
    );
    expect(original.reconciliationId).not.toBe(oracleChanged.reconciliationId);
  });

  it("uses one snapshot when caller data changes during asynchronous validation", async () => {
    const mutable = structuredClone(input());
    const expected = await reconcileWorkbook(mutable);
    const pending = reconcileWorkbook(mutable);
    (mutable.actualValues as Record<string, unknown>).f1 = 1234;
    if (!mutable.oracle) throw new Error("missing oracle");
    (mutable.oracle.results[0] as { computedValue: unknown }).computedValue =
      1234;
    const result = await pending;
    expect(result).toEqual(expected);
  });

  it("blocks unhashable extra actual values rather than reporting complete", async () => {
    await expect(
      reconcileWorkbook({
        ...input(),
        actualValues: { f1: 0, f2: 100, extra: NaN },
      }),
    ).rejects.toThrow("hashable exact input evidence");
  });

  it("rejects non-finite oracle precision", async () => {
    const first = oracle.results[0];
    if (!first) throw new Error("missing fixture");
    for (const precision of [NaN, Infinity]) {
      const result = await reconcileWorkbook({
        ...input(),
        oracle: {
          ...oracle,
          results: [{ ...first, precision }, ...oracle.results.slice(1)],
        },
      });
      expect(result.reconciliationStatus).toBe("oracle-error");
    }
  });

  it("records a tolerance mismatch outside the threshold", async () => {
    const result = await reconcileWorkbook({
      ...input(),
      actualValues: { f1: 0, f2: 100.25 },
    });
    expect(result.reconciliationStatus).toBe("mismatches");
    expect(result.mismatches[0]?.formulaId).toBe("f2");
  });
  it("rejects empty, stale, untrusted or undocumented oracle inputs", async () => {
    for (const modified of [
      { results: [] },
      { populationSnapshot: hash("e") },
      { buildSpecSnapshot: hash("e") },
      { reliability: "provisional" as const },
      { executionEvidence: " " },
    ]) {
      const result = await reconcileWorkbook({
        ...input(),
        oracle: { ...oracle, ...modified },
      });
      expect(result.reconciliationStatus).toBe("oracle-error");
      expect(result.matchCount).toBe(0);
    }
  });
  it("rejects malformed oracle metadata without treating it as complete", async () => {
    for (const modified of [
      { oracleId: "" },
      { populationSnapshot: "z".repeat(64) as Sha256 },
      { results: null as unknown as ReconciliationOracle["results"] },
    ]) {
      const result = await reconcileWorkbook({
        ...input(),
        oracle: { ...oracle, ...modified },
      });
      expect(result.reconciliationStatus).toBe("oracle-error");
    }
  });
  it("never emits a numeric infinity when the difference overflows", async () => {
    const first = oracle.results[0];
    if (!first) throw new Error("missing fixture");
    const result = await reconcileWorkbook({
      ...input(),
      actualValues: { f1: -1e308, f2: 100 },
      oracle: {
        ...oracle,
        results: [
          { ...first, computedValue: 1e308 },
          ...oracle.results.slice(1),
        ],
      },
    });
    expect(result.reconciliationStatus).toBe("mismatches");
    expect(result.mismatches[0]?.difference).toBe("non-finite-difference");
  });
  it("blocks failed validation even when values match", async () => {
    const result = await reconcileWorkbook({
      ...input(),
      validation: { ...validation, status: "invalid" },
    });
    expect(result.reconciliationStatus).toBe("oracle-error");
  });
  it("rejects altered workbook content even when its old hash is retained", async () => {
    const altered = {
      ...workbook,
      formulaCells: workbook.formulaCells.map((f, i) =>
        i === 0 ? { ...f, formulaText: "=999" } : f,
      ),
    };
    const result = await reconcileWorkbook({ ...input(), workbook: altered });
    expect(result.reconciliationStatus).toBe("oracle-error");
    expect(
      result.mismatches.some((m) =>
        m.diagnostics.some((d) => d.includes("validation evidence")),
      ),
    ).toBe(true);
  });
  it("rejects validation from a different, correctly rehashed workbook", async () => {
    const changed = {
      ...workbook,
      formulaCells: workbook.formulaCells.map((f, i) =>
        i === 0 ? { ...f, formulaText: "=999" } : f,
      ),
    };
    const different = {
      ...changed,
      workbookContentSha256: await computeWorkbookContentHash(changed),
    };
    const result = await reconcileWorkbook({ ...input(), workbook: different });
    expect(result.reconciliationStatus).toBe("oracle-error");
  });
  it("rejects a forged or legacy passing validation result", async () => {
    for (const altered of [
      { ...validation, status: "warnings" as const },
      { ...validation, validationId: hash("e") },
      { ...validation, validatorVersion: undefined },
    ]) {
      const result = await reconcileWorkbook({
        ...input(),
        validation: altered,
      });
      expect(result.reconciliationStatus).toBe("oracle-error");
    }
  });
  it("validates a stable workbook snapshot while the caller changes its input", async () => {
    const mutable = structuredClone(workbook);
    const request = {
      workbook: mutable,
      validatorVersion: "test-validator-1",
      validatedAt: time,
    };
    const expected = await validateWorkbook(request);
    const pending = validateWorkbook(request);
    const first = mutable.formulaCells[0] as
      { formulaText: string } | undefined;
    if (!first) throw new Error("Missing formula");
    first.formulaText = "=999";
    expect(await pending).toEqual(expected);
  });

  it("binds validation hashes to the workbook and validator version, not the timestamp", async () => {
    const original = await validateWorkbook({
      workbook,
      validatorVersion: "test-validator-1",
      validatedAt: time,
    });
    const later = await validateWorkbook({
      workbook,
      validatorVersion: "test-validator-1",
      validatedAt: "2026-01-02T00:00:00.000Z" as UtcTimestamp,
    });
    const versioned = await validateWorkbook({
      workbook,
      validatorVersion: "test-validator-2",
      validatedAt: time,
    });
    expect(original.validationId).toBe(later.validationId);
    expect(original.validationId).not.toBe(versioned.validationId);
    expect(original.workbookContentSha256).toBe(workbook.workbookContentSha256);
  });
  it("does not accept incomplete, duplicate, or wrong-cell oracle results", async () => {
    const first = oracle.results[0];
    if (!first) throw new Error("missing fixture");
    for (const results of [
      [first],
      [first, first],
      [{ ...first, cellAddress: "Z9" }, ...oracle.results.slice(1)],
    ]) {
      const result = await reconcileWorkbook({
        ...input(),
        oracle: { ...oracle, results },
      });
      expect(result.reconciliationStatus).not.toBe("complete");
    }
  });
  it.each([undefined, null, "", " ", NaN, Infinity])(
    "rejects missing or invalid actual value %s",
    async (value) => {
      const actualValues =
        value === undefined ? { f2: 100 } : { f1: value, f2: 100 };
      const result = await reconcileWorkbook({ ...input(), actualValues });
      expect(result.reconciliationStatus).toBe("mismatches");
      expect(result.mismatches[0]?.formulaId).toBe("f1");
    },
  );
  it("rejects malformed numeric tolerance rather than treating it as a pass", async () => {
    await expect(
      reconcileWorkbook({
        ...input(),
        tolerance: { ...input().tolerance, absoluteTolerance: NaN },
      }),
    ).rejects.toThrow("Invalid reconciliation tolerance");
  });
  it("rejects an oracle error value even when the actual value matches it", async () => {
    const first = oracle.results[0];
    if (!first) throw new Error("missing fixture");
    const result = await reconcileWorkbook({
      ...input(),
      actualValues: { f1: "#ERROR", f2: 100 },
      oracle: {
        ...oracle,
        results: [
          { ...first, computedValue: "#ERROR", computedType: "error" },
          ...oracle.results.slice(1),
        ],
      },
    });
    expect(result.reconciliationStatus).toBe("mismatches");
  });
});

describe("reconciliation approval gate", () => {
  it("blocks unavailable and mismatched results", async () => {
    const { WorkbookReconciliationEngine } =
      await import("../../../../src/domain/validation-reconciliation/engine");
    const engine = new WorkbookReconciliationEngine();
    const mismatch = await reconcileWorkbook({
      ...input(),
      actualValues: { f1: 0, f2: 101 },
    });
    const unavailable = await reconcileWorkbook({ ...input(), oracle: null });
    const complete = await reconcileWorkbook(input());
    expect(engine.isBlocked(mismatch)).toBe(true);
    expect(engine.isBlocked(unavailable)).toBe(true);
    expect(engine.isBlocked(complete)).toBe(false);
  });
});
