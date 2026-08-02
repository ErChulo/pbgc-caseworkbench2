import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import { buildXLSXSpec, computeWorkbookHash } from "../../../../src/domain/workbook-builder/serialization";
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
    namedRanges: [
      {
        rangeName: "COMP",
        cellAddress: "A1",
        tabName: "RETIREES",
        scope: "workbook" as const,
        genericField: "COMP",
        scenarioId: null,
        provenance: { source: "architecture" as const, architectureNamedRange: "COMP" },
      },
      {
        rangeName: "SUBTOTAL",
        cellAddress: "C1",
        tabName: "RETIREES",
        scope: "sheet" as const,
        genericField: null,
        scenarioId: null,
        provenance: { source: "architecture" as const, architectureNamedRange: "SUBTOTAL" },
      },
    ],
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

describe("workbook builder foundation", () => {
  it("builds a deterministic workbook payload from build spec", async () => {
    const fixture = await createFixture();

    const first = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    const second = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("builds required support-sheet spec", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const spec = buildXLSXSpec(result.workbook);
    expect(spec.sheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Tables",
      "UD Table",
    ]);
    expect(spec.namedRanges.map((range) => range.name)).toEqual([
      "COMP",
      "SUBTOTAL",
    ]);
  });

  it("computes a deterministic content hash for the workbook", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const { workbookContentSha256: _, ...payload } = result.workbook;
    void _;
    const hash1 = await computeWorkbookHash(payload);
    const hash2 = await computeWorkbookHash(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash1).toBe(result.workbook.workbookContentSha256);
  });

  it("populates summary sheet with complete lineage metadata", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const summary = result.workbook.support.summarySheet;
    expect(summary.caseId).toBe(fixture.buildSpec.caseId);
    expect(summary.architectureId).toBe(fixture.buildSpec.architectureId);
    expect(summary.architectureContentSha256).toBe(
      fixture.buildSpec.architectureContentSha256,
    );
    expect(summary.buildSpecId).toBe(fixture.buildSpec.buildSpecId);
    expect(summary.buildSpecContentSha256).toBe(
      fixture.buildSpec.buildSpecContentSha256,
    );
    expect(summary.populationProfileDecisionId).toBe("population-approval-1");
    expect(summary.generatorVersion).toBe("1.0.0");
    expect(summary.workbookContentSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("populates UD Table with named ranges and cell mappings", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const udTable = result.workbook.support.udTableSheet;
    expect(udTable.namedRanges).toHaveLength(2);
    expect(udTable.namedRanges[0]?.name).toBe("COMP");
    expect(udTable.namedRanges[0]?.scope).toBe("workbook");
    expect(udTable.namedRanges[1]?.name).toBe("SUBTOTAL");
    expect(udTable.namedRanges[1]?.scope).toBe("sheet");
  });

  it("rejects build when population profile is unapproved", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: {
        status: "provisional" as const,
        effectiveDecisionId: null,
        effectiveWorkbookProfileContentSha256: null,
        provenance: [],
      },
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "POPULATION_UNAPPROVED")).toBe(true);
    }
  });

  it("rejects build when I cell has no data source", async () => {
    const fixture = await createFixture();
    const buildSpec = {
      ...fixture.buildSpec,
      cellMappings: [
        {
          mappingId: "00000000-0000-4000-8000-000000000001" as import("../../../../src/domain/shared/types").Uuid,
          field: "DOB",
          tabName: "Retirees",
          cellAddress: "A1",
          iobClassification: "I" as const,
          dataSource: null,
          formulaId: null,
          scenarioId: "NRD",
        },
      ],
    };
    const result = await buildWorkbook({
      buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "MISSING_DATA_SOURCE")).toBe(true);
    }
  });

  it("populates tables sheet with plan rules from formula provenance", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const tables = result.workbook.support.tablesSheet;
    expect(tables.rules.length).toBeGreaterThan(0);
    const firstRule = tables.rules[0];
    expect(firstRule?.ruleId).toBeTruthy();
    expect(firstRule?.statement).toBeTruthy();
    expect(firstRule?.effectiveDate).toBeTruthy();
  });

  it("deduplicates plan rules across formulas", async () => {
    const fixture = await createFixture();
    const result = await buildWorkbook({
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const tables = result.workbook.support.tablesSheet;
    const ruleIds = tables.rules.map((r) => r.ruleId);
    const uniqueRuleIds = [...new Set(ruleIds)];
    expect(ruleIds).toEqual(uniqueRuleIds);
  });
});
