import { describe, expect, it } from "vitest";
import type {
  BuildSpecV2,
  CellMapping,
} from "../../../../src/domain/build-spec/models";
import type { PopulationRecordProjection } from "../../../../src/domain/population/record-projection";
import { preflightPopulationRouting } from "../../../../src/domain/workbook-builder/population-routing-preflight";

const profile = "a".repeat(64);
const row = {
  workbookProfileContentSha256: profile,
  populationDecisionId: "decision",
  sheetName: "Retirees",
  fields: [
    {
      field: "DOB",
      state: "value",
      value: "synthetic",
      sourceAddress: "A2",
      formulaText: null,
    },
    {
      field: "COMP",
      state: "blank",
      value: null,
      sourceAddress: "B2",
      formulaText: null,
    },
  ],
} as unknown as PopulationRecordProjection;
const mapping = (
  id: string,
  field: string,
  address: string,
  iob: "I" | "B" = "I",
): CellMapping => ({
  mappingId: id as CellMapping["mappingId"],
  field,
  tabName: "Retirees",
  cellAddress: address,
  scenarioId: id,
  iobClassification: iob,
  dataSource: {
    sourceType: "population",
    sourceTab: "Retirees",
    sourceField: field,
    evidenceKey: null,
  },
  formulaId: null,
});
const spec = (mappings: CellMapping[]): BuildSpecV2 =>
  ({
    caseId: "case",
    architectureLineage: {
      population: [
        {
          workbookProfileContentSha256: profile,
          approvalDecisionId: "decision",
        },
      ],
    },
    cellMappings: mappings,
    formulas: [],
  }) as unknown as BuildSpecV2;

describe("population routing preflight", () => {
  it("reports a clear advisory without treating it as authorization", () => {
    const result = preflightPopulationRouting(
      spec([mapping("one", "DOB", "A2")]),
      row,
      "case",
    );
    expect(result).toEqual({
      inputMappingCount: 1,
      issues: [],
      routingAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain("synthetic");
  });
  it("reports row-one, cross-scenario collisions, formula overlap, B semantics and missing values", () => {
    const build = spec([
      mapping("one", "DOB", "$A$1"),
      mapping("two", "COMP", "a1", "B"),
      mapping("three", "MISSING", "C3"),
    ]);
    const withFormula = {
      ...build,
      formulas: [{ tabName: "retirees", cellAddress: "A1" }],
    } as unknown as BuildSpecV2;
    const result = preflightPopulationRouting(withFormula, row, "wrong-case");
    const codes = result.issues.map((issue) => issue.code);
    for (const code of [
      "LINEAGE_MISMATCH",
      "TARGET_HEADER_ROW",
      "TARGET_COLLISION",
      "INPUT_FORMULA_COLLISION",
      "B_SEMANTICS_REQUIRED",
      "SOURCE_VALUE_UNAVAILABLE",
      "SOURCE_FIELD_MISSING",
    ])
      expect(codes).toContain(code);
    expect(result.routingAuthorized).toBe(false);
  });
  it("does not guess a different sheet or source field and detects invalid targets", () => {
    const bad = {
      ...mapping("one", "DOB", "bad!"),
      dataSource: {
        sourceType: "population" as const,
        sourceTab: "Other",
        sourceField: "DOB",
        evidenceKey: null,
      },
    };
    const result = preflightPopulationRouting(spec([bad]), row, "case");
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "TARGET_INVALID",
      "SOURCE_UNSUPPORTED",
    ]);
  });
  it("reports each scenario when formulas share a physical target", () => {
    const build = spec([]);
    const duplicate = {
      ...build,
      formulas: [
        {
          tabName: "Retirees",
          cellAddress: "A2",
          genericField: "F",
          scenarioId: "one",
        },
        {
          tabName: "retirees",
          cellAddress: "$A$2",
          genericField: "F",
          scenarioId: "two",
        },
      ],
    } as unknown as BuildSpecV2;
    const issues = preflightPopulationRouting(duplicate, row, "case").issues;
    expect(issues.map((issue) => issue.code)).toEqual([
      "FORMULA_TARGET_COLLISION",
      "FORMULA_TARGET_COLLISION",
    ]);
    expect(issues.map((issue) => issue.scenarioId)).toEqual(["one", "two"]);
  });
  it("requires a unique exact population lineage", () => {
    const build = spec([]);
    const duplicate = {
      ...build,
      architectureLineage: {
        ...build.architectureLineage,
        population: [
          ...build.architectureLineage.population,
          ...build.architectureLineage.population,
        ],
      },
    };
    expect(
      preflightPopulationRouting(duplicate, row, "case").issues[0]?.code,
    ).toBe("LINEAGE_MISMATCH");
  });
});
