import { describe, expect, it } from "vitest";

import { evaluateFileSystemCapability } from "../../src/adapters/filesystem/capability";
import { WorkerPool } from "../../src/adapters/workers/worker-pool";
import {
  assertLocalAssetUrl,
  assertLocalWorkerUrl,
  installProductionSecurityBoundary,
  SecurityBoundaryError,
} from "../../src/app/security-boundary";
import { validateContract } from "../../src/contracts/schema-validator";
import {
  decodeAuditJsonl,
  encodeAuditJsonl,
  validateAuditHistory,
} from "../../src/domain/lineage/audit-log";
import { hashTyped } from "../../src/domain/manifests/canonical-json";
import { parseBrandedId } from "../../src/domain/shared/types";
import { WORKER_PROTOCOL_VERSION } from "../../src/workers/protocol";
import { validAuditHistory } from "../fixtures/contracts/audit-events";
import { schemaCases } from "../fixtures/contracts/schema-cases";

describe("T029 Phase 2 deterministic local-only foundation", () => {
  it("validates an approved synthetic workspace contract offline", () => {
    const workspace = schemaCases.find(
      ({ schema }) => schema === "case-workspace.schema.json",
    );

    expect(workspace).toBeDefined();
    expect(validateContract("caseWorkspace", workspace?.valid).valid).toBe(
      true,
    );
  });

  it("hashes deterministic content independently of operational metadata", async () => {
    const first = {
      deterministicPayload: {
        artifactSha256Values: ["a".repeat(64), "b".repeat(64)],
        result: "provisional",
      },
      operationalMetadata: {
        generatedAt: "2026-07-25T12:00:00.000Z",
        uiState: "first",
      },
    };
    const second = {
      operationalMetadata: {
        generatedAt: "2026-07-25T13:00:00.000Z",
        uiState: "second",
      },
      deterministicPayload: {
        result: "provisional",
        artifactSha256Values: ["a".repeat(64), "b".repeat(64)],
      },
    };

    const firstHash = await hashTyped(first, {});
    const secondHash = await hashTyped(second, {});

    expect(firstHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(secondHash).toBe(firstHash);
  });

  it("round-trips and validates append-only JSONL history", () => {
    const encoded = encodeAuditJsonl(validAuditHistory);
    const decoded = decodeAuditJsonl(encoded);

    expect(decoded).toEqual({
      events: validAuditHistory,
      truncatedFinalLine: false,
    });
    expect(validateAuditHistory(decoded.events)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("cancels pre-aborted worker work before creating an endpoint", async () => {
    const jobId = parseBrandedId<"worker-job">("synthetic-foundation-job");
    if (!jobId.ok) throw new Error("Synthetic worker job ID is invalid.");

    const controller = new AbortController();
    controller.abort();
    let workerCreated = false;
    const pool = new WorkerPool({
      maxWorkers: 1,
      maxQueuedJobs: 0,
      createWorker: () => {
        workerCreated = true;
        throw new Error("A cancelled job must not create a worker.");
      },
    });

    await expect(
      pool.submit({
        start: {
          kind: "start",
          protocolVersion: WORKER_PROTOCOL_VERSION,
          jobId: jobId.value,
          operation: "sha256",
          totalBytes: 0,
          chunkSizeBytes: 1,
          artifactSha256: null,
          operationParameters: {},
        },
        chunks: async function* () {
          await Promise.resolve();
          if (controller.signal.aborted) return;
          yield {
            kind: "chunk",
            protocolVersion: WORKER_PROTOCOL_VERSION,
            jobId: jobId.value,
            sequence: 0,
            offsetBytes: 0,
            bytes: new ArrayBuffer(0),
            endOfSource: true,
          };
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "WORKER_JOB_CANCELLED",
      details: {
        processedBytes: 0,
        lastCompletedSequence: null,
      },
    });
    expect(workerCreated).toBe(false);
  });

  it("permits only an approved local workspace capability", () => {
    const approved = evaluateFileSystemCapability(
      {
        protocol: "http:",
        hostname: "127.0.0.1",
        secureContext: true,
        directoryPickerAvailable: true,
      },
      {
        approvedBrowserProfile: true,
        directFileApproved: false,
        loopbackStaticOriginApproved: true,
      },
    );
    const remote = evaluateFileSystemCapability(
      {
        protocol: "https:",
        hostname: "example.invalid",
        secureContext: true,
        directoryPickerAvailable: true,
      },
      {
        approvedBrowserProfile: true,
        directFileApproved: false,
        loopbackStaticOriginApproved: true,
      },
    );

    expect(approved).toMatchObject({
      mode: "production-local-workspace",
      allowsGovernedIntake: true,
    });
    expect(remote).toMatchObject({
      mode: "non-production-session",
      allowsGovernedIntake: false,
      blockingReasons: ["DELIVERY_MODE_NOT_APPROVED"],
    });
  });

  it("fails closed across production network and remote-resource boundaries", () => {
    const calls: string[] = [];
    const scope = {
      fetch: () => calls.push("fetch"),
      XMLHttpRequest: () => calls.push("XMLHttpRequest"),
      WebSocket: () => calls.push("WebSocket"),
      EventSource: () => calls.push("EventSource"),
      Worker: () => calls.push("Worker"),
      navigator: {
        sendBeacon: () => calls.push("sendBeacon"),
        serviceWorker: {
          register: () => calls.push("serviceWorker"),
        },
      },
    };

    installProductionSecurityBoundary(scope);

    const blocked = [
      scope.fetch,
      scope.XMLHttpRequest,
      scope.WebSocket,
      scope.EventSource,
      scope.navigator.sendBeacon,
      scope.navigator.serviceWorker.register,
    ];
    for (const capability of blocked) {
      expect(() => {
        Reflect.apply(capability, scope, []);
      }).toThrow(SecurityBoundaryError);
    }
    expect(() => {
      assertLocalWorkerUrl("https://example.invalid/worker.js");
    }).toThrow(SecurityBoundaryError);
    expect(() => {
      assertLocalAssetUrl("https://example.invalid/script.js");
    }).toThrow(SecurityBoundaryError);
    expect(calls).toEqual([]);
  });
});
