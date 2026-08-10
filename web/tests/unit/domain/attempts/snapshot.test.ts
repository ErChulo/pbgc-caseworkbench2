import { describe, expect, it } from "vitest";

import {
  createPackageSnapshot,
  compareSnapshots,
  computePackageSnapshotId,
} from "../../../../src/domain/attempts/snapshot";
import { planResume } from "../../../../src/domain/attempts/resume";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";
import { hashChunkReader } from "../../../../src/workers/hash.worker";
import {
  deterministicBytes,
  readerFromBytes,
} from "../../../fixtures/generators/artifacts";

const sha = (value: string) => {
  const parsed = parseSha256(value.repeat(64));
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};
const uuid = (value: string) => {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};
const time = parseUtcTimestamp("2026-07-25T16:00:00.000Z");
if (!time.ok) throw new Error("fixture");
const deps = {
  uuid: { generate: () => uuid("11111111-1111-4111-8111-111111111111") },
  clock: { now: () => time.value },
};

const entry = (path: string, digest = sha("a")) => ({
  observedRelativePath: path,
  normalizedDisplayPath: path,
  sha256: digest,
  sizeBytes: 1,
  declaredMediaType: null,
  lastModifiedObserved: null,
});

describe("T044 snapshots and deterministic resume", () => {
  it("uses lowercase SHA-256 identity independent of operational UUID/time", async () => {
    const one = await createPackageSnapshot([entry("b"), entry("a")], deps);
    const other = await createPackageSnapshot([entry("a"), entry("b")], {
      uuid: { generate: () => uuid("22222222-2222-4222-8222-222222222222") },
      clock: deps.clock,
    });
    expect(one.snapshotId).toBe(other.snapshotId);
    expect(one.snapshotRecordId).not.toBe(other.snapshotRecordId);
    expect(one.snapshotId).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("recomputes the deterministic identity from persisted entries", async () => {
    const snapshot = await createPackageSnapshot(
      [entry("second"), entry("first")],
      deps,
    );
    await expect(computePackageSnapshotId(snapshot.entries)).resolves.toBe(
      snapshot.snapshotId,
    );
  });

  it.each([
    [["a"], ["a", "b"], "added"],
    [["a", "b"], ["a"], "removed"],
    [["a"], ["renamed"], "renamed"],
  ] as const)("detects %s -> %s as %s", async (before, after, expected) => {
    const prior = await createPackageSnapshot(
      before.map((path) => entry(path)),
      deps,
    );
    const current = await createPackageSnapshot(
      after.map((path) => entry(path)),
      deps,
    );
    expect(compareSnapshots(prior, current)).toBe(expected);
  });

  it("resumes only an unchanged interrupted attempt and links changed attempts", async () => {
    const priorSnapshot = await createPackageSnapshot([entry("a")], deps);
    const attempt = {
      attemptId: uuid("33333333-3333-4333-8333-333333333333"),
      caseId: uuid("44444444-4444-4444-8444-444444444444"),
      priorAttemptId: null,
      divergenceReason: null,
      initiatedBy: "synthetic",
      startedAt: time.value,
      endedAt: null,
      sourceContext: {},
      snapshotId: priorSnapshot.snapshotId,
      snapshotRecordId: priorSnapshot.snapshotRecordId,
      status: "interrupted" as const,
      statusHistory: [],
      ruleSetVersion: "1",
    };
    expect(planResume(attempt, priorSnapshot, priorSnapshot, deps)).toEqual({
      kind: "resume",
      attempt,
    });
    const changed = await createPackageSnapshot([entry("a", sha("b"))], deps);
    expect(planResume(attempt, priorSnapshot, changed, deps)).toMatchObject({
      kind: "linked",
      attempt: {
        priorAttemptId: attempt.attemptId,
        divergenceReason: "changed",
      },
    });
  });

  it("detects a source that mutates between deterministic reads", async () => {
    const source = readerFromBytes(deterministicBytes(32), true);
    const first = await hashChunkReader(source, { chunkSizeBytes: 8 });
    const second = await hashChunkReader(source, { chunkSizeBytes: 8 });
    expect(first.ok && second.ok && first.value.sha256).not.toBe(
      second.ok ? second.value.sha256 : null,
    );
  });
});
