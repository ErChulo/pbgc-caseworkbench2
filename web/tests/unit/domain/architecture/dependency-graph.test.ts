import { describe, expect, it } from "vitest";

import {
  computeDependencies,
  detectCycles,
  extractFormulaRefs,
  resolveNamedRange,
} from "../../../../src/domain/architecture/dependency-graph";
import type {
  CellDescriptor,
  NamedRange,
} from "../../../../src/domain/architecture/models";

function cell(
  sourceTab: string,
  cellAddress: string,
  formulaText: string | null = null,
): CellDescriptor {
  return {
    key: `${sourceTab}::${cellAddress}`,
    sourceTab,
    cellAddress,
    genericField: `${sourceTab}_${cellAddress}`,
    description: "Synthetic dependency fixture",
    hasFormula: formulaText !== null,
    formulaText,
    perRunClassification: new Map(),
  };
}

const cells = (...values: readonly CellDescriptor[]) =>
  new Map(values.map((value) => [value.key, value]));

describe("architecture dependency graph", () => {
  it("extracts quoted sheets, absolute cells, and exact ranges from the formula AST", () => {
    const result = extractFormulaRefs(
      "=SUM('Benefit Data'!$A$1:$B$2,$C3)",
      "Current",
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          kind: "range",
          sheetName: "Benefit Data",
          address: "$A$1:$B$2",
          originalText: "'Benefit Data'!$A$1:$B$2",
        },
        {
          kind: "cell",
          sheetName: "Current",
          address: "$C3",
          originalText: "$C3",
        },
      ],
    });
  });

  it("resolves workbook and sheet-scoped names to exact architecture cells", () => {
    const namedRanges: readonly NamedRange[] = [
      {
        name: "Freeze_Date",
        sourceTab: "Parameters",
        cellAddress: "$B$2",
        scope: "workbook",
        genericField: "FREEZE_DATE",
      },
      {
        name: "Freeze_Date",
        sourceTab: "Retirees",
        cellAddress: "C3",
        scope: "sheet",
        genericField: "FREEZE_DATE_OVERRIDE",
      },
    ];
    expect(resolveNamedRange("freeze_date", namedRanges, "Retirees")).toEqual(
      namedRanges[1],
    );

    const result = computeDependencies({
      cells: cells(
        cell("Retirees", "A1", "=Freeze_Date"),
        cell("Retirees", "C3"),
        cell("Parameters", "B2"),
      ),
      scenarios: ["RUN-1"],
      namedRanges,
    });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          dependentKey: "Retirees::A1",
          dependencyKey: "Retirees::C3",
          runId: "RUN-1",
          referenceType: "named-range",
        },
      ],
    });
  });

  it("expands cell ranges only to exact cells present in the architecture", () => {
    const result = computeDependencies({
      cells: cells(
        cell("Output", "D1", "='Input Data'!$A$1:$B$2"),
        cell("Input Data", "A1"),
        cell("Input Data", "B2"),
        cell("Input Data", "C3"),
      ),
      scenarios: ["RUN-1"],
    });
    expect(result.ok && result.value.map((edge) => edge.dependencyKey)).toEqual(
      ["Input Data::A1", "Input Data::B2"],
    );
  });

  it.each([
    ["=Missing_Name", "Missing_Name", "named range"],
    ["='Missing Sheet'!A1", "'Missing Sheet'!A1", "cell"],
    ["=[Other.xlsx]Data!A1", "[Other.xlsx]Data!A1", "external"],
  ])("fails closed for %s and records %s explicitly", (formula, text, kind) => {
    const result = computeDependencies({
      cells: cells(cell("Output", "A1", formula)),
      scenarios: ["RUN-1"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DEPENDENCY_UNRESOLVED");
    if (result.error.code !== "DEPENDENCY_UNRESOLVED") return;
    expect(result.error.unresolvedItems).toEqual([
      expect.objectContaining({ kind: "missing-sequencing" }),
    ]);
    if (kind === "external")
      expect(result.error.partialDependencies).toEqual([
        expect.objectContaining({
          dependencyKey: text,
          referenceType: "external",
        }),
      ]);
    else expect(result.error.partialDependencies).toEqual([]);
  });

  it("fails closed with missing-sequencing items for cycles", () => {
    const dependencies = [
      {
        dependentKey: "Sheet::A1",
        dependencyKey: "Sheet::B1",
        runId: "RUN-1",
        referenceType: "cell" as const,
      },
      {
        dependentKey: "Sheet::B1",
        dependencyKey: "Sheet::A1",
        runId: "RUN-1",
        referenceType: "cell" as const,
      },
    ];
    expect(detectCycles(dependencies)).toEqual([
      expect.objectContaining({
        kind: "missing-sequencing",
        affectedScope: "run RUN-1: Sheet::A1 -> Sheet::B1",
      }),
    ]);

    const result = computeDependencies({
      cells: cells(cell("Sheet", "A1", "=B1"), cell("Sheet", "B1", "=A1")),
      scenarios: ["RUN-1"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CIRCULAR_DEPENDENCY");
  });

  it("replays deterministically regardless of map and scenario insertion order", () => {
    const first = computeDependencies({
      cells: cells(
        cell("Output", "C1", "=Input!A1+Input!B1"),
        cell("Input", "A1"),
        cell("Input", "B1"),
      ),
      scenarios: ["RUN-B", "RUN-A"],
    });
    const second = computeDependencies({
      cells: cells(
        cell("Input", "B1"),
        cell("Input", "A1"),
        cell("Output", "C1", "=Input!A1+Input!B1"),
      ),
      scenarios: ["RUN-A", "RUN-B"],
    });
    expect(first).toEqual(second);
  });
});
