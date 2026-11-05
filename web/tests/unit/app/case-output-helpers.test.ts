import { describe, expect, it } from "vitest";
import { createFinalOutputInput } from "../../../src/app/utilities/case-output-helpers";
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
