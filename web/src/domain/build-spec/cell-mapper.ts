import type { V1Architecture } from "../architecture/models";
import type { CellMapping, DataSourceReference } from "./models";
import { deterministicUuid, formulaIdentity } from "./identity";
import { compareCodePoint } from "./identity";

export async function generateCellMappings(config: {
  readonly architecture: V1Architecture;
}): Promise<readonly CellMapping[]> {
  const mappings: CellMapping[] = [];
  const sourceTabs = new Map(
    config.architecture.sourceTabs.map((tab) => [tab.tabName, tab]),
  );
  // A column's header cell is a label, not a data cell. When a formula cell
  // already represents the same field in a tab, mapping the header as well
  // would duplicate the field identity and demand a formula from a cell that
  // carries none, so label cells are mapped only for fields that have no
  // formula-bearing cell.
  const fieldsWithFormula = new Map<string, Set<string>>();
  for (const cell of config.architecture.cells.values()) {
    if (!cell.hasFormula || !cell.formulaText?.trim()) continue;
    const fields = fieldsWithFormula.get(cell.sourceTab) ?? new Set<string>();
    fields.add(cell.genericField);
    fieldsWithFormula.set(cell.sourceTab, fields);
  }
  for (const run of [...config.architecture.runs].sort((a, b) =>
    compareCodePoint(a.runId, b.runId),
  )) {
    for (const cell of [...config.architecture.cells.values()].sort((a, b) =>
      compareCodePoint(a.key, b.key),
    )) {
      const classification = cell.perRunClassification.get(run.runId);
      if (!classification) continue;
      if (
        !cell.hasFormula &&
        (fieldsWithFormula.get(cell.sourceTab)?.has(cell.genericField) ?? false)
      )
        continue;
      const hasObservedFormula =
        cell.hasFormula && Boolean(cell.formulaText?.trim());
      const hasInput = classification.iob === "I" || classification.iob === "B";
      const tab = sourceTabs.get(cell.sourceTab);
      const dataSource: DataSourceReference | null =
        hasInput && tab?.role === "population"
          ? {
              sourceType: "population",
              sourceTab: cell.sourceTab,
              sourceField: cell.genericField,
              evidenceKey: null,
            }
          : null;
      mappings.push({
        mappingId: await deterministicUuid("BuildSpecCellMapping", {
          architectureContentSha256:
            config.architecture.architectureContentSha256,
          scenarioId: run.runId,
          cellKey: cell.key,
        }),
        field: cell.genericField,
        tabName: cell.sourceTab,
        cellAddress: cell.cellAddress,
        iobClassification: classification.iob,
        dataSource,
        formulaId:
          hasObservedFormula &&
          (classification.iob === "O" || classification.iob === "B")
            ? formulaIdentity(cell.key, run.runId)
            : null,
        scenarioId: run.runId,
      });
    }
  }
  return mappings.sort((a, b) => compareCodePoint(a.mappingId, b.mappingId));
}
