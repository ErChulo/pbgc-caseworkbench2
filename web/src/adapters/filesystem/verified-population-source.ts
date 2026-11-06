import { contentObjectPath } from "../../domain/artifacts/models";
import type { PackageSnapshot } from "../../domain/attempts/models";
import { computePackageSnapshotId } from "../../domain/attempts/snapshot";
import type { WorkspacePort } from "../../domain/ports";
import type { Sha256 } from "../../domain/shared/types";
import type {
  PopulationCandidateDecision,
  PopulationCandidateProfile,
  PopulationEvidenceObservation,
} from "../../domain/population/population-types";
import {
  workbookProfileContentHash,
  type WorkbookNamedRangeObservation,
  type WorkbookPopulationProfile,
} from "../../domain/population/workbook-adapter";
import {
  verifyPopulationWorkbook,
  type VerifiedWorkbookResult,
} from "../parsers/verified-population-workbook";

// Conservative bound on compressed source bytes; this is not a ZIP bomb defense.
const MAX_WORKBOOK_SOURCE_BYTES = 32 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;

/** Verifies case-snapshot membership, current object bytes and stored profile consistency.
 * This does not authenticate the snapshot, reviewer, or artifact eligibility. */
export async function verifyPopulationSourceInWorkspace<StorageError>(input: {
  readonly workspace: Pick<WorkspacePort<StorageError>, "openChunkReader">;
  readonly snapshot: PackageSnapshot;
  readonly candidate: PopulationCandidateProfile;
  readonly observations: readonly PopulationEvidenceObservation[];
  readonly decisions: readonly PopulationCandidateDecision[];
  readonly storedWorkbook: WorkbookPopulationProfile;
  readonly storedNamedRanges: readonly WorkbookNamedRangeObservation[];
  readonly storedProfileHash: Sha256;
}): Promise<VerifiedWorkbookResult> {
  const fail = (code: string, message: string): VerifiedWorkbookResult => ({
    ok: false,
    code,
    message,
  });
  try {
    const { workspace } = input;
    const snapshot = structuredClone(input.snapshot);
    const candidate = structuredClone(input.candidate);
    const observations = structuredClone(input.observations);
    const decisions = structuredClone(input.decisions);
    const storedWorkbook = structuredClone(input.storedWorkbook);
    const storedNamedRanges = structuredClone(input.storedNamedRanges);
    const storedProfileHash = input.storedProfileHash;
    if (
      snapshot.discoveredCount !== snapshot.entries.length ||
      !Number.isSafeInteger(snapshot.totalBytes) ||
      snapshot.totalBytes !==
        snapshot.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0) ||
      snapshot.entries.some(
        (entry) =>
          !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0,
      ) ||
      (await computePackageSnapshotId(snapshot.entries)) !== snapshot.snapshotId
    )
      return fail(
        "SNAPSHOT_INVALID",
        "The current case evidence snapshot is invalid.",
      );
    const entries = snapshot.entries.filter(
      (entry) => entry.sha256 === candidate.artifactSha256,
    );
    if (
      entries.length === 0 ||
      entries.some((entry) => entry.sizeBytes !== entries[0]?.sizeBytes)
    )
      return fail(
        "SOURCE_NOT_IN_SNAPSHOT",
        "The source is not available in the current case evidence snapshot.",
      );
    const expectedSize = entries[0]?.sizeBytes ?? 0;
    if (expectedSize <= 0 || expectedSize > MAX_WORKBOOK_SOURCE_BYTES)
      return fail(
        "SOURCE_SIZE_BLOCKED",
        "The source workbook exceeds the supported inspection size.",
      );
    const opened = await workspace.openChunkReader(
      contentObjectPath(candidate.artifactSha256),
    );
    if (!opened.ok || opened.value.sizeBytes !== expectedSize)
      return fail(
        "SOURCE_READ_FAILED",
        "The preserved source workbook could not be read safely.",
      );
    const bytes = new Uint8Array(expectedSize);
    for (let offset = 0; offset < expectedSize;) {
      const length = Math.min(CHUNK_SIZE, expectedSize - offset);
      const chunk = await opened.value.read({
        offsetBytes: offset,
        lengthBytes: length,
      });
      if (
        !chunk.ok ||
        chunk.value.offsetBytes !== offset ||
        chunk.value.bytes.length !== length ||
        chunk.value.endOfSource !== (offset + length === expectedSize)
      )
        return fail(
          "SOURCE_READ_FAILED",
          "The preserved source workbook could not be read safely.",
        );
      bytes.set(chunk.value.bytes, offset);
      offset += length;
    }
    const verified = await verifyPopulationWorkbook({
      bytes,
      candidate,
      observations,
      decisions,
    });
    if (!verified.ok) return verified;
    const reconstructedHash = await workbookProfileContentHash(
      verified.value.workbook,
      verified.value.namedRanges,
    );
    const storedHash = await workbookProfileContentHash(
      storedWorkbook,
      storedNamedRanges,
    );
    if (
      storedHash !== storedProfileHash ||
      reconstructedHash !== storedProfileHash
    )
      return fail(
        "STORED_PROFILE_MISMATCH",
        "The stored workbook profile does not match the preserved source.",
      );
    return verified;
  } catch {
    return fail(
      "SOURCE_VERIFICATION_FAILED",
      "The source workbook could not be verified.",
    );
  }
}
