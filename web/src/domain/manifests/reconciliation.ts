export type OriginCategory = "source-artifact" | "extracted-member";
export type TerminalCategory =
  | "accepted-for-processing"
  | "provisional-safety-block"
  | "pending-human-disposition"
  | "final-human-disposition-recorded"
  | "failed"
  | "duplicate"
  | "excluded";

export interface ReconciliationEntry<Category extends string> {
  readonly recordId: string;
  readonly category: Category;
}

export interface Reconciliation {
  readonly discoveredRecordTotal: number;
  readonly originLedger: readonly ReconciliationEntry<OriginCategory>[];
  readonly terminalDispositionLedger: readonly ReconciliationEntry<TerminalCategory>[];
  readonly governedStatus: "provisional";
}

export function reconcileInventory(
  discoveredRecordIds: readonly string[],
  originLedger: readonly ReconciliationEntry<OriginCategory>[],
  terminalDispositionLedger: readonly ReconciliationEntry<TerminalCategory>[],
): Reconciliation {
  assertLedger(discoveredRecordIds, originLedger, "origin");
  assertLedger(discoveredRecordIds, terminalDispositionLedger, "terminal");
  return Object.freeze({
    discoveredRecordTotal: discoveredRecordIds.length,
    originLedger: Object.freeze([...originLedger].sort(byRecordId)),
    terminalDispositionLedger: Object.freeze(
      [...terminalDispositionLedger].sort(byRecordId),
    ),
    governedStatus: "provisional",
  });
}

function assertLedger(
  expectedIds: readonly string[],
  entries: readonly ReconciliationEntry<string>[],
  label: string,
): void {
  const expected = [...expectedIds].sort();
  const actual = entries.map((entry) => entry.recordId).sort();
  if (
    new Set(expected).size !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.join("\0") !== actual.join("\0")
  ) {
    throw new Error(`${label} ledger does not balance independently.`);
  }
}

function byRecordId(
  left: ReconciliationEntry<string>,
  right: ReconciliationEntry<string>,
): number {
  return left.recordId.localeCompare(right.recordId);
}
