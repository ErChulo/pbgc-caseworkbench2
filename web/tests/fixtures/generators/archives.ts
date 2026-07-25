import { gzipSync, zipSync } from "fflate";

const encode = (value: string) => new TextEncoder().encode(value);

export function archiveFixtures() {
  const nested = zipSync({
    "docs/readme.txt": encode("synthetic member"),
    "nested/inner.zip": zipSync({
      "inner.txt": encode("nested synthetic member"),
    }),
  });
  const unsupportedCompression = nested.slice();
  for (let index = 0; index < unsupportedCompression.length - 12; index += 1) {
    const local =
      unsupportedCompression[index] === 0x50 &&
      unsupportedCompression[index + 1] === 0x4b &&
      unsupportedCompression[index + 2] === 0x03 &&
      unsupportedCompression[index + 3] === 0x04;
    const central =
      unsupportedCompression[index] === 0x50 &&
      unsupportedCompression[index + 1] === 0x4b &&
      unsupportedCompression[index + 2] === 0x01 &&
      unsupportedCompression[index + 3] === 0x02;
    if (local) {
      unsupportedCompression[index + 8] = 99;
      unsupportedCompression[index + 9] = 0;
    }
    if (central) {
      unsupportedCompression[index + 10] = 99;
      unsupportedCompression[index + 11] = 0;
    }
  }
  return {
    nested,
    gzip: gzipSync(encode("synthetic gzip member")),
    traversal: zipSync({ "../escape.txt": encode("blocked") }),
    absolute: zipSync({ "/absolute.txt": encode("blocked") }),
    duplicateNormalized: zipSync({
      "café.txt": encode("one"),
      "cafe\u0301.txt": encode("two"),
    }),
    excessiveCount: zipSync({
      "1.txt": encode("1"),
      "2.txt": encode("2"),
      "3.txt": encode("3"),
    }),
    excessiveRatio: zipSync(
      { "large.txt": new Uint8Array(100_000) },
      { level: 9 },
    ),
    corrupt: nested.slice(0, Math.floor(nested.length / 2)),
    unsupported: unsupportedCompression,
  } as const;
}
