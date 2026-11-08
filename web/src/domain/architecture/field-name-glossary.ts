import type { FieldNameGlossaryEntry } from "./models";

export interface FieldNameGlossary {
  readonly entries: readonly FieldNameGlossaryEntry[];
  resolve(fieldDescription: string, tabContext?: string): string | null;
  reverse(genericField: string, tabContext?: string): readonly string[];
}

function normalize(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function mapGenericField(
  workbookDescription: string,
  tabContext: string,
  entries: readonly FieldNameGlossaryEntry[],
): string | null {
  const description = normalize(workbookDescription);
  const tab = normalize(tabContext);
  if (description === "") return null;
  const contextual = entries.filter(
    (entry) => entry.tabContext !== null && normalize(entry.tabContext) === tab,
  );
  const global = entries.filter((entry) => entry.tabContext === null);
  const applicable = contextual.some((entry) =>
    description.includes(normalize(entry.workbookPattern)),
  )
    ? contextual
    : global;
  const exact = applicable.filter(
    (entry) => normalize(entry.workbookPattern) === description,
  );
  const matches =
    exact.length > 0
      ? exact
      : applicable.filter((entry) =>
          description.includes(normalize(entry.workbookPattern)),
        );
  const genericFields = new Set(matches.map((entry) => entry.genericField));
  return genericFields.size === 1 ? ([...genericFields][0] ?? null) : null;
}

export function createFieldNameGlossary(
  entries: readonly FieldNameGlossaryEntry[],
): FieldNameGlossary {
  return {
    entries,
    resolve(fieldDescription: string, tabContext = ""): string | null {
      return mapGenericField(fieldDescription, tabContext, entries);
    },
    reverse(genericField: string, tabContext = ""): readonly string[] {
      const tab = normalize(tabContext);
      return entries
        .filter(
          (entry) =>
            entry.genericField === genericField &&
            (entry.tabContext === null || normalize(entry.tabContext) === tab),
        )
        .map((entry) => entry.workbookPattern);
    },
  };
}
