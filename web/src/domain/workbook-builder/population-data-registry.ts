export interface PopulationDataRegistry {
  resolve(sourceTab: string, sourceField: string): readonly unknown[];
  tabs(): readonly string[];
  fields(tab: string): readonly string[];
  recordCount(tab: string): number;
}

export function createPopulationDataRegistry(
  data: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>>,
): PopulationDataRegistry {
  return {
    resolve(sourceTab, sourceField) {
      return data.get(sourceTab)?.get(sourceField) ?? [];
    },
    tabs() {
      return [...data.keys()].sort();
    },
    fields(tab) {
      return [...(data.get(tab)?.keys() ?? [])].sort();
    },
    recordCount(tab) {
      const fields = data.get(tab);
      if (fields === undefined) return 0;
      let max = 0;
      for (const values of fields.values()) {
        if (values.length > max) max = values.length;
      }
      return max;
    },
  };
}

export function parseCsvToRegistry(
  csvText: string,
  tabName: string,
): PopulationDataRegistry {
  const lines = csvText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return createPopulationDataRegistry(new Map());
  }

  const headerLine = lines[0];
  if (headerLine === undefined) {
    return createPopulationDataRegistry(new Map());
  }

  const headers = parseCsvLine(headerLine);
  const data = new Map<string, Map<string, unknown[]>>();
  const fieldColumns = new Map<string, unknown[]>();

  for (const header of headers) {
    fieldColumns.set(header, []);
  }

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    headers.forEach((header, j) => {
      const column = fieldColumns.get(header);
      if (column !== undefined) {
        column.push(j < values.length ? values[j] : null);
      }
    });
  }

  data.set(tabName, fieldColumns);
  return createPopulationDataRegistry(data);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export function registryToPopulationData(
  registry: PopulationDataRegistry,
): ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>> {
  const result = new Map<string, Map<string, readonly unknown[]>>();
  for (const tab of registry.tabs()) {
    const fields = new Map<string, readonly unknown[]>();
    for (const field of registry.fields(tab)) {
      fields.set(field, registry.resolve(tab, field));
    }
    result.set(tab, fields);
  }
  return result;
}
