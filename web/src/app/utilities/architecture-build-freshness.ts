/** Detects changes to the case-bound references captured for an asynchronous build. */
export function architectureBuildIsCurrent(input: {
  readonly buildSequence: number;
  readonly currentBuildSequence: number;
  readonly caseId: string;
  readonly activeCaseId: string | null;
  readonly workspace: object;
  readonly currentWorkspace: object | null;
  readonly snapshot: object | null;
  readonly currentSnapshot: object | null;
  readonly reviewState: object;
  readonly currentReviewState: object;
  readonly catalog: object | null;
  readonly currentCatalog: object | null;
}): boolean {
  return (
    input.buildSequence === input.currentBuildSequence &&
    input.caseId === input.activeCaseId &&
    input.workspace === input.currentWorkspace &&
    input.snapshot === input.currentSnapshot &&
    input.reviewState === input.currentReviewState &&
    input.catalog === input.currentCatalog
  );
}
