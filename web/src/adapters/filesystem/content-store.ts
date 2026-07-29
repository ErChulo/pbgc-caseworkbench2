import {
  contentObjectPath,
  type ContentObject,
} from "../../domain/artifacts/models";
import type {
  ChunkReaderPort,
  ClockPort,
  WorkspacePort,
} from "../../domain/ports";
import type { Result, Sha256 } from "../../domain/shared/types";
import { hashChunkReader } from "../../workers/hash.worker";

export interface ContentStoreError {
  readonly code:
    | "SOURCE_HASH_MISMATCH"
    | "STORE_READ_FAILED"
    | "STORE_WRITE_FAILED"
    | "STORED_HASH_MISMATCH";
  readonly safeMessage: string;
  readonly quarantineRequired: boolean;
}

export async function preserveContent<StorageError>(
  workspace: WorkspacePort<StorageError>,
  source: ChunkReaderPort<StorageError>,
  expectedSha256: Sha256,
  clock: ClockPort,
): Promise<Result<ContentObject, ContentStoreError>> {
  const sourceHash = await hashChunkReader(source);
  if (!sourceHash.ok || sourceHash.value.sha256 !== expectedSha256) {
    return failure(
      "SOURCE_HASH_MISMATCH",
      "Source bytes changed before preservation.",
    );
  }
  const objectPath = contentObjectPath(expectedSha256);
  await workspace.createDirectory("objects");
  await workspace.createDirectory("objects/sha256");
  await workspace.createDirectory(
    `objects/sha256/${expectedSha256.slice(0, 2)}`,
  );
  const existing = await workspace.stat(objectPath);
  if (!existing.ok) {
    const write = await workspace.createImmutable(objectPath, source);
    if (!write.ok)
      return failure(
        "STORE_WRITE_FAILED",
        "Immutable evidence could not be preserved.",
      );
  }
  const stored = await workspace.openChunkReader(objectPath);
  if (!stored.ok)
    return failure(
      "STORE_READ_FAILED",
      "Preserved evidence could not be verified.",
    );
  const verified = await hashChunkReader(stored.value);
  if (!verified.ok || verified.value.sha256 !== expectedSha256) {
    return failure(
      "STORED_HASH_MISMATCH",
      "Preserved evidence failed post-write verification.",
    );
  }
  return {
    ok: true,
    value: Object.freeze({
      sha256: expectedSha256,
      sizeBytes: verified.value.sizeBytes,
      objectPath,
      preservationStatus: "verified",
      postWriteSha256: verified.value.sha256,
      firstPreservedAt: clock.now(),
    }),
  };
}

function failure(
  code: ContentStoreError["code"],
  safeMessage: string,
): Result<never, ContentStoreError> {
  return { ok: false, error: { code, safeMessage, quarantineRequired: true } };
}
