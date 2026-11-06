import { describe, expect, it } from "vitest";
import { populationReviewBlocker } from "../../../src/app/utilities/population-review-guard";
import type { PopulationReviewItem } from "../../../src/components/review/PopulationReview";

const workbook = {
  status: "profiled" as const,
  sheets: [],
  formulaExecutionCount: 0 as const,
  limitations: [],
};
const item = { workbook, namedRanges: [] } as unknown as PopulationReviewItem;
describe("population review guard", () => {
  it("allows only fully inspected workbook profiles to be approved", () => {
    expect(populationReviewBlocker(item, "approve")).toBeNull();
    expect(
      populationReviewBlocker({ ...item, namedRanges: undefined }, "approve"),
    ).toContain("Re-inspect");
    expect(
      populationReviewBlocker(
        { ...item, workbook: { ...workbook, status: "blocked" } },
        "approve",
      ),
    ).toContain("blocked");
  });
  it("allows revocation and supersession of outdated approvals", () => {
    const stale = { ...item, namedRanges: undefined };
    expect(populationReviewBlocker(stale, "revoke")).toBeNull();
    expect(populationReviewBlocker(stale, "supersede")).toBeNull();
  });
});
