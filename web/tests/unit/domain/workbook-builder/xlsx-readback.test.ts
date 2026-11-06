import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  preflightXlsxSpec,
  verifyGeneratedXlsx,
} from "../../../../src/domain/workbook-builder/xlsx-readback";
import {
  writeXLSXBytes,
  type XLSXWorkbookSpec,
} from "../../../../src/domain/workbook-builder/serialization";

const spec: XLSXWorkbookSpec = {
  sheets: [
    {
      name: "Visible",
      hidden: false,
      rows: [["=literal", 0, false, null]],
      formulas: [{ address: "D1", formulaText: "=1+2" }],
    },
    { name: "Hidden", hidden: true, rows: [["synthetic"]] },
  ],
  namedRanges: [
    {
      name: "MyValue",
      scope: "workbook",
      sheetName: null,
      reference: "'Visible'!$B$1",
    },
    {
      name: "LocalValue",
      scope: "sheet",
      sheetName: "Hidden",
      reference: "'Hidden'!$A$1",
    },
  ],
};

describe("generated XLSX model read-back", () => {
  it("checks synthetic values, literal text, formulas, visibility and scoped names", () => {
    const bytes = writeXLSXBytes(spec);
    expect(verifyGeneratedXlsx(spec, bytes)).toEqual({ ok: true });
    const parsed = XLSX.read(bytes, { type: "array", sheetStubs: true });
    const formula = parsed.Sheets.Visible?.D1 as XLSX.CellObject | undefined;
    expect(formula?.f).toBe("1+2");
    expect(formula?.t).toBe("z");
  });
  it("fails closed on changed sheet order, visibility, cells, formulas and names", () => {
    const bytes = writeXLSXBytes(spec);
    const first = spec.sheets[0];
    const second = spec.sheets[1];
    const firstName = spec.namedRanges[0];
    if (!first || !second || !firstName)
      throw new Error("Synthetic sheets missing");
    const changed: XLSXWorkbookSpec[] = [
      { ...spec, sheets: [second, first] },
      { ...spec, sheets: [{ ...first, hidden: true }, second] },
      {
        ...spec,
        sheets: [{ ...first, rows: [["=literal", 1, false, null]] }, second],
      },
      {
        ...spec,
        sheets: [
          { ...first, formulas: [{ address: "D1", formulaText: "=2+2" }] },
          second,
        ],
      },
      { ...spec, sheets: [{ ...first, formulas: [] }, second] },
      { ...spec, namedRanges: [{ ...firstName, reference: "'Visible'!$A$1" }] },
    ];
    for (const variation of changed)
      expect(verifyGeneratedXlsx(variation, bytes).ok).toBe(false);
    expect(verifyGeneratedXlsx(spec, Uint8Array.of(1, 2, 3)).ok).toBe(false);
  });
  it("rejects a fabricated cached formula result", () => {
    const parts = unzipSync(writeXLSXBytes(spec));
    const sheet = parts["xl/worksheets/sheet1.xml"];
    if (!sheet) throw new Error("Synthetic sheet missing");
    const xml = strFromU8(sheet);
    expect(xml).toContain("<f>1+2</f>");
    parts["xl/worksheets/sheet1.xml"] = strToU8(
      xml.replace("<f>1+2</f>", "<f>1+2</f><v>3</v>"),
    );
    expect(verifyGeneratedXlsx(spec, zipSync(parts)).ok).toBe(false);
  });
  it("rejects altered worksheet dimensions, even when the cells are unchanged", () => {
    const parts = unzipSync(writeXLSXBytes(spec));
    const sheet = parts["xl/worksheets/sheet1.xml"];
    if (!sheet) throw new Error("Synthetic sheet missing");
    const xml = strFromU8(sheet);
    expect(xml).toContain('dimension ref="A1:D1"');
    parts["xl/worksheets/sheet1.xml"] = strToU8(
      xml.replace('dimension ref="A1:D1"', 'dimension ref="A1:XFD1"'),
    );
    expect(verifyGeneratedXlsx(spec, zipSync(parts)).ok).toBe(false);
  });
  it("accepts empty sheets and formula-only sheets with sparse addresses", () => {
    const sparse: XLSXWorkbookSpec = {
      sheets: [
        { name: "Empty", hidden: false, rows: [] },
        {
          name: "Formula",
          hidden: false,
          rows: [],
          formulas: [{ address: "Z50", formulaText: "=1" }],
        },
      ],
      namedRanges: [],
    };
    expect(verifyGeneratedXlsx(sparse, writeXLSXBytes(sparse))).toEqual({
      ok: true,
    });
  });
  it("rejects oversized grids before XLSX serialization", () => {
    const largeRow = Array.from({ length: 16_384 }, () => null);
    const tooLarge: XLSXWorkbookSpec = {
      sheets: [
        {
          name: "Large",
          hidden: false,
          rows: Array.from({ length: 62 }, () => largeRow),
        },
      ],
      namedRanges: [],
    };
    const invalidWidth: XLSXWorkbookSpec = {
      sheets: [
        {
          name: "Wide",
          hidden: false,
          rows: [Array.from({ length: 16_385 }, () => null)],
        },
      ],
      namedRanges: [],
    };
    expect(preflightXlsxSpec(tooLarge).ok).toBe(false);
    expect(preflightXlsxSpec(invalidWidth).ok).toBe(false);
  });
  it("rejects unsupported values, duplicate formula targets and bounded overflows", () => {
    const bytes = writeXLSXBytes(spec);
    const first = spec.sheets[0];
    if (!first) throw new Error("Synthetic sheet missing");
    for (const bad of [
      { ...first, rows: [[NaN]] },
      { ...first, formulas: [{ address: "A1", formulaText: "=1" }] },
      {
        ...first,
        formulas: [
          { address: "D1", formulaText: "=1" },
          { address: "$D$1", formulaText: "=2" },
        ],
      },
      { ...first, formulas: [{ address: "XFE1", formulaText: "=1" }] },
    ])
      expect(verifyGeneratedXlsx({ ...spec, sheets: [bad] }, bytes).ok).toBe(
        false,
      );
    expect(
      verifyGeneratedXlsx(spec, new Uint8Array(64 * 1024 * 1024 + 1)).ok,
    ).toBe(false);
  });
});
