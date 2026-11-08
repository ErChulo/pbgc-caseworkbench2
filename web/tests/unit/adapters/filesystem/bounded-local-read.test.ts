import { expect, it, vi } from "vitest";
import { readBoundedLocalBytes } from "../../../../src/adapters/filesystem/bounded-local-read";
import { bytesReader } from "../../../../src/app/utilities/file-readers";

it("copies only bounded complete local chunks", async () => {
  const input = new Uint8Array(70_000).fill(7);
  expect(await readBoundedLocalBytes(bytesReader(input), 70_000)).toEqual(
    input,
  );
  const read = vi.fn();
  await expect(
    readBoundedLocalBytes({ sizeBytes: 70_001, read }, 70_000),
  ).rejects.toThrow(/size/);
  expect(read).not.toHaveBeenCalled();
  await expect(
    readBoundedLocalBytes(
      {
        sizeBytes: 1,
        read: () =>
          Promise.resolve({
            ok: true,
            value: {
              offsetBytes: 0,
              bytes: new Uint8Array(1),
              endOfSource: false,
            },
          }),
      },
      10,
    ),
  ).rejects.toThrow(/completely/);
});
