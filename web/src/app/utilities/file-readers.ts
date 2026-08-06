import type { BrowserWorkspaceError } from "../../adapters/filesystem/case-workspace";
import type { ChunkReaderPort } from "../../domain/ports";

export function fileReader(file: File): ChunkReaderPort<BrowserWorkspaceError> {
  return {
    sizeBytes: file.size,
    read: async ({ offsetBytes, lengthBytes }) => {
      try {
        const bytes = new Uint8Array(
          await file
            .slice(offsetBytes, offsetBytes + lengthBytes)
            .arrayBuffer(),
        );
        return {
          ok: true,
          value: {
            offsetBytes,
            bytes,
            endOfSource: offsetBytes + bytes.length >= file.size,
          },
        };
      } catch {
        return { ok: false, error: { code: "READ_FAILED" } };
      }
    },
  };
}

export function bytesReader(
  bytes: Uint8Array,
): ChunkReaderPort<BrowserWorkspaceError> {
  return {
    sizeBytes: bytes.byteLength,
    read: ({ offsetBytes, lengthBytes }) =>
      Promise.resolve({
        ok: true,
        value: {
          offsetBytes,
          bytes: bytes.slice(offsetBytes, offsetBytes + lengthBytes),
          endOfSource: offsetBytes + lengthBytes >= bytes.byteLength,
        },
      }),
  };
}

export async function readAllBytes(
  source: ChunkReaderPort<BrowserWorkspaceError>,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(source.sizeBytes);
  let offsetBytes = 0;
  while (offsetBytes < bytes.byteLength) {
    const chunk = await source.read({
      offsetBytes,
      lengthBytes: Math.min(64 * 1024, bytes.byteLength - offsetBytes),
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offsetBytes ||
      chunk.value.bytes.byteLength === 0
    ) {
      throw new Error("Workspace file could not be read completely.");
    }
    bytes.set(chunk.value.bytes, offsetBytes);
    offsetBytes += chunk.value.bytes.byteLength;
  }
  return bytes;
}
