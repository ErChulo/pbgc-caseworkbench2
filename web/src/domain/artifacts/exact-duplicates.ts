import type { ArtifactRecord, ReceiptRecord } from "./models";

export interface ExactDuplicateGroup {
  readonly sha256: ArtifactRecord["sha256"];
  readonly artifactIds: readonly ArtifactRecord["artifactId"][];
  readonly receiptIds: readonly ReceiptRecord["receiptId"][];
}

export function exactDuplicateGroups(
  artifacts: readonly ArtifactRecord[],
  receipts: readonly ReceiptRecord[],
): readonly ExactDuplicateGroup[] {
  const grouped = new Map<string, ArtifactRecord[]>();
  for (const artifact of artifacts) {
    grouped.set(artifact.sha256, [
      ...(grouped.get(artifact.sha256) ?? []),
      artifact,
    ]);
  }
  return Object.freeze(
    [...grouped.entries()]
      .filter(([, records]) => records.length > 1)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sha256, records]) => {
        const first = records[0];
        if (first === undefined) throw new Error("Duplicate group is empty.");
        return Object.freeze({
          sha256: first.sha256,
          artifactIds: Object.freeze(
            records.map((record) => record.artifactId),
          ),
          receiptIds: Object.freeze(
            receipts
              .filter((receipt) => receipt.sha256 === sha256)
              .map((receipt) => receipt.receiptId),
          ),
        });
      }),
  );
}
