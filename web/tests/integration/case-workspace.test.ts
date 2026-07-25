/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";

import {
  openCaseWorkspace,
  saveCaseWorkspace,
} from "../../src/adapters/filesystem/case-workspace";
import type {
  ChunkReadRequest,
  ChunkReaderPort,
  WorkspaceEntry,
  WorkspacePort,
  WorkspaceWriteReceipt,
} from "../../src/domain/ports";
import type { CaseRecord, WorkspaceCatalog } from "../../src/domain/case/case";
import { parseUtcTimestamp, parseUuid } from "../../src/domain/shared/types";

interface StorageError {
  readonly code: string;
}

class MemoryWorkspace implements WorkspacePort<StorageError> {
  readonly files = new Map<string, Uint8Array>();
  readonly writes: string[] = [];

  async list() {
    return { ok: true as const, value: [] };
  }

  async stat(relativePath: string) {
    const bytes = this.files.get(relativePath);
    return bytes
      ? {
          ok: true as const,
          value: {
            relativePath,
            kind: "file" as const,
            sizeBytes: bytes.byteLength,
          },
        }
      : { ok: false as const, error: { code: "NOT_FOUND" } };
  }

  async openChunkReader(relativePath: string) {
    const bytes = this.files.get(relativePath);
    if (!bytes) return { ok: false as const, error: { code: "NOT_FOUND" } };
    const reader: ChunkReaderPort<StorageError> = {
      sizeBytes: bytes.byteLength,
      read: async ({ offsetBytes, lengthBytes }: ChunkReadRequest) => ({
        ok: true as const,
        value: {
          offsetBytes,
          bytes: bytes.slice(offsetBytes, offsetBytes + lengthBytes),
          endOfSource: offsetBytes + lengthBytes >= bytes.byteLength,
        },
      }),
    };
    return { ok: true as const, value: reader };
  }

  async createDirectory(relativePath: string) {
    return {
      ok: true as const,
      value: {
        relativePath,
        kind: "directory" as const,
        sizeBytes: null,
      } satisfies WorkspaceEntry,
    };
  }

  async createImmutable() {
    return { ok: false as const, error: { code: "UNSUPPORTED" } };
  }

  async writeAtomic(relativePath: string, bytes: Uint8Array) {
    this.writes.push(relativePath);
    this.files.set(relativePath, bytes.slice());
    return {
      ok: true as const,
      value: {
        relativePath,
        sizeBytes: bytes.byteLength,
      } satisfies WorkspaceWriteReceipt,
    };
  }

  async append() {
    return { ok: false as const, error: { code: "UNSUPPORTED" } };
  }
}

function fixtures(): {
  readonly catalog: WorkspaceCatalog;
  readonly caseRecord: CaseRecord;
} {
  const workspaceId = parseUuid("11111111-1111-4111-8111-111111111111");
  const caseId = parseUuid("22222222-2222-4222-8222-222222222222");
  const createdAt = parseUtcTimestamp("2026-07-25T15:00:00.000Z");
  const statusOccurredAt = parseUtcTimestamp("2026-07-25T15:01:00.000Z");
  if (!workspaceId.ok || !caseId.ok || !createdAt.ok || !statusOccurredAt.ok) {
    throw new Error("Synthetic workspace fixtures invalid.");
  }
  const caseRecord: CaseRecord = Object.freeze({
    caseId: caseId.value,
    authoritativeCaseId: "PBGC-SYNTHETIC-001",
    purpose: "production",
    designationRationale: null,
    createdBy: {
      actorType: "human",
      actorKey: "synthetic-reviewer",
      displayName: "Synthetic Reviewer",
      authorityContext: "case-intake",
    } as const,
    createdAt: createdAt.value,
    collisionDecisionId: null,
    status: "active",
    statusHistory: Object.freeze([
      Object.freeze({
        status: "active",
        occurredAt: statusOccurredAt.value,
        actor: Object.freeze({
          actorType: "human",
          actorKey: "synthetic-reviewer",
          displayName: "Synthetic Reviewer",
          authorityContext: "case-intake",
        }),
        rationale: "Synthetic status-history preservation check.",
      }),
    ]),
  });
  return {
    caseRecord,
    catalog: {
      schemaVersion: "1.0.0",
      workspaceId: workspaceId.value,
      createdAt: createdAt.value,
      cases: [
        {
          caseId: caseId.value,
          authoritativeCaseId: caseRecord.authoritativeCaseId,
          purpose: "production",
          casePath: `cases/${caseId.value}/case.json`,
          status: "active",
        },
      ],
    },
  };
}

describe("T032 atomic case workspace persistence", () => {
  it("writes the case record before the catalog and validates both by reading them back", async () => {
    const workspace = new MemoryWorkspace();
    const fixture = fixtures();

    const result = await saveCaseWorkspace(
      workspace,
      fixture.catalog,
      fixture.caseRecord,
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(workspace.writes).toEqual([
      `cases/${fixture.caseRecord.caseId}/case.json`,
      "case-index.json",
    ]);
    const reopened = await openCaseWorkspace(workspace);
    expect(reopened).toEqual({
      ok: true,
      value: {
        catalog: fixture.catalog,
        cases: [fixture.caseRecord],
      },
    });
  });

  it("fails closed when read-back bytes differ and does not write the catalog", async () => {
    const workspace = new MemoryWorkspace();
    const fixture = fixtures();
    const originalWrite = workspace.writeAtomic.bind(workspace);
    workspace.writeAtomic = async (relativePath, bytes) => {
      const receipt = await originalWrite(relativePath, bytes);
      if (relativePath.endsWith("/case.json")) {
        workspace.files.set(relativePath, new TextEncoder().encode("{}"));
      }
      return receipt;
    };

    const result = await saveCaseWorkspace(
      workspace,
      fixture.catalog,
      fixture.caseRecord,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Corrupt read-back unexpectedly passed.");
    expect(result.error.code).toBe("CASE_READ_BACK_MISMATCH");
    expect(workspace.writes).toEqual([
      `cases/${fixture.caseRecord.caseId}/case.json`,
    ]);
    expect(workspace.files.has("case-index.json")).toBe(false);
  });
});
