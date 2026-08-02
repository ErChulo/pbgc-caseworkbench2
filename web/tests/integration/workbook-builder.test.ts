import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../../src/domain/workbook-builder/workbook-builder";
import {
  buildXLSXSpec,
  writeXLSXBuffer,
  computeXLSXHash,
} from "../../src/domain/workbook-builder/serialization";
import type { Sha256 } from "../../src/domain/shared/types";
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
    const buffer = await writeXLSXBuffer(spec);
    expect(buffer.slice(0, 4).toString("hex")).toBe("504b0304");
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
          provenance: { source: "architecture" as const, architectureNamedRange: "COMP" },
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
