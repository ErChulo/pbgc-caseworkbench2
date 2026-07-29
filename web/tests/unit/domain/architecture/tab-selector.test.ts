import { describe, expect, it } from "vitest";

import type { PopulationCandidateProfile } from "../../../../src/domain/population/population-profile";
import type { WorkbookPopulationProfile } from "../../../../src/domain/population/workbook-adapter";
import type { Sha256 } from "../../../../src/domain/shared/types";
import {
  createSelector,
  mapPopulationToTab,
  selectTabs,
  validateRequiredFields,
  type ArchitecturePopulationCandidate,
  type TabSelectionRule,
} from "../../../../src/domain/architecture/tab-selector";

const hash = (character: string) => character.repeat(64) as Sha256;
const rules: readonly TabSelectionRule[] = [
  {
    tabPattern: "Retirees",
    requiredFields: ["DOB", "BSEX"],
    populationRequirement: "retired-participants",
    description: "Retired participants",
  },
  {
    tabPattern: "Separated Vesteds",
    requiredFields: ["DOB", "BSEX"],
    populationRequirement: "separated-vested-participants",
    description: "Separated vested participants",
  },
];

describe("T020-T024 population-driven tab selection", () => {
  it("selects only visible tabs from an approved candidate and preserves justification", () => {
    const binding = population([sheet("Retirees", ["DOB", "BSEX"])]);
    const result = selectTabs({
      population: { candidates: [binding] },
      tabPolicy: rules,
    });

    expect(result.unresolvedItems).toEqual([]);
    expect(result.tabs).toEqual([
      {
        tabName: "Retirees",
        role: "population",
        workbookProfileContentSha256: hash("d"),
        populationCandidateKey: hash("a"),
        populationArtifactSha256: hash("b"),
        fieldCount: 2,
        recordCount: 7,
      },
    ]);
    expect(mapPopulationToTab(binding, rules)).toHaveLength(1);
  });

  it("validates exact observed field names rather than field counts", () => {
    const binding = population([sheet("Retirees", ["DOB", "COMP"])]);
    const result = selectTabs({
      population: { candidates: [binding] },
      tabPolicy: rules,
    });

    expect(validateRequiredFields(["DOB", "BSEX"], ["dob", "COMP"])).toEqual([
      "BSEX",
    ]);
    expect(result.tabs).toEqual([]);
    expect(result.unresolvedItems[0]?.kind).toBe("missing-required-value");
    expect(result.unresolvedItems[0]?.affectedScope).toContain("tab:Retirees");
  });

  it("does not treat a matching sheet name as population evidence", () => {
    const binding = population([sheet("Retirees", ["DOB", "BSEX"])]);
    const result = selectTabs({
      population: {
        candidates: [
          {
            ...binding,
            candidate: { ...binding.candidate, evidence: [] },
          },
        ],
      },
      tabPolicy: rules,
    });
    expect(result.tabs).toEqual([]);
    expect(result.unresolvedItems[0]?.kind).toBe("missing-required-value");
    expect(result.unresolvedItems[0]?.affectedScope).toContain("tab:Retirees");
  });

  it("fails closed for provisional or empty populations", () => {
    const provisional = population([sheet("Retirees", ["DOB", "BSEX"])], {
      status: "provisional",
      effectiveDecisionId: null,
      effectiveWorkbookProfileContentSha256: null,
      provenance: [],
    });
    const result = selectTabs({
      population: { candidates: [provisional] },
      tabPolicy: rules,
    });
    expect(result.tabs).toEqual([]);
    expect(result.unresolvedItems[0]?.kind).toBe("missing-required-value");
  });

  it("is deterministic and does not let the compatibility API use field counts", () => {
    const binding = population([
      sheet("Separated Vesteds", ["DOB", "BSEX"]),
      sheet("Retirees", ["DOB", "BSEX"]),
    ]);
    const input = { population: { candidates: [binding] }, tabPolicy: rules };
    expect(selectTabs(input)).toEqual(selectTabs(input));
    expect(
      createSelector(rules).select([
        {
          tabName: "Retirees",
          role: "population",
          workbookProfileContentSha256: hash("d"),
          populationCandidateKey: hash("a"),
          populationArtifactSha256: hash("b"),
          fieldCount: 99,
          recordCount: 7,
        },
      ]),
    ).toEqual([]);
  });

  it("blocks normalized tab collisions across multiple approved profiles before merging", () => {
    const left = population([sheet("Retirees", ["DOB", "BSEX"])]);
    const rightBase = population([sheet(" retirees ", ["DOB", "BSEX"])]);
    const right = {
      ...rightBase,
      candidate: {
        ...rightBase.candidate,
        candidateKey: hash("e"),
        artifactSha256: hash("f"),
      },
      workbookProfileContentSha256: hash("g"),
    };
    const input = {
      population: { candidates: [right, left] },
      tabPolicy: rules,
    };

    const result = selectTabs(input);

    expect(result.tabs).toEqual([]);
    expect(result.unresolvedItems).toHaveLength(1);
    expect(result.unresolvedItems[0]).toMatchObject({
      kind: "conflicting-provisions",
      affectedScope: "population/tab-identity:retirees",
    });
    expect(selectTabs(input)).toEqual(result);
  });

  it("deduplicates only an exact approved profile and tab observation", () => {
    const binding = population([sheet("Retirees", ["DOB", "BSEX"])]);
    const duplicate = {
      ...binding,
      candidate: { ...binding.candidate },
      workbook: {
        ...binding.workbook,
        sheets: binding.workbook.sheets.map((item) => ({
          ...item,
          cells: item.cells.map((cell) => ({ ...cell })),
        })),
      },
    };

    const result = selectTabs({
      population: { candidates: [duplicate, binding] },
      tabPolicy: rules,
    });

    expect(result.unresolvedItems).toEqual([]);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0]?.tabName).toBe("Retirees");
  });
});

function sheet(name: string, fields: readonly string[], hidden = false) {
  return {
    name,
    hidden,
    cells: fields.map((storedValue, index) => ({
      sheet: name,
      address: `${String.fromCharCode(65 + index)}1`,
      storedValue,
      formulaText: null,
      cellType: "s",
      kind: "text" as const,
    })),
  };
}

function population(
  sheets: WorkbookPopulationProfile["sheets"],
  governance: ArchitecturePopulationCandidate["governance"] = {
    status: "approved",
    effectiveDecisionId: "approval-1",
    effectiveWorkbookProfileContentSha256: hash("d"),
    provenance: ["approval-1"],
  },
): ArchitecturePopulationCandidate {
  const characteristic = {
    evidenceKey: hash("c"),
    citationId: "population-characteristic",
    artifactSha256: hash("b"),
    sourceLocator: "synthetic:population-characteristic",
    evidenceKind: "population-characteristic",
    observedTextOrValue: {
      dimension: "participant-group",
      value: sheets.some((item) => item.name === "Retirees")
        ? "retired-participants"
        : "separated-vested-participants",
    },
  };
  const candidate: PopulationCandidateProfile = {
    candidateKey: hash("a"),
    artifactSha256: hash("b"),
    candidateStatus: "proposed",
    detectorIdentity: "test",
    detectorVersion: "1.0.0",
    confidence: 1,
    evidence: [characteristic],
    observedFields: sheets.flatMap((item) =>
      item.cells.map((cell) => String(cell.storedValue)),
    ),
    recordCounts: sheets.map(() => 7),
    sensitivity: "synthetic-mock",
    correctionsOrImputationsApplied: false,
  };
  return {
    candidate,
    governance,
    workbookProfileContentSha256: hash("d"),
    workbook: {
      status: "profiled",
      sheets,
      formulaExecutionCount: 0,
      limitations: [],
    },
  };
}
