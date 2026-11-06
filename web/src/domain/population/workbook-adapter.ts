import type { PassiveExtraction } from "../../adapters/parsers/passive-result";
import type { WorkbookCellObservation } from "../../adapters/parsers/workbook-parser";
import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import { classifyRawValue, type RawValueKind } from "./tabular-adapter";

export interface PopulationWorkbookCell extends WorkbookCellObservation {
  readonly kind: RawValueKind;
}

export interface PopulationWorkbookSheet {
  readonly name: string;
  readonly hidden: boolean;
  readonly cells: readonly PopulationWorkbookCell[];
}

export interface WorkbookPopulationProfile {
  readonly status: "profiled" | "blocked";
  readonly sheets: readonly PopulationWorkbookSheet[];
  readonly formulaExecutionCount: 0;
  readonly limitations: readonly string[];
}

export interface WorkbookNamedRangeObservation {
  readonly name: string;
  readonly sourceTab: string;
  readonly cellAddress: string;
  readonly definitionSheet: string | null;
}

export async function workbookProfileContentHash(
  workbook: WorkbookPopulationProfile,
  namedRanges: readonly WorkbookNamedRangeObservation[],
): Promise<Sha256> {
  const parsed = parseSha256(
    await hashTyped(
      {
        workbook,
        namedRanges: [...namedRanges].sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.sourceTab.localeCompare(right.sourceTab) ||
            left.cellAddress.localeCompare(right.cellAddress) ||
            String(left.definitionSheet).localeCompare(
              String(right.definitionSheet),
            ),
        ),
      },
      { typeName: "WorkbookPopulationProfile" },
    ),
  );
  if (!parsed.ok)
    throw new Error("Workbook profile SHA-256 computation failed.");
  return parsed.value;
}

export function adaptWorkbookExtraction(
  extraction: PassiveExtraction,
): WorkbookPopulationProfile {
  if (
    extraction.parserId !== "workbook-passive" ||
    extraction.status !== "success"
  ) {
    return Object.freeze({
      status: "blocked",
      sheets: Object.freeze([]),
      formulaExecutionCount: 0,
      limitations: Object.freeze([
        ...extraction.limitations,
        "Workbook profiling requires a successful passive workbook extraction.",
      ]),
    });
  }
  const inventory = readSheetInventory(extraction.metadata.sheetInventoryJson);
  const cells = extraction.rawValues.filter(isWorkbookCell);
  if (
    inventory === null ||
    cells.length !== extraction.rawValues.length ||
    !validCells(cells, inventory) ||
    extraction.metadata.sheetCount !== inventory.length ||
    extraction.metadata.hiddenSheetCount !==
      inventory.filter((sheet) => sheet.hidden).length
  ) {
    return Object.freeze({
      status: "blocked",
      sheets: Object.freeze([]),
      formulaExecutionCount: 0,
      limitations: Object.freeze([
        ...extraction.limitations,
        "Sheet identity or visibility is missing or inconsistent; re-inspect the workbook.",
      ]),
    });
  }
  return Object.freeze({
    status: "profiled",
    sheets: Object.freeze(
      inventory.map(({ name, hidden }) =>
        Object.freeze({
          name,
          hidden,
          cells: Object.freeze(
            cells
              .filter((cell) => cell.sheet === name)
              .map((cell) =>
                Object.freeze({
                  ...cell,
                  kind:
                    cell.formulaText === null
                      ? classifyRawValue(cell.storedValue)
                      : "formula-text",
                }),
              ),
          ),
        }),
      ),
    ),
    formulaExecutionCount: 0,
    limitations: Object.freeze([...extraction.limitations]),
  });
}

function readSheetInventory(
  value: unknown,
): readonly { readonly name: string; readonly hidden: boolean }[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const result: { name: string; hidden: boolean }[] = [];
    const names = new Set<string>();
    for (const item of parsed as unknown[]) {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        return null;
      const sheet = item as Record<string, unknown>;
      if (
        typeof sheet.name !== "string" ||
        sheet.name.length === 0 ||
        typeof sheet.hidden !== "boolean"
      )
        return null;
      const identity = sheet.name.toUpperCase();
      if (names.has(identity)) return null;
      names.add(identity);
      result.push({ name: sheet.name, hidden: sheet.hidden });
    }
    return result;
  } catch {
    return null;
  }
}

function validCells(
  cells: readonly WorkbookCellObservation[],
  inventory: readonly { readonly name: string; readonly hidden: boolean }[],
): boolean {
  const sheets = new Set(inventory.map((sheet) => sheet.name));
  const seen = new Set<string>();
  for (const cell of cells) {
    const address = normalizeCellAddress(cell.address);
    if (!sheets.has(cell.sheet) || address === null) return false;
    const key = `${cell.sheet.toUpperCase()}\u0000${address.replaceAll("$", "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function isWorkbookCell(value: unknown): value is WorkbookCellObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sheet === "string" &&
    typeof record.address === "string" &&
    Object.prototype.hasOwnProperty.call(record, "storedValue") &&
    (typeof record.formulaText === "string" || record.formulaText === null) &&
    (typeof record.cellType === "string" || record.cellType === null)
  );
}
