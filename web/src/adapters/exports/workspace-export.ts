import type { WorkspacePort } from "../../domain/ports";
import { canonicalize } from "../../domain/manifests/canonical-json";
import { deterministicSha256 } from "../../domain/normalization/normalizer";
import type { Result, Sha256 } from "../../domain/shared/types";

export interface WorkspaceExportError {
  readonly code: "WRITE_FAILED" | "READ_FAILED" | "HASH_MISMATCH";
  readonly safeMessage: string;
}

export async function writeLocalJson<StorageError>(
  workspace: WorkspacePort<StorageError>,
  relativePath: string,
  value: unknown,
  expectedHash: Sha256,
): Promise<
  Result<
    { readonly relativePath: string; readonly sha256: Sha256 },
    WorkspaceExportError
  >
> {
  const bytes = new TextEncoder().encode(`${canonicalize(value)}\n`);
  const hash = await deterministicSha256(value);
  if (hash !== expectedHash)
    return fail(
      "HASH_MISMATCH",
      "Export hash does not match deterministic content.",
    );
  const write = await workspace.writeAtomic(relativePath, bytes);
  if (!write.ok)
    return fail(
      "WRITE_FAILED",
      "Local export could not be written atomically.",
    );
  const reader = await workspace.openChunkReader(relativePath);
  if (!reader.ok)
    return fail("READ_FAILED", "Local export could not be read back.");
  const read = await readAll(reader.value);
  if (
    !read.ok ||
    new TextDecoder().decode(read.value.bytes) !==
      new TextDecoder().decode(bytes)
  )
    return fail("HASH_MISMATCH", "Local export failed read-back verification.");
  return { ok: true, value: { relativePath, sha256: hash } };
}

async function readAll<ErrorValue>(
  reader: import("../../domain/ports").ChunkReaderPort<ErrorValue>,
) {
  return reader.read({ offsetBytes: 0, lengthBytes: reader.sizeBytes });
}

function fail(code: WorkspaceExportError["code"], safeMessage: string) {
  return { ok: false, error: { code, safeMessage } } as const;
}
