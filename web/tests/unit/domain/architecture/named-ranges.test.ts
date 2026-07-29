import { describe, expect, it } from "vitest";

import { createFieldNameGlossary } from "../../../../src/domain/architecture/field-name-glossary";
import { extractNamedRanges } from "../../../../src/domain/architecture/field-inventory";
import type { ArchitecturePopulation } from "../../../../src/domain/architecture/tab-selector";
import type { SourceTab } from "../../../../src/domain/architecture/models";
import type { Sha256 } from "../../../../src/domain/shared/types";

const hash = (character: string) => character.repeat(64) as Sha256;
const tab: SourceTab = {
  tabName: "Tables",
  role: "support",
  workbookProfileContentSha256: hash("d"),
  populationCandidateKey: null,
  populationArtifactSha256: null,
  fieldCount: 1,
  recordCount: 1,
};

describe("T037-T039 named ranges", () => {
  it("extracts only definitions backed by an actually observed cell and detects scope", () => {
    const result = extractNamedRanges(
      [tab],
      population(),
      createFieldNameGlossary([
        {
          workbookPattern: "Freeze_Date",
          genericField: "FREEZE_DATE",
          description: "Freeze date",
          tabContext: "Tables",
        },
      ]),
    );
    expect(result).toEqual([
      {
        name: "Benefit_Factor",
        sourceTab: "Tables",
        cellAddress: "C3",
        scope: "sheet",
        genericField: null,
      },
      {
        name: "Freeze_Date",
        sourceTab: "Tables",
        cellAddress: "B2",
        scope: "workbook",
        genericField: "FREEZE_DATE",
      },
    ]);
    expect(result.some((range) => range.name === "Invented_Name")).toBe(false);
  });

  it("is deterministic", () => {
    const glossary = createFieldNameGlossary([]);
    expect(extractNamedRanges([tab], population(), glossary)).toEqual(
      extractNamedRanges([tab], population(), glossary),
    );
  });

  it("does not mix ranges for duplicate normalized tab identities", () => {
    expect(
      extractNamedRanges(
        [tab, { ...tab, tabName: " tables " }],
        population(),
        createFieldNameGlossary([]),
      ),
    ).toEqual([]);
  });
});

function population(): ArchitecturePopulation {
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
          observedFields: ["Parameter"],
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
              name: "Tables",
              hidden: false,
              cells: [cell("B2"), cell("C3")],
            },
          ],
        },
        workbookProfileContentSha256: hash("d"),
        namedRanges: [
          {
            name: "Freeze_Date",
            sourceTab: "Tables",
            cellAddress: "B2",
            definitionSheet: null,
          },
          {
            name: "Benefit_Factor",
            sourceTab: "Tables",
            cellAddress: "C3",
            definitionSheet: "Tables",
          },
          {
            name: "Invented_Name",
            sourceTab: "Tables",
            cellAddress: "Z99",
            definitionSheet: null,
          },
        ],
      },
    ],
  };
}

function cell(address: string) {
  return {
    sheet: "Tables",
    address,
    storedValue: 1,
    formulaText: null,
    cellType: "n",
    kind: "number" as const,
  };
}
