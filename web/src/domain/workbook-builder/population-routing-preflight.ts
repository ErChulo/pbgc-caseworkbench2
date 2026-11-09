import type { BuildSpecV2, CellMapping } from "../build-spec/models";
import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import type { PopulationRecordProjection } from "../population/record-projection";

export type RoutingIssueCode =
  | "LINEAGE_MISMATCH"
  | "TARGET_INVALID"
  | "TARGET_HEADER_ROW"
  | "TARGET_COLLISION"
  | "INPUT_FORMULA_COLLISION"
  | "FORMULA_TARGET_COLLISION"
  | "B_SEMANTICS_REQUIRED"
  | "SOURCE_UNSUPPORTED"
  | "SOURCE_FIELD_MISSING"
  | "SOURCE_FIELD_AMBIGUOUS"
  | "SOURCE_VALUE_UNAVAILABLE";

export interface PopulationRoutingIssue {
  readonly code: RoutingIssueCode;
  readonly mappingId: string | null;
  readonly tabName: string | null;
  readonly cellAddress: string | null;
  readonly field: string | null;
  readonly scenarioId: string | null;
}

export interface PopulationRoutingPreflight {
  readonly inputMappingCount: number;
  readonly issues: readonly PopulationRoutingIssue[];
  /** This diagnostic never authorizes or performs routing. */
  readonly routingAuthorized: false;
}

/**
 * Checks explicit row observations against existing targets without inferring
 * mappings, moving formulas, storing values, or authorizing a workbook.
 */
export function preflightPopulationRouting(
  buildSpec: BuildSpecV2,
  record: PopulationRecordProjection,
  caseId: string,
): PopulationRoutingPreflight {
  const issues: PopulationRoutingIssue[] = [];
  const add = (code: RoutingIssueCode, mapping?: CellMapping) => {
    issues.push({
      code,
      mappingId: mapping?.mappingId ?? null,
      tabName: mapping?.tabName ?? null,
      cellAddress: mapping?.cellAddress ?? null,
      field: mapping?.field ?? null,
      scenarioId: mapping?.scenarioId ?? null,
    });
  };
  const lineageMatches = buildSpec.architectureLineage.population.filter(
    (entry) =>
      entry.workbookProfileContentSha256 ===
        record.workbookProfileContentSha256 &&
      entry.approvalDecisionId === record.populationDecisionId,
  );
  if (buildSpec.caseId !== caseId || lineageMatches.length !== 1)
    add("LINEAGE_MISMATCH");

  const inputs = buildSpec.cellMappings.filter(
    (mapping) =>
      mapping.iobClassification === "I" || mapping.iobClassification === "B",
  );
  const keyOf = (tab: string, address: string): string | null => {
    const normalized = normalizeCellAddress(address);
    return normalized === null
      ? null
      : JSON.stringify([tab.toUpperCase(), normalized.replaceAll("$", "")]);
  };
  const targetCounts = new Map<string, number>();
  for (const mapping of buildSpec.cellMappings) {
    const key = keyOf(mapping.tabName, mapping.cellAddress);
    if (key !== null) targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
  }
  const formulaCounts = new Map<string, number>();
  for (const formula of buildSpec.formulas) {
    const key = keyOf(formula.tabName, formula.cellAddress);
    if (key !== null) formulaCounts.set(key, (formulaCounts.get(key) ?? 0) + 1);
  }
  for (const formula of buildSpec.formulas) {
    const key = keyOf(formula.tabName, formula.cellAddress);
    if (key !== null && (formulaCounts.get(key) ?? 0) > 1) {
      issues.push({
        code: "FORMULA_TARGET_COLLISION",
        mappingId: null,
        tabName: formula.tabName,
        cellAddress: formula.cellAddress,
        field: formula.genericField,
        scenarioId: formula.scenarioId,
      });
    }
  }
  const fields = new Map<string, (typeof record.fields)[number][]>();
  for (const field of record.fields) {
    const matches = fields.get(field.field) ?? [];
    matches.push(field);
    fields.set(field.field, matches);
  }
  for (const mapping of inputs) {
    const key = keyOf(mapping.tabName, mapping.cellAddress);
    if (key === null) add("TARGET_INVALID", mapping);
    else {
      const normalized =
        normalizeCellAddress(mapping.cellAddress)?.replaceAll("$", "") ?? "";
      if (/^[A-Z]+1$/u.test(normalized)) add("TARGET_HEADER_ROW", mapping);
      if ((targetCounts.get(key) ?? 0) > 1) add("TARGET_COLLISION", mapping);
      if (formulaCounts.has(key)) add("INPUT_FORMULA_COLLISION", mapping);
    }
    if (mapping.iobClassification === "B") add("B_SEMANTICS_REQUIRED", mapping);
    const source = mapping.dataSource;
    if (
      source?.sourceType !== "population" ||
      source.sourceTab !== record.sheetName ||
      source.sourceField !== mapping.field
    ) {
      add("SOURCE_UNSUPPORTED", mapping);
      continue;
    }
    const observed = fields.get(mapping.field);
    if (!observed) add("SOURCE_FIELD_MISSING", mapping);
    else if (observed.length !== 1) add("SOURCE_FIELD_AMBIGUOUS", mapping);
    else if (observed[0]?.state !== "value")
      add("SOURCE_VALUE_UNAVAILABLE", mapping);
  }
  return { inputMappingCount: inputs.length, issues, routingAuthorized: false };
}
