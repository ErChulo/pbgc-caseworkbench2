import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import type { V1Architecture } from "./models";

export interface ArchitectureFormulaTargetConflict {
  readonly tabName: string;
  readonly cellAddress: string;
  readonly formulas: readonly {
    readonly cellKey: string;
    readonly genericField: string;
    readonly scenarioId: string;
  }[];
}

/** Report overlaps in the existing architecture; never rename sheets or formulas. */
export function findArchitectureFormulaTargetConflicts(
  architecture: V1Architecture,
): readonly ArchitectureFormulaTargetConflict[] {
  const compare = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  const targets = new Map<
    string,
    {
      tabName: string;
      cellAddress: string;
      formulas: { cellKey: string; genericField: string; scenarioId: string }[];
    }
  >();
  for (const cell of architecture.cells.values()) {
    if (!cell.hasFormula || !cell.formulaText?.trim()) continue;
    const address = normalizeCellAddress(cell.cellAddress)?.replaceAll("$", "");
    if (address === undefined) continue;
    for (const run of architecture.runs) {
      const classification = cell.perRunClassification.get(run.runId);
      if (classification?.iob !== "O" && classification?.iob !== "B") continue;
      const key = JSON.stringify([cell.sourceTab.toUpperCase(), address]);
      const target = targets.get(key) ?? {
        tabName: cell.sourceTab,
        cellAddress: address,
        formulas: [],
      };
      if (compare(cell.sourceTab, target.tabName) < 0)
        target.tabName = cell.sourceTab;
      target.formulas.push({
        cellKey: cell.key,
        genericField: cell.genericField,
        scenarioId: run.runId,
      });
      targets.set(key, target);
    }
  }
  return [...targets.values()]
    .filter((target) => target.formulas.length > 1)
    .map((target) => ({
      ...target,
      formulas: [...target.formulas].sort(
        (a, b) =>
          compare(a.scenarioId, b.scenarioId) || compare(a.cellKey, b.cellKey),
      ),
    }))
    .sort(
      (a, b) =>
        compare(a.tabName.toUpperCase(), b.tabName.toUpperCase()) ||
        compare(a.cellAddress, b.cellAddress),
    );
}
