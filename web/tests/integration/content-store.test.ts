/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";

import { preserveContent } from "../../src/adapters/filesystem/content-store";
import type { ChunkReaderPort, WorkspacePort } from "../../src/domain/ports";
import { parseSha256, parseUtcTimestamp } from "../../src/domain/shared/types";
import { hashChunkReader } from "../../src/workers/hash.worker";
import { readerFromBytes } from "../fixtures/generators/artifacts";

class MemoryWorkspace implements WorkspacePort<{ readonly code: string }> {
  readonly files = new Map<string, Uint8Array>();
  readonly immutableWrites: string[] = [];
  async list() {
    return { ok: true as const, value: [] };
  }
  async stat(path: string) {
    const bytes = this.files.get(path);
    return bytes
      ? {
          ok: true as const,
          value: {
            relativePath: path,
            kind: "file" as const,
            sizeBytes: bytes.length,
          },
        }
      : { ok: false as const, error: { code: "NOT_FOUND" } };
  }
  async openChunkReader(path: string) {
    const bytes = this.files.get(path);
    return bytes
      ? { ok: true as const, value: readerFromBytes(bytes) }
      : { ok: false as const, error: { code: "NOT_FOUND" } };
  }
  async createDirectory(path: string) {
    return {
      ok: true as const,
      value: {
        relativePath: path,
        kind: "directory" as const,
        sizeBytes: null,
      },
    };
  }
  async createImmutable(
    path: string,
    source: ChunkReaderPort<{ readonly code: string }>,
  ) {
    if (this.files.has(path))
      return { ok: false as const, error: { code: "ALREADY_EXISTS" } };
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < source.sizeBytes;) {
      const chunk = await source.read({
        offsetBytes: offset,
        lengthBytes: 1024,
      });
      if (!chunk.ok) return chunk;
      chunks.push(chunk.value.bytes);
      offset += chunk.value.bytes.length;
    }
    const bytes = new Uint8Array(source.sizeBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    this.files.set(path, bytes);
    this.immutableWrites.push(path);
    return {
      ok: true as const,
      value: { relativePath: path, sizeBytes: bytes.length },
    };
  }
  async writeAtomic() {
    return { ok: false as const, error: { code: "UNSUPPORTED" } };
  }
  async append() {
    return { ok: false as const, error: { code: "UNSUPPORTED" } };
  }
}

const timestamp = parseUtcTimestamp("2026-07-25T17:00:00.000Z");
if (!timestamp.ok) throw new Error("fixture");

describe("T043 immutable content store", () => {
  it("creates one content-addressed object, verifies it, and reuses exact bytes", async () => {
    const workspace = new MemoryWorkspace();
    const bytes = new TextEncoder().encode("synthetic preserved evidence");
    const hashed = await hashChunkReader(readerFromBytes(bytes));
    if (!hashed.ok) throw new Error("fixture");
    const one = await preserveContent(
      workspace,
      readerFromBytes(bytes),
      hashed.value.sha256,
      { now: () => timestamp.value },
    );
    const two = await preserveContent(
      workspace,
      readerFromBytes(bytes),
      hashed.value.sha256,
      { now: () => timestamp.value },
    );
    expect(one).toMatchObject({
      ok: true,
      value: {
        preservationStatus: "verified",
        postWriteSha256: hashed.value.sha256,
      },
    });
    expect(two).toMatchObject({ ok: true });
    expect(workspace.immutableWrites).toHaveLength(1);
  });

  it("never overwrites changed stored bytes and signals quarantine", async () => {
    const workspace = new MemoryWorkspace();
    const bytes = new TextEncoder().encode("synthetic original");
    const hashed = await hashChunkReader(readerFromBytes(bytes));
    if (!hashed.ok) throw new Error("fixture");
    const path = `objects/sha256/${hashed.value.sha256.slice(0, 2)}/${hashed.value.sha256}`;
    workspace.files.set(path, new TextEncoder().encode("changed"));
    const result = await preserveContent(
      workspace,
      readerFromBytes(bytes),
      hashed.value.sha256,
      { now: () => timestamp.value },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "STORED_HASH_MISMATCH", quarantineRequired: true },
    });
    expect(new TextDecoder().decode(workspace.files.get(path))).toBe("changed");
  });

  it("rejects a stale expected source hash", async () => {
    const parsed = parseSha256("a".repeat(64));
    if (!parsed.ok) throw new Error("fixture");
    expect(
      await preserveContent(
        new MemoryWorkspace(),
        readerFromBytes(new Uint8Array([1])),
        parsed.value,
        { now: () => timestamp.value },
      ),
    ).toMatchObject({ ok: false, error: { code: "SOURCE_HASH_MISMATCH" } });
  });
});
