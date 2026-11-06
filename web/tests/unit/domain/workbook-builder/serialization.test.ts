import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { unzipSync } from "fflate";
import {
  buildXLSXSpec,
  writeXLSXBuffer,
  writeXLSXBytes,
  computeXLSXHash,
} from "../../../../src/domain/workbook-builder/serialization";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import type { Sha256 } from "../../../../src/domain/shared/types";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

async function createFixture() {
  const baseBuildSpec = await buildSpecV2();
  const workbookProfileContentSha256 = "e".repeat(64) as Sha256;
  const buildSpec = {
    ...baseBuildSpec,
    architectureLineage: {
      ...baseBuildSpec.architectureLineage,
      population: [
        {
          candidateKey: "c".repeat(64) as Sha256,
          artifactSha256: "d".repeat(64) as Sha256,
          workbookProfileContentSha256,
          approvalDecisionId: "population-approval-1",
          approvalDecisionContentSha256: "f".repeat(64) as Sha256,
        },
      ],
    },
  };
  return {
    buildSpec,
    populationProfile: {
      status: "approved" as const,
      effectiveDecisionId: "population-approval-1",
      effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
      provenance: ["population-approval-1"],
    },
    workbookProfileContentSha256,
  };
}

describe("XLSX serialization", () => {
  it("produces a valid XLSX buffer from workbook spec", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const spec = buildXLSXSpec(result.workbook);
    const buffer = writeXLSXBuffer(spec);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    const magic = buffer.subarray(0, 4).toString("hex");
    expect(magic).toBe("504b0304");
  });

  it("writes formulas as OOXML formulas without invented cached results", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      ...fixture,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");
    const spec = buildXLSXSpec(result.workbook);
    const buffer = writeXLSXBuffer(spec);
    const parsed = XLSX.read(buffer, { type: "buffer", sheetStubs: true });
    const calc = parsed.Sheets.RETIREES;
    const c1 = calc?.C1 as XLSX.CellObject | undefined;
    const d1 = calc?.D1 as XLSX.CellObject | undefined;
    expect(c1?.f).toBe("COMP+YOS");
    expect(d1?.f).toBe("SUBTOTAL*0.01");
    const zip = unzipSync(buffer);
    const sheetIndex =
      spec.sheets.findIndex((sheet) => sheet.name === "RETIREES") + 1;
    const xmlBytes = zip[`xl/worksheets/sheet${String(sheetIndex)}.xml`];
    if (!xmlBytes) throw new Error("Missing worksheet XML");
    const xml = new TextDecoder().decode(xmlBytes);
    expect(xml).toMatch(/<c r="C1"[^>]*><f>COMP\+YOS<\/f><\/c>/u);
    expect(xml).toMatch(/<c r="D1"[^>]*><f>SUBTOTAL\*0\.01<\/f><\/c>/u);
    expect(xml).not.toMatch(/<c r="(?:C1|D1)"[^>]*>[^]*?<v>0<\/v>[^]*?<\/c>/u);
  });

  it("serializes workbook and sheet-scoped names with quoted exact targets", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      ...fixture,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");
    const sheet = result.workbook.sheets[0];
    const name = {
      rangeName: "GLOBAL_NAME",
      tabName: "",
      scope: "workbook" as const,
      cellAddress: "A1",
      genericField: null,
      scenarioId: null,
      provenance: {
        source: "architecture" as const,
        architectureNamedRange: "GLOBAL_NAME",
      },
    };
    if (!sheet) throw new Error("fixture lacks sheet");
    const target = "Owner's sheet";
    const workbook = {
      ...result.workbook,
      sheets: [{ ...sheet, name: target }],
      namedRanges: [
        {
          ...name,
          rangeName: "GLOBAL_NAME",
          tabName: target,
          scope: "workbook" as const,
          cellAddress: "$A$1",
        },
        {
          ...name,
          rangeName: "LOCAL_NAME",
          tabName: target,
          scope: "sheet" as const,
          cellAddress: "B2",
        },
      ],
    };
    const spec = buildXLSXSpec(workbook);
    const parsed = XLSX.read(writeXLSXBuffer(spec), { type: "buffer" });
    const names = parsed.Workbook?.Names ?? [];
    expect(names.find((entry) => entry.Name === "GLOBAL_NAME")?.Ref).toBe(
      "'Owner''s sheet'!$A$1",
    );
    const local = names.find((entry) => entry.Name === "LOCAL_NAME");
    expect(local?.Ref).toBe("'Owner''s sheet'!B2");
    expect(local?.Sheet).toBe(parsed.SheetNames.indexOf(target));
  });

  it("fails closed for missing formulas, conflicting values and invalid cell addresses", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      ...fixture,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");
    const sheet = result.workbook.sheets[0];
    const formula = sheet?.cells.find((cell) => cell.kind === "formula");
    if (!sheet || !formula) throw new Error("fixture lacks formula");
    for (const altered of [
      { ...formula, formulaText: null },
      { ...formula, formulaText: "=" },
      { ...formula, value: 0 },
      { ...formula, address: "A0" },
    ]) {
      const workbook = {
        ...result.workbook,
        sheets: [{ ...sheet, cells: [altered] }],
      };
      expect(() => buildXLSXSpec(workbook)).toThrow();
    }
  });

  it("keeps literal equals text literal and writes hidden sheet metadata", () => {
    const bytes = writeXLSXBuffer({
      sheets: [
        { name: "Visible", hidden: false, rows: [["=literal"]] },
        {
          name: "Hidden",
          hidden: true,
          rows: [],
          formulas: [{ address: "Z50", formulaText: "=1+2" }],
        },
      ],
      namedRanges: [],
    });
    const parsed = XLSX.read(bytes, { type: "buffer", sheetStubs: true });
    const literal = parsed.Sheets.Visible?.A1 as XLSX.CellObject | undefined;
    const formula = parsed.Sheets.Hidden?.Z50 as XLSX.CellObject | undefined;
    expect(literal?.v).toBe("=literal");
    expect(literal?.f).toBeUndefined();
    expect(formula?.f).toBe("1+2");
    expect(parsed.Workbook?.Sheets?.[0]?.Hidden).toBe(0);
    expect(parsed.Workbook?.Sheets?.[1]?.Hidden).toBe(1);
  });

  it("rejects named ranges with missing targets and bounded export overflow", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      ...fixture,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");
    const sheet = result.workbook.sheets[0];
    const cell = sheet?.cells[0];
    if (!sheet || !cell) throw new Error("fixture lacks cell");
    const namedRange = {
      rangeName: "MISSING",
      tabName: "Other",
      scope: "workbook" as const,
      cellAddress: "A1",
      genericField: null,
      scenarioId: null,
      provenance: {
        source: "architecture" as const,
        architectureNamedRange: "MISSING",
      },
    };
    expect(() =>
      buildXLSXSpec({ ...result.workbook, namedRanges: [namedRange] }),
    ).toThrow("missing sheet");
    expect(() =>
      buildXLSXSpec({
        ...result.workbook,
        sheets: [{ ...sheet, cells: [{ ...cell, address: "XFD1048576" }] }],
      }),
    ).toThrow("bounded export grid");
  });

  it("produces byte-identical XLSX output from identical inputs", async () => {
    const fixture = await createFixture();
    const input = {
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    };
    const first = await buildWorkbook(input);
    const second = await buildWorkbook(input);
    if (!first.ok || !second.ok) throw new Error("workbook build failed");

    const spec1 = buildXLSXSpec(first.workbook);
    const spec2 = buildXLSXSpec(second.workbook);
    const bytes1 = writeXLSXBytes(spec1);
    const bytes2 = writeXLSXBytes(spec2);
    expect(bytes1).toEqual(bytes2);
  });

  it("computes a deterministic XLSX hash", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const spec = buildXLSXSpec(result.workbook);
    const hash1 = await computeXLSXHash(spec);
    const hash2 = await computeXLSXHash(spec);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("includes all three support sheets in XLSX output", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const spec = buildXLSXSpec(result.workbook);
    const sheetNames = spec.sheets.map((s) => s.name);
    expect(sheetNames).toContain("Summary");
    expect(sheetNames).toContain("Tables");
    expect(sheetNames).toContain("UD Table");
  });

  it("populates summary sheet rows with metadata values", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const spec = buildXLSXSpec(result.workbook);
    const summary = spec.sheets.find((s) => s.name === "Summary");
    expect(summary).toBeDefined();
    if (summary === undefined) return;
    expect(summary.rows[0]?.[0]).toBe("PBGC V1 Workbook Summary");
    expect(summary.rows[2]?.[0]).toBe("Case ID");
    expect(summary.rows[2]?.[1]).toBe(fixture.buildSpec.caseId);
  });
});
