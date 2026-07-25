import {
  Gunzip,
  Unzip,
  UnzipInflate,
  UnzipPassThrough,
  gunzipSync,
  unzipSync,
} from "fflate";

import type { ChunkReaderPort } from "../../domain/ports";
import { assertUniqueArchivePaths } from "./archive-path";

export interface ArchiveLimits {
  readonly maxDepth: number;
  readonly maxMembers: number;
  readonly maxExpandedBytes: number;
  readonly maxCompressionRatio: number;
}

export interface ExtractedArchiveMember {
  readonly observedMemberPath: string;
  readonly normalizedDisplayPath: string;
  readonly sequence: number;
  readonly bytes: Uint8Array;
  readonly expandedSize: number;
}

export interface ArchiveExtraction {
  readonly outcome:
    "success" | "partial" | "corrupt" | "blocked-limit" | "unsupported";
  readonly members: readonly ExtractedArchiveMember[];
  readonly failures: readonly {
    readonly memberPath: string;
    readonly reason: string;
  }[];
}

export function extractArchive(
  bytes: Uint8Array,
  format: "zip" | "gzip",
  limits: ArchiveLimits,
  depth = 0,
): ArchiveExtraction {
  if (depth > limits.maxDepth)
    return blocked("Archive nesting limit exceeded.");
  try {
    const entries =
      format === "gzip" ? { member: gunzipSync(bytes) } : unzipSync(bytes);
    const names = Object.keys(entries);
    if (names.length > limits.maxMembers)
      return blocked("Archive member-count limit exceeded.");
    const paths = assertUniqueArchivePaths(names);
    let expanded = 0;
    const members: ExtractedArchiveMember[] = [];
    for (const [index, path] of paths.entries()) {
      const memberBytes = entries[path.observedPath];
      if (memberBytes === undefined) {
        return {
          outcome: "partial",
          members: Object.freeze(members),
          failures: Object.freeze([
            {
              memberPath: path.observedPath,
              reason: "Observed archive member could not be read.",
            },
          ]),
        };
      }
      expanded += memberBytes.byteLength;
      if (
        expanded > limits.maxExpandedBytes ||
        (bytes.byteLength > 0 &&
          expanded / bytes.byteLength > limits.maxCompressionRatio)
      ) {
        return {
          outcome: "partial",
          members: Object.freeze(members),
          failures: Object.freeze([
            {
              memberPath: path.observedPath,
              reason: "Archive expansion limit exceeded.",
            },
          ]),
        };
      }
      members.push(
        Object.freeze({
          observedMemberPath: path.observedPath,
          normalizedDisplayPath: path.normalizedDisplayPath,
          sequence: index + 1,
          bytes: memberBytes,
          expandedSize: memberBytes.byteLength,
        }),
      );
    }
    return {
      outcome: "success",
      members: Object.freeze(members),
      failures: Object.freeze([]),
    };
  } catch (error) {
    return {
      outcome:
        error instanceof Error && /unsafe|collide/iu.test(error.message)
          ? "blocked-limit"
          : "corrupt",
      members: Object.freeze([]),
      failures: Object.freeze([
        { memberPath: "", reason: "Archive extraction failed safely." },
      ]),
    };
  }
}

export async function extractArchiveStream<ReadError>(
  source: ChunkReaderPort<ReadError>,
  format: "zip" | "gzip",
  limits: ArchiveLimits,
  depth = 0,
  chunkSizeBytes = 64 * 1024,
): Promise<ArchiveExtraction> {
  if (depth > limits.maxDepth)
    return blocked("Archive nesting limit exceeded.");
  if (format === "gzip") {
    return extractGzipStream(source, limits, chunkSizeBytes);
  }
  const members: ExtractedArchiveMember[] = [];
  const failures: { memberPath: string; reason: string }[] = [];
  const seen = new Set<string>();
  let activeMembers = 0;
  let inputFinished = false;
  let expandedTotal = 0;
  let settled = false;
  return new Promise<ArchiveExtraction>((resolve) => {
    const finish = (outcome: ArchiveExtraction["outcome"]) => {
      if (settled) return;
      settled = true;
      resolve({
        outcome,
        members: Object.freeze(
          [...members].sort((left, right) => left.sequence - right.sequence),
        ),
        failures: Object.freeze([...failures]),
      });
    };
    const maybeFinish = () => {
      if (inputFinished && activeMembers === 0) {
        finish(
          failures.length === 0
            ? "success"
            : members.length > 0
              ? "partial"
              : "blocked-limit",
        );
      }
    };
    const unzip = new Unzip((file) => {
      if (settled) return;
      if (members.length + activeMembers >= limits.maxMembers) {
        failures.push({
          memberPath: file.name,
          reason: "Archive member-count limit exceeded.",
        });
        finish(members.length > 0 ? "partial" : "blocked-limit");
        return;
      }
      let safePath: ReturnType<typeof assertUniqueArchivePaths>[number];
      try {
        const pathResults = assertUniqueArchivePaths([file.name]);
        const firstPath = pathResults[0];
        if (
          firstPath === undefined ||
          seen.has(firstPath.normalizedDisplayPath)
        ) {
          throw new Error("Archive member paths collide.");
        }
        safePath = firstPath;
        seen.add(safePath.normalizedDisplayPath);
      } catch {
        failures.push({
          memberPath: file.name,
          reason: "Archive member path is unsafe or colliding.",
        });
        finish(members.length > 0 ? "partial" : "blocked-limit");
        return;
      }
      if (file.compression !== 0 && file.compression !== 8) {
        failures.push({
          memberPath: file.name,
          reason: "Archive compression method is unsupported.",
        });
        finish(members.length > 0 ? "partial" : "unsupported");
        return;
      }
      if (
        file.size !== undefined &&
        file.originalSize !== undefined &&
        file.size > 0 &&
        file.originalSize / file.size > limits.maxCompressionRatio
      ) {
        failures.push({
          memberPath: file.name,
          reason: "Archive compression-ratio limit exceeded.",
        });
        finish(members.length > 0 ? "partial" : "blocked-limit");
        return;
      }
      const sequence = members.length + activeMembers + 1;
      const chunks: Uint8Array[] = [];
      let memberSize = 0;
      activeMembers += 1;
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error) {
          activeMembers -= 1;
          failures.push({
            memberPath: file.name,
            reason: "Archive member decompression failed.",
          });
          maybeFinish();
          return;
        }
        memberSize += chunk.byteLength;
        expandedTotal += chunk.byteLength;
        if (
          expandedTotal > limits.maxExpandedBytes ||
          (source.sizeBytes > 0 &&
            expandedTotal / source.sizeBytes > limits.maxCompressionRatio)
        ) {
          failures.push({
            memberPath: file.name,
            reason: "Archive expansion limit exceeded.",
          });
          finish(members.length > 0 ? "partial" : "blocked-limit");
          file.terminate();
          return;
        }
        chunks.push(chunk);
        if (final) {
          activeMembers -= 1;
          const bytes = concatenate(chunks, memberSize);
          members.push(
            Object.freeze({
              observedMemberPath: file.name,
              normalizedDisplayPath: safePath.normalizedDisplayPath,
              sequence,
              bytes,
              expandedSize: memberSize,
            }),
          );
          maybeFinish();
        }
      };
      file.start();
    });
    unzip.register(UnzipPassThrough);
    unzip.register(UnzipInflate);
    void feedChunks(source, chunkSizeBytes, (chunk, final) => {
      unzip.push(chunk, final);
    })
      .then((ok) => {
        inputFinished = true;
        if (!ok) {
          failures.push({
            memberPath: "",
            reason: "Archive source could not be read.",
          });
          finish(members.length > 0 ? "partial" : "corrupt");
        } else {
          maybeFinish();
        }
      })
      .catch(() => {
        finish(members.length > 0 ? "partial" : "corrupt");
      });
  });
}

async function extractGzipStream<ReadError>(
  source: ChunkReaderPort<ReadError>,
  limits: ArchiveLimits,
  chunkSizeBytes: number,
): Promise<ArchiveExtraction> {
  const chunks: Uint8Array[] = [];
  let expanded = 0;
  const state = { failed: false };
  const gunzip = new Gunzip((chunk) => {
    expanded += chunk.byteLength;
    if (
      expanded > limits.maxExpandedBytes ||
      (source.sizeBytes > 0 &&
        expanded / source.sizeBytes > limits.maxCompressionRatio)
    ) {
      state.failed = true;
      return;
    }
    chunks.push(chunk);
  });
  try {
    const read = await feedChunks(source, chunkSizeBytes, (chunk, final) => {
      gunzip.push(chunk, final);
    });
    if (!read || state.failed)
      return blocked("GZIP expansion limit or source read failed.");
    return {
      outcome: "success",
      members: Object.freeze([
        Object.freeze({
          observedMemberPath: "member",
          normalizedDisplayPath: "member",
          sequence: 1,
          bytes: concatenate(chunks, expanded),
          expandedSize: expanded,
        }),
      ]),
      failures: Object.freeze([]),
    };
  } catch {
    return {
      outcome: "corrupt",
      members: Object.freeze([]),
      failures: Object.freeze([
        { memberPath: "", reason: "GZIP extraction failed safely." },
      ]),
    };
  }
}

async function feedChunks<ReadError>(
  source: ChunkReaderPort<ReadError>,
  chunkSizeBytes: number,
  consume: (chunk: Uint8Array, final: boolean) => void,
): Promise<boolean> {
  if (source.sizeBytes === 0) return false;
  for (let offsetBytes = 0; offsetBytes < source.sizeBytes;) {
    const chunk = await source.read({
      offsetBytes,
      lengthBytes: Math.min(chunkSizeBytes, source.sizeBytes - offsetBytes),
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offsetBytes ||
      chunk.value.bytes.byteLength === 0
    )
      return false;
    offsetBytes += chunk.value.bytes.byteLength;
    consume(chunk.value.bytes, offsetBytes >= source.sizeBytes);
  }
  return true;
}

function concatenate(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function blocked(reason: string): ArchiveExtraction {
  return {
    outcome: "blocked-limit",
    members: Object.freeze([]),
    failures: Object.freeze([{ memberPath: "", reason }]),
  };
}
