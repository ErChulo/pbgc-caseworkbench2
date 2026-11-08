import { describe, expect, it, vi } from "vitest";
import {
  readVerifiedIntakeBytes,
  MAX_INTAKE_INSPECTION_BYTES,
} from "../../../../src/adapters/filesystem/verified-intake-bytes";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import { bytesReader } from "../../../../src/app/utilities/file-readers";

describe("bounded preserved intake bytes", () => {
  it("returns the exact verified stored bytes across chunks", async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
    const hash = await sha256Bytes(bytes);
    const openChunkReader = vi
      .fn()
      .mockResolvedValue({ ok: true, value: bytesReader(bytes) });
    const result = await readVerifiedIntakeBytes(
      { openChunkReader },
      hash,
      bytes.length,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toEqual(bytes);
    expect(openChunkReader).toHaveBeenCalledWith(
      `objects/sha256/${hash.slice(0, 2)}/${hash}`,
    );
  });

  it("rejects changed bytes, wrong size and malformed chunks", async () => {
    const bytes = new TextEncoder().encode("synthetic");
    const hash = await sha256Bytes(bytes);
    const changed = bytes.slice();
    changed[0] = 0;
    const workspace = {
      openChunkReader: vi
        .fn()
        .mockResolvedValue({ ok: true, value: bytesReader(changed) }),
    };
    expect(
      await readVerifiedIntakeBytes(workspace, hash, bytes.length),
    ).toMatchObject({
      ok: false,
      message:
        "Preserved evidence bytes changed before inspection. It was not inspected or added to the snapshot.",
    });
    expect(
      await readVerifiedIntakeBytes(workspace, hash, bytes.length + 1),
    ).toMatchObject({
      ok: false,
      message:
        "Preserved evidence could not be read at its expected size. It was not inspected or added to the snapshot.",
    });
    workspace.openChunkReader.mockResolvedValue({
      ok: true,
      value: {
        sizeBytes: bytes.length,
        read: () =>
          Promise.resolve({
            ok: true,
            value: { offsetBytes: 0, bytes, endOfSource: false },
          }),
      },
    });
    expect(
      await readVerifiedIntakeBytes(workspace, hash, bytes.length),
    ).toMatchObject({
      ok: false,
      message:
        "Preserved evidence could not be read completely. It was not inspected or added to the snapshot.",
    });
  });

  it("rejects oversized and invalid lengths without opening the workspace", async () => {
    const hash = await sha256Bytes(new Uint8Array());
    const openChunkReader = vi.fn();
    for (const size of [MAX_INTAKE_INSPECTION_BYTES + 1, -1, NaN]) {
      expect(
        (await readVerifiedIntakeBytes({ openChunkReader }, hash, size)).ok,
      ).toBe(false);
    }
    expect(openChunkReader).not.toHaveBeenCalled();
  });
});
