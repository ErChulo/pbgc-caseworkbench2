import { describe, expect, it } from "vitest";
import { architectureBuildIsCurrent } from "../../../src/app/utilities/architecture-build-freshness";

describe("architecture build freshness", () => {
  it("rejects a changed case, workspace, snapshot, review, catalog, or build", () => {
    const workspace = {},
      snapshot = {},
      reviewState = {},
      catalog = {};
    const current = {
      buildSequence: 1,
      currentBuildSequence: 1,
      caseId: "case",
      activeCaseId: "case",
      workspace,
      currentWorkspace: workspace,
      snapshot,
      currentSnapshot: snapshot,
      reviewState,
      currentReviewState: reviewState,
      catalog,
      currentCatalog: catalog,
    };
    expect(architectureBuildIsCurrent(current)).toBe(true);
    for (const change of [
      { currentBuildSequence: 2 },
      { activeCaseId: "other" },
      { currentWorkspace: {} },
      { currentSnapshot: {} },
      { currentReviewState: {} },
      { currentCatalog: {} },
    ])
      expect(architectureBuildIsCurrent({ ...current, ...change })).toBe(false);
  });
});
