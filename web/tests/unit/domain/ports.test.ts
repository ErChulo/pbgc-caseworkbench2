import { describe, expect, it } from "vitest";

import type {
  ChunkReaderPort,
  ClockPort,
  HashingWorkerPort,
  LocalExportPort,
  ParserPort,
  ScreeningPort,
  UuidPort,
  WorkspacePort,
} from "../../../src/domain/ports";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../../src/domain/shared/types";

interface SyntheticError {
  readonly code: "SYNTHETIC_FAILURE";
}

const timestamp = parseUtcTimestamp("2026-07-25T12:00:00.000Z");
const uuid = parseUuid("11111111-1111-4111-8111-111111111111");
const sha256 = parseSha256("a".repeat(64));

if (!timestamp.ok || !uuid.ok || !sha256.ok) {
  throw new Error("Synthetic branded values must be valid.");
}

const bytes = new Uint8Array([1, 2, 3]);
const reader: ChunkReaderPort<SyntheticError> = {
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

describe("T023 browser-independent domain ports", () => {
  it("keeps clock and UUID generation behind explicit ports", () => {
    const clock: ClockPort = { now: () => timestamp.value };
    const identifiers: UuidPort = { generate: () => uuid.value };

    expect(clock.now()).toBe(timestamp.value);
    expect(identifiers.generate()).toBe(uuid.value);
  });

  it("supports deterministic chunked hashing without exposing a worker runtime", async () => {
    const hasher: HashingWorkerPort<SyntheticError> = {
      sha256: (source, options) => {
        options.onProgress?.({
          processedBytes: source.sizeBytes,
          totalBytes: source.sizeBytes,
        });
        return Promise.resolve({
          ok: true,
          value: { sha256: sha256.value, sizeBytes: source.sizeBytes },
        });
      },
    };
    const progress: number[] = [];

    const result = await hasher.sha256(reader, {
      chunkSizeBytes: 2,
      onProgress: ({ processedBytes }) => progress.push(processedBytes),
    });

    expect(result).toEqual({
      ok: true,
      value: { sha256: sha256.value, sizeBytes: 3 },
    });
    expect(progress).toEqual([3]);
  });

  it("separates local workspace persistence from domain behavior", async () => {
    const workspace: WorkspacePort<SyntheticError> = {
      list: () => Promise.resolve({ ok: true, value: [] }),
      stat: (relativePath) =>
        Promise.resolve({
          ok: true,
          value: { relativePath, kind: "file", sizeBytes: 3 },
        }),
      openChunkReader: () => Promise.resolve({ ok: true, value: reader }),
      createDirectory: (relativePath) =>
        Promise.resolve({
          ok: true,
          value: { relativePath, kind: "directory", sizeBytes: null },
        }),
      createImmutable: (relativePath, source) =>
        Promise.resolve({
          ok: true,
          value: { relativePath, sizeBytes: source.sizeBytes },
        }),
      writeAtomic: (relativePath, output) =>
        Promise.resolve({
          ok: true,
          value: { relativePath, sizeBytes: output.byteLength },
        }),
      append: (relativePath, output) =>
        Promise.resolve({
          ok: true,
          value: { relativePath, sizeBytes: output.byteLength },
        }),
    };

    await expect(workspace.openChunkReader("synthetic.bin")).resolves.toEqual({
      ok: true,
      value: reader,
    });
    await expect(
      workspace.createImmutable("objects/a", reader),
    ).resolves.toEqual({
      ok: true,
      value: { relativePath: "objects/a", sizeBytes: 3 },
    });
  });

  it("keeps parsing and screening passive and artifact-hash bound", async () => {
    const parser: ParserPort<{ readonly rawValue: string }, SyntheticError> = {
      parserId: "synthetic-parser",
      parserVersion: "1.0.0",
      supportedMediaTypes: ["text/plain"],
      inspect: (request) =>
        Promise.resolve({
          ok: true,
          value: {
            parser: {
              parserId: "synthetic-parser",
              parserVersion: "1.0.0",
            },
            artifactSha256: request.artifactSha256,
            output: { rawValue: "synthetic" },
            limitations: [],
          },
        }),
    };
    const screener: ScreeningPort<
      { readonly code: "SYNTHETIC_FINDING" },
      SyntheticError
    > = {
      screenerId: "synthetic-screener",
      screenerVersion: "1.0.0",
      ruleSetVersion: "1.0.0",
      screen: (request) =>
        Promise.resolve({
          ok: true,
          value: {
            artifactSha256: request.artifactSha256,
            findings: [],
            blocksDownstream: false,
          },
        }),
    };
    const request = {
      artifactSha256: sha256.value,
      mediaType: "text/plain",
      fileName: "synthetic.txt",
      source: reader,
    };

    expect((await parser.inspect(request)).ok).toBe(true);
    expect((await screener.screen(request)).ok).toBe(true);
  });

  it("allows only explicit local export persistence", async () => {
    const exporter: LocalExportPort<SyntheticError> = {
      save: (request) =>
        Promise.resolve({
          ok: true,
          value: {
            fileName: request.suggestedFileName,
            sizeBytes: request.bytes.byteLength,
            deterministicPayloadSha256: request.deterministicPayloadSha256,
          },
        }),
    };

    await expect(
      exporter.save({
        suggestedFileName: "synthetic-manifest.json",
        mediaType: "application/json",
        bytes,
        deterministicPayloadSha256: sha256.value,
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        fileName: "synthetic-manifest.json",
        sizeBytes: 3,
        deterministicPayloadSha256: sha256.value,
      },
    });
  });
});
