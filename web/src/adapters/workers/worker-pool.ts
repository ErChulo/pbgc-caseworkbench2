import {
  transferablesForWorkerMessage,
  WORKER_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerCancellationReason,
  type WorkerChunkRequest,
  type WorkerJobId,
  type WorkerProgressResponse,
  type WorkerResultResponse,
  type WorkerStartRequest,
  type WorkerToMainMessage,
} from "../../workers/protocol";

export interface WorkerEndpointMessageEvent {
  readonly data: WorkerToMainMessage;
}

export interface WorkerEndpointErrorEvent {
  readonly message?: string;
}

type WorkerEndpointMessageListener = (
  event: WorkerEndpointMessageEvent,
) => void;
type WorkerEndpointErrorListener = (event: WorkerEndpointErrorEvent) => void;

export interface WorkerEndpoint {
  postMessage(
    message: MainToWorkerMessage,
    transfer: readonly Transferable[],
  ): void;
  addEventListener(
    type: "message",
    listener: WorkerEndpointMessageListener,
  ): void;
  addEventListener(
    type: "error" | "messageerror",
    listener: WorkerEndpointErrorListener,
  ): void;
  removeEventListener(
    type: "message",
    listener: WorkerEndpointMessageListener,
  ): void;
  removeEventListener(
    type: "error" | "messageerror",
    listener: WorkerEndpointErrorListener,
  ): void;
  terminate(): void;
}

export interface WorkerPoolJob<Output> {
  readonly start: WorkerStartRequest;
  readonly chunks: () => AsyncIterable<WorkerChunkRequest>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: WorkerProgressResponse) => void;
  readonly resultType?: Output;
}

export interface WorkerPoolOptions {
  readonly maxWorkers: number;
  readonly maxQueuedJobs: number;
  readonly maxCrashRestarts?: number;
  readonly createWorker: () => WorkerEndpoint;
}

export type WorkerPoolErrorCode =
  | "WORKER_QUEUE_FULL"
  | "WORKER_JOB_DUPLICATE"
  | "WORKER_JOB_CANCELLED"
  | "WORKER_CRASH_LIMIT"
  | "WORKER_PROTOCOL_VIOLATION"
  | "WORKER_REPORTED_ERROR"
  | "WORKER_CHUNK_SOURCE_FAILED"
  | "WORKER_POOL_CLOSED";

export class WorkerPoolError extends Error {
  readonly code: WorkerPoolErrorCode;
  readonly jobId: WorkerJobId;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: WorkerPoolErrorCode,
    jobId: WorkerJobId,
    safeMessage: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(safeMessage);
    this.name = "WorkerPoolError";
    this.code = code;
    this.jobId = jobId;
    this.details = details;
  }
}

interface PendingEntry {
  readonly job: WorkerPoolJob<unknown>;
  readonly resolve: (result: WorkerResultResponse) => void;
  readonly reject: (error: WorkerPoolError) => void;
  readonly abortListener: () => void;
  crashRestarts: number;
  workerGeneration: number;
  worker: WorkerEndpoint | null;
  chunkIterator: AsyncIterator<WorkerChunkRequest> | null;
  messageListener: WorkerEndpointMessageListener | null;
  errorListener: WorkerEndpointErrorListener | null;
  settled: boolean;
  cancellationReason: WorkerCancellationReason | null;
}

function requireInteger(name: string, value: number, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(
      `${name} must be a safe integer greater than or equal to ${String(minimum)}.`,
    );
  }
  return value;
}

export class WorkerPool {
  private readonly maxWorkers: number;
  private readonly maxQueuedJobs: number;
  private readonly maxCrashRestarts: number;
  private readonly createWorker: () => WorkerEndpoint;
  private readonly queue: PendingEntry[] = [];
  private readonly active = new Map<WorkerJobId, PendingEntry>();
  private closed = false;

  constructor(options: WorkerPoolOptions) {
    this.maxWorkers = requireInteger("maxWorkers", options.maxWorkers, 1);
    this.maxQueuedJobs = requireInteger(
      "maxQueuedJobs",
      options.maxQueuedJobs,
      0,
    );
    this.maxCrashRestarts = requireInteger(
      "maxCrashRestarts",
      options.maxCrashRestarts ?? 1,
      0,
    );
    this.createWorker = options.createWorker;
  }

  submit<Output>(
    job: WorkerPoolJob<Output>,
  ): Promise<WorkerResultResponse<Output>> {
    const validationError = this.validateSubmission(job);
    if (validationError !== null) {
      return Promise.reject(validationError);
    }

    return new Promise<WorkerResultResponse<Output>>((resolve, reject) => {
      const entry = this.createEntry(
        job,
        resolve as (result: WorkerResultResponse) => void,
        reject,
      );

      if (this.active.size < this.maxWorkers) {
        this.start(entry);
        return;
      }

      if (this.queue.length >= this.maxQueuedJobs) {
        job.signal?.removeEventListener("abort", entry.abortListener);
        reject(
          this.error(
            "WORKER_QUEUE_FULL",
            job.start.jobId,
            "The local worker queue is at its configured capacity.",
          ),
        );
        return;
      }

      this.queue.push(entry);
    });
  }

  runAll<Output>(
    jobs: readonly WorkerPoolJob<Output>[],
  ): Promise<readonly WorkerResultResponse<Output>[]> {
    return Promise.all(jobs.map((job) => this.submit(job)));
  }

  cancel(
    jobId: WorkerJobId,
    reason: WorkerCancellationReason = "user-request",
  ): boolean {
    const queuedIndex = this.queue.findIndex(
      (entry) => entry.job.start.jobId === jobId,
    );
    if (queuedIndex >= 0) {
      const [entry] = this.queue.splice(queuedIndex, 1);
      if (entry !== undefined) {
        this.rejectCancelled(entry, reason, 0, null);
        return true;
      }
    }

    const active = this.active.get(jobId);
    if (active === undefined || active.settled) {
      return false;
    }
    if (active.cancellationReason !== null) {
      return true;
    }

    active.cancellationReason = reason;
    this.post(active, {
      kind: "cancel",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId,
      reason,
    });
    return true;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const entry of [...this.queue]) {
      this.cancel(entry.job.start.jobId, "shutdown");
    }
    for (const jobId of [...this.active.keys()]) {
      this.cancel(jobId, "shutdown");
    }
  }

  private validateSubmission<Output>(
    job: WorkerPoolJob<Output>,
  ): WorkerPoolError | null {
    const jobId = job.start.jobId;
    if (this.closed) {
      return this.error(
        "WORKER_POOL_CLOSED",
        jobId,
        "The local worker pool is closed.",
      );
    }
    if (job.signal?.aborted === true) {
      return this.error(
        "WORKER_JOB_CANCELLED",
        jobId,
        "The local worker job was cancelled before dispatch.",
        {
          reason: "user-request",
          processedBytes: 0,
          lastCompletedSequence: null,
        },
      );
    }
    if (
      this.active.has(jobId) ||
      this.queue.some((entry) => entry.job.start.jobId === jobId)
    ) {
      return this.error(
        "WORKER_JOB_DUPLICATE",
        jobId,
        "A local worker job with this identifier already exists.",
      );
    }
    if (
      !Number.isSafeInteger(job.start.totalBytes) ||
      job.start.totalBytes < 0 ||
      !Number.isSafeInteger(job.start.chunkSizeBytes) ||
      job.start.chunkSizeBytes <= 0
    ) {
      return this.error(
        "WORKER_PROTOCOL_VIOLATION",
        jobId,
        "The local worker start request is invalid.",
      );
    }
    return null;
  }

  private createEntry(
    job: WorkerPoolJob<unknown>,
    resolve: (result: WorkerResultResponse) => void,
    reject: (error: WorkerPoolError) => void,
  ): PendingEntry {
    const abortListener = () => {
      this.cancel(job.start.jobId, "user-request");
    };
    const entry: PendingEntry = {
      job,
      resolve,
      reject,
      abortListener,
      crashRestarts: 0,
      workerGeneration: 0,
      worker: null,
      chunkIterator: null,
      messageListener: null,
      errorListener: null,
      settled: false,
      cancellationReason: null,
    };
    job.signal?.addEventListener("abort", abortListener, { once: true });
    return entry;
  }

  private start(entry: PendingEntry): void {
    if (entry.settled) {
      return;
    }

    this.active.set(entry.job.start.jobId, entry);
    entry.chunkIterator = null;
    entry.workerGeneration += 1;
    const generation = entry.workerGeneration;

    let worker: WorkerEndpoint;
    try {
      worker = this.createWorker();
    } catch {
      this.handleCrash(entry);
      return;
    }

    entry.worker = worker;
    const messageListener: WorkerEndpointMessageListener = (event) => {
      this.handleMessage(entry, generation, event.data);
    };
    const errorListener: WorkerEndpointErrorListener = () => {
      this.handleCrash(entry);
    };
    entry.messageListener = messageListener;
    entry.errorListener = errorListener;
    worker.addEventListener("message", messageListener);
    worker.addEventListener("error", errorListener);
    worker.addEventListener("messageerror", errorListener);

    this.post(entry, entry.job.start);
  }

  private handleMessage(
    entry: PendingEntry,
    generation: number,
    message: WorkerToMainMessage,
  ): void {
    if (entry.settled || generation !== entry.workerGeneration) {
      return;
    }
    if (message.jobId !== entry.job.start.jobId) {
      this.rejectEntry(
        entry,
        this.error(
          "WORKER_PROTOCOL_VIOLATION",
          entry.job.start.jobId,
          "The local worker returned a mismatched protocol response.",
        ),
      );
      return;
    }

    switch (message.kind) {
      case "accepted":
        if (message.operation !== entry.job.start.operation) {
          this.rejectEntry(
            entry,
            this.error(
              "WORKER_PROTOCOL_VIOLATION",
              entry.job.start.jobId,
              "The local worker accepted a different operation.",
            ),
          );
          return;
        }
        entry.chunkIterator = entry.job.chunks()[Symbol.asyncIterator]();
        void this.sendNextChunk(entry, generation);
        return;
      case "chunk-consumed":
        void this.sendNextChunk(entry, generation);
        return;
      case "progress":
        entry.job.onProgress?.(message);
        return;
      case "result":
        if (message.operation !== entry.job.start.operation) {
          this.rejectEntry(
            entry,
            this.error(
              "WORKER_PROTOCOL_VIOLATION",
              entry.job.start.jobId,
              "The local worker returned a result for a different operation.",
            ),
          );
          return;
        }
        if (entry.cancellationReason !== null) {
          this.rejectCancelled(
            entry,
            entry.cancellationReason,
            message.processedBytes,
            null,
          );
          return;
        }
        this.resolveEntry(entry, message);
        return;
      case "error":
        this.rejectEntry(
          entry,
          this.error(
            "WORKER_REPORTED_ERROR",
            entry.job.start.jobId,
            message.error.safeMessage,
            {
              workerErrorCode: message.error.code,
              processedBytes: message.processedBytes,
              lastCompletedSequence: message.lastCompletedSequence,
              retryable: message.error.retryable,
            },
          ),
        );
        return;
      case "cancelled":
        this.rejectCancelled(
          entry,
          message.reason,
          message.processedBytes,
          message.lastCompletedSequence,
        );
        return;
    }
  }

  private async sendNextChunk(
    entry: PendingEntry,
    generation: number,
  ): Promise<void> {
    const iterator = entry.chunkIterator;
    if (
      iterator === null ||
      !this.isCurrentChunkRead(entry, generation, iterator)
    ) {
      return;
    }

    let next: IteratorResult<WorkerChunkRequest>;
    try {
      next = await iterator.next();
    } catch {
      this.rejectEntry(
        entry,
        this.error(
          "WORKER_CHUNK_SOURCE_FAILED",
          entry.job.start.jobId,
          "The local worker chunk source failed.",
        ),
      );
      return;
    }

    if (next.done || !this.isCurrentChunkRead(entry, generation, iterator)) {
      return;
    }
    if (
      next.value.jobId !== entry.job.start.jobId ||
      !Number.isSafeInteger(next.value.sequence) ||
      next.value.sequence < 0 ||
      !Number.isSafeInteger(next.value.offsetBytes) ||
      next.value.offsetBytes < 0
    ) {
      this.rejectEntry(
        entry,
        this.error(
          "WORKER_PROTOCOL_VIOLATION",
          entry.job.start.jobId,
          "The local worker chunk request is invalid.",
        ),
      );
      return;
    }

    this.post(entry, next.value);
  }

  private isCurrentChunkRead(
    entry: PendingEntry,
    generation: number,
    iterator: AsyncIterator<WorkerChunkRequest>,
  ): boolean {
    return (
      !entry.settled &&
      generation === entry.workerGeneration &&
      iterator === entry.chunkIterator &&
      entry.cancellationReason === null
    );
  }

  private handleCrash(entry: PendingEntry): void {
    if (entry.settled) {
      return;
    }
    this.detachWorker(entry);

    if (entry.cancellationReason !== null) {
      this.rejectCancelled(entry, entry.cancellationReason, 0, null);
      return;
    }
    if (entry.crashRestarts >= this.maxCrashRestarts) {
      this.rejectEntry(
        entry,
        this.error(
          "WORKER_CRASH_LIMIT",
          entry.job.start.jobId,
          "The local worker could not recover from repeated crashes.",
          { crashRestarts: entry.crashRestarts },
        ),
      );
      return;
    }

    entry.crashRestarts += 1;
    this.start(entry);
  }

  private post(entry: PendingEntry, message: MainToWorkerMessage): void {
    const worker = entry.worker;
    if (worker === null) {
      this.handleCrash(entry);
      return;
    }
    try {
      worker.postMessage(message, transferablesForWorkerMessage(message));
    } catch {
      this.handleCrash(entry);
    }
  }

  private resolveEntry(
    entry: PendingEntry,
    result: WorkerResultResponse,
  ): void {
    if (entry.settled) {
      return;
    }
    entry.settled = true;
    entry.resolve(result);
    this.finish(entry);
  }

  private rejectEntry(entry: PendingEntry, error: WorkerPoolError): void {
    if (entry.settled) {
      return;
    }
    entry.settled = true;
    entry.reject(error);
    this.finish(entry);
  }

  private rejectCancelled(
    entry: PendingEntry,
    reason: WorkerCancellationReason,
    processedBytes: number,
    lastCompletedSequence: number | null,
  ): void {
    this.rejectEntry(
      entry,
      this.error(
        "WORKER_JOB_CANCELLED",
        entry.job.start.jobId,
        "The local worker job was cancelled.",
        { reason, processedBytes, lastCompletedSequence },
      ),
    );
  }

  private finish(entry: PendingEntry): void {
    entry.job.signal?.removeEventListener("abort", entry.abortListener);
    this.active.delete(entry.job.start.jobId);
    this.detachWorker(entry);
    this.schedule();
  }

  private detachWorker(entry: PendingEntry): void {
    const worker = entry.worker;
    if (worker === null) {
      return;
    }
    if (entry.messageListener !== null) {
      worker.removeEventListener("message", entry.messageListener);
    }
    if (entry.errorListener !== null) {
      worker.removeEventListener("error", entry.errorListener);
      worker.removeEventListener("messageerror", entry.errorListener);
    }
    worker.terminate();
    entry.worker = null;
    entry.messageListener = null;
    entry.errorListener = null;
    entry.chunkIterator = null;
  }

  private schedule(): void {
    while (this.active.size < this.maxWorkers && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next !== undefined && !next.settled) {
        this.start(next);
      }
    }
  }

  private error(
    code: WorkerPoolErrorCode,
    jobId: WorkerJobId,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ): WorkerPoolError {
    return new WorkerPoolError(code, jobId, message, details);
  }
}
