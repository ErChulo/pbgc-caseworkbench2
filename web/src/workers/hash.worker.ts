import { createSHA256 } from "hash-wasm";

import type {
  ChunkReaderPort,
  HashProgress,
  HashResult,
} from "../domain/ports";
import { parseSha256, type Result } from "../domain/shared/types";

export interface HashWorkerError {
  readonly code: "HASH_READ_FAILED" | "HASH_CANCELLED" | "HASH_INVALID_CHUNK";
  readonly safeMessage: string;
}

export async function hashChunkReader<ReadError>(
  source: ChunkReaderPort<ReadError>,
  options: {
    readonly chunkSizeBytes?: number;
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: HashProgress) => void;
  } = {},
): Promise<Result<HashResult, HashWorkerError>> {
  const isCancelled = (): boolean => options.signal?.aborted === true;
  const chunkSizeBytes = options.chunkSizeBytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(chunkSizeBytes) || chunkSizeBytes <= 0) {
    return failure("HASH_INVALID_CHUNK", "Hash chunk size must be positive.");
  }
  const sizeBytes = source.sizeBytes;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    return failure("HASH_READ_FAILED", "Artifact size is invalid.");
  }
  if (isCancelled()) {
    return failure("HASH_CANCELLED", "Hashing was cancelled.");
  }
  const hasher = await createSHA256();
  let offsetBytes = 0;
  while (offsetBytes < sizeBytes) {
    if (isCancelled()) {
      return failure("HASH_CANCELLED", "Hashing was cancelled.");
    }
    const chunk = await source.read({
      offsetBytes,
      lengthBytes: Math.min(chunkSizeBytes, sizeBytes - offsetBytes),
    });
    if (isCancelled()) {
      return failure("HASH_CANCELLED", "Hashing was cancelled.");
    }
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offsetBytes ||
      chunk.value.bytes.byteLength === 0 ||
      chunk.value.bytes.byteLength >
        Math.min(chunkSizeBytes, sizeBytes - offsetBytes) ||
      chunk.value.endOfSource !==
        (offsetBytes + chunk.value.bytes.byteLength === sizeBytes)
    ) {
      return failure(
        "HASH_READ_FAILED",
        "Artifact bytes could not be read deterministically.",
      );
    }
    hasher.update(chunk.value.bytes);
    offsetBytes += chunk.value.bytes.byteLength;
    options.onProgress?.({
      processedBytes: offsetBytes,
      totalBytes: sizeBytes,
    });
  }
  if (isCancelled()) {
    return failure("HASH_CANCELLED", "Hashing was cancelled.");
  }
  const parsed = parseSha256(hasher.digest("hex"));
  if (!parsed.ok)
    throw new Error("SHA-256 implementation returned an invalid digest.");
  return { ok: true, value: { sha256: parsed.value, sizeBytes: offsetBytes } };
}

function failure(
  code: HashWorkerError["code"],
  safeMessage: string,
): Result<never, HashWorkerError> {
  return { ok: false, error: { code, safeMessage } };
}
