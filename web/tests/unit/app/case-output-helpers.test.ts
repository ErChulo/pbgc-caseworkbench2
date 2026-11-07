import { describe, expect, it } from "vitest";
import { createFinalOutputInput } from "../../../src/app/utilities/case-output-helpers";
import { buildFinalCaseworkOutputPayload } from "../../../src/domain/case-output/package-builder";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../../src/domain/shared/types";

describe("case output population approval", () => {
  it("does not treat a linked population file as an approved profile", () => {
    const id = parseUuid("00000000-0000-4000-8000-000000000001");
    const time = parseUtcTimestamp("2026-08-02T12:00:00.000Z");
    const hash = parseSha256("a".repeat(64));
    if (!id.ok || !time.ok || !hash.ok) throw new Error("Invalid fixture");
    const input = createFinalOutputInput({
      caseRecord: { caseId: id.value },
      manifestSummary: null,
      previewRules: [],
      populationItems: [],
      caseOutputArtifacts: [
        {
          artifactType: "population-profile",
          artifactId: "profile",
          contentSha256: hash.value,
          mediaType: "application/json",
          description: "linked",
          maturityLevel: "human-approved",
        },
      ],
      unresolvedItems: [],
      createdAt: time.value,
      createdBy: null,
    });
    expect(input.populationProfileContentSha256).toBeNull();
  });
});

describe("case output ambiguous selection", () => {
  const id = parseUuid("00000000-0000-4000-8000-000000000001");
  const time = parseUtcTimestamp("2026-08-02T12:00:00.000Z");
  const a = parseSha256("a".repeat(64));
  const b = parseSha256("b".repeat(64));
  if (!id.ok || !time.ok || !a.ok || !b.ok) throw new Error("Bad fixture");
  const caseId = id.value,
    createdAt = time.value,
    hashA = a.value,
    hashB = b.value;
  const candidate: import("../../../src/domain/population/population-types").PopulationCandidateProfile =
    {
      candidateKey: hashA,
      artifactSha256: hashA,
      candidateStatus: "proposed",
      detectorIdentity: "synthetic",
      detectorVersion: "1",
      confidence: 1,
      evidence: [],
      observedFields: [],
      recordCounts: [],
      sensitivity: "synthetic-mock",
      correctionsOrImputationsApplied: false,
    };
  function item(
    status: "approved" | "rejected",
    effective: typeof hashA | null,
    workbook: typeof hashA,
  ): import("../../../src/components/review/PopulationReview").PopulationReviewItem {
    return {
      displayName: "synthetic",
      candidate,
      workbookProfileContentSha256: workbook,
      structuralFinding: "synthetic",
      projection: {
        status,
        effectiveDecisionId: "synthetic",
        effectiveWorkbookProfileContentSha256: effective,
        provenance: [],
      },
    };
  }
  function input(
    populationItems: readonly import("../../../src/components/review/PopulationReview").PopulationReviewItem[],
    caseOutputArtifacts: readonly import("../../../src/domain/case-output/models").CaseworkOutputArtifactInput[] = [],
  ) {
    return createFinalOutputInput({
      caseRecord: { caseId },
      manifestSummary: null,
      previewRules: [],
      populationItems,
      caseOutputArtifacts,
      unresolvedItems: [],
      createdAt,
      createdBy: null,
    });
  }
  it("requires one approved candidate and matching current profile bytes", () => {
    expect(
      input([item("approved", hashA, hashA), item("rejected", null, hashB)])
        .populationProfileContentSha256,
    ).toBe(hashA);
    expect(
      input([item("approved", hashA, hashB)]).populationProfileContentSha256,
    ).toBeNull();
    expect(
      input([item("approved", null, hashA)]).populationProfileContentSha256,
    ).toBeNull();
    expect(
      input([item("approved", hashA, hashA), item("approved", hashB, hashB)])
        .populationProfileContentSha256,
    ).toBeNull();
    expect(
      input([item("approved", hashB, hashB), item("approved", hashA, hashA)])
        .populationProfileContentSha256,
    ).toBeNull();
    expect(
      input([item("approved", hashA, hashA), item("approved", null, hashB)])
        .populationProfileContentSha256,
    ).toBeNull();
  });
  it("surfaces ambiguous population and links as blocked stages without arbitrary artifact references", () => {
    const architecture = {
      artifactType: "v1-architecture" as const,
      artifactId: "synthetic",
      contentSha256: hashA,
      mediaType: "application/json",
      description: "synthetic",
    };
    const payload = buildFinalCaseworkOutputPayload(
      input(
        [item("approved", hashA, hashA), item("approved", hashB, hashB)],
        [
          architecture,
          { ...architecture, artifactId: "other", contentSha256: hashB },
        ],
      ),
    );
    expect(payload.packageStatus).toBe("blocked");
    expect(
      payload.artifacts.some(
        (artifact) =>
          artifact.artifactType === "population-profile" ||
          artifact.artifactType === "v1-architecture",
      ),
    ).toBe(false);
    expect(
      payload.stages
        .find((stage) => stage.stageKey === "population-profile")
        ?.blockers.join(" "),
    ).toContain("No single approved population profile");
    expect(
      payload.stages
        .find((stage) => stage.stageKey === "v1-architecture")
        ?.blockers.join(" "),
    ).toContain("No unambiguous");
  });

  it("does not choose among duplicate references, regardless of order or identical hashes", () => {
    const first = {
      artifactType: "build-spec" as const,
      artifactId: "first",
      contentSha256: hashA,
      mediaType: "application/json",
      description: "synthetic",
    };
    const second = { ...first, artifactId: "second", contentSha256: hashB };
    const workbook = { ...first, artifactType: "v1-workbook" as const };
    expect(input([], [first, workbook]).buildSpec).toEqual(first);
    for (const list of [
      [first, second],
      [second, first],
      [first, first],
      [first, second, first],
    ]) {
      expect(input([], [...list, workbook]).buildSpec).toBeNull();
      expect(input([], [...list, workbook]).workbook).toEqual(workbook);
    }
  });
});
