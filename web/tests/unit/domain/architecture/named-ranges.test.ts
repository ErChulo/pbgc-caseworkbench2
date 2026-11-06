import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbookPassive } from "../../../../src/adapters/parsers/workbook-parser";
import {
  adaptWorkbookExtraction,
  adaptWorkbookNamedRanges,
  workbookProfileContentHash,
} from "../../../../src/domain/population/workbook-adapter";

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

  it("carries a passively observed workbook name into the architecture inventory", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([["Parameter"], ["synthetic"]]),
      "Tables",
    );
    book.Workbook = {
      Sheets: [{ Hidden: 0 }],
      Names: [{ Name: "Freeze_Date", Ref: "Tables!$A$2" }],
    };
    const bytes = XLSX.write(book, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;
    const extraction = parseWorkbookPassive(new Uint8Array(bytes));
    const workbook = adaptWorkbookExtraction(extraction);
    const names = adaptWorkbookNamedRanges(extraction);
    if (!names.ok || workbook.status !== "profiled")
      throw new Error("Workbook inspection blocked");
    const profileHash = await workbookProfileContentHash(
      workbook,
      names.ranges,
    );
    const source = population().candidates[0];
    if (!source) throw new Error("Missing candidate fixture");
    const result = extractNamedRanges(
      [{ ...tab, workbookProfileContentSha256: profileHash }],
      {
        candidates: [
          {
            ...source,
            workbook,
            namedRanges: names.ranges,
            workbookProfileContentSha256: profileHash,
          },
        ],
      },
      createFieldNameGlossary([]),
    );
    expect(result).toEqual([
      {
        name: "Freeze_Date",
        sourceTab: "Tables",
        cellAddress: "A2",
        scope: "workbook",
        genericField: null,
      },
    ]);
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
