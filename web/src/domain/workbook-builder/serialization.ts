import * as XLSX from "xlsx";
import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type { V1Workbook, WorkbookSheet, WorkbookCell } from "./models";

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

  const calcSheets: XLSXSheet[] = workbook.sheets.map((sheet) => ({
    name: sheet.name,
    hidden: sheet.hidden,
    rows: buildCalcSheetRows(sheet),
  }));

  return {
    sheets: [summarySheet, tablesSheet, udTableSheet, ...calcSheets],
    namedRanges: workbook.namedRanges.map((nr) => ({
      name: nr.rangeName,
      scope: nr.scope,
      sheetName: nr.scope === "sheet" ? extractSheetName(nr.cellAddress) : null,
      reference: `${nr.tabName}!${nr.cellAddress}`,
    })),
  };
}

function buildCalcSheetRows(
  sheet: WorkbookSheet,
): readonly (readonly (string | number | boolean | null)[])[] {
  const rows: (readonly (string | number | boolean | null)[])[] = [];

  const cellMap = new Map<string, WorkbookCell>();
  for (const cell of sheet.cells) {
    cellMap.set(cell.address, cell);
  }

  let maxRow = 0;
  let maxCol = 0;
  for (const cell of sheet.cells) {
    const match = /^([A-Z]+)(\d+)$/.exec(cell.address);
    if (match) {
      const rowNum = parseInt(match[2] ?? "0", 10);
      const colNum = columnToIndex(match[1] ?? "A");
      if (rowNum > maxRow) maxRow = rowNum;
      if (colNum > maxCol) maxCol = colNum;
    }
  }

  for (let r = 1; r <= maxRow; r++) {
    const row: (string | number | boolean | null)[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const addr = `${indexToColumn(c)}${String(r)}`;
      const cell = cellMap.get(addr);
      if (cell) {
        if (cell.kind === "formula") {
          row.push(cell.formulaText ?? "");
        } else {
          row.push(cell.value as string | number | boolean | null);
        }
      } else {
        row.push(null);
      }
    }
    rows.push(row);
  }

  return rows;
}

function columnToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

function indexToColumn(index: number): string {
  let col = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    col = String.fromCharCode(65 + remainder) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
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

export function writeXLSXBuffer(spec: XLSXWorkbookSpec): Buffer {
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Author: "PBGC CaseWorkBench",
    CreatedDate: new Date(0),
  };

  for (const sheet of spec.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows as never[][]);
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
    if (sheet.hidden) {
      (ws as Record<string, unknown>)["!hidden"] = true;
    }
  }

  for (const nr of spec.namedRanges) {
    workbook.Workbook ??= {};
    workbook.Workbook.Names ??= [];
    workbook.Workbook.Names.push({
      Name: nr.name,
      Ref: `${nr.sheetName ? `'${nr.sheetName}'` : ""}!${nr.reference}`,
      Sheet:
        nr.scope === "sheet" && nr.sheetName
          ? workbook.SheetNames.indexOf(nr.sheetName)
          : undefined,
    });
  }

  const buffer = XLSX.write(workbook, { type: "buffer" }) as Buffer;
  return buffer;
}

export function writeXLSXBytes(spec: XLSXWorkbookSpec): Uint8Array {
  const buffer = writeXLSXBuffer(spec);
  return new Uint8Array(buffer);
}

export async function computeXLSXHash(spec: XLSXWorkbookSpec): Promise<Sha256> {
  const bytes = writeXLSXBytes(spec);
  return (await hashTyped(
    { xlsx: Array.from(bytes) },
    { typeName: "XLSXPayload" },
  )) as Sha256;
}
