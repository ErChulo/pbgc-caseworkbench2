import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const finalOutputSchema = schema(
  "../../../specs/010-final-casework-output-package/contracts/final-casework-output-package.schema.json",
);
const section436Schema = schema(
  "../../../specs/011-section-436-evaluation/contracts/section-436-evaluation.schema.json",
);

describe("final output and section 436 contracts", () => {
  it("accepts a blocked final casework output package", () => {
    const validate = validator(finalOutputSchema);
    const value = blockedFinalOutputPackage();

    expect({ valid: validate(value), errors: validate.errors }).toEqual({
      valid: true,
      errors: null,
    });
  });

  it("rejects a final package without all required stages", () => {
    const validate = validator(finalOutputSchema);
    const value = blockedFinalOutputPackage();
    const payload = value.deterministicPayload as Record<string, unknown>;
    payload.stages = [];

    expect(validate(value)).toBe(false);
  });

  it("accepts a blocked section 436 evaluation", () => {
    const validate = validator(section436Schema);
    const value = blockedSection436Evaluation();

    expect({ valid: validate(value), errors: validate.errors }).toEqual({
      valid: true,
      errors: null,
    });
  });

  it("rejects a section 436 evaluation without citations", () => {
    const validate = validator(section436Schema);
    const value = blockedSection436Evaluation();
    const payload = value.deterministicPayload as Record<string, unknown>;
    payload.facts = [
      {
        factKey: "aftap-percentage",
        value: "58.5",
        valueKind: "decimal-percentage",
        citations: [],
        reviewStatus: "human-approved",
      },
    ];

    expect(validate(value)).toBe(false);
  });
});

function schema(relativePath: string): object {
  return JSON.parse(
    readFileSync(resolve(currentDirectory, relativePath)).toString("utf8"),
  ) as object;
}

function validator(schemaValue: object) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat(
    "uuid",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  ajv.addFormat(
    "date-time",
    (value: string) => !Number.isNaN(Date.parse(value)),
  );
  ajv.addFormat("date", (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value));
  return ajv.compile(schemaValue);
}

function blockedFinalOutputPackage(): Record<string, unknown> {
  const stages = [
    "evidence",
    "plan-rules",
    "population-profile",
    "v1-architecture",
    "build-spec",
    "compiled-formulas",
    "workbook",
    "validation-reconciliation",
    "section-436",
  ].map((stageKey) => ({
    stageKey,
    label: stageKey,
    required: true,
    status: stageKey === "evidence" ? "ready" : "blocked",
    maturityLevel: stageKey === "evidence" ? "implemented" : "specified",
    artifactSha256Values: stageKey === "evidence" ? [hash("a")] : [],
    blockers: stageKey === "evidence" ? [] : [`Missing ${stageKey}.`],
  }));
  return {
    schemaVersion: "1.0.0",
    artifactType: "final-casework-output-package",
    deterministicPayload: {
      schemaVersion: "1.0.0",
      caseId: "11111111-1111-4111-8111-111111111111",
      packagePurpose: "production-v1-casework-output",
      packageStatus: "blocked",
      section436Required: true,
      stages,
      artifacts: [
        {
          artifactType: "evidence-manifest",
          artifactId: "evidence-manifest",
          contentSha256: hash("a"),
          mediaType: "application/json",
          storagePath: null,
          description: "Evidence manifest.",
        },
      ],
      unresolvedItems: [],
      maturityClaims: stages.map((stage) => ({
        subject: stage.stageKey,
        level: stage.maturityLevel,
        evidence: "Synthetic contract fixture.",
        externalExecutionClaimed: false,
      })),
      lineage: [],
    },
    contentSha256: hash("b"),
    operationalMetadata: {
      createdAt: "2026-08-02T12:00:00.000Z",
      createdBy: null,
      generatorVersion: "case-output-package-v1.0.0",
    },
  };
}

function blockedSection436Evaluation(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    artifactType: "section-436-evaluation",
    deterministicPayload: {
      schemaVersion: "1.0.0",
      caseId: "11111111-1111-4111-8111-111111111111",
      evaluationStatus: "blocked",
      planYearStart: null,
      planYearEnd: null,
      facts: [],
      rules: [],
      missingRequiredFacts: ["aftap-percentage"],
      matchedRuleIds: [],
      conclusionCode: "blocked",
      limitationEffect: null,
      citations: [],
      blockedReasons: [
        "Missing human-approved Section 436 fact: aftap-percentage.",
      ],
    },
    contentSha256: hash("c"),
    operationalMetadata: {
      evaluatedAt: "2026-08-02T12:00:00.000Z",
      evaluatedBy: null,
      engineVersion: "section-436-evaluator-v1.0.0",
    },
  };
}

function hash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}
