import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import { buildXLSXSpec } from "../../../../src/domain/workbook-builder/serialization";
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
});
