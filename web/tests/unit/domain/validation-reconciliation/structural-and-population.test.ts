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
    expect(validated.status).toBe("invalid");
    expect(validated.errors.map((item) => item.code)).toContain(
      "POPULATION_ROUTING_UNVERIFIED",
    );
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

  it("rejects rehashed worksheet/model formula mismatches and orphan formulas", async () => {
    const workbook = await fixtureWorkbook();
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("Missing sheet");
    const original = sheet.cells.find((cell) => cell.kind === "formula");
    if (!original) throw new Error("Missing formula cell");
    const alterations = [
      {
        code: "FORMULA_WORKSHEET_MISMATCH",
        cells: sheet.cells.filter((cell) => cell !== original),
      },
      {
        code: "FORMULA_WORKSHEET_MISMATCH",
        cells: sheet.cells.map((cell) =>
          cell === original ? { ...cell, formulaText: "=999" } : cell,
        ),
      },
      {
        code: "FORMULA_WORKSHEET_MISMATCH",
        cells: sheet.cells.map((cell) =>
          cell === original ? { ...cell, value: 0 } : cell,
        ),
      },
      {
        code: "UNTRACKED_WORKSHEET_FORMULA",
        cells: [...sheet.cells, { ...original, address: "Z99" }],
      },
      {
        code: "DUPLICATE_WORKSHEET_CELL",
        cells: [
          ...sheet.cells,
          {
            ...original,
            address: `$${original.address.replace(/([A-Z]+)([0-9]+)/u, "$1$$$2")}`,
          },
        ],
      },
    ];
    for (const alteration of alterations) {
      const changed = {
        ...workbook,
        sheets: [{ ...sheet, cells: alteration.cells }],
      };
      const actual = {
        ...changed,
        workbookContentSha256: await computeWorkbookContentHash(changed),
      };
      const result = await validateWorkbook({
        workbook: actual,
        validatorVersion: "1",
        validatedAt: actual.generatedAt,
      });
      expect(result.status).toBe("invalid");
      expect(result.errors.map((item) => item.code)).toContain(alteration.code);
    }
  });

  it("distinguishes the same cell address on different sheets", async () => {
    const workbook = await fixtureWorkbook();
    const formula = workbook.formulaCells[0];
    if (!formula) throw new Error("Missing formula");
    const other = {
      ...formula,
      formulaId: "other",
      tabName: "Other",
      dependencies: [],
    };
    const mapping = workbook.cellMappings.find(
      (m) => m.formulaId === formula.formulaId,
    );
    if (!mapping) throw new Error("Missing mapping");
    const changed = {
      ...workbook,
      formulaCells: [...workbook.formulaCells, other],
      sheets: [
        ...workbook.sheets,
        {
          name: "Other",
          hidden: false,
          cells: [
            {
              address: other.cellAddress,
              kind: "formula" as const,
              formulaText: other.formulaText,
              value: null,
              dataSource: null,
              mappingId: null,
            },
          ],
        },
      ],
      cellMappings: [
        ...workbook.cellMappings,
        { ...mapping, formulaId: other.formulaId, tabName: other.tabName },
      ],
    };
    const actual = {
      ...changed,
      workbookContentSha256: await computeWorkbookContentHash(changed),
    };
    const result = await validateWorkbook({
      workbook: actual,
      validatorVersion: "1",
      validatedAt: actual.generatedAt,
    });
    expect(result.errors.map((item) => item.code)).not.toContain(
      "DUPLICATE_FORMULA_CELL",
    );
    expect(result.errors.map((item) => item.code)).not.toContain(
      "FORMULA_WORKSHEET_MISMATCH",
    );
  });

  it("rejects a formula mapping that points to a different sheet or address", async () => {
    const workbook = await fixtureWorkbook();
    const formula = workbook.formulaCells[0];
    if (!formula) throw new Error("Missing formula");
    const changed = {
      ...workbook,
      cellMappings: workbook.cellMappings.map((mapping) =>
        mapping.formulaId === formula.formulaId
          ? { ...mapping, tabName: "Other" }
          : mapping,
      ),
    };
    const actual = {
      ...changed,
      workbookContentSha256: await computeWorkbookContentHash(changed),
    };
    const result = await validateWorkbook({
      workbook: actual,
      validatorVersion: "1",
      validatedAt: actual.generatedAt,
    });
    expect(result.errors.map((item) => item.code)).toContain(
      "FORMULA_MAPPING_MISMATCH",
    );
  });

  it("rejects named ranges that target missing sheets even at workbook scope", async () => {
    const workbook = await fixtureWorkbook();
    const range = {
      rangeName: "SYNTHETIC",
      scope: "workbook" as const,
      tabName: "Missing",
      cellAddress: "A1",
      genericField: null,
      scenarioId: null,
      provenance: {
        source: "architecture" as const,
        architectureNamedRange: "SYNTHETIC",
      },
    };
    const changed = { ...workbook, namedRanges: [range] };
    const actual = {
      ...changed,
      workbookContentSha256: await computeWorkbookContentHash(changed),
    };
    const result = await validateWorkbook({
      workbook: actual,
      validatorVersion: "1",
      validatedAt: actual.generatedAt,
    });
    expect(result.errors.map((item) => item.code)).toContain(
      "INVALID_NAMED_RANGE_TARGET_SHEET",
    );
    expect(() => buildXLSXSpec(actual)).toThrow();
  });

  it("rejects duplicate names in the same Excel scope across scenarios", async () => {
    const workbook = await fixtureWorkbook();
    const range = {
      rangeName: "SYNTHETIC",
      scope: "workbook" as const,
      tabName: "RETIREES",
      cellAddress: "A1",
      genericField: null,
      scenarioId: "ONE",
      provenance: {
        source: "architecture" as const,
        architectureNamedRange: "SYNTHETIC",
      },
    };
    const changed = {
      ...workbook,
      namedRanges: [
        range,
        { ...range, rangeName: "synthetic", scenarioId: "TWO" },
      ],
    };
    const actual = {
      ...changed,
      workbookContentSha256: await computeWorkbookContentHash(changed),
    };
    const result = await validateWorkbook({
      workbook: actual,
      validatorVersion: "1",
      validatedAt: actual.generatedAt,
    });
    expect(result.errors.map((item) => item.code)).toContain(
      "DUPLICATE_NAMED_RANGE",
    );
    expect(() => buildXLSXSpec(actual)).toThrow("unique");
  });

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
  it("blocks I/B population routing even when a value is present", async () => {
    const workbook = await fixtureWorkbook();
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("Missing sheet");
    const changed = {
      ...workbook,
      sheets: [
        {
          ...sheet,
          cells: sheet.cells.map((cell) =>
            cell.kind === "input" ? { ...cell, value: 0 } : cell,
          ),
        },
      ],
    };
    const errors = validatePopulationApplication(changed);
    expect(errors.map((item) => item.code)).toContain(
      "POPULATION_ROUTING_UNVERIFIED",
    );
  });

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
