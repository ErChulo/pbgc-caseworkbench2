import type {
  FormulaDefinitionV2,
  CellMapping,
  ExecutionOrder,
} from "../build-spec/models";
import type { FormulaCell, WorkbookCell } from "./models";
import type { PopulationDataResolver } from "./population-data-resolver";
import { resolveCellValue } from "./population-data-resolver";

export interface FormulaSheetInput {
  readonly formulas: readonly FormulaDefinitionV2[];
  readonly executionOrder: ExecutionOrder;
}

export interface FormulaSheetResult {
  readonly formulaCells: readonly FormulaCell[];
  readonly cellsByTab: ReadonlyMap<string, readonly WorkbookCell[]>;
}

export function generateFormulaCells(
  input: FormulaSheetInput,
): FormulaSheetResult {
  const formulaMap = new Map<string, FormulaDefinitionV2>();
  for (const formula of input.formulas) {
    formulaMap.set(formula.formulaId, formula);
  }

  const orderedFormulas = input.executionOrder.order
    .map((id) => formulaMap.get(id))
    .filter((f): f is FormulaDefinitionV2 => f !== undefined);

  const formulaCells: FormulaCell[] = [];
  for (let index = 0; index < orderedFormulas.length; index++) {
    const formula = orderedFormulas[index];
    if (formula === undefined) continue;
    formulaCells.push({
      cellAddress: formula.cellAddress,
      tabName: formula.tabName,
      formulaText: formula.formulaText,
      formulaId: formula.formulaId,
      dependencies: formula.dependencies
        .map((depId) => formulaMap.get(depId))
        .filter((f): f is FormulaDefinitionV2 => f !== undefined)
        .map((dep) => ({
          cellAddress: dep.cellAddress,
          tabName: dep.tabName,
          formulaText: dep.formulaText,
          formulaId: dep.formulaId,
          dependencies: [],
          executionOrder: input.executionOrder.order.indexOf(dep.formulaId),
          executionLevel: 0,
        })),
      executionOrder: index,
      executionLevel: computeLevel(formula, formulaMap, new Map()),
    });
  }

  const cellsByTab = new Map<string, WorkbookCell[]>();
  for (const fc of formulaCells) {
    const existing = cellsByTab.get(fc.tabName) ?? [];
    existing.push({
      address: fc.cellAddress,
      kind: "formula",
      formulaText: fc.formulaText,
      value: null,
      dataSource: null,
      mappingId: null,
    });
    cellsByTab.set(fc.tabName, existing);
  }

  return { formulaCells, cellsByTab };
}

function computeLevel(
  formula: FormulaDefinitionV2,
  formulaMap: Map<string, FormulaDefinitionV2>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(formula.formulaId);
  if (cached !== undefined) return cached;

  if (formula.dependencies.length === 0) {
    cache.set(formula.formulaId, 0);
    return 0;
  }

  let maxDepLevel = 0;
  for (const depId of formula.dependencies) {
    const dep = formulaMap.get(depId);
    if (dep !== undefined) {
      const level = computeLevel(dep, formulaMap, cache);
      if (level > maxDepLevel) maxDepLevel = level;
    }
  }

  const level = maxDepLevel + 1;
  cache.set(formula.formulaId, level);
  return level;
}

export function populateDataCells(
  cellMappings: readonly CellMapping[],
  resolver?: PopulationDataResolver,
): ReadonlyMap<string, readonly WorkbookCell[]> {
  const cellsByTab = new Map<string, WorkbookCell[]>();
  const rowIndexes = new Map<string, number>();

  for (const mapping of cellMappings) {
    const existing = cellsByTab.get(mapping.tabName) ?? [];
    const kind: WorkbookCell["kind"] =
      mapping.iobClassification === "I"
        ? "input"
        : mapping.iobClassification === "B"
          ? "output"
          : mapping.iobClassification === "O"
            ? "output"
            : "blank";

    let value: unknown = null;
    if (resolver && mapping.dataSource) {
      const key = `${mapping.dataSource.sourceTab}::${mapping.dataSource.sourceField}`;
      const rowIndex = rowIndexes.get(key) ?? 0;
      value = resolveCellValue(resolver, mapping.dataSource, rowIndex);
      rowIndexes.set(key, rowIndex + 1);
    }

    let dataSourceMetadata: import("./models").PopulationDataSource | null =
      null;
    if (mapping.dataSource) {
      const sourceValues =
        resolver?.resolve(
          mapping.dataSource.sourceTab,
          mapping.dataSource.sourceField,
        ) ?? [];
      dataSourceMetadata = {
        sourceTab: mapping.dataSource.sourceTab,
        columnIdentifier: mapping.dataSource.sourceField,
        rowRange: { start: 0, count: sourceValues.length },
        recordCount: sourceValues.length,
        recordHash: "0".repeat(64) as import("../shared/types").Sha256,
      };
    }

    existing.push({
      address: mapping.cellAddress,
      kind,
      formulaText: null,
      value,
      dataSource: dataSourceMetadata,
      mappingId: mapping.mappingId,
    });
    cellsByTab.set(mapping.tabName, existing);
  }

  return cellsByTab;
}

export function mergeSheetCells(
  ...sources: readonly ReadonlyMap<string, readonly WorkbookCell[]>[]
): ReadonlyMap<string, readonly WorkbookCell[]> {
  const merged = new Map<string, Map<string, WorkbookCell>>();
  for (const source of sources) {
    for (const [tabName, cells] of source) {
      let tab = merged.get(tabName);
      if (tab === undefined) {
        tab = new Map();
        merged.set(tabName, tab);
      }
      for (const cell of cells) {
        const existing = tab.get(cell.address);
        if (existing === undefined) {
          tab.set(cell.address, cell);
        } else {
          tab.set(cell.address, {
            address: existing.address,
            kind: existing.kind === "blank" ? cell.kind : existing.kind,
            formulaText: existing.formulaText ?? cell.formulaText,
            value: existing.value !== null ? existing.value : cell.value,
            dataSource: existing.dataSource ?? cell.dataSource,
            mappingId: existing.mappingId ?? cell.mappingId,
          });
        }
      }
    }
  }

  const result = new Map<string, readonly WorkbookCell[]>();
  for (const [tabName, cellMap] of merged) {
    result.set(tabName, [...cellMap.values()]);
  }
  return result;
}
