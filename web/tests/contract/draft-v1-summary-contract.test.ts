import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const draftV1SummarySchema = schema(
  "../../../specs/012-draft-v1-summary/contracts/draft-v1-summary.schema.json",
);

describe("draft V1 summary contract", () => {
  it("accepts a blocked draft scaffold artifact", () => {
    const validate = validator(draftV1SummarySchema);
    const value = draftV1SummaryArtifact();

    expect({ valid: validate(value), errors: validate.errors }).toEqual({
      valid: true,
      errors: null,
    });
  });

  it("rejects a draft artifact that claims external execution", () => {
    const validate = validator(draftV1SummarySchema);
    const value = draftV1SummaryArtifact();
    const payload = value.deterministicPayload as Record<string, unknown>;
    payload.maturityClaims = [
      {
        subject: "draft-v1-summary",
        level: "specified",
        evidence: "Synthetic contract fixture.",
        externalExecutionClaimed: true,
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
  return ajv.compile(schemaValue);
}

function draftV1SummaryArtifact(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    artifactType: "draft-v1-summary",
    deterministicPayload: {
      schemaVersion: "1.0.0",
      caseId: "11111111-1111-4111-8111-111111111111",
      artifactPurpose: "pre-package-v1-summary-scaffold",
      draftStatus: "blocked",
      r5Source: {
        fileName: "r5-summary.json",
        contentSha256: hash("a"),
        schemaName: "r5-summary.schema.json",
        schemaStrictness: "open-additional-properties",
      },
      referenceCorpus: {
        corpusPath: "reference/approved-v1-summaries",
        indexVersion: "approved-v1-summary-reference-index-v1.0.0",
        referenceCount: 247,
      },
      normalizedR5Signals: {
        schemaVersion: "1.0.0",
        sourceKind: "r5-summary",
        sourceTabs: ["ACTIVES"],
        runs: ["DOR", "NRD"],
        genericFields: ["DOH"],
        tokens: ["ACTIVES", "DOH"],
        comparableSignalCounts: {
          sourceTabs: 1,
          runs: 2,
          genericFields: 1,
          tokens: 2,
        },
        numericSignals: { cellCount: null, formulaCellCount: null },
        normalizationWarnings: [],
      },
      selectedScaffold: {
        referenceId: "22654500V1Summary",
        fileName: "22654500V1Summary.json",
        workbookName: "22654500V1.xlsm",
        referenceContentSha256: hash("b"),
        schemaVersion: "v1-engine-summary-option-b-1.0",
        keyMode: "SOURCE_TAB::CELL_ADDRESS",
        sourceTabs: ["Actives"],
        runs: ["DOR", "NRD"],
        cellCount: 100,
        uniqueFieldCount: 80,
        formulaCellCount: 50,
        iobCounts: { I: 50, O: 20, B: 0, N: 5, C: 0, other: 0 },
        matchedFieldCount: 1,
        matchedRunCount: 2,
        matchedSourceTabCount: 1,
      },
      candidateMatches: [
        {
          referenceId: "22654500V1Summary",
          fileName: "22654500V1Summary.json",
          workbookName: "22654500V1.xlsm",
          referenceContentSha256: hash("b"),
          scoreBasisPoints: 7500,
          matchedFieldCount: 1,
          matchedRunCount: 2,
          matchedSourceTabCount: 1,
          cellCountDistance: null,
        },
      ],
      draftSummary: {
        schemaVersion: "draft-v1-summary-1.0",
        draftStatus: "blocked",
        keyMode: "SOURCE_TAB::CELL_ADDRESS",
        workbookName: "draft-22654500V1.xlsm",
        sourceTabs: ["Actives"],
        runs: ["DOR", "NRD"],
        cellCount: 100,
        uniqueFieldCount: 80,
        formulaCellCount: 50,
        fieldPreview: ["DOH"],
        omittedCellsReason: "Synthetic contract fixture.",
      },
      blockers: ["Draft scaffold requires human review."],
      maturityClaims: [
        {
          subject: "draft-v1-summary",
          level: "specified",
          evidence: "Synthetic contract fixture.",
          externalExecutionClaimed: false,
        },
      ],
      lineage: [
        {
          fromArtifactSha256: hash("a"),
          toArtifactSha256: hash("b"),
          relationship: "compared-with-approved-reference-scaffold",
        },
      ],
    },
    contentSha256: hash("c"),
    operationalMetadata: {
      generatedAt: "2026-08-02T12:00:00.000Z",
      generatedBy: null,
      generatorVersion: "draft-v1-summary-generator-v1.0.0",
    },
  };
}

function hash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}
