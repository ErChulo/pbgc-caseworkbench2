import * as XLSX from "xlsx";
import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type { V1Workbook, WorkbookSheet, WorkbookCell } from "./models";
import { validateCalculationSheetNames } from "./sheet-policy";
import {
  canonicalCellReference,
  normalizeCellAddress,
} from "../formula-compiler/reference-codec";

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
  readonly formulas?: readonly {
    readonly address: string;
    readonly formulaText: string;
  }[];
}

export interface XLSXNamedRange {
  readonly name: string;
  readonly scope: "workbook" | "sheet";
  readonly sheetName: string | null;
  readonly reference: string;
}

export function buildXLSXSpec(workbook: V1Workbook): XLSXWorkbookSpec {
  const sheetErrors = validateCalculationSheetNames(
    workbook.sheets.map((sheet) => sheet.name),
  );
  if (sheetErrors.length > 0)
    throw new Error("Workbook contains prohibited or conflicting sheet names.");
  const summarySheet = buildSummarySheet(workbook);
  const tablesSheet = buildTablesSheet(workbook);
  const udTableSheet = buildUDTableSheet(workbook);

  const sheetNames = new Set([
    "Summary",
    "Tables",
    "UD Table",
    ...workbook.sheets.map((sheet) => sheet.name),
  ]);
  if (workbook.namedRanges.some((range) => !sheetNames.has(range.tabName))) {
    throw new Error("A named range refers to a missing sheet.");
  }
  const rangeKeys = new Set<string>();
  for (const range of workbook.namedRanges) {
    const scope =
      range.scope === "sheet"
        ? `sheet:${range.tabName.toUpperCase()}`
        : "workbook";
    const key = `${scope}\u0000${range.rangeName.toUpperCase()}`;
    if (rangeKeys.has(key))
      throw new Error("Named range scope and name must be unique.");
    rangeKeys.add(key);
  }

  const calcSheets: XLSXSheet[] = workbook.sheets.map((sheet) => ({
    name: sheet.name,
    hidden: sheet.hidden,
    rows: buildCalcSheetRows(sheet),
    formulas: sheet.cells
      .filter((cell) => cell.kind === "formula")
      .map((cell) => {
        const address = normalizedAddress(cell.address);
        if (
          cell.formulaText === null ||
          !cell.formulaText.startsWith("=") ||
          cell.formulaText.slice(1).trim() === ""
        ) {
          throw new Error(
            "Formula cells require a nonempty Excel formula starting with equals.",
          );
        }
        if (cell.value !== null && cell.value !== undefined) {
          throw new Error(
            "A cell cannot contain both a formula and an input value without an approved mapping.",
          );
        }
        return { address, formulaText: cell.formulaText };
      }),
  }));

  return {
    sheets: [summarySheet, tablesSheet, udTableSheet, ...calcSheets],
    namedRanges: workbook.namedRanges.map((nr) => ({
      name: nr.rangeName,
      scope: nr.scope,
      sheetName: nr.scope === "sheet" ? nr.tabName : null,
      reference: canonicalCellReference(
        nr.tabName,
        requireValidAddress(nr.cellAddress),
      ),
    })),
  };
}

function buildCalcSheetRows(
  sheet: WorkbookSheet,
): readonly (readonly (string | number | boolean | null)[])[] {
  const rows: (readonly (string | number | boolean | null)[])[] = [];

  const cellMap = new Map<string, WorkbookCell>();
  for (const cell of sheet.cells) {
    const address = normalizedAddress(cell.address);
    if (cellMap.has(address))
      throw new Error("Workbook contains duplicate cell addresses.");
    cellMap.set(address, cell);
  }

  let maxRow = 0;
  let maxCol = 0;
  for (const address of cellMap.keys()) {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (match) {
      const rowNum = parseInt(match[2] ?? "0", 10);
      const colNum = columnToIndex(match[1] ?? "A");
      if (rowNum > maxRow) maxRow = rowNum;
      if (colNum > maxCol) maxCol = colNum;
    }
  }

  // The current array-based serializer must not allocate an unbounded sparse grid.
  if (maxRow * (maxCol + 1) > 2_000_000) {
    throw new Error(
      "Worksheet exceeds the bounded export grid. Use a smaller workbook until sparse serialization is supported.",
    );
  }

  for (let r = 1; r <= maxRow; r++) {
    const row: (string | number | boolean | null)[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const addr = `${indexToColumn(c)}${String(r)}`;
      const cell = cellMap.get(addr);
      if (cell) {
        if (cell.kind === "formula") {
          row.push(null);
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
    ["Workbook Content Hash", workbook.workbookContentSha256],
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

function requireValidAddress(address: string): string {
  const normalized = normalizeCellAddress(address);
  if (normalized === null)
    throw new Error("Workbook contains an invalid cell address.");
  return normalized;
}

function normalizedAddress(address: string): string {
  return requireValidAddress(address).replaceAll("$", "");
}

export function writeXLSXBuffer(spec: XLSXWorkbookSpec): Buffer {
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Author: "PBGC CaseWorkBench",
    CreatedDate: new Date(0),
  };

  for (const sheet of spec.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows as never[][]);
    for (const formula of sheet.formulas ?? []) {
      const address = normalizedAddress(formula.address);
      if (
        !formula.formulaText.startsWith("=") ||
        formula.formulaText.slice(1).trim() === ""
      ) {
        throw new Error(
          "Formula cells require a nonempty Excel formula starting with equals.",
        );
      }
      if (ws[address] !== undefined)
        throw new Error("A formula cannot overwrite an existing value.");
      // A stub formula has no cached value: never invent a numeric zero.
      ws[address] = { t: "z", f: formula.formulaText.slice(1) };
      const point = XLSX.utils.decode_cell(address);
      const range = ws["!ref"]
        ? XLSX.utils.decode_range(ws["!ref"])
        : { s: point, e: point };
      range.s.r = Math.min(range.s.r, point.r);
      range.s.c = Math.min(range.s.c, point.c);
      range.e.r = Math.max(range.e.r, point.r);
      range.e.c = Math.max(range.e.c, point.c);
      ws["!ref"] = XLSX.utils.encode_range(range);
    }
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
    workbook.Workbook ??= {};
    workbook.Workbook.Sheets ??= [];
    workbook.Workbook.Sheets.push({
      name: sheet.name,
      Hidden: sheet.hidden ? 1 : 0,
    });
  }

  for (const nr of spec.namedRanges) {
    workbook.Workbook ??= {};
    workbook.Workbook.Names ??= [];
    const sheetIndex =
      nr.scope === "sheet" && nr.sheetName !== null
        ? workbook.SheetNames.indexOf(nr.sheetName)
        : -1;
    if (nr.scope === "sheet" && sheetIndex < 0)
      throw new Error("Sheet-scoped name refers to a missing sheet.");
    workbook.Workbook.Names.push({
      Name: nr.name,
      Ref: nr.reference,
      Sheet: nr.scope === "sheet" ? sheetIndex : undefined,
    });
  }

  // SheetJS writes with type "buffer" only when a Node runtime is detected;
  // in the browser build the same call falls through to the "array" branch
  // and returns a Uint8Array, so this function is safe in both runtimes even
  // though the Node-side type is Buffer.
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
