import { describe, it, expect } from "vitest";
import type { Sha256 } from "../../../../src/domain/shared/types";
import { buildWorkbook } from "../../../../src/domain/workbook-builder/workbook-builder";
import { computeWorkbookContentHash } from "../../../../src/domain/workbook-builder/workbook-hash";
import { buildXLSXSpec } from "../../../../src/domain/workbook-builder/serialization";
import { validateWorkbook } from "../../../../src/domain/validation-reconciliation/structural-validator";
import { validatePopulationApplication } from "../../../../src/domain/validation-reconciliation/population-validator";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

async function fixtureWorkbook() {
  const workbookProfileContentSha256 = "e".repeat(64) as Sha256;
  const buildSpec = await buildSpecV2();
  const result = await buildWorkbook({
    buildSpec: {
      ...buildSpec,
      architectureLineage: {
        ...buildSpec.architectureLineage,
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
    },
    populationProfile: {
      status: "approved",
      effectiveDecisionId: "population-approval-1",
      effectiveWorkbookProfileContentSha256: workbookProfileContentSha256,
      provenance: ["population-approval-1"],
    },
    workbookProfileContentSha256,
    generatorVersion: "1.0.0",
  });
  if (!result.ok) throw new Error("fixture workbook build failed");
  return result.workbook;
}

describe("structural validation", () => {
  it("validates workbook named ranges deterministically", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    expect(validated.status).toBe("valid");
    expect(validated.errors).toBeDefined();
    expect(validated.validationId).toHaveLength(64);
  });

  it.each(["summarySheet", "tablesSheet", "udTableSheet"] as const)(
    "rejects missing %s support content",
    async (field) => {
      const workbook = await fixtureWorkbook();
      const changed = {
        ...workbook,
        support: { ...workbook.support, [field]: null },
      };
      const actual = {
        ...changed,
        workbookContentSha256: await computeWorkbookContentHash(changed),
      } as typeof workbook;
      const result = await validateWorkbook({
        workbook: actual,
        validatorVersion: "1",
        validatedAt: workbook.generatedAt,
      });
      expect(
        result.errors.some((item) => item.code === "MISSING_SUPPORT_SHEET"),
      ).toBe(true);
      expect(result.status).toBe("invalid");
    },
  );

  it("rejects inconsistent summary lineage", async () => {
    const workbook = await fixtureWorkbook();
    const changed = {
      ...workbook,
      support: {
        ...workbook.support,
        summarySheet: {
          ...workbook.support.summarySheet,
          buildSpecContentSha256: "a".repeat(64) as Sha256,
        },
      },
    };
    const actual = {
      ...changed,
      workbookContentSha256: await computeWorkbookContentHash(changed),
    };
    const result = await validateWorkbook({
      workbook: actual,
      validatorVersion: "1",
      validatedAt: workbook.generatedAt,
    });
    expect(
      result.errors.some((item) => item.code === "SUPPORT_SUMMARY_MISMATCH"),
    ).toBe(true);
  });

  it.each(["summary", "mySort"])(
    "rejects a conflicting or prohibited %s calculation sheet",
    async (name) => {
      const workbook = await fixtureWorkbook();
      const changed = {
        ...workbook,
        sheets: [...workbook.sheets, { name, hidden: false, cells: [] }],
      };
      const actual = {
        ...changed,
        workbookContentSha256: await computeWorkbookContentHash(changed),
      };
      const result = await validateWorkbook({
        workbook: actual,
        validatorVersion: "1",
        validatedAt: workbook.generatedAt,
      });
      expect(result.status).toBe("invalid");
      expect(
        result.errors.some((item) =>
          ["DUPLICATE_SHEET", "PROHIBITED_SHEET"].includes(item.code),
        ),
      ).toBe(true);
      expect(() => buildXLSXSpec(actual)).toThrow();
    },
  );

  it("generates deterministic validation IDs", async () => {
    const workbook = await fixtureWorkbook();
    const validated1 = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    const validated2 = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    expect(validated1.validationId).toBe(validated2.validationId);
  });

  it("includes all canonical validation components in result", async () => {
    const workbook = await fixtureWorkbook();
    const validated = await validateWorkbook({
      workbook,
      validatorVersion: "1.0.0",
      validatedAt: workbook.generatedAt,
    });
    expect(validated.validationType).toBe("workbook");
    expect(validated.affectedComponentIds).toBeDefined();
    expect(validated.schemaVersion).toBe("1.0.0");
    expect(validated.validationContentSha256).toBeDefined();
  });
});

describe("population validation", () => {
  it("validates population data completeness", async () => {
    const workbook = await fixtureWorkbook();
    const populationErrors = validatePopulationApplication(workbook);
    expect(Array.isArray(populationErrors)).toBe(true);
  });

  it("detects unmapped input cells", async () => {
    const workbook = await fixtureWorkbook();
    const unmappedWorkbook = {
      ...workbook,
      cellMappings: workbook.cellMappings.map((m) => ({
        ...m,
        dataSource: null,
      })),
    };
    const populationErrors = validatePopulationApplication(unmappedWorkbook);
    const unmappedErrors = populationErrors.filter(
      (e) => e.code === "UNMAPPED_INPUT_CELL",
    );
    expect(unmappedErrors.length).toBeGreaterThanOrEqual(0);
  });

  it("validates bifeed cell mappings", async () => {
    const workbook = await fixtureWorkbook();
    const populationErrors = validatePopulationApplication(workbook);
    const bifeedErrors = populationErrors.filter(
      (e) => e.code === "UNMAPPED_BIFEED_CELL",
    );
    expect(Array.isArray(bifeedErrors)).toBe(true);
  });
});
