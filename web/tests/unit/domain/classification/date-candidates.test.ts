/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it } from "vitest";

import {
  conflictingDateCandidates,
  extractDateCandidates,
  validateDateSelection,
} from "../../../../src/domain/classification/date-candidates";
import { syntheticClassificationArtifacts } from "../../../fixtures/generators/classification";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

describe("T079 date candidates", () => {
  it("preserves raw values, conventions, locators, and competing values", async () => {
    const fixture = syntheticClassificationArtifacts()[3]!;
    const candidates = await extractDateCandidates(
      fixture.sha256,
      fixture.text,
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawValue: "2021-02-01",
          normalizedValue: "2021-02-01",
          convention: "YYYY-MM-DD",
          sourceLocator: expect.stringContaining("offset="),
          status: "proposed",
        }),
        expect.objectContaining({
          rawValue: "02/15/2021",
          normalizedValue: "2021-02-15",
          convention: "MM/DD/YYYY",
        }),
      ]),
    );
    expect(conflictingDateCandidates(candidates)).toBe(true);
  });

  it("retains invalid calendar dates as unresolved rather than correcting them", async () => {
    const fixture = syntheticClassificationArtifacts()[0]!;
    const [candidate] = await extractDateCandidates(
      fixture.sha256,
      "Effective 2021-02-31.",
    );
    expect(candidate).toMatchObject({
      rawValue: "2021-02-31",
      normalizedValue: null,
      valid: false,
      status: "unresolved",
    });
  });

  it("records human selection separately without mutating competing candidates", async () => {
    const fixture = syntheticClassificationArtifacts()[3]!;
    const candidates = await extractDateCandidates(
      fixture.sha256,
      fixture.text,
    );
    const selected = candidates[0]!;
    const decisionId = parseUuid("11111111-1111-4111-8111-111111111111");
    const decidedAt = parseUtcTimestamp("2026-07-25T12:00:00.000Z");
    if (!decisionId.ok || !decidedAt.ok) throw new Error("fixture");
    expect(
      validateDateSelection(candidates, {
        decisionId: decisionId.value,
        artifactSha256: fixture.sha256,
        selectedCandidateKey: selected.candidateKey,
        actor: {
          actorType: "human",
          actorKey: "reviewer",
          displayName: "Synthetic Reviewer",
          authorityContext: "Synthetic date review",
        },
        decidedAt: decidedAt.value,
        rationale: "Competing raw candidates reviewed.",
        ruleSetVersion: "1",
      }),
    ).toMatchObject({
      ok: true,
      value: { candidateKey: selected.candidateKey },
    });
    expect(
      candidates.every((candidate) =>
        ["proposed", "unresolved"].includes(candidate.status),
      ),
    ).toBe(true);
  });
});
