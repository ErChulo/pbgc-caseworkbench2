import { describe, expect, it } from "vitest";
import { validateContract } from "../../../../src/contracts/schema-validator";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

describe("BuildSpec schema", () => {
  it("accepts provenance-complete BuildSpec 2.0.0", async () => {
    expect(validateContract("buildSpec", await buildSpecV2()).valid).toBe(true);
  });

  it("rejects v1 and missing formula governance", async () => {
    const buildSpec = await buildSpecV2();
    expect(
      validateContract("buildSpec", { ...buildSpec, schemaVersion: "1.0.0" })
        .valid,
    ).toBe(false);
    const withoutProvenance = buildSpec.formulas.map((formula) =>
      Object.fromEntries(
        Object.entries(formula).filter(([key]) => key !== "provenance"),
      ),
    );
    expect(
      validateContract("buildSpec", {
        ...buildSpec,
        formulas: withoutProvenance,
      }).valid,
    ).toBe(false);
  });

  it("requires compiler/runtime fields and permits nullable named-range generic fields", async () => {
    const buildSpec = await buildSpecV2();
    const namedRange = {
      rangeName: "ARCHITECTURE_ONLY",
      cellAddress: "A1",
      tabName: "Tables",
      scope: "workbook" as const,
      genericField: null,
      scenarioId: null,
      provenance: {
        source: "architecture" as const,
        architectureNamedRange: "ARCHITECTURE_ONLY",
      },
    };
    expect(
      validateContract("buildSpec", {
        ...buildSpec,
        namedRanges: [namedRange],
      }).valid,
    ).toBe(true);

    const omit = (value: object, key: string) =>
      Object.fromEntries(
        Object.entries(value).filter(([name]) => name !== key),
      );
    const mapping = buildSpec.cellMappings[0];
    if (!mapping) throw new Error("Fixture has no mapping.");
    for (const key of ["dataSource", "formulaId"])
      expect(
        validateContract("buildSpec", {
          ...buildSpec,
          cellMappings: [
            omit(mapping, key),
            ...buildSpec.cellMappings.slice(1),
          ],
        }).valid,
      ).toBe(false);
    if (!mapping.dataSource) throw new Error("Fixture mapping has no source.");
    expect(
      validateContract("buildSpec", {
        ...buildSpec,
        cellMappings: [
          {
            ...mapping,
            dataSource: omit(mapping.dataSource, "evidenceKey"),
          },
          ...buildSpec.cellMappings.slice(1),
        ],
      }).valid,
    ).toBe(false);
    expect(
      validateContract("buildSpec", {
        ...buildSpec,
        namedRanges: [omit(namedRange, "provenance")],
      }).valid,
    ).toBe(false);
    expect(
      validateContract(
        "buildSpec",
        omit(buildSpec, "architectureContentSha256"),
      ).valid,
    ).toBe(false);
    const formula = buildSpec.formulas[0];
    if (!formula) throw new Error("Fixture has no formula.");
    expect(
      validateContract("buildSpec", {
        ...buildSpec,
        formulas: [{ ...formula, genericField: null }],
      }).valid,
    ).toBe(false);
  });
});
