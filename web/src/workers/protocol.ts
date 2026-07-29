import type { DomainError } from "../domain/shared/outcomes";
import type { BrandedId, Sha256 } from "../domain/shared/types";

export const WORKER_PROTOCOL_VERSION = "1.0.0" as const;

export type WorkerProtocolVersion = typeof WORKER_PROTOCOL_VERSION;
export type WorkerJobId = BrandedId<"worker-job">;

export type WorkerOperation =
  "sha256" | "media-detect" | "extract" | "parse" | "screen" | "fingerprint";

export interface WorkerStartRequest {
  readonly kind: "start";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly operation: WorkerOperation;
  readonly totalBytes: number;
  readonly chunkSizeBytes: number;
  readonly artifactSha256: Sha256 | null;
  readonly operationParameters: Readonly<Record<string, unknown>>;
}

export interface WorkerChunkRequest {
  readonly kind: "chunk";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly sequence: number;
  readonly offsetBytes: number;
  readonly bytes: ArrayBuffer;
  readonly endOfSource: boolean;
}

export type WorkerCancellationReason =
  "user-request" | "superseded" | "shutdown";

export interface WorkerCancelRequest {
  readonly kind: "cancel";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly reason: WorkerCancellationReason;
}

export type MainToWorkerMessage =
  WorkerStartRequest | WorkerChunkRequest | WorkerCancelRequest;

export interface WorkerAcceptedResponse {
  readonly kind: "accepted";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly operation: WorkerOperation;
}

export type WorkerProgressStage =
  | "initializing"
  | "reading"
  | "hashing"
  | "extracting"
  | "parsing"
  | "screening"
  | "finalizing";

export interface WorkerProgressResponse {
  readonly kind: "progress";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly stage: WorkerProgressStage;
  readonly processedBytes: number;
  readonly totalBytes: number;
  readonly lastCompletedSequence: number | null;
}

export interface WorkerChunkConsumedResponse {
  readonly kind: "chunk-consumed";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly sequence: number;
  readonly processedBytes: number;
}

export interface WorkerResultResponse<Output = unknown> {
  readonly kind: "result";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly operation: WorkerOperation;
  readonly artifactSha256: Sha256 | null;
  readonly processedBytes: number;
  readonly output: Output;
}

export interface WorkerErrorResponse {
  readonly kind: "error";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly error: DomainError;
  readonly processedBytes: number;
  readonly lastCompletedSequence: number | null;
}

export interface WorkerCancelledResponse {
  readonly kind: "cancelled";
  readonly protocolVersion: WorkerProtocolVersion;
  readonly jobId: WorkerJobId;
  readonly reason: WorkerCancellationReason;
  readonly processedBytes: number;
  readonly lastCompletedSequence: number | null;
}

export type WorkerToMainMessage<Output = unknown> =
  | WorkerAcceptedResponse
  | WorkerProgressResponse
  | WorkerChunkConsumedResponse
  | WorkerResultResponse<Output>
  | WorkerErrorResponse
  | WorkerCancelledResponse;

export function transferablesForWorkerMessage(
  message: MainToWorkerMessage,
): readonly Transferable[] {
  return message.kind === "chunk" ? [message.bytes] : [];
}
