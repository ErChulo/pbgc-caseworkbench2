import * as XLSX from "xlsx";

export const syntheticPopulationRows = Object.freeze([
  Object.freeze([
    "generalKey",
    "status",
    "service",
    "leadingZero",
    "formulaText",
    "mixed",
  ]),
  Object.freeze(["SYN-001", "active", "0", "0012", "=1+1", "text"]),
  Object.freeze(["SYN-002", "", "INVALID", "0000", "", "7"]),
  Object.freeze(["SYN-003", "retired", "12.5", "0100", "@never", "true"]),
  Object.freeze(["generalKey", "status", "service"]),
]);

export const syntheticPopulationCsv = () =>
  new TextEncoder().encode(
    syntheticPopulationRows
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n"),
  );

export const syntheticPopulationTsv = () =>
  new TextEncoder().encode(
    syntheticPopulationRows.map((row) => row.join("\t")).join("\n"),
  );

export function syntheticPopulationWorkbook(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const population = XLSX.utils.aoa_to_sheet([
    ["generalKey", "status", "service", "leadingZero", "formulaText", "mixed"],
    ["SYN-001", "active", 0, "0012", { t: "n", v: 2, f: "1+1" }, "text"],
    ["SYN-002", "", "INVALID", "0000", "", 7],
  ]);
  XLSX.utils.book_append_sheet(workbook, population, "Population");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["note"], ["synthetic hidden sheet"]]),
    "Hidden",
  );
  workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

export const malformedSyntheticPopulationCsv = () =>
  new TextEncoder().encode('generalKey,status\n"SYN-001,active');
