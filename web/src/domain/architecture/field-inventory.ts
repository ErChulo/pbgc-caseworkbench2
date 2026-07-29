import type { CreateUnresolvedItemInput } from "../plan-rules/unresolved-items";
import { unresolvedItemEmitters } from "../plan-rules/unresolved-items";
import type { Interpretation } from "../plan-rules/models";
import { parseUuid } from "../shared/types";
import type {
  CellDescriptor,
  NamedRange,
  RunDescriptor,
  SourceTab,
} from "./models";
import type { FieldNameGlossary } from "./field-name-glossary";
import type {
  ArchitecturePopulation,
  ArchitecturePopulationCandidate,
} from "./tab-selector";

export interface FieldInventoryOutcome {
  readonly cells: ReadonlyMap<string, CellDescriptor>;
  readonly unresolvedItems: readonly CreateUnresolvedItemInput[];
}

export function buildFieldInventory(input: {
  readonly tabs: readonly SourceTab[];
  readonly scenarios: readonly RunDescriptor[];
  readonly population: ArchitecturePopulation;
  readonly glossary: FieldNameGlossary;
}): FieldInventoryOutcome {
  const cells = new Map<string, CellDescriptor>();
  const unresolvedItems: CreateUnresolvedItemInput[] = [];
  const conflictedTabIdentities = duplicateTabIdentities(input.tabs);
  for (const identity of conflictedTabIdentities)
    unresolvedItems.push(tabCollision(identity));
  const sources = input.tabs
    .filter((tab) => !conflictedTabIdentities.has(normalize(tab.tabName)))
    .flatMap((tab) => {
      const binding = bindingFor(tab, input.population);
      const sheet = binding?.workbook.sheets.find(
        (candidate) => candidate.name === tab.tabName,
      );
      return binding === undefined || sheet === undefined
        ? []
        : [{ tab, binding, sheet, support: tab.role === "support" }];
    });
  for (const { tab, binding, sheet, support } of sources.sort((left, right) =>
    left.tab.tabName.localeCompare(right.tab.tabName),
  )) {
    const observed = new Set(binding.candidate.observedFields.map(normalize));
    const namedAddresses = new Set(
      (binding.namedRanges ?? [])
        .filter((range) => range.sourceTab === sheet.name)
        .map((range) => range.cellAddress),
    );
    for (const cell of [...sheet.cells].sort((left, right) =>
      left.address.localeCompare(right.address),
    )) {
      const header = /^[A-Z]+1$/u.test(cell.address);
      const formula = cell.formulaText !== null;
      const storedDescription = displayPrimitive(cell.storedValue);
      const description = formula
        ? formulaDescription(sheet.cells, cell.address)
        : storedDescription;
      const mapped = input.glossary.resolve(description, tab.tabName);
      const relevantSupport =
        support &&
        (formula || namedAddresses.has(cell.address) || mapped !== null);
      if (
        !formula &&
        !relevantSupport &&
        !(header && observed.has(normalize(description)))
      )
        continue;
      const genericField = mapped;
      if (genericField === null) {
        unresolvedItems.push(unmapped(tab, cell.address, description));
        if (!formula) continue;
      }
      const key = `${tab.tabName}::${cell.address}`;
      cells.set(key, {
        key,
        sourceTab: tab.tabName,
        cellAddress: cell.address,
        genericField: genericField ?? description,
        description,
        hasFormula: cell.formulaText !== null,
        formulaText: cell.formulaText,
        perRunClassification: new Map(),
      });
    }
  }
  return { cells, unresolvedItems };
}

function formulaDescription(
  cells: readonly { readonly address: string; readonly storedValue: unknown }[],
  address: string,
): string {
  const column = /^[A-Z]+/u.exec(address)?.[0];
  if (column === undefined) return "";
  const header = cells.find((cell) => cell.address === `${column}1`);
  return header === undefined ? "" : displayPrimitive(header.storedValue);
}

export function extractNamedRanges(
  tabs: readonly SourceTab[],
  population: ArchitecturePopulation,
  glossary: FieldNameGlossary,
): readonly NamedRange[] {
  const ranges: NamedRange[] = [];
  const conflictedTabIdentities = duplicateTabIdentities(tabs);
  for (const tab of tabs.filter(
    (item) => !conflictedTabIdentities.has(normalize(item.tabName)),
  )) {
    const binding = bindingFor(tab, population);
    if (binding === undefined) continue;
    for (const observed of binding.namedRanges ?? []) {
      if (observed.sourceTab !== tab.tabName) continue;
      const sheet = binding.workbook.sheets.find(
        (item) => item.name === observed.sourceTab,
      );
      if (!sheet?.cells.some((cell) => cell.address === observed.cellAddress))
        continue;
      ranges.push({
        name: observed.name,
        cellAddress: observed.cellAddress,
        sourceTab: observed.sourceTab,
        scope: observed.definitionSheet === null ? "workbook" : "sheet",
        genericField: glossary.resolve(observed.name, observed.sourceTab),
      });
    }
  }
  return ranges.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.sourceTab.localeCompare(right.sourceTab) ||
      left.cellAddress.localeCompare(right.cellAddress),
  );
}

function duplicateTabIdentities(
  tabs: readonly SourceTab[],
): ReadonlySet<string> {
  const observed = new Set<string>();
  const duplicates = new Set<string>();
  for (const tab of tabs) {
    const identity = normalize(tab.tabName);
    if (observed.has(identity)) duplicates.add(identity);
    else observed.add(identity);
  }
  return duplicates;
}

function bindingFor(
  tab: SourceTab,
  population: ArchitecturePopulation,
): ArchitecturePopulationCandidate | undefined {
  return population.candidates.find(
    (binding) =>
      binding.governance.status === "approved" &&
      binding.workbookProfileContentSha256 ===
        tab.workbookProfileContentSha256 &&
      (tab.role === "support" ||
        (binding.candidate.candidateKey === tab.populationCandidateKey &&
          binding.candidate.artifactSha256 === tab.populationArtifactSha256)),
  );
}

function displayPrimitive(value: unknown): string {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : "";
}

function normalize(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function unmapped(
  tab: SourceTab,
  address: string,
  description: string,
): CreateUnresolvedItemInput {
  return unresolvedItemEmitters["ambiguous-source-role"]({
    affectedScope: `profile:${tab.workbookProfileContentSha256}/tab:${tab.tabName}/cell:${address}`,
    competingInterpretations: [
      interpretation(
        "00000000-0000-4000-8000-000000000411",
        `Observed workbook field ${JSON.stringify(description)} has no contextual generic-field mapping.`,
      ),
      interpretation(
        "00000000-0000-4000-8000-000000000412",
        "A human reviewer approves a traceable contextual glossary mapping before this field is used.",
      ),
    ],
    consequence:
      "The observed field is excluded from the calculation architecture until its source role is resolved.",
    reviewer: null,
  });
}

function tabCollision(identity: string): CreateUnresolvedItemInput {
  return unresolvedItemEmitters["conflicting-provisions"]({
    affectedScope: `architecture/tab-identity:${identity}`,
    competingInterpretations: [
      interpretation(
        "00000000-0000-4000-8000-000000000413",
        `Multiple selected tabs share normalized identity ${JSON.stringify(identity)}.`,
      ),
      interpretation(
        "00000000-0000-4000-8000-000000000414",
        "A human reviewer resolves the approved workbook-profile collision before inventory construction.",
      ),
    ],
    consequence:
      "Cells and named ranges from the conflicting tab identity are excluded rather than overwritten or merged.",
    reviewer: null,
  });
}

function interpretation(id: string, statement: string): Interpretation {
  const parsed = parseUuid(id);
  if (!parsed.ok)
    throw new Error("Internal architecture interpretation ID failed.");
  return {
    interpretationId: parsed.value,
    statement,
    evidence: [],
    sourceCandidateId: null,
  };
}
