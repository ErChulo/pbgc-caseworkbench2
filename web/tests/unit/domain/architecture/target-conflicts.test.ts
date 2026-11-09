import { describe, expect, it } from "vitest";
import type {
  V1Architecture,
  CellDescriptor,
} from "../../../../src/domain/architecture/models";
import { findArchitectureFormulaTargetConflicts } from "../../../../src/domain/architecture/target-conflicts";

function cell(
  key: string,
  tab: string,
  address: string,
  statuses: readonly [string, "I" | "O" | "B"][],
  hasFormula = true,
): CellDescriptor {
  return {
    key,
    sourceTab: tab,
    cellAddress: address,
    genericField: key,
    description: "",
    hasFormula,
    formulaText: hasFormula ? "=1" : null,
    perRunClassification: new Map(
      statuses.map(([runId, iob]) => [
        runId,
        { runId, iob, justification: "synthetic", ruleVersion: "test" },
      ]),
    ),
  };
}
const runs = [
  { runId: "run-b" },
  { runId: "run-a" },
] as unknown as V1Architecture["runs"];
const architecture = (cells: CellDescriptor[]): V1Architecture =>
  ({
    runs,
    cells: new Map(cells.map((entry) => [entry.key, entry])),
  }) as unknown as V1Architecture;

describe("proposed architecture formula target conflicts", () => {
  it("reports separate runs on the same physical cell in stable order", () => {
    const input = cell("FV", "Retirees", "$a$2", [
      ["run-b", "O"],
      ["run-a", "B"],
    ]);
    const conflicts = findArchitectureFormulaTargetConflicts(
      architecture([input]),
    );
    expect(conflicts).toEqual([
      {
        tabName: "Retirees",
        cellAddress: "A2",
        formulas: [
          { cellKey: "FV", genericField: "FV", scenarioId: "run-a" },
          { cellKey: "FV", genericField: "FV", scenarioId: "run-b" },
        ],
      },
    ]);
  });
  it("merges case-insensitive tab targets and ignores inputs and missing formulas", () => {
    const a = cell("A", "Tab", "B2", [["run-a", "O"]]);
    const b = cell("B", "tab", "$b$2", [["run-b", "B"]]);
    const ignored = cell("C", "Tab", "B2", [["run-a", "I"]]);
    const noFormula = cell("D", "Tab", "B2", [["run-a", "O"]], false);
    expect(
      findArchitectureFormulaTargetConflicts(
        architecture([a, b, ignored, noFormula]),
      ),
    ).toEqual(
      findArchitectureFormulaTargetConflicts(
        architecture([noFormula, ignored, b, a]),
      ),
    );
    expect(
      findArchitectureFormulaTargetConflicts(
        architecture([a, b, ignored, noFormula]),
      )[0]?.formulas,
    ).toHaveLength(2);
    expect(
      findArchitectureFormulaTargetConflicts(
        architecture([a, ignored, noFormula]),
      ),
    ).toEqual([]);
  });
});
