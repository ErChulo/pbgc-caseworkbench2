import type {
  AsyncResult,
  Result,
  Sha256,
  UtcTimestamp,
  Uuid,
} from "./shared/types";

export interface ClockPort {
  now(): UtcTimestamp;
}

export interface UuidPort {
  generate(): Uuid;
}

export interface ChunkReadRequest {
  readonly offsetBytes: number;
  readonly lengthBytes: number;
}

export interface BinaryChunk {
  readonly offsetBytes: number;
  readonly bytes: Uint8Array;
  readonly endOfSource: boolean;
}

export interface ChunkReaderPort<ErrorValue> {
  readonly sizeBytes: number;
  read(request: ChunkReadRequest): AsyncResult<BinaryChunk, ErrorValue>;
}

export type WorkspaceEntryKind = "file" | "directory";

export interface WorkspaceEntry {
  readonly relativePath: string;
  readonly kind: WorkspaceEntryKind;
  readonly sizeBytes: number | null;
}

export interface WorkspaceWriteReceipt {
  readonly relativePath: string;
  readonly sizeBytes: number;
}

export interface WorkspacePort<ErrorValue> {
  list(
    relativeDirectory: string,
  ): AsyncResult<readonly WorkspaceEntry[], ErrorValue>;
  stat(relativePath: string): AsyncResult<WorkspaceEntry, ErrorValue>;
  openChunkReader(
    relativePath: string,
  ): AsyncResult<ChunkReaderPort<ErrorValue>, ErrorValue>;
  createDirectory(
    relativePath: string,
  ): AsyncResult<WorkspaceEntry, ErrorValue>;
  createImmutable(
    relativePath: string,
    source: ChunkReaderPort<ErrorValue>,
  ): AsyncResult<WorkspaceWriteReceipt, ErrorValue>;
  writeAtomic(
    relativePath: string,
    bytes: Uint8Array,
  ): AsyncResult<WorkspaceWriteReceipt, ErrorValue>;
  append(
    relativePath: string,
    bytes: Uint8Array,
  ): AsyncResult<WorkspaceWriteReceipt, ErrorValue>;
}

export interface HashProgress {
  readonly processedBytes: number;
  readonly totalBytes: number;
}

export interface HashingOptions {
  readonly chunkSizeBytes: number;
  readonly onProgress?: (progress: HashProgress) => void;
}

export interface HashResult {
  readonly sha256: Sha256;
  readonly sizeBytes: number;
}

export interface HashingWorkerPort<ErrorValue> {
  sha256(
    source: ChunkReaderPort<ErrorValue>,
    options: HashingOptions,
  ): AsyncResult<HashResult, ErrorValue>;
}

export interface ArtifactInspectionRequest<ErrorValue> {
  readonly artifactSha256: Sha256;
  readonly mediaType: string;
  readonly fileName: string;
  readonly source: ChunkReaderPort<ErrorValue>;
}

export interface ParserIdentity {
  readonly parserId: string;
  readonly parserVersion: string;
}

export interface ParserResult<Output> {
  readonly parser: ParserIdentity;
  readonly artifactSha256: Sha256;
  readonly output: Output;
  readonly limitations: readonly string[];
}

export interface ParserPort<Output, ErrorValue> extends ParserIdentity {
  readonly supportedMediaTypes: readonly string[];
  inspect(
    request: ArtifactInspectionRequest<ErrorValue>,
  ): AsyncResult<ParserResult<Output>, ErrorValue>;
}

export interface ScreeningIdentity {
  readonly screenerId: string;
  readonly screenerVersion: string;
  readonly ruleSetVersion: string;
}

export interface ScreeningResult<Finding> {
  readonly artifactSha256: Sha256;
  readonly findings: readonly Finding[];
  readonly blocksDownstream: boolean;
}

export interface ScreeningPort<Finding, ErrorValue> extends ScreeningIdentity {
  screen(
    request: ArtifactInspectionRequest<ErrorValue>,
  ): AsyncResult<ScreeningResult<Finding>, ErrorValue>;
}

export interface LocalExportRequest {
  readonly suggestedFileName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly deterministicPayloadSha256: Sha256;
}

export interface LocalExportReceipt {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly deterministicPayloadSha256: Sha256;
}

export interface LocalExportPort<ErrorValue> {
  save(
    request: LocalExportRequest,
  ): AsyncResult<LocalExportReceipt, ErrorValue>;
}

export type PortResult<Value, ErrorValue> = Result<Value, ErrorValue>;
