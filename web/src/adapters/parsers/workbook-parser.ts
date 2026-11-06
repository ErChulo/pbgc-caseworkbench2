import * as XLSX from "xlsx";
import { unzipSync } from "fflate";

import {
  failedPassiveExtraction,
  type PassiveExtraction,
} from "./passive-result";
import {
  inspectOoxmlPartNames,
  inspectOoxmlRelationships,
} from "../screening/ooxml-risk";
import { assertUniqueArchivePaths } from "./archive-path";

export interface WorkbookCellObservation {
  readonly sheet: string;
  readonly address: string;
  readonly storedValue: unknown;
  readonly formulaText: string | null;
  readonly cellType: string | null;
}

export function parseWorkbookPassive(bytes: Uint8Array): PassiveExtraction {
  try {
    const packageRisk = inspectWorkbookContainer(bytes);
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
    const sheetProperties = workbook.Workbook?.Sheets;
    const sheetInventory = workbook.SheetNames.map((name, index) => {
      const properties = sheetProperties?.[index];
      const hidden = properties?.Hidden;
      return {
        name,
        hidden:
          sheetProperties?.length !== workbook.SheetNames.length ||
          properties === undefined ||
          (properties.name !== undefined && properties.name !== name) ||
          (hidden !== 0 && hidden !== 1 && hidden !== 2)
            ? null
            : hidden !== 0,
      };
    });
    const formulaCount = cells.filter(
      (cell) => cell.formulaText !== null,
    ).length;
    return Object.freeze({
      parserId: "workbook-passive",
      parserVersion: "1.3.0",
      status: packageRisk.length > 0 ? "partial" : "success",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      metadata: Object.freeze({
        sheetCount: workbook.SheetNames.length,
        formulaCount,
        sheetInventoryJson: JSON.stringify(sheetInventory),
        definedNamesJson: JSON.stringify(
          (workbook.Workbook?.Names ?? []).map((name) => ({
            name: name.Name,
            reference: name.Ref,
            scopeIndex: name.Sheet ?? null,
          })),
        ),
        hiddenSheetCount: (workbook.Workbook?.Sheets ?? []).filter(
          (sheet) => (sheet.Hidden ?? 0) !== 0,
        ).length,
      }),
      rawValues: Object.freeze(cells),
      limitations: Object.freeze([
        "Stored cell values and formula text were recorded; formulas, links, and macros were not executed.",
      ]),
      riskIndicators: Object.freeze(packageRisk),
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

/** Inspect ZIP metadata before handing it to the workbook parser. */
function inspectWorkbookContainer(bytes: Uint8Array): string[] {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return ["legacy-container-unverified"];
  const names: string[] = [];
  let totalExpanded = 0;
  const parts = unzipSync(bytes, {
    filter(part) {
      names.push(part.name);
      totalExpanded += part.originalSize;
      if (
        names.length > 10_000 ||
        !Number.isSafeInteger(totalExpanded) ||
        totalExpanded > 512 * 1024 * 1024 ||
        part.originalSize < 0 ||
        part.size < 0 ||
        (part.name.toLowerCase().endsWith(".rels") &&
          part.originalSize > 4 * 1024 * 1024)
      )
        throw new Error("Workbook package exceeds inspection limits.");
      return part.name.toLowerCase().endsWith(".rels");
    },
  });
  // Ignore explicit directory entries, which do not contain document content.
  const fileNames = names.filter((name) => !name.endsWith("/"));
  assertUniqueArchivePaths(fileNames);
  if (
    ![
      "[Content_Types].xml",
      "xl/workbook.xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
    ].every((name) => fileNames.includes(name))
  )
    throw new Error("Workbook package is missing required OOXML parts.");
  const seen = new Set<string>();
  for (const name of fileNames) {
    const key = name.normalize("NFC").toLowerCase();
    if (seen.has(key))
      throw new Error("Workbook package has ambiguous part names.");
    seen.add(key);
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const relationshipXml = Object.keys(parts)
    .sort()
    .map((name) => decoder.decode(parts[name]));
  return [
    ...inspectOoxmlPartNames(fileNames).indicators,
    ...inspectOoxmlRelationships(relationshipXml).indicators,
  ];
}

function isCell(value: unknown): value is {
  readonly v?: unknown;
  readonly f?: string;
  readonly t?: string;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
