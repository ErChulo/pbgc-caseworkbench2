import { describe, expect, it } from "vitest";
import {
  decisionCoversFindings,
  gateEligibilityByCurrentFindings,
} from "../../../src/app/orchestrator/quarantine-eligibility-gate";
import type { ArtifactEligibilityReviewItem } from "../../../src/components/review/ArtifactEligibilityReview";
import type { QuarantineQueueItem } from "../../../src/components/quarantine/QuarantineQueue";
import type {
  ArtifactEligibilityDecision,
  QuarantineDecision,
} from "../../../src/domain/quarantine/models";

const item = {
  requiresQuarantineRelease: false,
  projection: { eligible: true, effectiveStatus: "released", provenance: [] },
} as unknown as ArtifactEligibilityReviewItem;
const queue = { findingIds: ["one", "two"] } as unknown as QuarantineQueueItem;
const release = {
  decisionId: "release",
  decisionContentSha256: "hash",
  resultingStatus: "released",
  findingIds: ["one", "two"],
} as unknown as QuarantineDecision;
const inherited = {
  action: "inherit-approval",
  sourceQuarantineDecisionId: "release",
  sourceQuarantineDecisionContentSha256: "hash",
} as unknown as ArtifactEligibilityDecision;

describe("same-byte safety eligibility gate", () => {
  it("leaves an eligibility projection alone only when there is no safety hold", () => {
    expect(
      gateEligibilityByCurrentFindings(item, undefined, [], [], item.projection)
        .projection.eligible,
    ).toBe(true);
    expect(
      gateEligibilityByCurrentFindings(
        { ...item, requiresQuarantineRelease: true },
        undefined,
        [],
        [],
        item.projection,
      ).projection.eligible,
    ).toBe(false);
  });
  it("requires both the current release and the cited eligibility source to cover all findings", () => {
    expect(decisionCoversFindings(release, [])).toBe(false);
    expect(
      gateEligibilityByCurrentFindings(
        item,
        queue,
        [release],
        [inherited],
        item.projection,
      ),
    ).toMatchObject({
      requiresQuarantineRelease: true,
      quarantineReleased: true,
      projection: { eligible: true },
    });
    const earlier = { ...release, findingIds: ["one"] };
    expect(
      gateEligibilityByCurrentFindings(
        item,
        queue,
        [earlier],
        [inherited],
        item.projection,
      ),
    ).toMatchObject({
      quarantineReleased: false,
      projection: { eligible: false, effectiveStatus: "blocked" },
    });
    expect(
      gateEligibilityByCurrentFindings(
        item,
        queue,
        [release],
        [{ ...inherited, action: "approve" }],
        item.projection,
      ).projection.eligible,
    ).toBe(false);
    expect(
      gateEligibilityByCurrentFindings(
        item,
        queue,
        [release],
        [
          {
            ...inherited,
            sourceQuarantineDecisionContentSha256:
              "different" as typeof inherited.sourceQuarantineDecisionContentSha256,
          },
        ],
        item.projection,
      ).projection.eligible,
    ).toBe(false);
    expect(
      gateEligibilityByCurrentFindings(
        item,
        queue,
        [release, { ...release, resultingStatus: "revoked" }],
        [inherited],
        item.projection,
      ).projection.eligible,
    ).toBe(false);
  });
});
