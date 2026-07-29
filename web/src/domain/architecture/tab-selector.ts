import { canonicalize } from "../manifests/canonical-json";
import type { Interpretation } from "../plan-rules/models";
import type { CreateUnresolvedItemInput } from "../plan-rules/unresolved-items";
import { unresolvedItemEmitters } from "../plan-rules/unresolved-items";
import type {
  PopulationCandidateProfile,
  PopulationDecisionProjection,
} from "../population/population-profile";
import type {
  PopulationWorkbookSheet,
  WorkbookNamedRangeObservation,
  WorkbookPopulationProfile,
} from "../population/workbook-adapter";
import { parseUuid, type Sha256 } from "../shared/types";
import type { SourceTab } from "./models";

export interface TabSelectionRule {
  readonly tabPattern: string;
  readonly requiredFields: readonly string[];
  readonly populationRequirement: string | null;
  readonly description: string;
}

export interface TabSelector {
  readonly select: (populationTabs: readonly SourceTab[]) => readonly string[];
  readonly getRule: (tabPattern: string) => TabSelectionRule | undefined;
}

export type ObservedNamedRangeDefinition = WorkbookNamedRangeObservation;

export interface ArchitecturePopulationCandidate {
  readonly candidate: PopulationCandidateProfile;
  readonly governance: PopulationDecisionProjection;
  readonly workbook: WorkbookPopulationProfile;
  readonly workbookProfileContentSha256: Sha256;
  readonly namedRanges?: readonly ObservedNamedRangeDefinition[];
}

export interface ArchitecturePopulation {
  readonly candidates: readonly ArchitecturePopulationCandidate[];
}

export interface TabSelectionOutcome {
  readonly tabs: readonly SourceTab[];
  readonly unresolvedItems: readonly CreateUnresolvedItemInput[];
}

export interface PopulationDimensionOutcome {
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly unresolvedItems: readonly CreateUnresolvedItemInput[];
}

function matchesPattern(tabName: string, pattern: string): boolean {
  const lowerTab = tabName.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  if (lowerPattern.includes("*")) {
    const regex = new RegExp(`^${lowerPattern.replace(/\*/gu, ".*")}$`, "iu");
    return regex.test(lowerTab);
  }

  return lowerTab.includes(lowerPattern);
}

function normalize(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function observedSheetFields(
  binding: ArchitecturePopulationCandidate,
  sheetName: string,
): readonly string[] {
  const sheet = binding.workbook.sheets.find((item) => item.name === sheetName);
  if (sheet === undefined) return [];
  const governed = new Set(binding.candidate.observedFields.map(normalize));
  return sheet.cells
    .filter((cell) => /^[A-Z]+1$/u.test(cell.address))
    .flatMap((cell) => {
      const value =
        typeof cell.storedValue === "string" ||
        typeof cell.storedValue === "number" ||
        typeof cell.storedValue === "boolean"
          ? String(cell.storedValue)
          : "";
      return governed.has(normalize(value)) ? [value] : [];
    });
}

export function validateRequiredFields(
  requiredFields: readonly string[],
  observedFields: readonly string[],
): readonly string[] {
  const observed = new Set(observedFields.map(normalize));
  return requiredFields.filter((field) => !observed.has(normalize(field)));
}

export function mapPopulationToTab(
  binding: ArchitecturePopulationCandidate,
  tabPolicy: readonly TabSelectionRule[],
): readonly { readonly sheetName: string; readonly rule: TabSelectionRule }[] {
  if (
    binding.governance.status !== "approved" ||
    binding.workbook.status !== "profiled"
  )
    return [];
  const characteristics = new Set(
    Object.values(populationDimensions(binding).dimensions).map((value) =>
      normalize(String(value)),
    ),
  );
  return binding.workbook.sheets
    .filter((sheet) => !sheet.hidden)
    .flatMap((sheet) => {
      const rule = tabPolicy.find(
        (item) =>
          matchesPattern(sheet.name, item.tabPattern) &&
          (item.populationRequirement === null ||
            characteristics.has(normalize(item.populationRequirement))),
      );
      return rule === undefined ? [] : [{ sheetName: sheet.name, rule }];
    });
}

export function selectTabs(input: {
  readonly population: ArchitecturePopulation;
  readonly tabPolicy: readonly TabSelectionRule[];
}): TabSelectionOutcome {
  const approved = input.population.candidates.filter(
    (binding) => binding.governance.status === "approved",
  );
  if (approved.length === 0) {
    return {
      tabs: [],
      unresolvedItems: [
        unresolved(
          "missing-required-value",
          "population",
          "No approved population candidate is available.",
          "Population-driven tabs cannot be selected until a candidate is approved.",
        ),
      ],
    };
  }

  const tabs: SourceTab[] = [];
  const unresolvedItems: CreateUnresolvedItemInput[] = [];
  const sortedApproved = [...approved].sort(compareBindings);
  const admittedSheets = new Set<PopulationWorkbookSheet>();
  const sheetsByIdentity = new Map<
    string,
    {
      binding: ArchitecturePopulationCandidate;
      sheet: PopulationWorkbookSheet;
    }[]
  >();
  for (const binding of sortedApproved) {
    for (const sheet of binding.workbook.sheets.filter(
      (item) => !item.hidden,
    )) {
      const identity = normalize(sheet.name);
      const observations = sheetsByIdentity.get(identity) ?? [];
      observations.push({ binding, sheet });
      sheetsByIdentity.set(identity, observations);
    }
  }
  for (const [identity, observations] of [...sheetsByIdentity].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const first = observations[0];
    if (first === undefined) continue;
    if (
      observations.length === 1 ||
      observations.every(
        (observation, index) =>
          index === 0 || exactTabDuplicate(first, observation),
      )
    ) {
      admittedSheets.add(first.sheet);
      continue;
    }
    unresolvedItems.push(
      unresolved(
        "conflicting-provisions",
        `population/tab-identity:${identity}`,
        `Multiple approved workbook profiles provide the normalized tab identity ${JSON.stringify(identity)} with non-identical profile, source-lineage, or tab content.`,
        "The conflicting tab is blocked before fields, cells, or named ranges can be merged.",
      ),
    );
  }

  for (const binding of sortedApproved) {
    const dimensionOutcome = populationDimensions(binding);
    unresolvedItems.push(...dimensionOutcome.unresolvedItems);
    const characteristics = new Set(
      Object.values(dimensionOutcome.dimensions).map((value) =>
        normalize(String(value)),
      ),
    );
    for (const sheet of binding.workbook.sheets.filter((item) =>
      admittedSheets.has(item),
    )) {
      for (const rule of input.tabPolicy.filter((item) =>
        matchesPattern(sheet.name, item.tabPattern),
      )) {
        if (
          rule.populationRequirement !== null &&
          !characteristics.has(normalize(rule.populationRequirement))
        )
          unresolvedItems.push(
            unresolved(
              "missing-required-value",
              `population:${binding.candidate.candidateKey}/tab:${sheet.name}`,
              `The approved population evidence does not establish required characteristic ${JSON.stringify(rule.populationRequirement)}.`,
              "The matching sheet name alone cannot justify inclusion or silent omission of the population tab.",
            ),
          );
      }
    }
    for (const match of mapPopulationToTab(binding, input.tabPolicy).filter(
      (item) =>
        binding.workbook.sheets.some(
          (sheet) => sheet.name === item.sheetName && admittedSheets.has(sheet),
        ),
    )) {
      const observedFields = observedSheetFields(binding, match.sheetName);
      const missing = validateRequiredFields(
        match.rule.requiredFields,
        observedFields,
      );
      if (missing.length > 0) {
        unresolvedItems.push(
          unresolved(
            "missing-required-value",
            `population:${binding.candidate.candidateKey}/tab:${match.sheetName}`,
            `Required observed field(s) are absent: ${missing.join(", ")}.`,
            "The affected population tab cannot be included without its exact required fields.",
          ),
        );
        continue;
      }
      const sheetIndex = binding.workbook.sheets.findIndex(
        (sheet) => sheet.name === match.sheetName,
      );
      const recordCount = binding.candidate.recordCounts[sheetIndex];
      if (recordCount === undefined) {
        unresolvedItems.push(
          unresolved(
            "missing-required-value",
            `population:${binding.candidate.candidateKey}/tab:${match.sheetName}`,
            "The approved candidate has no observed record count for this tab.",
            "The tab cannot be selected because its population size is unknown.",
          ),
        );
        continue;
      }
      tabs.push({
        tabName: match.sheetName,
        role: "population",
        workbookProfileContentSha256: binding.workbookProfileContentSha256,
        populationCandidateKey: binding.candidate.candidateKey,
        populationArtifactSha256: binding.candidate.artifactSha256,
        fieldCount: observedFields.length,
        recordCount,
      });
    }
    for (const sheet of binding.workbook.sheets) {
      if (
        sheet.hidden ||
        !admittedSheets.has(sheet) ||
        !canonicalSupportSheets.has(sheet.name) ||
        tabs.some((tab) => normalize(tab.tabName) === normalize(sheet.name))
      )
        continue;
      tabs.push({
        tabName: sheet.name,
        role: "support",
        workbookProfileContentSha256: binding.workbookProfileContentSha256,
        populationCandidateKey: null,
        populationArtifactSha256: null,
        fieldCount: sheet.cells.filter((cell) =>
          /^[A-Z]+1$/u.test(cell.address),
        ).length,
        recordCount: 0,
      });
    }
  }
  return {
    tabs: tabs.sort((left, right) => left.tabName.localeCompare(right.tabName)),
    unresolvedItems,
  };
}

export const canonicalSupportSheets = new Set([
  "Summary",
  "Tables",
  "UD Table",
]);

export function populationDimensions(
  binding: ArchitecturePopulationCandidate,
): PopulationDimensionOutcome {
  const values = new Map<string, string | number | boolean>();
  const unresolvedItems: CreateUnresolvedItemInput[] = [];
  for (const evidence of binding.candidate.evidence) {
    if (evidence.evidenceKind !== "population-characteristic") continue;
    const observed = evidence.observedTextOrValue;
    if (
      typeof observed !== "object" ||
      observed === null ||
      Array.isArray(observed)
    )
      continue;
    const record = observed as Record<string, unknown>;
    const dimension =
      typeof record.dimension === "string" ? record.dimension.trim() : "";
    const value = record.value;
    if (
      dimension === "" ||
      !(
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
    )
      continue;
    const prior = values.get(dimension);
    if (prior !== undefined && prior !== value) {
      unresolvedItems.push(
        unresolved(
          "ambiguous-source-role",
          `population:${binding.candidate.candidateKey}/dimension:${dimension}`,
          `Approved population evidence contains conflicting values ${JSON.stringify(prior)} and ${JSON.stringify(value)} for ${dimension}.`,
          "Population-driven tab and scenario selection is blocked until the conflicting characteristic is resolved.",
        ),
      );
      values.delete(dimension);
      continue;
    }
    values.set(dimension, value);
  }
  return {
    dimensions: Object.fromEntries(
      [...values].sort(([left], [right]) => left.localeCompare(right)),
    ),
    unresolvedItems,
  };
}

function unresolved(
  kind:
    | "missing-required-value"
    | "ambiguous-source-role"
    | "conflicting-provisions",
  affectedScope: string,
  observedStatement: string,
  consequence: string,
): CreateUnresolvedItemInput {
  const interpretations = [
    interpretation("00000000-0000-4000-8000-000000000401", observedStatement),
    interpretation(
      "00000000-0000-4000-8000-000000000402",
      "A human reviewer supplies or maps traceable source evidence before processing continues.",
    ),
  ];
  return unresolvedItemEmitters[kind]({
    affectedScope,
    competingInterpretations: interpretations,
    consequence,
    reviewer: null,
  });
}

function compareBindings(
  left: ArchitecturePopulationCandidate,
  right: ArchitecturePopulationCandidate,
): number {
  return (
    left.candidate.candidateKey.localeCompare(right.candidate.candidateKey) ||
    left.candidate.artifactSha256.localeCompare(
      right.candidate.artifactSha256,
    ) ||
    left.workbookProfileContentSha256.localeCompare(
      right.workbookProfileContentSha256,
    )
  );
}

function exactTabDuplicate(
  left: {
    readonly binding: ArchitecturePopulationCandidate;
    readonly sheet: PopulationWorkbookSheet;
  },
  right: {
    readonly binding: ArchitecturePopulationCandidate;
    readonly sheet: PopulationWorkbookSheet;
  },
): boolean {
  return (
    left.binding !== right.binding &&
    left.binding.candidate.candidateKey ===
      right.binding.candidate.candidateKey &&
    left.binding.candidate.artifactSha256 ===
      right.binding.candidate.artifactSha256 &&
    left.binding.workbookProfileContentSha256 ===
      right.binding.workbookProfileContentSha256 &&
    canonicalize(left.binding.governance) ===
      canonicalize(right.binding.governance) &&
    canonicalize(left.sheet) === canonicalize(right.sheet) &&
    canonicalize(tabNamedRanges(left.binding, left.sheet.name)) ===
      canonicalize(tabNamedRanges(right.binding, right.sheet.name))
  );
}

function tabNamedRanges(
  binding: ArchitecturePopulationCandidate,
  sheetName: string,
): readonly ObservedNamedRangeDefinition[] {
  return [...(binding.namedRanges ?? [])]
    .filter((range) => normalize(range.sourceTab) === normalize(sheetName))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.sourceTab.localeCompare(right.sourceTab) ||
        left.cellAddress.localeCompare(right.cellAddress) ||
        String(left.definitionSheet).localeCompare(
          String(right.definitionSheet),
        ),
    );
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

export function createSelector(
  rules: readonly TabSelectionRule[],
): TabSelector {
  const byPattern = new Map<string, TabSelectionRule>();
  for (const rule of rules) {
    byPattern.set(rule.tabPattern.toLowerCase(), rule);
  }

  return {
    select(populationTabs: readonly SourceTab[]): readonly string[] {
      const selected: string[] = [];

      for (const rule of rules) {
        const matchingTabs = populationTabs.filter((tab) =>
          matchesPattern(tab.tabName, rule.tabPattern),
        );

        for (const tab of matchingTabs) {
          if (rule.requiredFields.length === 0) {
            selected.push(tab.tabName);
          }
        }
      }

      return [...new Set(selected)];
    },

    getRule(tabPattern: string): TabSelectionRule | undefined {
      return byPattern.get(tabPattern.toLowerCase());
    },
  };
}
