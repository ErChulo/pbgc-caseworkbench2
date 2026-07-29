import { describe, expect, it } from "vitest";
import { compileBuildSpec } from "../../../../src/domain/formula-compiler/compiler";
import { computeContentHash } from "../../../../src/domain/build-spec/serialization";
import { excelScalarV1Policy } from "../../../../src/domain/formula-compiler/policy";
import {
  approvedProvenance,
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../../../fixtures/formula-compiler";

const compile = async (spec: Awaited<ReturnType<typeof buildSpecV2>>) =>
  compileBuildSpec({
    buildSpec: spec,
    compilerVersion: "1.0.0-test",
    clock: fixedClock,
    uuid: fixedUuid,
  });
const artifactOf = (result: Awaited<ReturnType<typeof compileBuildSpec>>) => {
  if (!result.artifact) throw new Error("Expected a compiled artifact.");
  return result.artifact;
};

describe("formula compiler", () => {
  it("compiles reviewed formulas without executing them", async () => {
    const result = await compile(await buildSpecV2());
    expect(result.status).toBe("complete");
    expect(
      artifactOf(result).deterministicPayload.compiledFormulas.map(
        (formula) => formula.canonicalFormulaText,
      ),
    ).toEqual(["('RETIREES'!A1+'RETIREES'!B1)", "('RETIREES'!C1*0.01)"]);
    expect(
      artifactOf(result).deterministicPayload.compiledFormulas[0]?.provenance
        .validationOracleIds,
    ).toEqual(["ORACLE-SYNTHETIC-001"]);
  });

  it.each([
    ["=TODAY()", "VOLATILE_FUNCTION_PROHIBITED"],
    ["=MYSTERY(COMP)", "FUNCTION_NOT_ALLOWED"],
    ["=[other.xlsx]A1", "EXTERNAL_REFERENCE_PROHIBITED"],
    ["=UNKNOWN+1", "REFERENCE_UNRESOLVED"],
  ])("blocks unsupported source %s", async (text, code) => {
    const result = await compile(
      await buildSpecV2([
        { id: "FORMULA-RETIREES-X-DOR", field: "X", cell: "C1", text },
      ]),
    );
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.some((entry) => entry.code === code)).toBe(true);
    expect(artifactOf(result).deterministicPayload.compiledFormulas).toEqual(
      [],
    );
  });

  it("blocks formulas without an independent deterministic oracle", async () => {
    const provenance = approvedProvenance({ validationOracleIds: [] });
    const result = await compile(
      await buildSpecV2([
        {
          id: "FORMULA-RETIREES-X-DOR",
          field: "X",
          cell: "C1",
          text: "=COMP",
          provenance,
        },
      ]),
    );
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "FORMULA_ORACLE_MISSING",
      ),
    ).toBe(true);
  });

  it("keeps I/O/B distinct from calculation metadata", async () => {
    const spec = await buildSpecV2();
    const result = await compile(spec);
    const formula = artifactOf(result).deterministicPayload.compiledFormulas[0];
    expect(formula?.target.iobClassification).toBe("O");
    expect(formula).not.toHaveProperty("CALC_INDICATOR");
    expect(formula).not.toHaveProperty("CALCULATION");
  });

  it("rejects a custom policy under the approved policy identity", async () => {
    const spec = await buildSpecV2();
    const compilation = compileBuildSpec({
      buildSpec: spec,
      compilerVersion: "1.0.0-test",
      clock: fixedClock,
      uuid: fixedUuid,
      policy: {
        ...excelScalarV1Policy,
        functions: [
          ...excelScalarV1Policy.functions,
          { name: "HYPERLINK", minimumArguments: 1, maximumArguments: 2 },
        ],
        activeFunctions: [],
      },
    });
    await expect(compilation).resolves.toMatchObject({
      status: "blocked",
      artifact: null,
    });
    const result = await compilation;
    expect(result.status).toBe("blocked");
    expect(result.artifact).toBeNull();
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "COMPILER_POLICY_HASH_MISMATCH",
      ),
    ).toBe(true);
  });

  it("blocks a BuildSpec whose validation result failed", async () => {
    const spec = await buildSpecV2();
    const invalid = {
      ...spec,
      validation: { ...spec.validation, isValid: false },
    };
    const rehashed = {
      ...invalid,
      buildSpecContentSha256: await computeContentHash(invalid),
    };
    const result = await compile(rehashed);
    expect(result.status).toBe("blocked");
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "BUILD_SPEC_VALIDATION_FAILED",
      ),
    ).toBe(true);
  });

  it("blocks malformed and historical BuildSpec input without throwing", async () => {
    const result = await compileBuildSpec({
      buildSpec: { schemaVersion: "1.0.0" },
      compilerVersion: "1.0.0-test",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    expect(result).toMatchObject({ status: "blocked", artifact: null });
    expect(result.diagnostics[0]?.code).toBe("BUILD_SPEC_SCHEMA_INVALID");
  });

  it("blocks duplicate formula and mapping identities before resolution", async () => {
    const spec = await buildSpecV2();
    const formula = spec.formulas[0];
    const mapping = spec.cellMappings.find(
      (entry) => entry.formulaId === formula?.formulaId,
    );
    if (!formula || !mapping) throw new Error("Expected compiler fixtures.");
    const result = await compileBuildSpec({
      buildSpec: {
        ...spec,
        formulas: [...spec.formulas, formula],
        cellMappings: [
          ...spec.cellMappings,
          {
            ...mapping,
            mappingId: "00000000-0000-1000-8000-000000000997",
          },
        ],
      },
      compilerVersion: "1.0.0-test",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    expect(result.artifact).toBeNull();
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_FORMULA_ID",
        "DUPLICATE_MAPPING_CELL",
        "DUPLICATE_MAPPING_FIELD",
        "FORMULA_CELL_MAPPING_AMBIGUOUS",
      ]),
    );
  });

  it("blocks mappings that identify a formula absent from the BuildSpec", async () => {
    const spec = await buildSpecV2();
    const changed = {
      ...spec,
      cellMappings: spec.cellMappings.map((mapping) =>
        mapping.field === "COMP"
          ? { ...mapping, formulaId: "FORMULA-NOT-DEFINED" }
          : mapping,
      ),
    };
    const result = await compile({
      ...changed,
      buildSpecContentSha256: await computeContentHash(changed),
    });

    expect(result).toMatchObject({ status: "blocked", artifact: null });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MAPPING_FORMULA_NOT_FOUND",
        formulaId: null,
      }),
    );
  });

  it("fails a formula that has no CellMapping", async () => {
    const spec = await buildSpecV2();
    const formula = spec.formulas[0];
    if (!formula) throw new Error("Expected a compiler fixture.");
    const changed = {
      ...spec,
      cellMappings: spec.cellMappings.filter(
        (mapping) => mapping.formulaId !== formula.formulaId,
      ),
    };
    const result = await compile({
      ...changed,
      buildSpecContentSha256: await computeContentHash(changed),
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FORMULA_CELL_MAPPING_MISSING",
        formulaId: formula.formulaId,
      }),
    );
  });

  it("fails only the affected formula for ambiguous or disagreeing mappings", async () => {
    const spec = await buildSpecV2();
    const formula = spec.formulas[1];
    const mapping = spec.cellMappings.find(
      (entry) => entry.formulaId === formula?.formulaId,
    );
    if (!formula || !mapping) throw new Error("Expected compiler fixtures.");
    const ambiguous = {
      ...spec,
      cellMappings: [
        ...spec.cellMappings,
        {
          ...mapping,
          mappingId: "00000000-0000-1000-8000-000000000996" as never,
          scenarioId: `${mapping.scenarioId}-OTHER`,
          tabName: `${mapping.tabName}-OTHER`,
          cellAddress: "Z99",
          field: `${mapping.field}-OTHER`,
        },
      ],
    };
    const ambiguousResult = await compile({
      ...ambiguous,
      buildSpecContentSha256: await computeContentHash(ambiguous),
    });
    expect(ambiguousResult.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FORMULA_CELL_MAPPING_AMBIGUOUS",
        formulaId: formula.formulaId,
      }),
    );

    const disagreeing = {
      ...spec,
      cellMappings: spec.cellMappings.map((entry) =>
        entry.formulaId === formula.formulaId
          ? { ...entry, field: `${entry.field}-OTHER` }
          : entry,
      ),
    };
    const disagreeingResult = await compile({
      ...disagreeing,
      buildSpecContentSha256: await computeContentHash(disagreeing),
    });
    expect(disagreeingResult.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FORMULA_CELL_MAPPING_MISMATCH",
        formulaId: formula.formulaId,
        context: { mismatchedFields: "field" },
      }),
    );
  });
});
