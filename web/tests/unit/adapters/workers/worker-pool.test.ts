import { describe, expect, it } from "vitest";

import {
  parseBrandedId,
  parseSha256,
} from "../../../../src/domain/shared/types";
import {
  WorkerPool,
  WorkerPoolError,
  type WorkerEndpoint,
  type WorkerEndpointErrorEvent,
  type WorkerEndpointMessageEvent,
  type WorkerPoolJob,
} from "../../../../src/adapters/workers/worker-pool";
import {
  WORKER_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerJobId,
  type WorkerToMainMessage,
} from "../../../../src/workers/protocol";

class SyntheticWorker implements WorkerEndpoint {
  readonly posted: {
    readonly message: MainToWorkerMessage;
    readonly transfer: readonly Transferable[];
  }[] = [];

  terminated = false;

  private readonly messageListeners = new Set<
    (event: WorkerEndpointMessageEvent) => void
  >();

  private readonly errorListeners = new Set<
    (event: WorkerEndpointErrorEvent) => void
  >();

  postMessage(
    message: MainToWorkerMessage,
    transfer: readonly Transferable[],
  ): void {
    this.posted.push({ message, transfer });
  }

  addEventListener(
    type: "message" | "error" | "messageerror",
    listener:
      | ((event: WorkerEndpointMessageEvent) => void)
      | ((event: WorkerEndpointErrorEvent) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.add(
        listener as (event: WorkerEndpointMessageEvent) => void,
      );
      return;
    }
    this.errorListeners.add(
      listener as (event: WorkerEndpointErrorEvent) => void,
    );
  }

  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener:
      | ((event: WorkerEndpointMessageEvent) => void)
      | ((event: WorkerEndpointErrorEvent) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.delete(
        listener as (event: WorkerEndpointMessageEvent) => void,
      );
      return;
    }
    this.errorListeners.delete(
      listener as (event: WorkerEndpointErrorEvent) => void,
    );
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerToMainMessage): void {
    for (const listener of this.messageListeners) {
      listener({ data: message });
    }
  }

  crash(): void {
    for (const listener of this.errorListeners) {
      listener({});
    }
  }
}

function workerJob(
  label: string,
  options: { readonly signal?: AbortSignal } = {},
): WorkerPoolJob<{ readonly label: string }> {
  const parsedJobId = parseBrandedId<"worker-job">(`synthetic-${label}`);
  if (!parsedJobId.ok) {
    throw new Error("Synthetic job ID must be valid.");
  }

  return {
    start: {
      kind: "start",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: parsedJobId.value,
      operation: "sha256",
      totalBytes: 3,
      chunkSizeBytes: 3,
      artifactSha256: null,
      operationParameters: {},
    },
    chunks: async function* () {
      await Promise.resolve();
      yield {
        kind: "chunk",
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: parsedJobId.value,
        sequence: 0,
        offsetBytes: 0,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        endOfSource: true,
      };
    },
    signal: options.signal,
  };
}

function accepted(jobId: WorkerJobId): WorkerToMainMessage {
  return {
    kind: "accepted",
    protocolVersion: WORKER_PROTOCOL_VERSION,
    jobId,
    operation: "sha256",
  };
}

function result(
  jobId: WorkerJobId,
  label: string,
): WorkerToMainMessage<{ readonly label: string }> {
  const parsedSha256 = parseSha256("a".repeat(64));
  if (!parsedSha256.ok) {
    throw new Error("Synthetic SHA-256 must be valid.");
  }
  return {
    kind: "result",
    protocolVersion: WORKER_PROTOCOL_VERSION,
    jobId,
    operation: "sha256",
    artifactSha256: parsedSha256.value,
    processedBytes: 3,
    output: { label },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("T026 deterministic worker pool", () => {
  it("enforces worker and queue bounds without silently dropping work", async () => {
    const workers: SyntheticWorker[] = [];
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 1,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const first = workerJob("first");
    const second = workerJob("second");
    const firstResult = pool.submit(first);
    const secondResult = pool.submit(second);

    await expect(pool.submit(workerJob("overflow"))).rejects.toMatchObject({
      code: "WORKER_QUEUE_FULL",
    });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted[0]?.message).toEqual(first.start);

    workers[0]?.emit(result(first.start.jobId, "first"));
    await expect(firstResult).resolves.toMatchObject({
      output: { label: "first" },
    });
    await flush();

    expect(workers).toHaveLength(2);
    expect(workers[1]?.posted[0]?.message).toEqual(second.start);
    workers[1]?.emit(result(second.start.jobId, "second"));
    await expect(secondResult).resolves.toMatchObject({
      output: { label: "second" },
    });
  });

  it("returns batch results in submission order despite completion order", async () => {
    const workers: SyntheticWorker[] = [];
    const pool = new WorkerPool({
      maxWorkers: 2,
      maxQueuedJobs: 2,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const first = workerJob("first");
    const second = workerJob("second");
    const ordered = pool.runAll([first, second]);

    workers[1]?.emit(result(second.start.jobId, "second"));
    workers[0]?.emit(result(first.start.jobId, "first"));

    await expect(ordered).resolves.toEqual([
      expect.objectContaining({ output: { label: "first" } }),
      expect.objectContaining({ output: { label: "second" } }),
    ]);
  });

  it("cancels queued work without dispatching it", async () => {
    const workers: SyntheticWorker[] = [];
    const controller = new AbortController();
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 1,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const active = workerJob("active");
    const queued = workerJob("queued", { signal: controller.signal });
    const activeResult = pool.submit(active);
    const queuedResult = pool.submit(queued);

    controller.abort();
    await expect(queuedResult).rejects.toMatchObject({
      code: "WORKER_JOB_CANCELLED",
    });
    expect(workers).toHaveLength(1);

    workers[0]?.emit(result(active.start.jobId, "active"));
    await activeResult;
    await flush();
    expect(workers).toHaveLength(1);
  });

  it("sends typed cancellation to active work and preserves prior progress", async () => {
    const workers: SyntheticWorker[] = [];
    const controller = new AbortController();
    const progress: number[] = [];
    const job = {
      ...workerJob("active-cancel", { signal: controller.signal }),
      onProgress: (message: { readonly processedBytes: number }) => {
        progress.push(message.processedBytes);
      },
    };
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 0,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const pending = pool.submit(job);
    workers[0]?.emit({
      kind: "progress",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: job.start.jobId,
      stage: "hashing",
      processedBytes: 2,
      totalBytes: 3,
      lastCompletedSequence: 0,
    });
    controller.abort();

    expect(progress).toEqual([2]);
    expect(workers[0]?.posted.at(-1)?.message).toMatchObject({
      kind: "cancel",
      jobId: job.start.jobId,
      reason: "user-request",
    });

    workers[0]?.emit({
      kind: "cancelled",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: job.start.jobId,
      reason: "user-request",
      processedBytes: 2,
      lastCompletedSequence: 0,
    });
    await expect(pending).rejects.toMatchObject({
      code: "WORKER_JOB_CANCELLED",
      details: {
        processedBytes: 2,
        lastCompletedSequence: 0,
      },
    });
  });

  it("recovers one worker crash with a fresh endpoint and replayable chunks", async () => {
    const workers: SyntheticWorker[] = [];
    let chunkFactoryCalls = 0;
    const base = workerJob("crash");
    const job: WorkerPoolJob<{ readonly label: string }> = {
      ...base,
      chunks: async function* () {
        chunkFactoryCalls += 1;
        await Promise.resolve();
        yield {
          kind: "chunk",
          protocolVersion: WORKER_PROTOCOL_VERSION,
          jobId: base.start.jobId,
          sequence: 0,
          offsetBytes: 0,
          bytes: new Uint8Array([1, 2, 3]).buffer,
          endOfSource: true,
        };
      },
    };
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 0,
      maxCrashRestarts: 1,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const pending = pool.submit(job);
    workers[0]?.emit(accepted(job.start.jobId));
    await flush();
    expect(workers[0]?.posted[1]?.message.kind).toBe("chunk");
    workers[0]?.crash();
    await flush();

    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1]?.posted[0]?.message).toEqual(job.start);
    workers[1]?.emit(accepted(job.start.jobId));
    await flush();
    expect(workers[1]?.posted[1]?.message.kind).toBe("chunk");
    expect(chunkFactoryCalls).toBe(2);

    workers[1]?.emit(result(job.start.jobId, "recovered"));
    await expect(pending).resolves.toMatchObject({
      output: { label: "recovered" },
    });
  });

  it("does not deliver an in-flight stale chunk to a replacement worker", async () => {
    const workers: SyntheticWorker[] = [];
    let releaseFirstRead: (() => void) | undefined;
    let chunkFactoryCalls = 0;
    const base = workerJob("stale-chunk");
    const job: WorkerPoolJob<{ readonly label: string }> = {
      ...base,
      chunks: () => {
        chunkFactoryCalls += 1;
        const generation = chunkFactoryCalls;
        return {
          async *[Symbol.asyncIterator]() {
            if (generation === 1) {
              await new Promise<void>((resolve) => {
                releaseFirstRead = resolve;
              });
            }
            yield {
              kind: "chunk",
              protocolVersion: WORKER_PROTOCOL_VERSION,
              jobId: base.start.jobId,
              sequence: 0,
              offsetBytes: 0,
              bytes: new Uint8Array([generation]).buffer,
              endOfSource: true,
            };
          },
        };
      },
    };
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 0,
      maxCrashRestarts: 1,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const pending = pool.submit(job);
    workers[0]?.emit(accepted(job.start.jobId));
    await flush();
    workers[0]?.crash();
    workers[1]?.emit(accepted(job.start.jobId));
    await flush();

    expect(workers[1]?.posted).toHaveLength(2);
    const replacementChunk = workers[1]?.posted[1];
    expect(replacementChunk?.message.kind).toBe("chunk");
    expect(replacementChunk?.transfer).toEqual([
      (replacementChunk?.message as { readonly bytes: ArrayBuffer }).bytes,
    ]);

    releaseFirstRead?.();
    await flush();
    expect(workers[1]?.posted).toHaveLength(2);

    workers[1]?.emit(result(job.start.jobId, "recovered"));
    await expect(pending).resolves.toMatchObject({
      output: { label: "recovered" },
    });
  });

  it("fails closed after the configured crash-recovery limit", async () => {
    const workers: SyntheticWorker[] = [];
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 0,
      maxCrashRestarts: 1,
      createWorker: () => {
        const worker = new SyntheticWorker();
        workers.push(worker);
        return worker;
      },
    });

    const pending = pool.submit(workerJob("repeated-crash"));
    workers[0]?.crash();
    await flush();
    workers[1]?.crash();

    await expect(pending).rejects.toEqual(
      expect.objectContaining<Partial<WorkerPoolError>>({
        code: "WORKER_CRASH_LIMIT",
      }),
    );
  });
});
