import { describe, expect, it } from "vitest";
import { bytesReader } from "../../../../src/app/utilities/file-readers";
import { readVerifiedChunkSnapshot } from "../../../../src/adapters/filesystem/verified-chunk-snapshot";
import { sha256Bytes } from "../../../../src/domain/shared/digest";

describe("verified preserved byte snapshot", () => {
  it("copies and verifies the exact bytes that are returned", async () => {
    const original = new TextEncoder().encode("synthetic content");
    const hash = await sha256Bytes(original);
    const result = await readVerifiedChunkSnapshot(
      bytesReader(original),
      hash,
      original.length,
      100,
    );
    original[0] = 0;
    expect(new TextDecoder().decode(result)).toBe("synthetic content");
  });
  it("rejects changed bytes, invalid size and malformed reads", async () => {
    const original = new TextEncoder().encode("synthetic content");
    const hash = await sha256Bytes(original);
    const changed = original.slice();
    changed[0] = 0;
    await expect(
      readVerifiedChunkSnapshot(
        bytesReader(changed),
        hash,
        original.length,
        100,
      ),
    ).rejects.toThrow(/hash/);
    await expect(
      readVerifiedChunkSnapshot(
        bytesReader(original),
        hash,
        original.length,
        1,
      ),
    ).rejects.toThrow(/size/);
    await expect(
      readVerifiedChunkSnapshot(
        {
          sizeBytes: original.length,
          read: () =>
            Promise.resolve({
              ok: true,
              value: { offsetBytes: 0, bytes: original, endOfSource: false },
            }),
        },
        hash,
        original.length,
        100,
      ),
    ).rejects.toThrow(/completely/);
  });
});
