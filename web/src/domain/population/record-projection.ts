import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import { hashTyped } from "../manifests/canonical-json";
import type { Sha256 } from "../shared/types";
import type { PopulationDecisionProjection } from "./population-types";
import {
  workbookProfileContentHash,
  type WorkbookNamedRangeObservation,
  type WorkbookPopulationProfile,
} from "./workbook-adapter";

/** Explicit, reviewable binding. No header matching or participant selection is inferred. */
export interface PopulationRecordFieldBinding {
  readonly field: string;
  readonly column: string;
  readonly expectedHeader: string;
}

export interface PopulationRecordProjection {
  readonly workbookProfileContentSha256: Sha256;
  readonly populationDecisionId: string;
  readonly sheetName: string;
  readonly sourceRow: number;
  readonly fields: readonly {
    readonly field: string;
    readonly sourceAddress: string;
    readonly state: "value" | "blank" | "missing" | "formula" | "error";
    readonly value: string | number | boolean | null;
    readonly formulaText: string | null;
  }[];
  readonly hasOnlyValues: boolean;
  readonly recordContentSha256: Sha256;
}

type RecordResult =
  | { readonly ok: true; readonly record: PopulationRecordProjection }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Projects an explicitly selected source row, without normalizing, calculating,
 * imputing, or treating a hash or an asserted approval as authentication.
 * This is a review primitive, not authorization for workbook generation.
 */
export async function projectPopulationRecord(input: {
  readonly workbook: WorkbookPopulationProfile;
  readonly namedRanges: readonly WorkbookNamedRangeObservation[];
  readonly populationDecision: PopulationDecisionProjection;
  readonly sheetName: string;
  readonly sourceRow: number;
  readonly bindings: readonly PopulationRecordFieldBinding[];
}): Promise<RecordResult> {
  const fail = (code: string, message: string): RecordResult => ({
    ok: false,
    code,
    message,
  });
  const decision = input.populationDecision;
  if (
    input.workbook.status !== "profiled" ||
    decision.status !== "approved" ||
    !decision.effectiveDecisionId?.trim() ||
    decision.effectiveWorkbookProfileContentSha256 === null
  ) {
    return fail(
      "POPULATION_NOT_APPROVED",
      "An approved workbook population profile is required.",
    );
  }
  let profileHash: Sha256;
  try {
    profileHash = await workbookProfileContentHash(
      input.workbook,
      input.namedRanges,
    );
  } catch {
    return fail(
      "PROFILE_HASH_FAILED",
      "The workbook profile could not be verified.",
    );
  }
  if (profileHash !== decision.effectiveWorkbookProfileContentSha256)
    return fail(
      "PROFILE_HASH_MISMATCH",
      "The workbook profile does not match the population decision.",
    );
  if (
    !Number.isInteger(input.sourceRow) ||
    input.sourceRow < 2 ||
    input.sourceRow > 1_048_576 ||
    input.bindings.length === 0
  )
    return fail(
      "SELECTION_INVALID",
      "Select a data row and at least one explicit field binding.",
    );
  const sheets = input.workbook.sheets.filter(
    (sheet) => sheet.name === input.sheetName,
  );
  if (sheets.length !== 1)
    return fail(
      "SOURCE_SHEET_INVALID",
      "The selected source sheet is missing or ambiguous.",
    );
  const sheet = sheets[0];
  if (!sheet)
    return fail(
      "SOURCE_SHEET_INVALID",
      "The selected source sheet is missing or ambiguous.",
    );
  const cells = new Map<string, (typeof sheet.cells)[number]>();
  for (const cell of sheet.cells) {
    const address = normalizeCellAddress(cell.address);
    if (cell.sheet !== sheet.name || address === null)
      return fail(
        "SOURCE_CELLS_INVALID",
        "The source sheet has invalid cell observations.",
      );
    const key = address.replaceAll("$", "");
    if (cells.has(key))
      return fail(
        "SOURCE_CELLS_INVALID",
        "The source sheet has duplicate cell observations.",
      );
    cells.set(key, cell);
  }
  const fields: PopulationRecordProjection["fields"][number][] = [];
  const usedFields = new Set<string>();
  const usedColumns = new Set<string>();
  for (const binding of input.bindings) {
    const column = binding.column;
    const field = binding.field;
    if (
      !field.trim() ||
      field !== field.trim() ||
      !binding.expectedHeader.trim() ||
      !/^[A-Z]{1,3}$/u.test(column) ||
      normalizeCellAddress(`${column}1`) === null ||
      usedFields.has(field.normalize("NFC").toUpperCase()) ||
      usedColumns.has(column)
    )
      return fail(
        "FIELD_BINDING_INVALID",
        "Field bindings must identify unique fields and valid source columns.",
      );
    usedFields.add(field.normalize("NFC").toUpperCase());
    usedColumns.add(column);
    const header = cells.get(`${column}1`);
    if (
      header?.formulaText !== null ||
      header.storedValue !== binding.expectedHeader
    )
      return fail(
        "HEADER_MISMATCH",
        "A selected field does not match its observed source header.",
      );
    const sourceAddress = `${column}${String(input.sourceRow)}`;
    const cell = cells.get(sourceAddress);
    let state: PopulationRecordProjection["fields"][number]["state"] =
      "missing";
    let value: string | number | boolean | null = null;
    let formulaText: string | null = null;
    if (cell) {
      formulaText = cell.formulaText;
      if (cell.formulaText !== null) state = "formula";
      else if (cell.cellType === "e") state = "error";
      else if (cell.storedValue === null || cell.storedValue === "") {
        state = "blank";
        value = cell.storedValue;
      } else if (
        typeof cell.storedValue === "string" ||
        typeof cell.storedValue === "boolean" ||
        (typeof cell.storedValue === "number" &&
          Number.isFinite(cell.storedValue))
      ) {
        state = "value";
        value = cell.storedValue;
      } else
        return fail(
          "SOURCE_VALUE_UNSUPPORTED",
          "A selected value cannot be preserved as a supported primitive.",
        );
    }
    fields.push({ field, sourceAddress, state, value, formulaText });
  }
  fields.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  const payload = {
    workbookProfileContentSha256: profileHash,
    populationDecisionId: decision.effectiveDecisionId,
    sheetName: sheet.name,
    sourceRow: input.sourceRow,
    fields,
    hasOnlyValues: fields.every((field) => field.state === "value"),
  };
  return {
    ok: true,
    record: {
      ...payload,
      recordContentSha256: (await hashTyped(payload, {
        typeName: "PopulationRecordProjection",
      })) as Sha256,
    },
  };
}
