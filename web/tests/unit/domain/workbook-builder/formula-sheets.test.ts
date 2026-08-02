import { describe, expect, it } from "vitest";
import {
  generateFormulaCells,
  populateDataCells,
  mergeSheetCells,
} from "../../../../src/domain/workbook-builder/formula-sheets";
import type {
  FormulaDefinitionV2,
  CellMapping,
  ExecutionOrder,
} from "../../../../src/domain/build-spec/models";

function formula(
  overrides: Partial<FormulaDefinitionV2> & {
    formulaId: string;
    formulaText: string;
    cellAddress: string;
    tabName: string;
  },
): FormulaDefinitionV2 {
  return {
    scenarioId: "NRD",
    genericField: "CALC",
    dependencies: [],
    iobClassification: "O",
    justification: "test",
    formulaKind: "scalar",
    provenance: {
      sourcePlanRules: [],
      derivationDescription: "test",
      formulaApproval: {} as never,
      affectedTestIds: [],
      regenerationImpact: "none",
      validationOracleIds: [],
    },
    ...overrides,
  };
}

describe("formula sheet generation", () => {
  it("generates formula cells in execution order", () => {
    const f1 = formula({
      formulaId: "F1",
      cellAddress: "A1",
      tabName: "Retirees",
      formulaText: "=B1+1",
    });
    const f2 = formula({
      formulaId: "F2",
      cellAddress: "B1",
      tabName: "Retirees",
      formulaText: "=10",
      dependencies: [],
    });
    const f3 = formula({
      formulaId: "F3",
      cellAddress: "C1",
      tabName: "Retirees",
      formulaText: "=A1*2",
      dependencies: ["F1"],
    });

    const executionOrder: ExecutionOrder = {
      order: ["F2", "F1", "F3"],
      levelCount: 2,
      maxDepth: 2,
      hasCycles: false,
      cycleNodes: [],
    };

    const result = generateFormulaCells({
      formulas: [f1, f2, f3],
      executionOrder,
    });
    expect(result.formulaCells).toHaveLength(3);
    expect(result.formulaCells[0]?.formulaId).toBe("F2");
    expect(result.formulaCells[0]?.executionOrder).toBe(0);
    expect(result.formulaCells[1]?.formulaId).toBe("F1");
    expect(result.formulaCells[1]?.executionOrder).toBe(1);
    expect(result.formulaCells[2]?.formulaId).toBe("F3");
    expect(result.formulaCells[2]?.executionOrder).toBe(2);
    expect(result.formulaCells[2]?.executionLevel).toBe(1);
  });

  it("groups formula cells by tab", () => {
    const f1 = formula({
      formulaId: "F1",
      cellAddress: "A1",
      tabName: "Retirees",
      formulaText: "=1",
    });
    const f2 = formula({
      formulaId: "F2",
      cellAddress: "A1",
      tabName: "Tables",
      formulaText: "=2",
    });

    const executionOrder: ExecutionOrder = {
      order: ["F1", "F2"],
      levelCount: 1,
      maxDepth: 0,
      hasCycles: false,
      cycleNodes: [],
    };

    const result = generateFormulaCells({ formulas: [f1, f2], executionOrder });
    expect(result.cellsByTab.size).toBe(2);
    expect(result.cellsByTab.get("Retirees")).toHaveLength(1);
    expect(result.cellsByTab.get("Tables")).toHaveLength(1);
  });

  it("computes execution levels from dependency depth", () => {
    const f1 = formula({
      formulaId: "F1",
      cellAddress: "A1",
      tabName: "T",
      formulaText: "=1",
    });
    const f2 = formula({
      formulaId: "F2",
      cellAddress: "B1",
      tabName: "T",
      formulaText: "=A1",
      dependencies: ["F1"],
    });
    const f3 = formula({
      formulaId: "F3",
      cellAddress: "C1",
      tabName: "T",
      formulaText: "=B1",
      dependencies: ["F2"],
    });

    const executionOrder: ExecutionOrder = {
      order: ["F1", "F2", "F3"],
      levelCount: 3,
      maxDepth: 2,
      hasCycles: false,
      cycleNodes: [],
    };

    const result = generateFormulaCells({
      formulas: [f1, f2, f3],
      executionOrder,
    });
    expect(result.formulaCells[0]?.executionLevel).toBe(0);
    expect(result.formulaCells[1]?.executionLevel).toBe(1);
    expect(result.formulaCells[2]?.executionLevel).toBe(2);
  });
});

describe("data cell population", () => {
  it("populates I cells with data source references", () => {
    const mappings: CellMapping[] = [
      {
        mappingId: "m1" as never,
        field: "DOB",
        tabName: "Retirees",
        cellAddress: "A1",
        iobClassification: "I",
        dataSource: {
          sourceType: "population",
          sourceTab: "Pop",
          sourceField: "DOB",
          evidenceKey: null,
        },
        formulaId: null,
        scenarioId: "NRD",
      },
    ];
    const result = populateDataCells(mappings);
    expect(result.get("Retirees")).toHaveLength(1);
    expect(result.get("Retirees")?.[0]?.kind).toBe("input");
    expect(result.get("Retirees")?.[0]?.dataSource?.sourceTab).toBe("Pop");
  });

  it("populates B cells as output kind", () => {
    const mappings: CellMapping[] = [
      {
        mappingId: "m2" as never,
        field: "BENEFIT",
        tabName: "Retirees",
        cellAddress: "B1",
        iobClassification: "B",
        dataSource: null,
        formulaId: "F1",
        scenarioId: "NRD",
      },
    ];
    const result = populateDataCells(mappings);
    expect(result.get("Retirees")?.[0]?.kind).toBe("output");
  });

  it("populates O cells as output kind", () => {
    const mappings: CellMapping[] = [
      {
        mappingId: "m3" as never,
        field: "RESULT",
        tabName: "Retirees",
        cellAddress: "C1",
        iobClassification: "O",
        dataSource: null,
        formulaId: null,
        scenarioId: "NRD",
      },
    ];
    const result = populateDataCells(mappings);
    expect(result.get("Retirees")?.[0]?.kind).toBe("output");
  });
});

describe("sheet cell merging", () => {
  it("merges cells from multiple sources by tab", () => {
    const map1 = new Map([
      [
        "Retirees",
        [
          {
            address: "A1",
            kind: "formula" as const,
            formulaText: "=1",
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const map2 = new Map([
      [
        "Retirees",
        [
          {
            address: "B1",
            kind: "input" as const,
            formulaText: null,
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const result = mergeSheetCells(map1, map2);
    expect(result.get("Retirees")).toHaveLength(2);
  });

  it("handles disjoint tabs", () => {
    const map1 = new Map([
      [
        "Retirees",
        [
          {
            address: "A1",
            kind: "formula" as const,
            formulaText: "=1",
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const map2 = new Map([
      [
        "Tables",
        [
          {
            address: "A1",
            kind: "label" as const,
            formulaText: null,
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const result = mergeSheetCells(map1, map2);
    expect(result.size).toBe(2);
  });

  it("merges overlapping cells by address, combining formula and data", () => {
    const formulaCells = new Map([
      [
        "Retirees",
        [
          {
            address: "C1",
            kind: "formula" as const,
            formulaText: "=A1+B1",
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const dataCells = new Map([
      [
        "Retirees",
        [
          {
            address: "C1",
            kind: "output" as const,
            formulaText: null,
            value: 42,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const result = mergeSheetCells(formulaCells, dataCells);
    const cells = result.get("Retirees");
    expect(cells).toHaveLength(1);
    expect(cells?.[0]?.formulaText).toBe("=A1+B1");
    expect(cells?.[0]?.value).toBe(42);
  });

  it("preserves formula text when merging B cells from both sources", () => {
    const formulaCells = new Map([
      [
        "Retirees",
        [
          {
            address: "D1",
            kind: "formula" as const,
            formulaText: "=C1*2",
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      ],
    ]);
    const dataCells = new Map([
      [
        "Retirees",
        [
          {
            address: "D1",
            kind: "output" as const,
            formulaText: null,
            value: 100,
            dataSource: {
              sourceTab: "RETIREES",
              columnIdentifier: "BENEFIT",
              rowRange: { start: 0, count: 1 },
              recordCount: 1,
              recordHash: "a".repeat(
                64,
              ) as import("../../../../src/domain/shared/types").Sha256,
            },
            mappingId:
              "m1" as import("../../../../src/domain/shared/types").Uuid,
          },
        ],
      ],
    ]);
    const result = mergeSheetCells(formulaCells, dataCells);
    const cells = result.get("Retirees");
    expect(cells).toHaveLength(1);
    expect(cells?.[0]?.formulaText).toBe("=C1*2");
    expect(cells?.[0]?.value).toBe(100);
    expect(cells?.[0]?.dataSource?.columnIdentifier).toBe("BENEFIT");
  });
});
