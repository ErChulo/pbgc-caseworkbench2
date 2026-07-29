import { describe, expect, it } from "vitest";

import { parseWorkbookPassive } from "../../../../src/adapters/parsers/workbook-parser";
import { failedPassiveExtraction } from "../../../../src/adapters/parsers/passive-result";
import { adaptWorkbookExtraction } from "../../../../src/domain/population/workbook-adapter";
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
});
