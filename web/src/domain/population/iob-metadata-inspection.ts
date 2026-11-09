import { normalizeCellAddress } from "../formula-compiler/reference-codec";
import type { PopulationRecordFieldBinding } from "./record-projection";
import type { WorkbookPopulationProfile } from "./workbook-adapter";

export type ObservedIobState =
  "I" | "O" | "B" | "blank" | "missing" | "formula" | "error" | "other";
export interface IobMetadataObservation {
  readonly metadataRow: number;
  readonly fields: readonly {
    readonly field: string;
    readonly sourceAddress: string;
    readonly state: ObservedIobState;
  }[];
}

/** Inspect an explicitly chosen metadata row. This never assigns I/O/B policy. */
export function inspectIobMetadataRow(input: {
  readonly workbook: WorkbookPopulationProfile;
  readonly sheetName: string;
  readonly sourceRow: number;
  readonly metadataRow: number;
  readonly bindings: readonly PopulationRecordFieldBinding[];
}): IobMetadataObservation {
  if (
    input.workbook.status !== "profiled" ||
    !Number.isSafeInteger(input.metadataRow) ||
    input.metadataRow < 2 ||
    input.metadataRow > 1_048_576 ||
    input.metadataRow === input.sourceRow ||
    input.bindings.length < 1 ||
    input.bindings.length > 50
  )
    throw new Error(
      "Choose a separate one-based metadata row and explicit field bindings.",
    );
  const sheets = input.workbook.sheets.filter(
    (sheet) => sheet.name === input.sheetName,
  );
  if (sheets.length !== 1 || !sheets[0])
    throw new Error("The source sheet is missing or ambiguous.");
  const sheet = sheets[0];
  const cells = new Map<string, (typeof sheet.cells)[number]>();
  for (const cell of sheet.cells) {
    const address = normalizeCellAddress(cell.address)?.replaceAll("$", "");
    if (
      cell.sheet !== sheet.name ||
      address === undefined ||
      cells.has(address)
    )
      throw new Error(
        "The source sheet has invalid or duplicate cell observations.",
      );
    cells.set(address, cell);
  }
  const usedFields = new Set<string>();
  const usedColumns = new Set<string>();
  const fields = input.bindings.map((binding) => {
    const identity = binding.field.normalize("NFC").toUpperCase();
    if (
      !binding.field.trim() ||
      binding.field !== binding.field.trim() ||
      !/^[A-Z]{1,3}$/u.test(binding.column) ||
      normalizeCellAddress(`${binding.column}1`) === null ||
      !binding.expectedHeader.trim() ||
      usedFields.has(identity) ||
      usedColumns.has(binding.column)
    )
      throw new Error(
        "Field bindings must identify unique fields and valid columns.",
      );
    usedFields.add(identity);
    usedColumns.add(binding.column);
    const header = cells.get(`${binding.column}1`);
    if (
      header?.formulaText !== null ||
      header.cellType === "e" ||
      header.storedValue !== binding.expectedHeader
    )
      throw new Error(
        "A selected field does not match its observed source header.",
      );
    const sourceAddress = `${binding.column}${String(input.metadataRow)}`;
    const cell = cells.get(sourceAddress);
    let state: ObservedIobState;
    if (!cell) state = "missing";
    else if (cell.formulaText !== null) state = "formula";
    else if (cell.cellType === "e") state = "error";
    else if (cell.storedValue === null || cell.storedValue === "")
      state = "blank";
    else if (
      cell.storedValue === "I" ||
      cell.storedValue === "O" ||
      cell.storedValue === "B"
    )
      state = cell.storedValue;
    else state = "other";
    return Object.freeze({ field: binding.field, sourceAddress, state });
  });
  return Object.freeze({
    metadataRow: input.metadataRow,
    fields: Object.freeze(fields),
  });
}
