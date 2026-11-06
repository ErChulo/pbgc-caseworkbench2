import { describe, expect, it } from "vitest";
import { BrowserDirectoryWorkspace } from "../../../../src/adapters/filesystem/case-workspace";

function workspaceWith(
  entries: readonly { name: string; kind: string }[],
  missing = false,
) {
  const directory = {
    async *values() {
      for (const entry of entries) yield await Promise.resolve(entry);
    },
    getDirectoryHandle: () =>
      missing
        ? Promise.reject(new DOMException("Missing", "NotFoundError"))
        : Promise.resolve(directory),
  } as unknown as FileSystemDirectoryHandle;
  return new BrowserDirectoryWorkspace(directory);
}

describe("browser workspace directory listing", () => {
  it("returns bounded immediate-child metadata in deterministic order without reading files", async () => {
    const workspace = workspaceWith([
      { name: "z", kind: "file" },
      { name: "a", kind: "directory" },
    ]);
    expect(await workspace.list("cases/test")).toEqual({
      ok: true,
      value: [
        { relativePath: "cases/test/a", kind: "directory", sizeBytes: null },
        { relativePath: "cases/test/z", kind: "file", sizeBytes: null },
      ],
    });
  });
  it("does not return partial or unsafe listings", async () => {
    expect(
      await workspaceWith(
        Array.from({ length: 257 }, (_, i) => ({
          name: String(i),
          kind: "file",
        })),
      ).list("cases"),
    ).toEqual({ ok: false, error: { code: "TOO_MANY_ENTRIES" } });
    for (const name of ["..", "a/b", "e\u0301", "\\bad", ""])
      expect(
        (await workspaceWith([{ name, kind: "directory" }]).list("cases")).ok,
      ).toBe(false);
    expect((await workspaceWith([]).list("../other")).ok).toBe(false);
    expect(
      (await workspaceWith([{ name: "x", kind: "other" }]).list("cases")).ok,
    ).toBe(false);
  });
  it("distinguishes missing and unsupported enumeration", async () => {
    expect(await workspaceWith([], true).list("missing")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const unsupported = new BrowserDirectoryWorkspace(
      {} as FileSystemDirectoryHandle,
    );
    expect(await unsupported.list("")).toEqual({
      ok: false,
      error: { code: "UNSUPPORTED_OPERATION" },
    });
  });
});
