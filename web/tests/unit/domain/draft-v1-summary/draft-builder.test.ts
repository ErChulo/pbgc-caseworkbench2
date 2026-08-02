import { describe, expect, it } from "vitest";

import {
  createDraftV1SummaryArtifact,
  normalizeR5Summary,
} from "../../../../src/domain/draft-v1-summary/draft-builder";
import type { ApprovedV1SummaryReference } from "../../../../src/domain/draft-v1-summary/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
} from "../../../../src/domain/shared/types";

describe("draft V1 summary builder", () => {
  it("normalizes comparable R5 fields, runs, and tabs without treating descriptions as fields", () => {
    const profile = normalizeR5Summary({
      sourceTabs: ["Actives"],
      runs: ["DOR", "NRD"],
      fields: ["DOH", "DOTE"],
      description: "Participant date of hire should remain text only",
      cells: {
        A2: { genericField: "NRA" },
      },
    });

    expect(profile.sourceTabs).toContain("ACTIVES");
    expect(profile.runs).toEqual(["DOR", "NRD"]);
    expect(profile.genericFields).toEqual(
      expect.arrayContaining(["DOH", "DOTE", "NRA"]),
    );
    expect(profile.genericFields).not.toContain("A2");
    expect(profile.genericFields).not.toContain("PARTICIPANT_DATE_OF_HIRE");
    expect(profile.numericSignals.cellCount).toBe(1);
  });

  it("selects the closest approved reference and keeps operational metadata out of the content hash", async () => {
    const references = [
      reference({
        referenceId: "close",
        fileName: "close.json",
        workbookName: "close.xlsm",
        hashSeed: "a",
        sourceTabs: ["ACTIVES"],
        runs: ["DOR", "NRD"],
        genericFields: ["DOH", "DOTE", "NRA"],
      }),
      reference({
        referenceId: "far",
        fileName: "far.json",
        workbookName: "far.xlsm",
        hashSeed: "b",
        sourceTabs: ["RETIREES"],
        runs: ["QPSA"],
        genericFields: ["BENEFIT", "PAYMENT"],
      }),
    ];

    const first = await createDraftV1SummaryArtifact({
      caseId: uuid("00000000-0000-4000-8000-000000000001"),
      r5Summary: {
        sourceTabs: ["Actives"],
        runs: ["DOR", "NRD"],
        fields: ["DOH", "DOTE", "NRA"],
      },
      r5SummaryContentSha256: sha("c"),
      r5SummaryFileName: "r5-summary.json",
      generatedAt: timestamp("2026-08-02T12:00:00.000Z"),
      generatedBy: "reviewer-a",
      references,
    });
    const second = await createDraftV1SummaryArtifact({
      ...firstInput(references),
      generatedAt: timestamp("2026-08-02T13:00:00.000Z"),
      generatedBy: "reviewer-b",
    });

    expect(first.artifactType).toBe("draft-v1-summary");
    expect(first.deterministicPayload.selectedScaffold.referenceId).toBe(
      "close",
    );
    expect(first.deterministicPayload.draftStatus).toBe("blocked");
    expect(first.deterministicPayload.blockers.join(" ")).toContain(
      "not a governed V1 architecture",
    );
    expect(first.deterministicPayload.maturityClaims).toEqual([
      expect.objectContaining({ externalExecutionClaimed: false }),
    ]);
    expect(first.contentSha256).toBe(second.contentSha256);
    expect(first.operationalMetadata).not.toEqual(second.operationalMetadata);
  });
});

function firstInput(references: readonly ApprovedV1SummaryReference[]) {
  return {
    caseId: uuid("00000000-0000-4000-8000-000000000001"),
    r5Summary: {
      sourceTabs: ["Actives"],
      runs: ["DOR", "NRD"],
      fields: ["DOH", "DOTE", "NRA"],
    },
    r5SummaryContentSha256: sha("c"),
    r5SummaryFileName: "r5-summary.json",
    generatedAt: timestamp("2026-08-02T12:00:00.000Z"),
    generatedBy: "reviewer-a",
    references,
  };
}

function reference({
  referenceId,
  fileName,
  workbookName,
  hashSeed,
  sourceTabs,
  runs,
  genericFields,
}: {
  readonly referenceId: string;
  readonly fileName: string;
  readonly workbookName: string;
  readonly hashSeed: string;
  readonly sourceTabs: readonly string[];
  readonly runs: readonly string[];
  readonly genericFields: readonly string[];
}): ApprovedV1SummaryReference {
  return {
    referenceId,
    fileName,
    workbookName,
    contentSha256: sha(hashSeed),
    schemaVersion: "v1-engine-summary-option-b-1.0",
    keyMode: "SOURCE_TAB::CELL_ADDRESS",
    sourceTabs,
    runs,
    cellCount: 3,
    uniqueFieldCount: genericFields.length,
    formulaCellCount: 1,
    iobCounts: { I: 2, O: 1, B: 0, N: 0, C: 0, other: 0 },
    genericFields,
  };
}

function uuid(value: string) {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function sha(seed: string): Sha256 {
  const parsed = parseSha256(seed.repeat(64).slice(0, 64));
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseUtcTimestamp(value);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}
