import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const schema = JSON.parse(
  readFileSync(
    resolve(
      currentDirectory,
      "../../../specs/007-workbook-builder/contracts/workbook.schema.json",
    ),
  ).toString("utf8"),
) as object;

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat(
    "uuid",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  ajv.addFormat(
    "date-time",
    (value: string) => !Number.isNaN(Date.parse(value)),
  );
  return ajv.compile(schema);
}

function validWorkbook(): Record<string, unknown> {
  const hash = "a".repeat(64);
  return {
    schemaVersion: "1.0.0",
    workbookId: "00000000-0000-4000-8000-000000000001",
    buildSpecId: "00000000-0000-4000-8000-000000000002",
    buildSpecContentSha256: hash,
    architectureId: "00000000-0000-4000-8000-000000000003",
    architectureContentSha256: hash,
    caseId: "00000000-0000-4000-8000-000000000004",
    populationProfileDecisionId: "00000000-0000-4000-8000-000000000005",
    populationProfileContentSha256: hash,
    generatedAt: "2026-08-02T12:00:00.000Z",
    sheets: [
      {
        name: "RETIREES",
        hidden: false,
        cells: [
          {
            address: "A1",
            kind: "input",
            formulaText: null,
            value: "1960-01-01",
            dataSource: {
              sourceTab: "Population",
              columnIdentifier: "DOB",
              rowRange: { start: 2, count: 100 },
              recordCount: 100,
              recordHash: "b".repeat(64),
            },
            mappingId: "00000000-0000-4000-8000-000000000010",
          },
          {
            address: "B1",
            kind: "formula",
            formulaText: "=A1+1",
            value: null,
            dataSource: null,
            mappingId: null,
          },
        ],
      },
    ],
    namedRanges: [
      {
        rangeName: "COMP",
        cellAddress: "A1",
        tabName: "RETIREES",
        scope: "workbook",
        genericField: "COMP",
        scenarioId: null,
        provenance: {
          source: "architecture",
          architectureNamedRange: "COMP",
        },
      },
    ],
    cellMappings: [
      {
        mappingId: "00000000-0000-4000-8000-000000000020",
        field: "DOB",
        tabName: "RETIREES",
        cellAddress: "A1",
        iobClassification: "I",
        dataSource: {
          sourceType: "population",
          sourceTab: "Population",
          sourceField: "DOB",
          evidenceKey: null,
        },
        formulaId: null,
        scenarioId: "DOR",
      },
    ],
    formulaCells: [
      {
        cellAddress: "B1",
        tabName: "RETIREES",
        formulaText: "=A1+1",
        formulaId: "FORMULA-001",
        dependencies: [],
        executionOrder: 0,
        executionLevel: 0,
      },
    ],
    support: {
      summarySheet: {
        caseId: "00000000-0000-4000-8000-000000000004",
        architectureId: "00000000-0000-4000-8000-000000000003",
        architectureContentSha256: hash,
        buildSpecId: "00000000-0000-4000-8000-000000000002",
        buildSpecContentSha256: hash,
        populationProfileDecisionId: "00000000-0000-4000-8000-000000000005",
        populationProfileContentSha256: hash,
        generatedAt: "2026-08-02T12:00:00.000Z",
        generatorVersion: "1.0.0",
        workbookContentSha256: hash,
      },
      tablesSheet: {
        rules: [
          {
            ruleId: "00000000-0000-4000-8000-000000000030",
            statement: "Synthetic rule",
            effectiveDate: "2026-01-01",
            endDate: null,
            applicability: "all-participants",
            primaryCitation: "Plan Document Section 1.0",
          },
        ],
      },
      udTableSheet: {
        namedRanges: [
          {
            name: "COMP",
            scope: "workbook",
            target: "RETIREES!A1",
            genericField: "COMP",
          },
        ],
        cellMappings: [
          {
            mappingId: "00000000-0000-4000-8000-000000000040",
            cellAddress: "A1",
            iobValue: "I",
            dataSource: "Population::DOB",
            formulaId: null,
          },
        ],
      },
    },
    workbookContentSha256: hash,
  };
}

function sheet(
  value: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const sheets = value.sheets as Record<string, unknown>[];
  const result = sheets[index];
  if (result === undefined) throw new Error("Fixture sheet is missing.");
  return result;
}

function cell(
  value: Record<string, unknown>,
  sheetIndex: number,
  cellIndex: number,
): Record<string, unknown> {
  const s = sheet(value, sheetIndex);
  const cells = s.cells as Record<string, unknown>[];
  const result = cells[cellIndex];
  if (result === undefined) throw new Error("Fixture cell is missing.");
  return result;
}

function namedRange(
  value: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const namedRanges = value.namedRanges as Record<string, unknown>[];
  const result = namedRanges[index];
  if (result === undefined) throw new Error("Fixture named range is missing.");
  return result;
}

function cellMapping(
  value: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const cellMappings = value.cellMappings as Record<string, unknown>[];
  const result = cellMappings[index];
  if (result === undefined) throw new Error("Fixture cell mapping is missing.");
  return result;
}

function formulaCell(
  value: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const formulaCells = value.formulaCells as Record<string, unknown>[];
  const result = formulaCells[index];
  if (result === undefined) throw new Error("Fixture formula cell is missing.");
  return result;
}

function support(value: Record<string, unknown>): Record<string, unknown> {
  const result = value.support;
  if (result === undefined || typeof result !== "object" || result === null)
    throw new Error("Fixture support is missing.");
  return result as Record<string, unknown>;
}

function summarySheet(value: Record<string, unknown>): Record<string, unknown> {
  const s = support(value);
  const result = s.summarySheet;
  if (result === undefined || typeof result !== "object" || result === null)
    throw new Error("Fixture summary sheet is missing.");
  return result as Record<string, unknown>;
}

function tablesSheet(value: Record<string, unknown>): Record<string, unknown> {
  const s = support(value);
  const result = s.tablesSheet;
  if (result === undefined || typeof result !== "object" || result === null)
    throw new Error("Fixture tables sheet is missing.");
  return result as Record<string, unknown>;
}

function planRule(
  value: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const ts = tablesSheet(value);
  const rules = ts.rules as Record<string, unknown>[];
  const result = rules[index];
  if (result === undefined) throw new Error("Fixture plan rule is missing.");
  return result;
}

describe("Workbook contract", () => {
  it("accepts a valid workbook object", () => {
    const validate = validator();
    expect(validate(validWorkbook()), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it("rejects a missing required field", () => {
    const value = validWorkbook();
    delete value.sheets;
    expect(validator()(value)).toBe(false);
  });

  it("rejects an invalid schemaVersion", () => {
    const value = validWorkbook();
    value.schemaVersion = "2.0.0";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a cell with invalid address format", () => {
    const value = validWorkbook();
    cell(value, 0, 0).address = "invalid-address";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a cell with invalid kind", () => {
    const value = validWorkbook();
    cell(value, 0, 0).kind = "invalid-kind";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a named range with invalid scope", () => {
    const value = validWorkbook();
    namedRange(value, 0).scope = "invalid-scope";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a cell mapping with invalid iobClassification", () => {
    const value = validWorkbook();
    cellMapping(value, 0).iobClassification = "X";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a formula cell with negative executionOrder", () => {
    const value = validWorkbook();
    formulaCell(value, 0).executionOrder = -1;
    expect(validator()(value)).toBe(false);
  });

  it("rejects a population data source with invalid recordCount", () => {
    const value = validWorkbook();
    const dataSource = cell(value, 0, 0).dataSource as Record<string, unknown>;
    dataSource.recordCount = -1;
    expect(validator()(value)).toBe(false);
  });

  it("rejects a summary sheet with invalid generatorVersion", () => {
    const value = validWorkbook();
    delete summarySheet(value).generatorVersion;
    expect(validator()(value)).toBe(false);
  });

  it("rejects a plan rule row with missing required fields", () => {
    const value = validWorkbook();
    delete planRule(value, 0).primaryCitation;
    expect(validator()(value)).toBe(false);
  });

  it("rejects a data source reference with invalid sourceType", () => {
    const value = validWorkbook();
    const dataSource = cellMapping(value, 0).dataSource as Record<
      string,
      unknown
    >;
    dataSource.sourceType = "invalid-source-type";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a named range provenance with invalid source", () => {
    const value = validWorkbook();
    const provenance = namedRange(value, 0).provenance as Record<
      string,
      unknown
    >;
    provenance.source = "invalid-source";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a workbook with additional properties", () => {
    const value = validWorkbook();
    value.extraField = "not allowed";
    expect(validator()(value)).toBe(false);
  });

  it("rejects a cell with additional properties", () => {
    const value = validWorkbook();
    cell(value, 0, 0).extraField = "not allowed";
    expect(validator()(value)).toBe(false);
  });

  it("accepts a workbook with null populationProfileDecisionId", () => {
    const value = validWorkbook();
    value.populationProfileDecisionId = null;
    expect(validator()(value)).toBe(true);
  });

  it("accepts a workbook with empty sheets array", () => {
    const value = validWorkbook();
    value.sheets = [];
    expect(validator()(value)).toBe(true);
  });

  it("accepts a workbook with empty formulaCells array", () => {
    const value = validWorkbook();
    value.formulaCells = [];
    expect(validator()(value)).toBe(true);
  });

  it("accepts a cell with null dataSource and null mappingId", () => {
    const value = validWorkbook();
    const formulaCellInstance = cell(value, 0, 1);
    expect(formulaCellInstance.dataSource).toBeNull();
    expect(formulaCellInstance.mappingId).toBeNull();
    expect(validator()(value)).toBe(true);
  });

  it("accepts a named range with null genericField and null scenarioId", () => {
    const value = validWorkbook();
    namedRange(value, 0).genericField = null;
    namedRange(value, 0).scenarioId = null;
    expect(validator()(value)).toBe(true);
  });
});
