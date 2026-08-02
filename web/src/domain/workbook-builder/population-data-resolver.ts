import type { DataSourceReference } from "../build-spec/models";

export interface PopulationDataResolver {
  resolve(sourceTab: string, columnIdentifier: string): readonly unknown[];
}

export function createPopulationDataResolver(
  data: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>>,
): PopulationDataResolver {
  return {
    resolve(sourceTab, columnIdentifier) {
      return data.get(sourceTab)?.get(columnIdentifier) ?? [];
    },
  };
}

export function resolveCellValue(
  resolver: PopulationDataResolver,
  dataSource: DataSourceReference,
  rowIndex: number,
): unknown {
  const values = resolver.resolve(
    dataSource.sourceTab,
    dataSource.sourceField,
  );
  return rowIndex < values.length ? values[rowIndex] : null;
}
