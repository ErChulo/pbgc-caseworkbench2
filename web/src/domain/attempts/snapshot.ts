import { canonicalize, hashTyped } from "../manifests/canonical-json";
import type { ClockPort, UuidPort } from "../ports";
import { parseSha256, type Sha256 } from "../shared/types";
import type { PackageSnapshot, SnapshotEntry } from "./models";

export async function createPackageSnapshot(
  entries: readonly SnapshotEntry[],
  dependencies: { readonly uuid: UuidPort; readonly clock: ClockPort },
): Promise<PackageSnapshot> {
  const sorted = [...entries].sort(
    (left, right) =>
      left.normalizedDisplayPath.localeCompare(right.normalizedDisplayPath) ||
      left.sha256.localeCompare(right.sha256),
  );
  const snapshotId = await computePackageSnapshotId(sorted);
  const totalBytes = sorted.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return Object.freeze({
    snapshotId,
    snapshotRecordId: dependencies.uuid.generate(),
    entries: Object.freeze(sorted),
    discoveredCount: sorted.length,
    totalBytes,
    frozenAt: dependencies.clock.now(),
  });
}

export async function computePackageSnapshotId(
  entries: readonly SnapshotEntry[],
): Promise<Sha256> {
  const sorted = [...entries].sort(
    (left, right) =>
      left.normalizedDisplayPath.localeCompare(right.normalizedDisplayPath) ||
      left.sha256.localeCompare(right.sha256),
  );
  const deterministicPayload = {
    entries: sorted.map((entry) => ({
      observedRelativePath: entry.observedRelativePath,
      normalizedDisplayPath: entry.normalizedDisplayPath,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
      declaredMediaType: entry.declaredMediaType,
    })),
    discoveredCount: sorted.length,
    totalBytes: sorted.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  };
  const parsedSnapshotId = parseSha256(
    await hashTyped(deterministicPayload, {}),
  );
  if (!parsedSnapshotId.ok) throw new Error("Snapshot hash was invalid.");
  return parsedSnapshotId.value;
}

export type SnapshotDifference =
  "unchanged" | "added" | "removed" | "renamed" | "changed";

export function compareSnapshots(
  prior: PackageSnapshot,
  current: PackageSnapshot,
): SnapshotDifference {
  if (prior.snapshotId === current.snapshotId) return "unchanged";
  const priorByPath = new Map(
    prior.entries.map((entry) => [entry.observedRelativePath, entry]),
  );
  const currentByPath = new Map(
    current.entries.map((entry) => [entry.observedRelativePath, entry]),
  );
  if (current.entries.length > prior.entries.length) return "added";
  if (current.entries.length < prior.entries.length) return "removed";
  const sameHashes =
    [...prior.entries]
      .map((entry) => entry.sha256)
      .sort()
      .join() ===
    [...current.entries]
      .map((entry) => entry.sha256)
      .sort()
      .join();
  if (
    sameHashes &&
    canonicalize([...priorByPath.keys()]) !==
      canonicalize([...currentByPath.keys()])
  ) {
    return "renamed";
  }
  return "changed";
}

export function snapshotIdentity(snapshot: PackageSnapshot): Sha256 {
  return snapshot.snapshotId;
}
