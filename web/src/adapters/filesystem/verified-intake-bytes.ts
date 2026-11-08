import type { WorkspacePort } from "../../domain/ports";
import { contentObjectPath } from "../../domain/artifacts/models";
import { sha256Bytes } from "../../domain/shared/digest";
import type { Sha256 } from "../../domain/shared/types";

/** Maximum bytes loaded into memory for intake screening and passive parsing. */
export const MAX_INTAKE_INSPECTION_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

export async function readVerifiedIntakeBytes<StorageError>(
  workspace: Pick<WorkspacePort<StorageError>, "openChunkReader">,
  expectedHash: Sha256,
  expectedSize: number,
): Promise<
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly message: string }
> {
  const fail = (message: string) => ({ ok: false as const, message });
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize < 0 ||
    expectedSize > MAX_INTAKE_INSPECTION_BYTES
  )
    return fail(
      "File exceeds the 32 MiB local inspection limit. It was not inspected or added to the snapshot.",
    );
  try {
    const opened = await workspace.openChunkReader(
      contentObjectPath(expectedHash),
    );
    if (!opened.ok || opened.value.sizeBytes !== expectedSize)
      return fail(
        "Preserved evidence could not be read at its expected size. It was not inspected or added to the snapshot.",
      );
    const bytes = new Uint8Array(expectedSize);
    for (let offset = 0; offset < expectedSize;) {
      const length = Math.min(CHUNK_BYTES, expectedSize - offset);
      const chunk = await opened.value.read({
        offsetBytes: offset,
        lengthBytes: length,
      });
      if (
        !chunk.ok ||
        chunk.value.offsetBytes !== offset ||
        chunk.value.bytes.byteLength !== length ||
        chunk.value.endOfSource !== (offset + length === expectedSize)
      )
        return fail(
          "Preserved evidence could not be read completely. It was not inspected or added to the snapshot.",
        );
      bytes.set(chunk.value.bytes, offset);
      offset += length;
    }
    if ((await sha256Bytes(bytes)) !== expectedHash)
      return fail(
        "Preserved evidence bytes changed before inspection. It was not inspected or added to the snapshot.",
      );
    return { ok: true, bytes };
  } catch {
    return fail(
      "Preserved evidence could not be verified. It was not inspected or added to the snapshot.",
    );
  }
}
