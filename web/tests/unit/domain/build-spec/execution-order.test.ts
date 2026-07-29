import { describe, expect, it } from "vitest";
import { computeExecutionOrder } from "../../../../src/domain/build-spec/execution-order";
import type { FormulaDefinitionV2 } from "../../../../src/domain/build-spec/models";
import { approvedProvenance } from "../../../fixtures/formula-compiler";

const formula = (
  formulaId: string,
  dependencies: readonly string[] = [],
): FormulaDefinitionV2 => ({
  formulaId,
  scenarioId: "DOR",
  tabName: "RETIREES",
  genericField: formulaId,
  formulaText: "=1",
  cellAddress: formulaId.endsWith("A") ? "A1" : "B1",
  dependencies,
  iobClassification: "O",
  justification: "Synthetic",
  formulaKind: "scalar",
  provenance: approvedProvenance(),
});

describe("execution order", () => {
  it("uses deterministic Kahn ordering and depth", () => {
    const result = computeExecutionOrder({
      formulas: [formula("FORMULA-B", ["FORMULA-A"]), formula("FORMULA-A")],
    });
    expect(result).toEqual({
      order: ["FORMULA-A", "FORMULA-B"],
      levelCount: 2,
      maxDepth: 1,
      hasCycles: false,
      cycleNodes: [],
    });
  });

  it("reports cycle nodes deterministically", () => {
    const result = computeExecutionOrder({
      formulas: [
        formula("FORMULA-B", ["FORMULA-A"]),
        formula("FORMULA-A", ["FORMULA-B"]),
      ],
    });
    expect(result.hasCycles).toBe(true);
    expect(result.cycleNodes).toEqual(["FORMULA-A", "FORMULA-B"]);
  });

  it("reports only SCC cycle members, not downstream blocked formulas", () => {
    const result = computeExecutionOrder({
      formulas: [
        formula("FORMULA-C", ["FORMULA-A"]),
        formula("FORMULA-B", ["FORMULA-A"]),
        formula("FORMULA-A", ["FORMULA-B"]),
        formula("FORMULA-D"),
      ],
    });
    expect(result.order).toEqual(["FORMULA-D"]);
    expect(result.cycleNodes).toEqual(["FORMULA-A", "FORMULA-B"]);
  });
});
