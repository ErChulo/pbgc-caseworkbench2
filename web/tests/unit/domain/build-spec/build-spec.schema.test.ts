import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";

const schemaPath = resolve(
  import.meta.dirname,
  "../../../../src/contracts/schemas/build-spec.schema.json",
);

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  ajv.addFormat(
    "uuid",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  ajv.addFormat(
    "date-time",
    (value: string) => !Number.isNaN(Date.parse(value)),
  );
  return ajv;
}

const ajv = createAjv();
const validate = ajv.compile(schema);

describe("build-spec.schema.json", () => {
  const validBuildSpec = {
    schemaVersion: "1.0.0",
    buildSpecId: "00000000-0000-1000-8000-000000000001",
    architectureId: "00000000-0000-1000-8000-000000000002",
    caseId: "00000000-0000-1000-8000-000000000003",
    ruleSetVersion: "1.0.0",
    generatedAt: "2026-07-28T12:00:00Z",
    formulas: [
      {
        formulaId: "FORMULA-RETIREES-BENEFIT-DOR",
        scenarioId: "DOR",
        tabName: "RETIREES",
        genericField: "BENEFIT",
        formulaText: "=COMP*YOS*0.01",
        cellAddress: "B2",
        dependencies: ["FORMULA-RETIREES-COMP-DOR", "FORMULA-RETIREES-YOS-DOR"],
        iobClassification: "O",
        justification: "Benefit amount is a calculated result",
      },
    ],
    namedRanges: [
      {
        rangeName: "BENEFIT",
        cellAddress: "B2",
        tabName: "RETIREES",
        scope: "workbook",
        genericField: "BENEFIT",
        scenarioId: "DOR",
        provenance: {
          source: "architecture",
          architectureNamedRange: "BENEFIT",
        },
      },
    ],
    cellMappings: [
      {
        mappingId: "00000000-0000-1000-8000-000000000010",
        field: "BENEFIT",
        tabName: "RETIREES",
        cellAddress: "B2",
        iobClassification: "O",
        dataSource: null,
        formulaId: "FORMULA-RETIREES-BENEFIT-DOR",
        scenarioId: "DOR",
      },
    ],
    executionOrder: {
      order: ["FORMULA-RETIREES-BENEFIT-DOR"],
      levelCount: 1,
      maxDepth: 0,
      hasCycles: false,
      cycleNodes: [],
    },
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      validatedAt: "2026-07-28T12:00:01Z",
    },
    buildSpecContentSha256: "a".repeat(64),
  };

  it("accepts a valid build spec", () => {
    const valid = validate(validBuildSpec);
    expect(valid).toBe(true);
  });

  it("rejects missing schemaVersion", () => {
    const rest = Object.fromEntries(
      Object.entries(validBuildSpec).filter(([key]) => key !== "schemaVersion"),
    );
    const valid = validate(rest);
    expect(valid).toBe(false);
  });

  it("rejects invalid schemaVersion", () => {
    const invalid = { ...validBuildSpec, schemaVersion: "2.0.0" };
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it("rejects missing buildSpecId", () => {
    const rest = Object.fromEntries(
      Object.entries(validBuildSpec).filter(([key]) => key !== "buildSpecId"),
    );
    const valid = validate(rest);
    expect(valid).toBe(false);
  });

  it("rejects invalid buildSpecId format", () => {
    const invalid = { ...validBuildSpec, buildSpecId: "not-a-uuid" };
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it("rejects invalid formulaId format", () => {
    const invalid = {
      ...validBuildSpec,
      formulas: [
        {
          ...validBuildSpec.formulas[0],
          formulaId: "bad-id",
        },
      ],
    };
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it("rejects invalid iobClassification", () => {
    const invalid = {
      ...validBuildSpec,
      formulas: [
        {
          ...validBuildSpec.formulas[0],
          iobClassification: "X",
        },
      ],
    };
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it("rejects invalid cellAddress pattern", () => {
    const invalid = {
      ...validBuildSpec,
      formulas: [
        {
          ...validBuildSpec.formulas[0],
          cellAddress: "invalid",
        },
      ],
    };
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it("rejects invalid sha256 pattern", () => {
    const invalid = { ...validBuildSpec, buildSpecContentSha256: "not-a-hash" };
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it("rejects missing executionOrder", () => {
    const rest = Object.fromEntries(
      Object.entries(validBuildSpec).filter(
        ([key]) => key !== "executionOrder",
      ),
    );
    const valid = validate(rest);
    expect(valid).toBe(false);
  });

  it("rejects missing validation", () => {
    const rest = Object.fromEntries(
      Object.entries(validBuildSpec).filter(([key]) => key !== "validation"),
    );
    const valid = validate(rest);
    expect(valid).toBe(false);
  });

  it.each([
    ["root", { ...validBuildSpec, unexpected: true }],
    [
      "formula",
      {
        ...validBuildSpec,
        formulas: [{ ...validBuildSpec.formulas[0], unexpected: true }],
      },
    ],
    [
      "mapping",
      {
        ...validBuildSpec,
        cellMappings: [{ ...validBuildSpec.cellMappings[0], unexpected: true }],
      },
    ],
  ])("rejects additional properties on the %s object", (_label, value) => {
    expect(validate(value)).toBe(false);
  });
});
