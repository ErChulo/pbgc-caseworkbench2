import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { cloneFixture, schemaCases } from "../fixtures/contracts/schema-cases";
import {
  governedDecisionFamilies,
  permittedTransitions,
  semanticCases,
  universalInvalidChainConditions,
} from "../fixtures/contracts/semantic-cases";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const schemaDirectory = resolve(
  currentDirectory,
  "../../../specs/009-case-intake-normalization/contracts",
);

interface ContractValidationResult {
  readonly valid: boolean;
  readonly issues: readonly { readonly code: string }[];
}

interface ContractValidatorApi {
  validateContract(
    contract: string,
    value: unknown,
    context?: { readonly relatedRecords?: readonly unknown[] },
  ): ContractValidationResult;
  validateDecisionTransition(
    family: string,
    transition: string,
  ): ContractValidationResult;
  validateDecisionChainCondition(
    family: string,
    condition: string,
  ): ContractValidationResult;
}

async function loadContractValidator(): Promise<ContractValidatorApi> {
  const implementationUrl = new URL(
    "../../src/contracts/schema-validator.ts",
    import.meta.url,
  ).href;
  return (await import(
    /* @vite-ignore */ implementationUrl
  )) as ContractValidatorApi;
}

async function createAjv(): Promise<Ajv2020> {
  const ajv = new Ajv2020({
    allErrors: true,
    // The contracts intentionally use documented `x-*` annotations for
    // semantic invariants enforced by the later T019 validation layer.
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

  const names = (await readdir(schemaDirectory))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  for (const name of names) {
    const schema = JSON.parse(
      await readFile(resolve(schemaDirectory, name), "utf8"),
    ) as object;
    ajv.addSchema(schema);
  }
  return ajv;
}

function validatorFor(ajv: Ajv2020, reference: string): ValidateFunction {
  const [fileName, fragment = ""] = reference.split("#");
  if (!fileName) throw new Error(`Invalid schema reference: ${reference}`);
  const id = `https://pbgc-case-workbench.local/schemas/${fileName}`;
  const validator = ajv.getSchema(fragment ? `${id}#${fragment}` : id);
  if (!validator) throw new Error(`Missing validator for ${reference}`);
  return validator;
}

describe("T013 design-schema fixture catalog", () => {
  it("covers all seven Draft 2020-12 contracts and resolves every local reference", async () => {
    const ajv = await createAjv();
    expect(schemaCases).toHaveLength(7);
    for (const fixture of schemaCases) {
      expect(validatorFor(ajv, fixture.schema)).toBeTypeOf("function");
    }
  });

  it.each(schemaCases)(
    "$schema accepts its positive fixture",
    async (fixture) => {
      const validator = validatorFor(await createAjv(), fixture.schema);
      expect(
        validator(cloneFixture(fixture.valid)),
        validator.errors?.map(String).join("\n"),
      ).toBe(true);
      for (const additional of "additionalValid" in fixture
        ? fixture.additionalValid
        : []) {
        expect(
          validator(cloneFixture(additional)),
          validator.errors?.map(String).join("\n"),
        ).toBe(true);
      }
    },
  );

  it.each(schemaCases)(
    "$schema rejects a structurally incomplete fixture",
    async (fixture) => {
      const validator = validatorFor(await createAjv(), fixture.schema);
      const valid = cloneFixture(fixture.valid) as Record<string, unknown>;
      const omittedKey = Object.keys(valid)[0];
      const invalid = Object.fromEntries(
        Object.entries(valid).filter(([key]) => key !== omittedKey),
      );
      expect(validator(invalid)).toBe(false);
    },
  );

  it.each(schemaCases)("$schema rejects unknown fields", async (fixture) => {
    const validator = validatorFor(await createAjv(), fixture.schema);
    const invalid = {
      ...(cloneFixture(fixture.valid) as Record<string, unknown>),
      unexpectedTestOnlyField: true,
    };
    expect(validator(invalid)).toBe(false);
  });

  it.each(
    schemaCases.filter(
      ({ schema, valid }) => !schema.includes("#") && "schemaVersion" in valid,
    ),
  )("$schema rejects a top-level schema-version mismatch", async (fixture) => {
    const validator = validatorFor(await createAjv(), fixture.schema);
    const invalid = {
      ...(cloneFixture(fixture.valid) as Record<string, unknown>),
      schemaVersion: "999.0.0",
    };
    expect(validator(invalid)).toBe(false);
  });
});

describe("T014 semantic contract controls (red until T019)", () => {
  it.each(semanticCases)("$name", async (testCase) => {
    const api = await loadContractValidator();
    const result = api.validateContract(testCase.contract, testCase.value, {
      relatedRecords: testCase.relatedRecords,
    });
    expect(result.valid).toBe(testCase.expectedValid);
    if (!testCase.expectedValid) {
      expect(result.issues.map(({ code }) => code)).toContain(
        testCase.expectedCode,
      );
    }
  });

  for (const family of governedDecisionFamilies) {
    it.each(permittedTransitions[family])(
      `${family} permits %s`,
      async (transition) => {
        const api = await loadContractValidator();
        expect(api.validateDecisionTransition(family, transition).valid).toBe(
          true,
        );
      },
    );

    it.each(universalInvalidChainConditions)(
      `${family} rejects %s`,
      async (condition) => {
        const api = await loadContractValidator();
        expect(
          api.validateDecisionChainCondition(family, condition).valid,
        ).toBe(false);
      },
    );
  }
});
