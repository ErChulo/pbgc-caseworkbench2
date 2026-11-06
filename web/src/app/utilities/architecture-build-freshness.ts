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

/** Clear derived output while retaining the cell inventory for formula review when requested. */
export function invalidateDerivedBuildOutputs(input: {
  readonly preserveArchitecture: boolean;
  readonly supersedeBuild: () => void;
  readonly clearArchitecture: () => void;
  readonly clearBuildSpec: () => void;
  readonly clearCompilation: () => void;
  readonly clearWorkbook: () => void;
  readonly clearWorkbookBytes: () => void;
  readonly clearOutputMessage: () => void;
  readonly clearBuildMessage: () => void;
}): void {
  input.supersedeBuild();
  if (!input.preserveArchitecture) input.clearArchitecture();
  input.clearBuildSpec();
  input.clearCompilation();
  input.clearWorkbook();
  input.clearWorkbookBytes();
  input.clearOutputMessage();
  input.clearBuildMessage();
}
