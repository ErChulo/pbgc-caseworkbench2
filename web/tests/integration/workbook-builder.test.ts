import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../../src/domain/workbook-builder/workbook-builder";
import {
  buildXLSXSpec,
  writeXLSXBuffer,
  computeXLSXHash,
} from "../../src/domain/workbook-builder/serialization";
import {
  parseCsvToRegistry,
  registryToPopulationData,
} from "../../src/domain/workbook-builder/population-data-registry";
import type { Sha256, Uuid } from "../../src/domain/shared/types";
import type { BuildSpecV2 } from "../../src/domain/build-spec/models";
import { buildSpecV2 } from "../fixtures/formula-compiler";

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

describe("Feature 007 workbook builder integration", () => {
  it("produces a complete, deterministic workbook from governed inputs", async () => {
    const fixture = await createFixture();
    const input = {
      buildSpec: fixture.buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    };

    const first = await buildWorkbook(input);
    const second = await buildWorkbook(input);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;

    const { workbook } = first;
    expect(workbook.workbookContentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(workbook.support.summarySheet.caseId).toBe(fixture.buildSpec.caseId);
    expect(workbook.support.summarySheet.buildSpecId).toBe(
      fixture.buildSpec.buildSpecId,
    );
  });

  it("serializes to a valid XLSX buffer with correct ZIP magic bytes", async () => {
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
    expect(buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(buffer.length).toBeGreaterThan(100);
  });

  it("computes deterministic XLSX content hash", async () => {
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

  it("rejects workbook generation for unapproved population", async () => {
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
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.code === "POPULATION_UNAPPROVED" ||
            e.code === "MISSING_POPULATION_DECISION",
        ),
      ).toBe(true);
    }
  });

  it("preserves named range scope and exact cell references", async () => {
    const fixture = await createFixture();
    const buildSpec = {
      ...fixture.buildSpec,
      namedRanges: [
        {
          rangeName: "COMP",
          cellAddress: "A1",
          tabName: "RETIREES",
          scope: "workbook" as const,
          genericField: "COMP",
          scenarioId: null,
          provenance: {
            source: "architecture" as const,
            architectureNamedRange: "COMP",
          },
        },
      ],
    };
    const result = await buildWorkbook({
      buildSpec,
      populationProfile: fixture.populationProfile,
      workbookProfileContentSha256: fixture.workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const spec = buildXLSXSpec(result.workbook);
    expect(spec.namedRanges.length).toBe(1);
    expect(spec.namedRanges[0]?.name).toBe("COMP");
    expect(spec.namedRanges[0]?.reference).toContain("!");
  });
});

describe("population data integration with arbitrary fields", () => {
  it("populates I cells from CSV population data", async () => {
    const csv = "COMP,YOS\n50000,10\n60000,15\n70000,20\n";
    const registry = parseCsvToRegistry(csv, "RETIREES");
    const populationData = registryToPopulationData(registry);

    const baseBuildSpec = await buildSpecV2();
    const workbookProfileContentSha256 = "e".repeat(64) as Sha256;
    const buildSpec: BuildSpecV2 = {
      ...baseBuildSpec,
      architectureLineage: {
        ...baseBuildSpec.architectureLineage,
        population: [
          {
            candidateKey: "c".repeat(64) as Sha256,
            artifactSha256: "d".repeat(64) as Sha256,
            workbookProfileContentSha256,
            approvalDecisionId: "pop-approval",
            approvalDecisionContentSha256: "f".repeat(64) as Sha256,
          },
        ],
      },
    };

    const result = await buildWorkbook({
      buildSpec,
      populationProfile: {
        status: "approved",
        effectiveDecisionId: "pop-approval",
        effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
        provenance: ["pop-approval"],
      },
      workbookProfileContentSha256,
      generatorVersion: "1.0.0",
      populationData,
    });
    if (!result.ok)
      throw new Error(
        `workbook build failed: ${JSON.stringify(result.errors)}`,
      );

    const retireeSheet = result.workbook.sheets.find(
      (s) => s.name === "RETIREES",
    );
    expect(retireeSheet).toBeDefined();
    if (retireeSheet === undefined) return;

    const compCells = retireeSheet.cells.filter(
      (c) => c.dataSource?.columnIdentifier === "COMP",
    );
    expect(compCells.length).toBeGreaterThan(0);
    expect(compCells[0]?.value).toBe("50000");

    const yosCells = retireeSheet.cells.filter(
      (c) => c.dataSource?.columnIdentifier === "YOS",
    );
    expect(yosCells.length).toBeGreaterThan(0);
    expect(yosCells[0]?.value).toBe("10");
  });

  it("handles arbitrary user-defined field names", async () => {
    const csv =
      "MY_CUSTOM_FIELD,ANOTHER_USER_FIELD,CALC_AVG_COMP\nfoo,bar,42\n";
    const registry = parseCsvToRegistry(csv, "CUSTOM_TAB");
    const populationData = registryToPopulationData(registry);

    const baseBuildSpec = await buildSpecV2();
    const workbookProfileContentSha256 = "e".repeat(64) as Sha256;
    const buildSpec: BuildSpecV2 = {
      ...baseBuildSpec,
      architectureLineage: {
        ...baseBuildSpec.architectureLineage,
        population: [
          {
            candidateKey: "c".repeat(64) as Sha256,
            artifactSha256: "d".repeat(64) as Sha256,
            workbookProfileContentSha256,
            approvalDecisionId: "pop-approval",
            approvalDecisionContentSha256: "f".repeat(64) as Sha256,
          },
        ],
      },
      cellMappings: [
        {
          mappingId: "00000000-0000-4000-8000-000000000001" as Uuid,
          field: "MY_CUSTOM_FIELD",
          tabName: "RETIREES",
          cellAddress: "A1",
          iobClassification: "I",
          dataSource: {
            sourceType: "population",
            sourceTab: "CUSTOM_TAB",
            sourceField: "MY_CUSTOM_FIELD",
            evidenceKey: null,
          },
          formulaId: null,
          scenarioId: "DOR",
        },
        {
          mappingId: "00000000-0000-4000-8000-000000000002" as Uuid,
          field: "ANOTHER_USER_FIELD",
          tabName: "RETIREES",
          cellAddress: "B1",
          iobClassification: "I",
          dataSource: {
            sourceType: "population",
            sourceTab: "CUSTOM_TAB",
            sourceField: "ANOTHER_USER_FIELD",
            evidenceKey: null,
          },
          formulaId: null,
          scenarioId: "DOR",
        },
      ],
    };

    const result = await buildWorkbook({
      buildSpec,
      populationProfile: {
        status: "approved",
        effectiveDecisionId: "pop-approval",
        effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
        provenance: ["pop-approval"],
      },
      workbookProfileContentSha256,
      generatorVersion: "1.0.0",
      populationData,
    });
    if (!result.ok)
      throw new Error(
        `workbook build failed: ${JSON.stringify(result.errors)}`,
      );

    const retireeSheet = result.workbook.sheets.find(
      (s) => s.name === "RETIREES",
    );
    expect(retireeSheet).toBeDefined();
    if (retireeSheet === undefined) return;

    const customCell = retireeSheet.cells.find(
      (c) => c.dataSource?.columnIdentifier === "MY_CUSTOM_FIELD",
    );
    expect(customCell?.value).toBe("foo");

    const anotherCell = retireeSheet.cells.find(
      (c) => c.dataSource?.columnIdentifier === "ANOTHER_USER_FIELD",
    );
    expect(anotherCell?.value).toBe("bar");
  });

  it("handles multiple population tabs", async () => {
    const registry1 = parseCsvToRegistry("COMP\n50000\n", "RETIREES");
    const registry2 = parseCsvToRegistry("SALARY\n80000\n", "ACTIVE");
    const popData1 = registryToPopulationData(registry1);
    const popData2 = registryToPopulationData(registry2);

    const merged = new Map([...popData1, ...popData2]);

    const baseBuildSpec = await buildSpecV2();
    const workbookProfileContentSha256 = "e".repeat(64) as Sha256;
    const buildSpec: BuildSpecV2 = {
      ...baseBuildSpec,
      architectureLineage: {
        ...baseBuildSpec.architectureLineage,
        population: [
          {
            candidateKey: "c".repeat(64) as Sha256,
            artifactSha256: "d".repeat(64) as Sha256,
            workbookProfileContentSha256,
            approvalDecisionId: "pop-approval",
            approvalDecisionContentSha256: "f".repeat(64) as Sha256,
          },
        ],
      },
      cellMappings: [
        ...baseBuildSpec.cellMappings,
        {
          mappingId: "00000000-0000-4000-8000-000000000003" as Uuid,
          field: "SALARY",
          tabName: "ACTIVE",
          cellAddress: "A1",
          iobClassification: "I",
          dataSource: {
            sourceType: "population",
            sourceTab: "ACTIVE",
            sourceField: "SALARY",
            evidenceKey: null,
          },
          formulaId: null,
          scenarioId: "DOR",
        },
      ],
    };

    const result = await buildWorkbook({
      buildSpec,
      populationProfile: {
        status: "approved",
        effectiveDecisionId: "pop-approval",
        effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
        provenance: ["pop-approval"],
      },
      workbookProfileContentSha256,
      generatorVersion: "1.0.0",
      populationData: merged,
    });
    if (!result.ok)
      throw new Error(
        `workbook build failed: ${JSON.stringify(result.errors)}`,
      );

    expect(result.workbook.sheets.some((s) => s.name === "RETIREES")).toBe(
      true,
    );
    expect(result.workbook.sheets.some((s) => s.name === "ACTIVE")).toBe(true);

    const activeSheet = result.workbook.sheets.find((s) => s.name === "ACTIVE");
    expect(activeSheet).toBeDefined();
    if (activeSheet !== undefined) {
      const salaryCell = activeSheet.cells.find(
        (c) => c.dataSource?.columnIdentifier === "SALARY",
      );
      expect(salaryCell?.value).toBe("80000");
    }
  });
});
