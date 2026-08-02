import ExcelJS from "exceljs";
import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type { V1Workbook } from "./models";

export async function computeWorkbookHash(
  workbook: Omit<V1Workbook, "workbookContentSha256">,
): Promise<Sha256> {
  return (await hashTyped(
    { workbook },
    { typeName: "V1WorkbookPayload" },
  )) as Sha256;
}

export interface XLSXWorkbookSpec {
  readonly sheets: readonly XLSXSheet[];
  readonly namedRanges: readonly XLSXNamedRange[];
}

export interface XLSXSheet {
  readonly name: string;
  readonly hidden: boolean;
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
}

export interface XLSXNamedRange {
  readonly name: string;
  readonly scope: "workbook" | "sheet";
  readonly sheetName: string | null;
  readonly reference: string;
}

export function buildXLSXSpec(workbook: V1Workbook): XLSXWorkbookSpec {
  const summarySheet = buildSummarySheet(workbook);
  const tablesSheet = buildTablesSheet(workbook);
  const udTableSheet = buildUDTableSheet(workbook);

  return {
    sheets: [summarySheet, tablesSheet, udTableSheet],
    namedRanges: workbook.namedRanges.map((nr) => ({
      name: nr.rangeName,
      scope: nr.scope,
      sheetName: nr.scope === "sheet" ? extractSheetName(nr.cellAddress) : null,
      reference: `${nr.tabName}!${nr.cellAddress}`,
    })),
  };
}

function buildSummarySheet(workbook: V1Workbook): XLSXSheet {
  const summary = workbook.support.summarySheet;
  const rows: (readonly (string | number | boolean | null)[])[] = [
    ["PBGC V1 Workbook Summary"],
    [],
    ["Case ID", summary.caseId],
    ["Architecture ID", summary.architectureId],
    ["Architecture Content Hash", summary.architectureContentSha256],
    ["BuildSpec ID", summary.buildSpecId],
    ["BuildSpec Content Hash", summary.buildSpecContentSha256],
    [
      "Population Profile Decision",
      summary.populationProfileDecisionId ?? "None",
    ],
    ["Population Profile Hash", summary.populationProfileContentSha256],
    ["Generated At", summary.generatedAt],
    ["Generator Version", summary.generatorVersion],
    ["Workbook Content Hash", summary.workbookContentSha256],
  ];
  return {
    name: "Summary",
    hidden: false,
    rows,
  };
}

function buildTablesSheet(workbook: V1Workbook): XLSXSheet {
  const tables = workbook.support.tablesSheet;
  const headerRow: readonly (string | number | boolean | null)[] = [
    "Rule ID",
    "Statement",
    "Effective Date",
    "End Date",
    "Applicability",
    "Primary Citation",
  ];

  const dataRows: (readonly (string | number | boolean | null)[])[] =
    tables.rules.map((rule) => [
      rule.ruleId,
      rule.statement,
      rule.effectiveDate,
      rule.endDate ?? "",
      rule.applicability,
      rule.primaryCitation,
    ]);

  const rows: (readonly (string | number | boolean | null)[])[] = [
    [`Plan Rules (${String(tables.rules.length)} total)`],
    [],
    headerRow,
    ...dataRows,
  ];

  return {
    name: "Tables",
    hidden: false,
    rows,
  };
}

function buildUDTableSheet(workbook: V1Workbook): XLSXSheet {
  const udTable = workbook.support.udTableSheet;

  const namedRangeRows = [["Named Ranges"], []];
  namedRangeRows.push(["Name", "Scope", "Target", "Generic Field"]);
  for (const nr of udTable.namedRanges) {
    namedRangeRows.push([nr.name, nr.scope, nr.target, nr.genericField ?? ""]);
  }

  namedRangeRows.push([]);
  namedRangeRows.push(["Cell Mappings"]);
  namedRangeRows.push([]);
  namedRangeRows.push([
    "Mapping ID",
    "Cell Address",
    "I/O/B Classification",
    "Data Source",
    "Formula ID",
  ]);

  for (const mapping of udTable.cellMappings) {
    namedRangeRows.push([
      mapping.mappingId,
      mapping.cellAddress,
      mapping.iobValue,
      mapping.dataSource ?? "",
      mapping.formulaId ?? "",
    ]);
  }

  return {
    name: "UD Table",
    hidden: false,
    rows: namedRangeRows,
  };
}

function extractSheetName(cellAddress: string): string | null {
  const match = /^'?([^'!]+)'?!/.exec(cellAddress);
  return match?.[1] ?? null;
}

export async function writeXLSXBuffer(spec: XLSXWorkbookSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PBGC CaseWorkBench";
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  workbook.lastPrinted = new Date(0);

  for (const sheet of spec.sheets) {
    const ws = workbook.addWorksheet(sheet.name, {
      state: sheet.hidden ? "hidden" : "visible",
    });
    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
      const row = sheet.rows[rowIndex];
      if (row === undefined) continue;
      const excelRow = ws.getRow(rowIndex + 1);
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const value = row[colIndex];
        excelRow.getCell(colIndex + 1).value = value ?? undefined;
      }
      excelRow.commit();
    }
  }

  for (const nr of spec.namedRanges) {
    workbook.definedNames.add(nr.name, nr.reference);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function writeXLSXBytes(
  spec: XLSXWorkbookSpec,
): Promise<Uint8Array> {
  const buffer = await writeXLSXBuffer(spec);
  return new Uint8Array(buffer);
}

export async function computeXLSXHash(spec: XLSXWorkbookSpec): Promise<Sha256> {
  const bytes = await writeXLSXBytes(spec);
  return (await hashTyped(
    { xlsx: Array.from(bytes) },
    { typeName: "XLSXPayload" },
  )) as Sha256;
}
