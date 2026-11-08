import type { ChunkReaderPort } from "../../domain/ports";

/** Read a local object with an explicit bound and strict chunk accounting. */
export async function readBoundedLocalBytes<StorageError>(
  reader: ChunkReaderPort<StorageError>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const size = reader.sizeBytes;
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    size > limit
  )
    throw new Error("Local file size is invalid or exceeds the limit.");
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size;) {
    const length = Math.min(64 * 1024, size - offset);
    const chunk = await reader.read({
      offsetBytes: offset,
      lengthBytes: length,
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offset ||
      chunk.value.bytes.length !== length ||
      chunk.value.endOfSource !== (offset + length === size)
    )
      throw new Error("Local file could not be read completely.");
    bytes.set(chunk.value.bytes, offset);
    offset += length;
  }
  return bytes;
}
