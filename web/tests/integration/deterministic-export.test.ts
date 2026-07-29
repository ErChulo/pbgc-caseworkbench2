import { describe, expect, it } from "vitest";

import { writeLocalJson } from "../../src/adapters/exports/workspace-export";
import { deterministicSha256 } from "../../src/domain/normalization/normalizer";
import type {
  ChunkReaderPort,
  WorkspaceEntry,
  WorkspacePort,
  WorkspaceWriteReceipt,
} from "../../src/domain/ports";
import type { Result } from "../../src/domain/shared/types";

describe("T105 deterministic export", () => {
  it("writes byte-identical deterministic content while operational metadata differs", async () => {
    const workspace = new MemoryWorkspace();
    const first = {
      deterministicPayload: { value: "synthetic" },
      runId: "one",
    };
    const second = {
      deterministicPayload: { value: "synthetic" },
      runId: "two",
    };
    const hash = await deterministicSha256(first);
    expect(hash).toBe(await deterministicSha256(second));
    expect((await writeLocalJson(workspace, "one.json", first, hash)).ok).toBe(
      true,
    );
    expect((await writeLocalJson(workspace, "two.json", second, hash)).ok).toBe(
      true,
    );
    expect(workspace.text("one.json")).not.toBe(workspace.text("two.json"));
  });
});

class MemoryWorkspace implements WorkspacePort<string> {
  private readonly files = new Map<string, Uint8Array>();
  text(path: string) {
    return new TextDecoder().decode(this.files.get(path));
  }
  list() {
    return Promise.resolve({ ok: true, value: [] } as const);
  }
  stat(path: string): Promise<Result<WorkspaceEntry, string>> {
    const bytes = this.files.get(path);
    return Promise.resolve(
      bytes
        ? {
            ok: true,
            value: {
              relativePath: path,
              kind: "file" as const,
              sizeBytes: bytes.length,
            },
          }
        : { ok: false, error: "missing" },
    );
  }
  openChunkReader(
    path: string,
  ): Promise<Result<ChunkReaderPort<string>, string>> {
    const bytes = this.files.get(path);
    return Promise.resolve(
      bytes
        ? {
            ok: true,
            value: {
              sizeBytes: bytes.length,
              read: () =>
                Promise.resolve({
                  ok: true,
                  value: { offsetBytes: 0, bytes, endOfSource: true },
                }),
            },
          }
        : { ok: false, error: "missing" },
    );
  }
  createDirectory(path: string) {
    return Promise.resolve({
      ok: true,
      value: {
        relativePath: path,
        kind: "directory" as const,
        sizeBytes: null,
      },
    } as const);
  }
  createImmutable(
    path: string,
    source: ChunkReaderPort<string>,
  ): Promise<Result<WorkspaceWriteReceipt, string>> {
    return this.copy(path, source);
  }
  writeAtomic(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes);
    return Promise.resolve({
      ok: true,
      value: { relativePath: path, sizeBytes: bytes.length },
    } as const);
  }
  append(path: string, bytes: Uint8Array) {
    return this.writeAtomic(path, bytes);
  }
  private async copy(
    path: string,
    source: ChunkReaderPort<string>,
  ): Promise<Result<WorkspaceWriteReceipt, string>> {
    const read = await source.read({
      offsetBytes: 0,
      lengthBytes: source.sizeBytes,
    });
    return read.ok
      ? this.writeAtomic(path, read.value.bytes)
      : { ok: false, error: read.error };
  }
}
