import { describe, expect, it } from "vitest";

import { parseBrandedId, parseSha256 } from "../../../src/domain/shared/types";
import {
  transferablesForWorkerMessage,
  WORKER_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerChunkRequest,
  type WorkerErrorResponse,
  type WorkerResultResponse,
  type WorkerToMainMessage,
} from "../../../src/workers/protocol";

const jobId = parseBrandedId<"worker-job">("synthetic-worker-job");
const sha256 = parseSha256("a".repeat(64));
if (!jobId.ok || !sha256.ok) {
  throw new Error("Synthetic protocol identifiers must be valid.");
}

describe("T025 typed worker protocol", () => {
  it("defines a versioned, typed start request", () => {
    const request: MainToWorkerMessage = {
      kind: "start",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: jobId.value,
      operation: "sha256",
      totalBytes: 3,
      chunkSizeBytes: 2,
      artifactSha256: null,
      operationParameters: {},
    };

    expect(request).toMatchObject({
      kind: "start",
      protocolVersion: "1.0.0",
      operation: "sha256",
    });
    expect(transferablesForWorkerMessage(request)).toEqual([]);
  });

  it("exposes only chunk buffers as transferable ownership", () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const request: WorkerChunkRequest = {
      kind: "chunk",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: jobId.value,
      sequence: 0,
      offsetBytes: 0,
      bytes,
      endOfSource: true,
    };

    expect(transferablesForWorkerMessage(request)).toEqual([bytes]);
  });

  it("represents progress with byte and sequence checkpoints", () => {
    const progress: WorkerToMainMessage = {
      kind: "progress",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: jobId.value,
      stage: "hashing",
      processedBytes: 2,
      totalBytes: 3,
      lastCompletedSequence: 0,
    };

    expect(progress).toMatchObject({
      kind: "progress",
      processedBytes: 2,
      lastCompletedSequence: 0,
    });
  });

  it("keeps typed results artifact-bound without operational timestamps", () => {
    const result: WorkerResultResponse<{ readonly digest: string }> = {
      kind: "result",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: jobId.value,
      operation: "sha256",
      artifactSha256: sha256.value,
      processedBytes: 3,
      output: { digest: sha256.value },
    };

    expect(result.artifactSha256).toBe(sha256.value);
    expect(result).not.toHaveProperty("timestamp");
  });

  it("uses non-sensitive structured errors and explicit cancellation", () => {
    const error: WorkerErrorResponse = {
      kind: "error",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: jobId.value,
      error: {
        code: "SYNTHETIC_WORKER_FAILURE",
        category: "worker",
        severity: "error",
        safeMessage: "Synthetic worker operation failed.",
        blocksDownstream: true,
        subjectKey: "artifact:synthetic",
        affectedArtifactSha256: sha256.value,
        retryable: true,
      },
      processedBytes: 2,
      lastCompletedSequence: 0,
    };
    const cancel: MainToWorkerMessage = {
      kind: "cancel",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: jobId.value,
      reason: "user-request",
    };

    expect(error.error).not.toHaveProperty("cause");
    expect(cancel).toEqual({
      kind: "cancel",
      protocolVersion: "1.0.0",
      jobId: "synthetic-worker-job",
      reason: "user-request",
    });
  });
});
