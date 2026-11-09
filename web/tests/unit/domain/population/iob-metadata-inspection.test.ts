import { describe, expect, it } from "vitest";
import { inspectIobMetadataRow } from "../../../../src/domain/population/iob-metadata-inspection";
import type { WorkbookPopulationProfile } from "../../../../src/domain/population/workbook-adapter";

const cell = (
  address: string,
  storedValue: unknown,
  formulaText: string | null = null,
  cellType = "s",
) => ({
  sheet: "Source",
  address,
  storedValue,
  formulaText,
  cellType,
  kind: "text" as const,
});
const workbook = {
  status: "profiled",
  formulaExecutionCount: 0,
  limitations: [],
  sheets: [
    {
      name: "Source",
      hidden: false,
      cells: [
        cell("A1", "First"),
        cell("B1", "Second"),
        cell("C1", "Third"),
        cell("D1", "Fourth"),
        cell("E1", "Fifth"),
        cell("A12", "I"),
        cell("B12", "O"),
        cell("C12", "B"),
        cell("D12", "I", "1+1"),
        cell("E12", "i"),
      ],
    },
  ],
} as WorkbookPopulationProfile;
const bindings = ["First", "Second", "Third", "Fourth", "Fifth"].map(
  (name, index) => ({
    field: name,
    expectedHeader: name,
    column: String.fromCharCode(65 + index),
  }),
);
const input = {
  workbook,
  sheetName: "Source",
  sourceRow: 2,
  metadataRow: 12,
  bindings,
};
describe("explicit source I/O/B inspection", () => {
  it("reports exact observations without interpreting formulas or normalizing values", () => {
    expect(
      inspectIobMetadataRow(input).fields.map((field) => field.state),
    ).toEqual(["I", "O", "B", "formula", "other"]);
    expect(
      inspectIobMetadataRow({ ...input, metadataRow: 13 }).fields.every(
        (field) => field.state === "missing",
      ),
    ).toBe(true);
  });
  it("blocks unsafe row, ambiguous bindings and changed headers", () => {
    expect(() => inspectIobMetadataRow({ ...input, metadataRow: 2 })).toThrow();
    expect(() => inspectIobMetadataRow({ ...input, metadataRow: 1 })).toThrow();
    expect(() =>
      inspectIobMetadataRow({
        ...input,
        bindings: [
          { field: "First", column: "A", expectedHeader: "First" },
          { field: "First", column: "A", expectedHeader: "First" },
        ],
      }),
    ).toThrow();
    expect(() =>
      inspectIobMetadataRow({
        ...input,
        bindings: [
          {
            ...{ field: "First", column: "A", expectedHeader: "First" },
            expectedHeader: "wrong",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      inspectIobMetadataRow({
        ...input,
        bindings: [
          {
            ...{ field: "First", column: "A", expectedHeader: "First" },
            column: "XFE",
          },
        ],
      }),
    ).toThrow();
  });
});
