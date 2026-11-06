import { describe, expect, it, vi } from "vitest";
import {
  architectureBuildIsCurrent,
  invalidateDerivedBuildOutputs,
} from "../../../src/app/utilities/architecture-build-freshness";

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
  it("clears derived outputs, preserving cell inventory only for formula review", () => {
    const calls = {
      supersedeBuild: vi.fn(),
      clearArchitecture: vi.fn(),
      clearBuildSpec: vi.fn(),
      clearCompilation: vi.fn(),
      clearWorkbook: vi.fn(),
      clearWorkbookBytes: vi.fn(),
      clearOutputMessage: vi.fn(),
      clearBuildMessage: vi.fn(),
    };
    invalidateDerivedBuildOutputs({ ...calls, preserveArchitecture: true });
    expect(calls.clearArchitecture).not.toHaveBeenCalled();
    for (const [name, callback] of Object.entries(calls))
      if (name !== "clearArchitecture")
        expect(callback).toHaveBeenCalledTimes(1);
    invalidateDerivedBuildOutputs({ ...calls, preserveArchitecture: false });
    expect(calls.clearArchitecture).toHaveBeenCalledTimes(1);
    for (const [name, callback] of Object.entries(calls))
      if (name !== "clearArchitecture")
        expect(callback).toHaveBeenCalledTimes(2);
  });
});
