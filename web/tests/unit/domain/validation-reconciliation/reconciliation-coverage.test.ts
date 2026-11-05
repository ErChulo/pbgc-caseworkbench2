import { describe, expect, it } from "vitest";
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
const workbook = {
  workbookContentSha256: hash("a"),
  populationProfileContentSha256: hash("b"),
  buildSpecContentSha256: hash("c"),
  formulaCells: formulas,
} as unknown as V1Workbook;
const validation = {
  validationType: "workbook",
  status: "valid",
  errors: [],
  warnings: [],
  validationId: hash("d"),
  validatedAt: time,
} as unknown as ValidationResult;
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
