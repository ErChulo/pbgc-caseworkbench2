import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { validateContract } from "../../src/contracts/schema-validator";

const schema = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../specs/004-v1-architecture-selector/contracts/v1-architecture.schema.json",
    ),
    "utf8",
  ),
) as object;
const governed = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/contracts/schemas/governed-records.schema.json",
    ),
    "utf8",
  ),
) as object;

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat(
    "uuid",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  ajv.addFormat(
    "date-time",
    (value: string) => !Number.isNaN(Date.parse(value)),
  );
  ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/u);
  ajv.addSchema(governed);
  return ajv.compile(schema);
}

function validArchitecture(): Record<string, unknown> {
  const hash = "a".repeat(64);
  return {
    architectureId: "6f9619ff-8b86-4a5d-a8ab-1f4c3b2a1900",
    caseId: "550e8400-e29b-41d4-a716-446655440000",
    builtAt: "2026-07-29T12:00:00.000Z",
    schemaVersion: "1.0.0",
    ruleSetVersion: "1.0.0",
    lineage: {
      policies: [
        "scenario-selection",
        "tab-selection",
        "iob-classification",
        "field-name-glossary",
      ].map((policyKind, index) => ({
        policyKind,
        policyVersion: "1.0.0",
        policyContentSha256: String(index + 1).repeat(64),
        sourceFileSha256: String(index + 5).repeat(64),
        approvalDecisionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        approvalDecisionContentSha256: String(index + 5).repeat(64),
      })),
      evidenceCatalogId: "00000000-0000-4000-8000-000000000010",
      evidenceCatalogContentSha256: hash,
      population: [
        {
          candidateKey: hash,
          artifactSha256: "b".repeat(64),
          workbookProfileContentSha256: "e".repeat(64),
          approvalDecisionId: "population-approval",
          approvalDecisionContentSha256: "c".repeat(64),
        },
      ],
      caseControls: [
        {
          controlId: "00000000-0000-4000-8000-000000000011",
          contentSha256: "d".repeat(64),
        },
      ],
      authorityOverrides: [],
    },
    sourceTabs: [
      {
        tabName: "Synthetic Retirees",
        role: "population",
        workbookProfileContentSha256: "e".repeat(64),
        populationCandidateKey: hash,
        populationArtifactSha256: "b".repeat(64),
        fieldCount: 1,
        recordCount: 1,
      },
    ],
    runs: [
      {
        runId: "NRD",
        runLabel: "Normal retirement date",
        effectiveDateRange: { startDate: "2026-01-01", endDate: null },
        justifications: [
          {
            source: "plan-rule",
            referenceId: "b4f1fbb8-7119-4cec-a7d5-1f2cd47fb6a7",
            referenceContentSha256: "c".repeat(64),
          },
        ],
        applicableTabs: ["Synthetic Retirees"],
      },
    ],
    cells: {
      "Synthetic Retirees::A1": {
        key: "Synthetic Retirees::A1",
        sourceTab: "Synthetic Retirees",
        cellAddress: "A1",
        genericField: "DOB",
        description: "Synthetic date of birth field",
        hasFormula: false,
        formulaText: null,
        perRunClassification: {
          NRD: {
            runId: "NRD",
            iob: "I",
            justification: "Synthetic contract fixture",
            ruleVersion: "1.0.0",
          },
        },
      },
    },
    formulaDependencies: [],
    namedRanges: [],
    architectureContentSha256: "d".repeat(64),
  };
}

describe("V1 architecture contract", () => {
  it("accepts the JSON object representation of domain maps", () => {
    const validate = validator();
    expect(validate(validArchitecture()), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it("rejects a missing required field", () => {
    const value = validArchitecture();
    delete value.runs;
    expect(validator()(value)).toBe(false);
  });

  it("rejects an empty serialized cells map", () => {
    const value = validArchitecture();
    value.cells = {};
    expect(validator()(value)).toBe(false);
  });

  it("rejects a cell key outside the TAB::CELL_ADDRESS contract", () => {
    const value = validArchitecture();
    const cells = value.cells as Record<string, Record<string, unknown>>;
    const cell = cells["Synthetic Retirees::A1"];
    if (cell === undefined)
      throw new Error("Contract fixture cell is missing.");
    delete cells["Synthetic Retirees::A1"];
    cells["Synthetic Retirees:A1"] = {
      ...cell,
      key: "Synthetic Retirees:A1",
    };
    expect(validator()(value)).toBe(false);
  });

  it("rejects Map instances at the wire boundary", () => {
    const value = validArchitecture();
    value.cells = new Map();
    expect(validator()(value)).toBe(false);
  });

  it.each([
    [
      "a cell identity inconsistent with its tab and address",
      (value: Record<string, unknown>) => {
        cell(value).sourceTab = "Other";
      },
      "ARCHITECTURE_CELL_IDENTITY_INVALID",
    ],
    [
      "a formula flag without nonempty formula text",
      (value: Record<string, unknown>) => {
        cell(value).hasFormula = true;
        cell(value).formulaText = "";
      },
      "ARCHITECTURE_FORMULA_FLAG_INVALID",
    ],
    [
      "classification coverage missing an architecture run",
      (value: Record<string, unknown>) => {
        cell(value).perRunClassification = {};
      },
      "ARCHITECTURE_CLASSIFICATION_COVERAGE_INVALID",
    ],
    [
      "classification coverage containing a nonexistent run",
      (value: Record<string, unknown>) => {
        const classifications = cell(value).perRunClassification as Record<
          string,
          unknown
        >;
        classifications.EXTRA = {
          runId: "EXTRA",
          iob: "I",
          justification: "Invalid extra run",
          ruleVersion: "1.0.0",
        };
      },
      "ARCHITECTURE_CLASSIFICATION_COVERAGE_INVALID",
    ],
    [
      "a CALC_INDICATOR classification other than B",
      (value: Record<string, unknown>) => {
        cell(value).genericField = "CALC_INDICATOR";
      },
      "ARCHITECTURE_CLASSIFICATION_SEMANTICS_INVALID",
    ],
    [
      "a CALCULATION classification other than N",
      (value: Record<string, unknown>) => {
        cell(value).genericField = "CALCULATION";
      },
      "ARCHITECTURE_CLASSIFICATION_SEMANTICS_INVALID",
    ],
    [
      "an applicable tab absent from sourceTabs",
      (value: Record<string, unknown>) => {
        run(value).applicableTabs = ["Missing"];
      },
      "ARCHITECTURE_RUN_TAB_MISSING",
    ],
    [
      "a dependency with a missing cell",
      (value: Record<string, unknown>) => {
        value.formulaDependencies = [
          {
            dependentKey: "Synthetic Retirees::A1",
            dependencyKey: "Synthetic Retirees::B1",
            runId: "NRD",
            referenceType: "cell",
          },
        ];
      },
      "ARCHITECTURE_DEPENDENCY_REFERENCE_INVALID",
    ],
    [
      "a dependency with a missing run",
      (value: Record<string, unknown>) => {
        value.formulaDependencies = [
          {
            dependentKey: "Synthetic Retirees::A1",
            dependencyKey: "Synthetic Retirees::A1",
            runId: "MISSING",
            referenceType: "named-range",
          },
        ];
      },
      "ARCHITECTURE_DEPENDENCY_REFERENCE_INVALID",
    ],
    [
      "a named range with a noncanonical target",
      (value: Record<string, unknown>) => {
        value.namedRanges = [namedRange("$A$1")];
      },
      "ARCHITECTURE_NAMED_RANGE_TARGET_INVALID",
    ],
    [
      "a named range with a missing target",
      (value: Record<string, unknown>) => {
        value.namedRanges = [namedRange("B1")];
      },
      "ARCHITECTURE_NAMED_RANGE_TARGET_INVALID",
    ],
    [
      "duplicate case-insensitive workbook named ranges",
      (value: Record<string, unknown>) => {
        value.namedRanges = [
          namedRange("A1"),
          { ...namedRange("A1"), name: "dob" },
        ];
      },
      "ARCHITECTURE_NAMED_RANGE_DUPLICATE",
    ],
    [
      "a source tab absent from population lineage",
      (value: Record<string, unknown>) => {
        sourceTab(value).workbookProfileContentSha256 = "f".repeat(64);
      },
      "ARCHITECTURE_SOURCE_TAB_LINEAGE_MISSING",
    ],
    [
      "a case-control run with an unbound approval reference",
      (value: Record<string, unknown>) => {
        run(value).justifications = [
          {
            source: "case-control",
            referenceId: "00000000-0000-4000-8000-000000000011",
            referenceContentSha256: "e".repeat(64),
          },
        ];
      },
      "ARCHITECTURE_RUN_APPROVAL_REFERENCE_INVALID",
    ],
    [
      "a population source tab with nullable candidate lineage",
      (value: Record<string, unknown>) => {
        sourceTab(value).populationCandidateKey = null;
      },
      "ARCHITECTURE_SOURCE_TAB_ROLE_INVALID",
    ],
    [
      "a support source tab retaining population linkage",
      (value: Record<string, unknown>) => {
        const tab = sourceTab(value);
        tab.tabName = "Tables";
        tab.role = "support";
      },
      "ARCHITECTURE_SOURCE_TAB_ROLE_INVALID",
    ],
    [
      "duplicate population lineage identities",
      (value: Record<string, unknown>) => {
        const lineage = value.lineage as Record<string, unknown>;
        const population = lineage.population as readonly unknown[];
        lineage.population = [...population, population[0]];
      },
      "ARCHITECTURE_LINEAGE_IDENTITY_DUPLICATE",
    ],
  ])("fails closed semantically for %s", (_label, mutate, expectedCode) => {
    const value = validArchitecture();
    mutate(value);
    const result = validateContract("v1Architecture", value);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(expectedCode);
  });

  it("rejects malformed lineage hashes structurally at runtime", () => {
    const value = validArchitecture();
    const lineage = value.lineage as Record<string, unknown>;
    lineage.evidenceCatalogContentSha256 = "not-a-hash";
    const result = validateContract("v1Architecture", value);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "SCHEMA_PATTERN")).toBe(
      true,
    );
  });
});

function cell(value: Record<string, unknown>): Record<string, unknown> {
  const cells = value.cells as Record<string, Record<string, unknown>>;
  const result = cells["Synthetic Retirees::A1"];
  if (result === undefined)
    throw new Error("Contract fixture cell is missing.");
  return result;
}

function run(value: Record<string, unknown>): Record<string, unknown> {
  const result = (value.runs as Record<string, unknown>[])[0];
  if (result === undefined) throw new Error("Contract fixture run is missing.");
  return result;
}

function sourceTab(value: Record<string, unknown>): Record<string, unknown> {
  const result = (value.sourceTabs as Record<string, unknown>[])[0];
  if (result === undefined)
    throw new Error("Contract fixture source tab is missing.");
  return result;
}

function namedRange(cellAddress: string): Record<string, unknown> {
  return {
    name: "DOB",
    cellAddress,
    sourceTab: "Synthetic Retirees",
    scope: "workbook",
    genericField: "DOB",
  };
}
