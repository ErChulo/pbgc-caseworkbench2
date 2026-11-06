import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseWorkbookPassive } from "../../../../src/adapters/parsers/workbook-parser";
import { failedPassiveExtraction } from "../../../../src/adapters/parsers/passive-result";
import {
  adaptWorkbookExtraction,
  workbookProfileContentHash,
} from "../../../../src/domain/population/workbook-adapter";
import { syntheticPopulationWorkbook } from "../../../fixtures/generators/populations";

describe("T092 population workbook adapter", () => {
  it("preserves sheets, stored values, formulas, hidden content, and executes nothing", () => {
    const extraction = parseWorkbookPassive(syntheticPopulationWorkbook());
    const profile = adaptWorkbookExtraction(extraction);
    expect(profile.status).toBe("profiled");
    expect(profile.sheets.map((sheet) => sheet.name)).toEqual([
      "Population",
      "Hidden",
    ]);
    expect(profile.sheets.some((sheet) => sheet.hidden)).toBe(true);
    const cells = profile.sheets.flatMap((sheet) => sheet.cells);
    expect(cells.find((cell) => cell.formulaText === "1+1")).toMatchObject({
      storedValue: 2,
      kind: "formula-text",
    });
    expect(cells.some((cell) => cell.storedValue === 0)).toBe(true);
    expect(profile.formulaExecutionCount).toBe(0);
  });

  it("records visibility by exact sheet identity and retains empty sheets", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["first"]]),
      "Hidden first",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([]),
      "Empty visible",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["middle"]]),
      "Very hidden",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["last"]]),
      "Visible last",
    );
    workbook.Workbook = {
      Sheets: [{ Hidden: 1 }, { Hidden: 0 }, { Hidden: 2 }, { Hidden: 0 }],
    };
    const bytes = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;
    const extraction = parseWorkbookPassive(new Uint8Array(bytes));
    const profile = adaptWorkbookExtraction(extraction);
    expect(profile.status).toBe("profiled");
    expect(profile.sheets.map((sheet) => [sheet.name, sheet.hidden])).toEqual([
      ["Hidden first", true],
      ["Empty visible", false],
      ["Very hidden", true],
      ["Visible last", false],
    ]);
    expect(profile.sheets[1]?.cells).toEqual([]);
  });

  it("fails closed on absent, unknown or inconsistent sheet inventory", () => {
    const extraction = parseWorkbookPassive(syntheticPopulationWorkbook());
    const cases = [
      { ...extraction.metadata, sheetInventoryJson: null },
      { ...extraction.metadata, sheetInventoryJson: "invalid json" },
      {
        ...extraction.metadata,
        sheetInventoryJson: JSON.stringify([
          { name: "Population", hidden: null },
          { name: "Hidden", hidden: true },
        ]),
      },
      {
        ...extraction.metadata,
        sheetInventoryJson: JSON.stringify([
          { name: "Population", hidden: false },
          { name: "Population", hidden: true },
        ]),
      },
      { ...extraction.metadata, hiddenSheetCount: 0 },
    ];
    for (const metadata of cases) {
      const profile = adaptWorkbookExtraction({ ...extraction, metadata });
      expect(profile.status).toBe("blocked");
      expect(profile.sheets).toEqual([]);
    }
    const foreignCell = {
      sheet: "Unknown",
      address: "A1",
      storedValue: "synthetic",
      formulaText: null,
      cellType: "s",
    };
    expect(
      adaptWorkbookExtraction({
        ...extraction,
        rawValues: [...extraction.rawValues, foreignCell],
      }).status,
    ).toBe("blocked");
    const first = extraction.rawValues[0];
    expect(
      adaptWorkbookExtraction({
        ...extraction,
        rawValues: [...extraction.rawValues, first],
      }).status,
    ).toBe("blocked");
    expect(
      adaptWorkbookExtraction({
        ...extraction,
        rawValues: [{ ...foreignCell, sheet: "Population", address: "A0" }],
      }).status,
    ).toBe("blocked");
    expect(
      adaptWorkbookExtraction({
        ...extraction,
        rawValues: [
          {
            sheet: "Population",
            address: "A1",
            formulaText: null,
            cellType: "s",
          },
        ],
      }).status,
    ).toBe("blocked");
  });

  it("fails closed on unsuccessful parser output", () => {
    const profile = adaptWorkbookExtraction(
      failedPassiveExtraction(
        "workbook-passive",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "unreadable",
        "Synthetic unreadable workbook.",
      ),
    );
    expect(profile.status).toBe("blocked");
    expect(profile.sheets).toEqual([]);
  });

  it("hashes sheets, cells, and named ranges deterministically", async () => {
    const profile = adaptWorkbookExtraction(
      parseWorkbookPassive(syntheticPopulationWorkbook()),
    );
    const range = {
      name: "Synthetic_Name",
      sourceTab: "Population",
      cellAddress: "A1",
      definitionSheet: null,
    };
    const ranges = [range];
    const hash = await workbookProfileContentHash(profile, ranges);
    expect(await workbookProfileContentHash(profile, ranges)).toBe(hash);
    expect(
      await workbookProfileContentHash(profile, [
        { ...range, name: "Tampered_Name" },
      ]),
    ).not.toBe(hash);
  });
});
