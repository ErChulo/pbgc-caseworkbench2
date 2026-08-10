import { describe, expect, it } from "vitest";

import {
  parsePersistedCheckpoint,
  parsePersistedCheckpointPointer,
  selectCurrentCheckpoint,
  type PersistedEvidenceCheckpoint,
} from "../../../../src/app/orchestrator/case-orchestrator";

const UUID_A = "11111111-2222-4333-8aaa-bbbbccccdddd";
const UUID_B = "55555555-6666-4777-9aaa-bbbbccccdddd";
const UUID_CASE = "99999999-aaaa-4bbb-8ccc-ddddeeeeffff";
const UUID_RECEIPT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffffffff";
const UUID_ARTIFACT = "bbbbbbbb-cccc-4ddd-8eee-ffffffffaaaa";
const SHA_ONE = "a".repeat(64);
const SHA_TWO = "b".repeat(64);
const SHA_ENTRY = "c".repeat(64);

function validCheckpoint(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    caseId: UUID_CASE,
    attemptId: UUID_A,
    priorAttemptId: null,
    divergenceReason: null,
    snapshot: {
      snapshotId: SHA_ONE,
      snapshotRecordId: UUID_B,
      frozenAt: "2026-08-08T10:00:00.000Z",
      entries: [
        {
          observedRelativePath: "source/alpha.txt",
          normalizedDisplayPath: "source/alpha.txt",
          sha256: SHA_ENTRY,
          sizeBytes: 11,
          declaredMediaType: "text/plain",
          lastModifiedObserved: null,
        },
      ],
      discoveredCount: 1,
      totalBytes: 11,
    },
    inventoryItems: [
      {
        id: "inventory-alpha",
        path: "source/alpha.txt",
        sizeBytes: 11,
        sha256: SHA_ENTRY,
        status: "preserved",
        message: "Preserved for unit testing.",
      },
    ],
    packageStatus: "completed",
    receipts: [],
    artifacts: [],
    reconciliation: {
      missing: [],
      unexpected: [],
      duplicate: [],
      conflicting: [],
    },
    downstreamBlocked: true,
    ...overrides,
  };
}

function parsedCheckpoint(
  overrides: Record<string, unknown> = {},
): PersistedEvidenceCheckpoint {
  const result = parsePersistedCheckpoint(validCheckpoint(overrides));
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: PersistedEvidenceCheckpoint }).value;
}

describe("parsePersistedCheckpoint", () => {
  it("accepts a canonical persisted checkpoint", () => {
    const result = parsePersistedCheckpoint(validCheckpoint());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attemptId).toBe(UUID_A);
      expect(result.value.priorAttemptId).toBeNull();
      expect(result.value.snapshot.snapshotId).toBe(SHA_ONE);
      expect(result.value.snapshot.entries).toHaveLength(1);
      const firstEntry = result.value.snapshot.entries[0];
      expect(firstEntry?.sha256).toBe(SHA_ENTRY);
      expect(firstEntry?.sizeBytes).toBe(11);
    }
  });

  it("accepts a chained checkpoint with a prior attempt", () => {
    const result = parsePersistedCheckpoint(
      validCheckpoint({ attemptId: UUID_B, priorAttemptId: UUID_A }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.priorAttemptId).toBe(UUID_A);
      expect(result.value.divergenceReason).toBeNull();
    }
  });

  it("rejects a non-object payload", () => {
    const result = parsePersistedCheckpoint("not an object");
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid attemptId", () => {
    const result = parsePersistedCheckpoint(
      validCheckpoint({ attemptId: "not-a-uuid" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid priorAttemptId", () => {
    const result = parsePersistedCheckpoint(
      validCheckpoint({ priorAttemptId: "not-a-uuid" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid snapshotId", () => {
    const result = parsePersistedCheckpoint(
      validCheckpoint({
        snapshot: {
          ...(validCheckpoint().snapshot as Record<string, unknown>),
          snapshotId: "not-a-sha256",
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid frozenAt", () => {
    const result = parsePersistedCheckpoint(
      validCheckpoint({
        snapshot: {
          ...(validCheckpoint().snapshot as Record<string, unknown>),
          frozenAt: "yesterday",
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a missing entries array", () => {
    const result = parsePersistedCheckpoint(
      validCheckpoint({
        snapshot: {
          ...(validCheckpoint().snapshot as Record<string, unknown>),
          entries: undefined,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an entry with a missing sha256", () => {
    const snapshot = validCheckpoint().snapshot as Record<string, unknown>;
    const entries = (snapshot.entries as Record<string, unknown>[]).map(
      (entry) => ({ ...entry, sha256: undefined }),
    );
    const result = parsePersistedCheckpoint(
      validCheckpoint({ snapshot: { ...snapshot, entries } }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an entry with a negative sizeBytes", () => {
    const snapshot = validCheckpoint().snapshot as Record<string, unknown>;
    const entries = (snapshot.entries as Record<string, unknown>[]).map(
      (entry) => ({ ...entry, sizeBytes: -1 }),
    );
    const result = parsePersistedCheckpoint(
      validCheckpoint({ snapshot: { ...snapshot, entries } }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a checkpoint without a supported schema version", () => {
    expect(
      parsePersistedCheckpoint(validCheckpoint({ schemaVersion: "2.0.0" })).ok,
    ).toBe(false);
  });

  it("rejects a checkpoint without a valid case binding", () => {
    expect(
      parsePersistedCheckpoint(validCheckpoint({ caseId: "PBGC-UNIT" })).ok,
    ).toBe(false);
  });

  it("rejects snapshot totals that do not match the entries", () => {
    const snapshot = validCheckpoint().snapshot as Record<string, unknown>;
    expect(
      parsePersistedCheckpoint(
        validCheckpoint({
          snapshot: { ...snapshot, discoveredCount: 2, totalBytes: 12 },
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects a normalized path that does not match the observed path", () => {
    const snapshot = validCheckpoint().snapshot as Record<string, unknown>;
    const entries = (snapshot.entries as Record<string, unknown>[]).map(
      (entry) => ({ ...entry, normalizedDisplayPath: "different.txt" }),
    );
    expect(
      parsePersistedCheckpoint(
        validCheckpoint({ snapshot: { ...snapshot, entries } }),
      ).ok,
    ).toBe(false);
  });

  it("rejects an inventory projection that omits a snapshot entry", () => {
    expect(
      parsePersistedCheckpoint(validCheckpoint({ inventoryItems: [] })).ok,
    ).toBe(false);
  });

  it("rejects an invalid persisted package status", () => {
    expect(
      parsePersistedCheckpoint(
        validCheckpoint({ packageStatus: "interrupted" }),
      ).ok,
    ).toBe(false);
  });

  it("restores a case-bound receipt and artifact ledger and rejects hash divergence", () => {
    const receipt = {
      receiptId: UUID_RECEIPT,
      attemptId: UUID_A,
      caseId: UUID_CASE,
      sha256: SHA_ENTRY,
      originalFilename: "alpha.txt",
      observedRelativePath: "source/alpha.txt",
      submittedBy: "synthetic-reviewer",
      submittedAt: "2026-08-08T10:00:00.000Z",
      sourceLocation: "synthetic-test",
      transferContext: null,
      declaredDescription: null,
      parentArtifactId: null,
    };
    const artifact = {
      artifactId: UUID_ARTIFACT,
      receiptId: UUID_RECEIPT,
      sha256: SHA_ENTRY,
      attemptId: UUID_A,
      caseId: UUID_CASE,
      artifactRole: "submitted-file",
      signatureMediaType: "text/plain",
      processingStatus: "preserved",
      downstreamEligibility: "blocked",
      statusHistory: [],
    };
    const restored = parsePersistedCheckpoint(
      validCheckpoint({ receipts: [receipt], artifacts: [artifact] }),
    );
    expect(restored.ok && restored.value.receipts).toHaveLength(1);
    expect(restored.ok && restored.value.artifacts).toHaveLength(1);
    expect(
      parsePersistedCheckpoint(
        validCheckpoint({
          receipts: [receipt],
          artifacts: [{ ...artifact, sha256: SHA_TWO }],
        }),
      ).ok,
    ).toBe(false);
  });
});

describe("selectCurrentCheckpoint", () => {
  it("returns null for an empty set", () => {
    expect(selectCurrentCheckpoint([])).toBeNull();
  });

  it("selects a single valid head", () => {
    const checkpoint = parsedCheckpoint();
    expect(selectCurrentCheckpoint([checkpoint])).toBe(checkpoint);
  });

  it("selects the newest un-referenced head in a chronological chain", () => {
    const older = parsedCheckpoint({ attemptId: UUID_A });
    const newer = parsedCheckpoint({
      attemptId: UUID_B,
      priorAttemptId: UUID_A,
      divergenceReason: "content changed",
      snapshot: {
        ...(validCheckpoint().snapshot as Record<string, unknown>),
        snapshotId: SHA_TWO,
        frozenAt: "2026-08-08T11:00:00.000Z",
      },
    });
    expect(selectCurrentCheckpoint([older, newer])).toBe(newer);
  });

  it("selects the checkpoint with the greatest frozenAt among independent heads", () => {
    const later = parsedCheckpoint({
      attemptId: UUID_B,
      snapshot: {
        ...(validCheckpoint().snapshot as Record<string, unknown>),
        snapshotId: SHA_TWO,
        frozenAt: "2026-08-08T12:00:00.000Z",
      },
    });
    const earlier = parsedCheckpoint();
    expect(selectCurrentCheckpoint([earlier, later])).toBe(later);
  });

  it("breaks exact frozenAt ties deterministically by snapshotId", () => {
    const first = parsedCheckpoint({
      attemptId: UUID_A,
      snapshot: {
        ...(validCheckpoint().snapshot as Record<string, unknown>),
        snapshotId: SHA_ONE,
      },
    });
    const second = parsedCheckpoint({
      attemptId: UUID_B,
      snapshot: {
        ...(validCheckpoint().snapshot as Record<string, unknown>),
        snapshotId: SHA_TWO,
      },
    });
    const byDescendingSnapshotId = [first, second].sort((left, right) =>
      right.snapshot.snapshotId.localeCompare(left.snapshot.snapshotId),
    )[0];
    expect(selectCurrentCheckpoint([first, second])).toBe(
      byDescendingSnapshotId,
    );
    expect(selectCurrentCheckpoint([second, first])).toBe(
      byDescendingSnapshotId,
    );
  });

  it("falls back to the newest checkpoint when every attempt is referenced", () => {
    const first = parsedCheckpoint({ attemptId: UUID_A });
    const second = parsedCheckpoint({
      attemptId: UUID_B,
      priorAttemptId: UUID_A,
      snapshot: {
        ...(validCheckpoint().snapshot as Record<string, unknown>),
        snapshotId: SHA_TWO,
        frozenAt: "2026-08-08T11:30:00.000Z",
      },
    });
    const cyclic = parsedCheckpoint({
      attemptId: UUID_A,
      priorAttemptId: UUID_B,
    });
    expect(selectCurrentCheckpoint([cyclic, second])).toBe(second);
    expect(selectCurrentCheckpoint([first, second])).toBe(second);
  });
});

describe("parsePersistedCheckpointPointer", () => {
  it("accepts a pointer with a valid checkpoint snapshot id and writtenAt", () => {
    const result = parsePersistedCheckpointPointer({
      checkpointSnapshotId: SHA_ONE,
      writtenAt: "2026-08-08T10:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checkpointSnapshotId).toBe(SHA_ONE);
      expect(result.value.writtenAt).toBe("2026-08-08T10:00:00.000Z");
    }
  });

  it("accepts a pointer without writtenAt", () => {
    const result = parsePersistedCheckpointPointer({
      checkpointSnapshotId: SHA_ONE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.writtenAt).toBeNull();
  });

  it("rejects a non-object pointer", () => {
    const result = parsePersistedCheckpointPointer("not an object");
    expect(result.ok).toBe(false);
  });

  it("rejects a pointer without checkpointSnapshotId", () => {
    const result = parsePersistedCheckpointPointer({ writtenAt: null });
    expect(result.ok).toBe(false);
  });

  it("rejects an uppercase checkpointSnapshotId", () => {
    const result = parsePersistedCheckpointPointer({
      checkpointSnapshotId: SHA_ONE.toUpperCase(),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a checkpointSnapshotId that is not SHA-256", () => {
    const result = parsePersistedCheckpointPointer({
      checkpointSnapshotId: "not-a-sha256",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid writtenAt", () => {
    const result = parsePersistedCheckpointPointer({
      checkpointSnapshotId: SHA_ONE,
      writtenAt: "not-a-timestamp",
    });
    expect(result.ok).toBe(false);
  });
});
