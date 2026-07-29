import * as XLSX from "xlsx";
import { unzipSync } from "fflate";

import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";
import { inspectOoxmlPartNames } from "../screening/ooxml-risk";

export interface WorkbookCellObservation {
  readonly sheet: string;
  readonly address: string;
  readonly storedValue: unknown;
  readonly formulaText: string | null;
  readonly cellType: string | null;
}

export function parseWorkbookPassive(bytes: Uint8Array): PassiveExtraction {
  try {
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellFormula: true,
      cellStyles: true,
      cellDates: false,
      raw: true,
    });
    const cells: WorkbookCellObservation[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      for (const [address, candidate] of (
        Object.entries(sheet) as [string, unknown][]
      )
        .filter(([key]) => !key.startsWith("!"))
        .sort(([left], [right]) => left.localeCompare(right))) {
        if (!isCell(candidate)) continue;
        const cell = candidate;
        cells.push({
          sheet: sheetName,
          address,
          storedValue: cell.v ?? null,
          formulaText: cell.f ?? null,
          cellType: cell.t ?? null,
        });
      }
    }
    let names: string[] = [];
    try {
      names = Object.keys(unzipSync(bytes));
    } catch {
      // Legacy XLS is not a ZIP container; SheetJS still reads its stored values passively.
    }
    const risk = inspectOoxmlPartNames(names);
    const formulaCount = cells.filter(
      (cell) => cell.formulaText !== null,
    ).length;
    return Object.freeze({
      parserId: "workbook-passive",
      parserVersion: "1.0.0",
      status: risk.blocked ? "partial" : "success",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      metadata: Object.freeze({
        sheetCount: workbook.SheetNames.length,
        formulaCount,
        hiddenSheetCount: (workbook.Workbook?.Sheets ?? []).filter(
          (sheet) => (sheet.Hidden ?? 0) !== 0,
        ).length,
      }),
      rawValues: Object.freeze(cells),
      limitations: Object.freeze([
        "Stored cell values and formula text were recorded; formulas, links, and macros were not executed.",
      ]),
      riskIndicators: Object.freeze(risk.indicators),
    });
  } catch {
    return failedPassiveExtraction(
      "workbook-passive",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "unreadable",
      "Workbook is corrupt, encrypted, or unsupported; no repair was attempted.",
    );
  }
}

function isCell(value: unknown): value is {
  readonly v?: unknown;
  readonly f?: string;
  readonly t?: string;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
