import type { ChunkReaderPort } from "../../domain/ports";
import { sha256Bytes } from "../../domain/shared/digest";
import type { Sha256 } from "../../domain/shared/types";

/** Copy a bounded object once and verify the exact copied bytes before use. */
export async function readVerifiedChunkSnapshot<StorageError>(
  reader: ChunkReaderPort<StorageError>,
  expectedHash: Sha256,
  expectedSize: number,
  maximumSize: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize < 0 ||
    !Number.isSafeInteger(maximumSize) ||
    maximumSize < 0 ||
    expectedSize > maximumSize ||
    reader.sizeBytes !== expectedSize
  )
    throw new Error("Preserved content has an invalid size.");
  const bytes = new Uint8Array(expectedSize);
  for (let offset = 0; offset < expectedSize;) {
    const length = Math.min(64 * 1024, expectedSize - offset);
    const chunk = await reader.read({
      offsetBytes: offset,
      lengthBytes: length,
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offset ||
      chunk.value.bytes.byteLength !== length ||
      chunk.value.endOfSource !== (offset + length === expectedSize)
    )
      throw new Error("Preserved content could not be read completely.");
    bytes.set(chunk.value.bytes, offset);
    offset += length;
  }
  if ((await sha256Bytes(bytes)) !== expectedHash)
    throw new Error("Preserved content hash does not match.");
  return bytes;
}
