/* eslint-disable @typescript-eslint/require-await */
import type { ChunkReaderPort } from "../../../src/domain/ports";

export interface SyntheticArtifact {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly mediaType: string | null;
}

const encode = (value: string) => new TextEncoder().encode(value);

export function artifactFixtures(): readonly SyntheticArtifact[] {
  const duplicate = encode("synthetic duplicate bytes");
  return Object.freeze([
    { path: "same-a.txt", bytes: duplicate.slice(), mediaType: "text/plain" },
    {
      path: "nested/same-b.txt",
      bytes: duplicate.slice(),
      mediaType: "text/plain",
    },
    {
      path: "conflict/report.txt",
      bytes: encode("version one"),
      mediaType: "text/plain",
    },
    {
      path: "conflict-copy/report.txt",
      bytes: encode("version two"),
      mediaType: "text/plain",
    },
    { path: "zero.bin", bytes: new Uint8Array(), mediaType: null },
    {
      path: "Unicode/café.txt",
      bytes: encode("synthetic unicode"),
      mediaType: "text/plain",
    },
    {
      path: "large-stream.bin",
      bytes: deterministicBytes(5 * 1024 * 1024 + 17),
      mediaType: "application/octet-stream",
    },
    {
      path: "corrupt.zip",
      bytes: encode("not a zip"),
      mediaType: "application/zip",
    },
    {
      path: "unsupported.7z",
      bytes: encode("synthetic unsupported"),
      mediaType: "application/x-7z-compressed",
    },
  ]);
}

export function deterministicBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) % 256);
}

export function readerFromBytes(
  bytes: Uint8Array,
  mutateAfterRead = false,
): ChunkReaderPort<{ readonly code: string }> {
  let reads = 0;
  return {
    sizeBytes: bytes.byteLength,
    read: async ({ offsetBytes, lengthBytes }) => {
      reads += 1;
      const value = bytes.slice(offsetBytes, offsetBytes + lengthBytes);
      if (mutateAfterRead && reads > 1 && value.byteLength > 0) {
        value[0] = (value[0] ?? 0) ^ 0xff;
      }
      return {
        ok: true,
        value: {
          offsetBytes,
          bytes: value,
          endOfSource: offsetBytes + value.byteLength >= bytes.byteLength,
        },
      };
    },
  };
}
