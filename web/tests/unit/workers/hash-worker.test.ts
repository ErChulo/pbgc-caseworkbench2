import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hashChunkReader } from "../../../src/workers/hash.worker";
import {
  deterministicBytes,
  readerFromBytes,
} from "../../fixtures/generators/artifacts";

describe("T042 incremental SHA-256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  ])("matches published vector %j", async (text, expected) => {
    const result = await hashChunkReader(
      readerFromBytes(new TextEncoder().encode(text)),
      { chunkSizeBytes: 1 },
    );
    expect(result).toEqual({
      ok: true,
      value: { sha256: expected, sizeBytes: text.length },
    });
  });

  it.each([1, 2, 3, 64, 1024, 4096])(
    "is independent of chunk boundary %i",
    async (chunkSizeBytes) => {
      const bytes = deterministicBytes(12_345);
      const result = await hashChunkReader(readerFromBytes(bytes), {
        chunkSizeBytes,
      });
      expect(result.ok && result.value.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    },
  );

  it("matches an independent Node crypto digest for synthetic large-stream bytes", async () => {
    const bytes = deterministicBytes(2 * 1024 * 1024 + 11);
    const result = await hashChunkReader(readerFromBytes(bytes), {
      chunkSizeBytes: 65_537,
    });
    // Use Node's `createHash` as the independent digest source. The chunk-
    // boundary `it.each` above uses the same pattern, and this avoids the
    // SubtleCrypto polyfill `BufferSource` validation in jsdom plus the
    // stricter `BufferSource` typing in newer `@types/web` that rejected
    // every Uint8Array / ArrayBuffer coercion we tried.
    const independent = createHash("sha256").update(bytes).digest("hex");
    expect(result.ok && result.value.sha256).toBe(independent);
  });

  it("reports progress and cancellation without returning a partial hash", async () => {
    const controller = new AbortController();
    const progress: number[] = [];
    const result = await hashChunkReader(
      readerFromBytes(deterministicBytes(100)),
      {
        chunkSizeBytes: 10,
        signal: controller.signal,
        onProgress: ({ processedBytes }) => {
          progress.push(processedBytes);
          if (processedBytes === 30) controller.abort();
        },
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "HASH_CANCELLED" },
    });
    expect(progress).toEqual([10, 20, 30]);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid source size %s rather than hashing empty data",
    async (sizeBytes) => {
      const result = await hashChunkReader({
        sizeBytes,
        read: () => {
          throw new Error("Unexpected read");
        },
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "HASH_READ_FAILED" },
      });
    },
  );

  it.each([true, false])(
    "rejects contradictory end-of-source flags (%s)",
    async (early) => {
      const bytes = new Uint8Array([1, 2]);
      const reader = readerFromBytes(bytes);
      const result = await hashChunkReader(
        {
          sizeBytes: bytes.length,
          read: async (request) => {
            const chunk = await reader.read(request);
            if (!chunk.ok) return chunk;
            return {
              ok: true as const,
              value: { ...chunk.value, endOfSource: early },
            };
          },
        },
        { chunkSizeBytes: 1 },
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "HASH_READ_FAILED" },
      });
    },
  );

  it("accepts short reads with accurate end-of-source signals", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const base = readerFromBytes(bytes);
    const result = await hashChunkReader(
      {
        sizeBytes: bytes.length,
        read: (request) => base.read({ ...request, lengthBytes: 1 }),
      },
      { chunkSizeBytes: 3 },
    );
    expect(result).toEqual({
      ok: true,
      value: {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: 3,
      },
    });
  });

  it("pins the declared size even if the reader changes it during a read", async () => {
    const bytes = new Uint8Array([1, 2]);
    const base = readerFromBytes(bytes);
    let size = bytes.length;
    const result = await hashChunkReader(
      {
        get sizeBytes() {
          return size;
        },
        read: async (request) => {
          size = 1;
          return base.read(request);
        },
      },
      { chunkSizeBytes: 1 },
    );
    expect(result).toEqual({
      ok: true,
      value: {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: 2,
      },
    });
  });

  it("does not return a hash when cancelled for an empty or final chunk", async () => {
    const before = new AbortController();
    before.abort();
    expect(
      await hashChunkReader(readerFromBytes(new Uint8Array()), {
        signal: before.signal,
      }),
    ).toMatchObject({ ok: false, error: { code: "HASH_CANCELLED" } });
    const during = new AbortController();
    const reader = readerFromBytes(new Uint8Array([1]));
    const result = await hashChunkReader(
      {
        sizeBytes: 1,
        read: async (request) => {
          const chunk = await reader.read(request);
          during.abort();
          return chunk;
        },
      },
      { signal: during.signal },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "HASH_CANCELLED" },
    });
    const progress = new AbortController();
    expect(
      await hashChunkReader(reader, {
        signal: progress.signal,
        onProgress: () => {
          progress.abort();
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "HASH_CANCELLED" } });
  });
});
