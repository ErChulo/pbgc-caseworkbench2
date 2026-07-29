import { describe, expect, it } from "vitest";
import { validateBuildSpec } from "../../../../src/domain/build-spec/validator";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

describe("BuildSpec validator", () => {
  it("accepts a complete v2 specification", async () => {
    expect(validateBuildSpec({ buildSpec: await buildSpecV2() }).isValid).toBe(
      true,
    );
  });

  it("aggregates duplicate mappings, ranges, missing formulas, and dependencies", async () => {
    const source = await buildSpecV2();
    const firstMapping = source.cellMappings[0];
    if (!firstMapping) throw new Error("Fixture has no mapping.");
    const firstFormula = source.formulas[0];
    if (!firstFormula) throw new Error("Fixture has no formula.");
    const invalid = {
      ...source,
      formulas: [{ ...firstFormula, dependencies: ["FORMULA-MISSING"] }],
      cellMappings: [...source.cellMappings, firstMapping],
      namedRanges: [
        {
          rangeName: "DUP",
          cellAddress: "A1",
          tabName: "RETIREES",
          scope: "workbook" as const,
          genericField: "A",
          scenarioId: null,
          provenance: {
            source: "architecture" as const,
            architectureNamedRange: "DUP",
          },
        },
        {
          rangeName: "dup",
          cellAddress: "B1",
          tabName: "RETIREES",
          scope: "workbook" as const,
          genericField: "B",
          scenarioId: null,
          provenance: {
            source: "architecture" as const,
            architectureNamedRange: "dup",
          },
        },
      ],
    };
    const codes = validateBuildSpec({ buildSpec: invalid }).errors.map(
      (error) => error.code,
    );
    expect(codes).toContain("DUPLICATE_MAPPING");
    expect(codes).toContain("DUPLICATE_RANGE");
    expect(codes).toContain("UNSATISFIED_DEPENDENCY");
    expect(codes).toContain("MISSING_FORMULA");
  });

  it("rejects unknown, missing, duplicate, and forged execution metadata", async () => {
    const source = await buildSpecV2();
    const firstId = source.formulas[0]?.formulaId;
    if (!firstId) throw new Error("Fixture has no formula.");
    const result = validateBuildSpec({
      buildSpec: {
        ...source,
        executionOrder: {
          order: [firstId, firstId, "FORMULA-UNKNOWN"],
          levelCount: 99,
          maxDepth: 98,
          hasCycles: true,
          cycleNodes: [firstId],
        },
      },
    });
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some(
        (error) =>
          error.code === "UNSATISFIED_DEPENDENCY" &&
          JSON.stringify(error.context).includes("FORMULA-UNKNOWN"),
      ),
    ).toBe(true);
    expect(
      result.errors.some((error) =>
        error.message.includes("deterministic recomputation"),
      ),
    ).toBe(true);
  });

  it.each(["XFE1", "A1048577", "a1", "A0"])(
    "rejects non-canonical or out-of-grid address %s",
    async (cellAddress) => {
      const source = await buildSpecV2();
      const first = source.cellMappings[0];
      if (!first) throw new Error("Fixture has no mapping.");
      const result = validateBuildSpec({
        buildSpec: {
          ...source,
          cellMappings: [
            { ...first, cellAddress },
            ...source.cellMappings.slice(1),
          ],
        },
      });
      expect(result.errors.map((error) => error.code)).toContain(
        "INVALID_CELL_ADDRESS",
      );
    },
  );
});
