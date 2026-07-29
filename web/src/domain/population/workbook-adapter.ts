import type { PassiveExtraction } from "../../adapters/parsers/passive-result";
import type { WorkbookCellObservation } from "../../adapters/parsers/workbook-parser";
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
  const cells = extraction.rawValues.filter(
    isWorkbookCell,
  ) as readonly WorkbookCellObservation[];
  const names = [...new Set(cells.map((cell) => cell.sheet))];
  const hiddenCount =
    typeof extraction.metadata.hiddenSheetCount === "number"
      ? extraction.metadata.hiddenSheetCount
      : 0;
  return Object.freeze({
    status: "profiled",
    sheets: Object.freeze(
      names.map((name, index) =>
        Object.freeze({
          name,
          hidden: index >= Math.max(0, names.length - hiddenCount),
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

function isWorkbookCell(value: unknown): value is WorkbookCellObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sheet === "string" &&
    typeof record.address === "string" &&
    (typeof record.formulaText === "string" || record.formulaText === null) &&
    (typeof record.cellType === "string" || record.cellType === null)
  );
}
