import { describe, expect, it } from "vitest";
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
    expect(spec.sheets.map((s) => s.name)).toEqual([
      "Summary",
      "Tables",
      "UD Table",
    ]);
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
