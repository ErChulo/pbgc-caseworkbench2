import { describe, expect, it } from "vitest";

import { createFieldNameGlossary } from "../../../../src/domain/architecture/field-name-glossary";
import { buildFieldInventory } from "../../../../src/domain/architecture/field-inventory";
import { classifyIoB } from "../../../../src/domain/architecture/iob-classifier";
import type { ArchitecturePopulation } from "../../../../src/domain/architecture/tab-selector";
import type {
  RunDescriptor,
  SourceTab,
} from "../../../../src/domain/architecture/models";
import type { Sha256 } from "../../../../src/domain/shared/types";

const hash = (character: string) => character.repeat(64) as Sha256;
const tab: SourceTab = {
  tabName: "Retirees",
  role: "population",
  workbookProfileContentSha256: hash("d"),
  populationCandidateKey: hash("a"),
  populationArtifactSha256: hash("b"),
  fieldCount: 4,
  recordCount: 1,
};
const supportTab: SourceTab = {
  tabName: "Tables",
  role: "support",
  workbookProfileContentSha256: hash("d"),
  populationCandidateKey: null,
  populationArtifactSha256: null,
  fieldCount: 1,
  recordCount: 0,
};
const run = (runId: string): RunDescriptor => ({
  runId,
  runLabel: runId,
  effectiveDateRange: { startDate: "2020-01-01", endDate: null },
  justifications: [
    {
      source: "population",
      referenceId: "test",
      referenceContentSha256: hash("a"),
    },
  ],
  applicableTabs: ["Retirees"],
});
const glossary = createFieldNameGlossary([
  entry("Date of Birth", "DOB"),
  entry("Context", "CALC_INDICATOR"),
  entry("Calculation Run", "CALCULATION"),
]);

describe("T025-T031 field inventory and per-run I/O/B", () => {
  it("uses actual observed addresses and formula metadata without inventing cells", () => {
    const result = buildFieldInventory({
      tabs: [tab, supportTab],
      scenarios: [run("DOR")],
      population: population(),
      glossary,
    });
    expect([...result.cells.keys()]).toEqual([
      "Retirees::A1",
      "Retirees::B1",
      "Retirees::C1",
      "Retirees::C2",
      "Tables::A1",
    ]);
    expect(result.cells.get("Retirees::C1")).toMatchObject({
      cellAddress: "C1",
      genericField: "CALCULATION",
      hasFormula: true,
      formulaText: "DOR_NAME",
    });
    expect(
      [...result.cells.values()].some((cell) => cell.cellAddress === "A2"),
    ).toBe(false);
  });

  it("retains formulas below headers and relevant support cells without participant values", () => {
    const result = buildFieldInventory({
      tabs: [tab, supportTab],
      scenarios: [run("DOR")],
      population: population(),
      glossary,
    });
    expect(result.cells.get("Retirees::C2")).toMatchObject({
      description: "Calculation Run",
      genericField: "CALCULATION",
      formulaText: "=A1",
    });
    expect(result.cells.get("Tables::A1")).toMatchObject({
      description: "Date of Birth",
      genericField: "DOB",
    });
    expect(
      [...result.cells.values()].some(
        (item) => item.description === "synthetic-participant-value",
      ),
    ).toBe(false);
  });

  it("emits an ambiguous-source-role item and omits an unmapped field", () => {
    const result = buildFieldInventory({
      tabs: [tab],
      scenarios: [],
      population: population(),
      glossary,
    });
    expect(result.cells.has("Retirees::D1")).toBe(false);
    expect(result.unresolvedItems[0]?.kind).toBe("ambiguous-source-role");
    expect(result.unresolvedItems[0]?.affectedScope).toContain("cell:D1");
  });

  it("never overwrites or mixes cells for duplicate normalized tab identities", () => {
    const result = buildFieldInventory({
      tabs: [tab, { ...tab, tabName: " retirees " }],
      scenarios: [],
      population: population(),
      glossary,
    });

    expect(result.cells.size).toBe(0);
    expect(result.unresolvedItems).toEqual([
      expect.objectContaining({
        kind: "conflicting-provisions",
        affectedScope: "architecture/tab-identity:retirees",
      }),
    ]);
  });

  it("classifies every field independently for every run with distinct CALC semantics", () => {
    const inventory = buildFieldInventory({
      tabs: [tab],
      scenarios: [run("DOR"), run("NRD")],
      population: population(),
      glossary,
    });
    const cells = classifyIoB({
      cells: inventory.cells,
      scenarios: [run("NRD"), run("DOR")],
      iobPolicy: [
        {
          fieldPattern: "DOB",
          runPattern: "DOR",
          iob: "I",
          priority: 10,
          justification: "DOR input",
        },
        {
          fieldPattern: "DOB",
          runPattern: "NRD",
          iob: "P",
          priority: 10,
          justification: "NRD derived field",
        },
      ],
      ruleVersion: "2.0.0",
    });
    expect(
      cells.get("Retirees::A1")?.perRunClassification.get("DOR")?.iob,
    ).toBe("I");
    expect(
      cells.get("Retirees::A1")?.perRunClassification.get("NRD")?.iob,
    ).toBe("P");
    expect(
      cells.get("Retirees::B1")?.perRunClassification.get("DOR")?.iob,
    ).toBe("B");
    const calculation = cells
      .get("Retirees::C1")
      ?.perRunClassification.get("NRD");
    expect(calculation?.iob).toBe("N");
    expect(calculation?.justification).toContain("NRD");
  });
});

function entry(workbookPattern: string, genericField: string) {
  return {
    workbookPattern,
    genericField,
    description: workbookPattern,
    tabContext: null,
  };
}

function population(): ArchitecturePopulation {
  const fields = ["Date of Birth", "Context", "Calculation Run", "Mystery"];
  return {
    candidates: [
      {
        candidate: {
          candidateKey: hash("a"),
          artifactSha256: hash("b"),
          candidateStatus: "proposed",
          detectorIdentity: "test",
          detectorVersion: "1.0.0",
          confidence: 1,
          evidence: [],
          observedFields: fields,
          recordCounts: [1],
          sensitivity: "synthetic-mock",
          correctionsOrImputationsApplied: false,
        },
        governance: {
          status: "approved",
          effectiveDecisionId: "approval-1",
          effectiveWorkbookProfileContentSha256: hash("d"),
          provenance: ["approval-1"],
        },
        workbook: {
          status: "profiled",
          formulaExecutionCount: 0,
          limitations: [],
          sheets: [
            {
              name: "Retirees",
              hidden: false,
              cells: [
                cell("A1", fields[0] ?? ""),
                cell("B1", fields[1] ?? ""),
                { ...cell("C1", fields[2] ?? ""), formulaText: "DOR_NAME" },
                cell("D1", fields[3] ?? ""),
                cell("A2", "synthetic-participant-value"),
                { ...cell("C2", 1), formulaText: "=A1" },
              ],
            },
            {
              name: "Tables",
              hidden: false,
              cells: [{ ...cell("A1", "Date of Birth"), sheet: "Tables" }],
            },
          ],
        },
        workbookProfileContentSha256: hash("d"),
      },
    ],
  };
}

function cell(address: string, storedValue: string | number) {
  return {
    sheet: "Retirees",
    address,
    storedValue,
    formulaText: null,
    cellType: "s",
    kind: "text" as const,
  };
}
