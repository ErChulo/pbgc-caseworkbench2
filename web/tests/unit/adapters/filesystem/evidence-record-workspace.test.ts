import { describe, expect, it } from "vitest";

import {
  appendProvisionCandidates,
  appendUnresolvedItems,
  readCurrentEvidenceCatalog,
  readProvisionCandidates,
  readUnresolvedItems,
  writeCurrentEvidenceCatalog,
} from "../../../../src/adapters/filesystem/evidence-record-workspace";
import { buildEvidenceCatalog } from "../../../../src/domain/evidence/catalog";
import { extractProvisionCandidate } from "../../../../src/domain/plan-rules/candidate-extraction";
import { createUnresolvedItem } from "../../../../src/domain/plan-rules/unresolved-items";
import type {
  ChunkReaderPort,
  WorkspaceEntry,
  WorkspacePort,
  WorkspaceWriteReceipt,
} from "../../../../src/domain/ports";
import { parseUuid, type Result } from "../../../../src/domain/shared/types";

interface StorageError {
  readonly code: "NOT_FOUND" | "ALREADY_EXISTS" | "UNSUPPORTED";
}

class MemoryWorkspace implements WorkspacePort<StorageError> {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>();

  list(): Promise<Result<readonly WorkspaceEntry[], StorageError>> {
    return Promise.resolve({ ok: false, error: { code: "UNSUPPORTED" } });
  }

  stat(path: string): Promise<Result<WorkspaceEntry, StorageError>> {
    const bytes = this.files.get(path);
    return Promise.resolve(
      bytes === undefined
        ? { ok: false, error: { code: "NOT_FOUND" } }
        : {
            ok: true,
            value: {
              relativePath: path,
              kind: "file",
              sizeBytes: bytes.byteLength,
            },
          },
    );
  }

  openChunkReader(
    path: string,
  ): Promise<Result<ChunkReaderPort<StorageError>, StorageError>> {
    const bytes = this.files.get(path);
    return Promise.resolve(
      bytes === undefined
        ? { ok: false, error: { code: "NOT_FOUND" } }
        : { ok: true, value: reader(bytes) },
    );
  }

  createDirectory(path: string): Promise<Result<WorkspaceEntry, StorageError>> {
    this.directories.add(path);
    return Promise.resolve({
      ok: true,
      value: { relativePath: path, kind: "directory", sizeBytes: null },
    });
  }

  async createImmutable(
    path: string,
    source: ChunkReaderPort<StorageError>,
  ): Promise<Result<WorkspaceWriteReceipt, StorageError>> {
    if (this.files.has(path)) {
      return { ok: false, error: { code: "ALREADY_EXISTS" } };
    }
    return this.writeAtomic(path, await read(source));
  }

  writeAtomic(
    path: string,
    bytes: Uint8Array,
  ): Promise<Result<WorkspaceWriteReceipt, StorageError>> {
    this.files.set(path, bytes.slice());
    return Promise.resolve({
      ok: true,
      value: { relativePath: path, sizeBytes: bytes.byteLength },
    });
  }

  async append(
    path: string,
    bytes: Uint8Array,
  ): Promise<Result<WorkspaceWriteReceipt, StorageError>> {
    const prior = this.files.get(path) ?? new Uint8Array();
    const combined = new Uint8Array(prior.byteLength + bytes.byteLength);
    combined.set(prior);
    combined.set(bytes, prior.byteLength);
    return this.writeAtomic(path, combined);
  }
}

const parsedCaseId = parseUuid("00000000-0000-4000-8000-000000000001");
if (!parsedCaseId.ok) throw new Error("Synthetic case UUID is invalid.");
const caseId = parsedCaseId.value;
const catalogId = "00000000-0000-4000-8000-000000000002" as const;

describe("browser evidence record workspace", () => {
  it("retains immutable catalog snapshots and advances a verified pointer", async () => {
    const workspace = new MemoryWorkspace();
    const first = await catalog("a");
    const second = await catalog("b");
    expect(
      await writeCurrentEvidenceCatalog(
        workspace,
        first.caseId,
        first,
        "2026-08-09T12:00:00.000Z",
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      (
        await writeCurrentEvidenceCatalog(
          workspace,
          second.caseId,
          second,
          "2026-08-09T13:00:00.000Z",
        )
      ).ok,
    ).toBe(true);
    expect(
      workspace.files.has(
        `cases/${caseId}/evidence/catalogs/${first.catalogContentSha256}.json`,
      ),
    ).toBe(true);
    expect(
      workspace.files.has(
        `cases/${caseId}/evidence/catalogs/${second.catalogContentSha256}.json`,
      ),
    ).toBe(true);
    const current = await readCurrentEvidenceCatalog(workspace, second.caseId);
    expect(current.ok && current.value?.catalogContentSha256).toBe(
      second.catalogContentSha256,
    );
    const pointer = JSON.parse(
      new TextDecoder().decode(
        workspace.files.get(`cases/${caseId}/evidence/catalogs/current.json`),
      ),
    ) as Record<string, unknown>;
    expect(Object.keys(pointer).sort()).toEqual([
      "catalogContentSha256",
      "schemaVersion",
      "writtenAt",
    ]);
  });

  it("appends candidates idempotently and rejects changed content", async () => {
    const workspace = new MemoryWorkspace();
    const candidate = await extractProvisionCandidate({
      artifactSha256: "a".repeat(64),
      artifactLocator: "text:line=1:offset=0",
      provisionIdentifier: "text-line-1",
      verbatimText: "Effective January 1, 2025, benefit formula A applies.",
      normalizedRestatement:
        "Effective January 1, 2025, benefit formula A applies.",
      extractedEffectiveDate: "2025-01-01",
      extractedAdoptionDate: null,
      dateExtractionConvention: "explicit",
      confidence: 1,
      classifierId: "synthetic-test",
      classifierVersion: "1.0.0",
      ruleSetVersion: "feature-001-plan-rule-v1",
    });
    if (!candidate.ok) throw new Error(candidate.error);
    expect(
      (await appendProvisionCandidates(workspace, caseId, [candidate.value]))
        .ok,
    ).toBe(true);
    expect(
      (await appendProvisionCandidates(workspace, caseId, [candidate.value]))
        .ok,
    ).toBe(true);
    const restored = await readProvisionCandidates(workspace, caseId);
    expect(restored.ok && restored.value).toHaveLength(1);

    const path = `cases/${caseId}/evidence/provision-candidates.jsonl`;
    const tampered = {
      ...candidate.value,
      verbatimText: "Changed text",
    };
    workspace.files.set(
      path,
      new TextEncoder().encode(`${JSON.stringify(tampered)}\n`),
    );
    expect((await readProvisionCandidates(workspace, caseId)).ok).toBe(false);
  });

  it("appends deterministic unresolved revisions idempotently", async () => {
    const workspace = new MemoryWorkspace();
    const created = await createUnresolvedItem(
      {
        kind: "ambiguous-text",
        affectedScope: "synthetic:benefit-formula",
        competingInterpretations: [
          {
            interpretationId: parsedUuid(
              "00000000-0000-4000-8000-000000000011",
            ),
            statement: "Synthetic interpretation A.",
            evidence: [],
            sourceCandidateId: null,
          },
          {
            interpretationId: parsedUuid(
              "00000000-0000-4000-8000-000000000012",
            ),
            statement: "Synthetic interpretation B.",
            evidence: [],
            sourceCandidateId: null,
          },
        ],
        consequence: "Synthetic calculated values differ.",
        reviewer: null,
      },
      {
        uuid: () => parsedUuid("00000000-0000-4000-8000-000000000013"),
        now: () => "2026-08-09T12:00:00.000Z",
      },
    );
    if (!created.ok) throw new Error(created.error);
    expect(
      (await appendUnresolvedItems(workspace, caseId, [created.value])).ok,
    ).toBe(true);
    expect(
      (await appendUnresolvedItems(workspace, caseId, [created.value])).ok,
    ).toBe(true);
    const restored = await readUnresolvedItems(workspace, caseId);
    expect(restored.ok && restored.value).toHaveLength(1);
  });
});

async function catalog(hashCharacter: string) {
  const built = await buildEvidenceCatalog({
    catalogId,
    caseId,
    builtAt: "2026-08-09T12:00:00.000Z",
    caseEvidence: [
      {
        artifactId: "00000000-0000-4000-8000-000000000003",
        sha256: hashCharacter.repeat(64),
        sizeBytes: 100,
        locator: "synthetic/plan.txt",
        mediaType: "text/plain",
        receiptId: "00000000-0000-4000-8000-000000000004",
        receiptIds: ["00000000-0000-4000-8000-000000000004"],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "executed-plan-document",
        reviewStatus: "released",
        importedAt: "2026-08-09T11:00:00.000Z",
      },
    ],
    referenceOnly: [],
    excludedQuarantined: [],
  });
  if (!built.ok) throw new Error(built.error.message);
  return built.value;
}

function reader(bytes: Uint8Array): ChunkReaderPort<StorageError> {
  return {
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
}

async function read(
  source: ChunkReaderPort<StorageError>,
): Promise<Uint8Array> {
  const chunk = await source.read({
    offsetBytes: 0,
    lengthBytes: source.sizeBytes,
  });
  if (!chunk.ok) throw new Error("Synthetic read failed.");
  return chunk.value.bytes;
}

function parsedUuid(value: string) {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("Synthetic UUID is invalid.");
  return parsed.value;
}
