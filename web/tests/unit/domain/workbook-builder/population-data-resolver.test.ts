import { describe, expect, it } from "vitest";
import {
  createPopulationDataResolver,
  resolveCellValue,
} from "../../../../src/domain/workbook-builder/population-data-resolver";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import type { Sha256 } from "../../../../src/domain/shared/types";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

function makeResolver() {
  const data = new Map([
    [
      "RETIREES",
      new Map([
        ["COMP", [50000, 60000, 70000]],
        ["YOS", [10, 15, 20]],
      ]),
    ],
  ]);
  return createPopulationDataResolver(data);
}

describe("PopulationDataResolver", () => {
  it("resolves cell values from population data", () => {
    const resolver = makeResolver();
    expect(
      resolveCellValue(
        resolver,
        { sourceType: "population", sourceTab: "RETIREES", sourceField: "COMP", evidenceKey: null },
        0,
      ),
    ).toBe(50000);
    expect(
      resolveCellValue(
        resolver,
        { sourceType: "population", sourceTab: "RETIREES", sourceField: "COMP", evidenceKey: null },
        2,
      ),
    ).toBe(70000);
  });

  it("returns null for out-of-range index", () => {
    const resolver = makeResolver();
    expect(
      resolveCellValue(
        resolver,
        { sourceType: "population", sourceTab: "RETIREES", sourceField: "COMP", evidenceKey: null },
        10,
      ),
    ).toBeNull();
  });

  it("returns empty array for unknown tab", () => {
    const resolver = makeResolver();
    expect(resolver.resolve("UNKNOWN", "FIELD")).toEqual([]);
  });
});

describe("workbook builder with population data", () => {
  it("populates I cells with resolved population values", async () => {
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

    const populationData = new Map([
      [
        "RETIREES",
        new Map([
          ["COMP", [50000]],
          ["YOS", [10]],
        ]),
      ],
    ]);

    const result = await buildWorkbook({
      buildSpec,
      populationProfile: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
        provenance: ["population-approval-1"],
      },
      workbookProfileContentSha256,
      generatorVersion: "1.0.0",
      populationData,
    });
    if (!result.ok) throw new Error("workbook build failed");

    const retireeSheet = result.workbook.sheets.find((s) => s.name === "RETIREES");
    expect(retireeSheet).toBeDefined();
    if (retireeSheet === undefined) return;

    const compCell = retireeSheet.cells.find(
      (c) => c.kind === "input" && c.dataSource?.columnIdentifier === "COMP",
    );
    expect(compCell).toBeDefined();
    if (compCell !== undefined) {
      expect(compCell.value).toBe(50000);
    }

    const yosCell = retireeSheet.cells.find(
      (c) => c.kind === "input" && c.dataSource?.columnIdentifier === "YOS",
    );
    expect(yosCell).toBeDefined();
    if (yosCell !== undefined) {
      expect(yosCell.value).toBe(10);
    }
  });

  it("produces null values when no population data is provided", async () => {
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

    const result = await buildWorkbook({
      buildSpec,
      populationProfile: {
        status: "approved",
        effectiveDecisionId: "population-approval-1",
        effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
        provenance: ["population-approval-1"],
      },
      workbookProfileContentSha256,
      generatorVersion: "1.0.0",
    });
    if (!result.ok) throw new Error("workbook build failed");

    const retireeSheet = result.workbook.sheets.find((s) => s.name === "RETIREES");
    expect(retireeSheet).toBeDefined();
    if (retireeSheet === undefined) return;

    const inputCells = retireeSheet.cells.filter((c) => c.kind === "input");
    for (const cell of inputCells) {
      expect(cell.value).toBeNull();
    }
  });
});
