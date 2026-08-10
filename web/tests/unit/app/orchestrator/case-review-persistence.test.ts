import { describe, expect, it } from "vitest";

import {
  createCaseReviewSnapshot,
  createEmptyCaseReviewState,
  parseCaseReviewPointer,
  parseCaseReviewSnapshot,
} from "../../../../src/app/orchestrator/case-review-persistence";
import {
  parseSha256,
  parseUuid,
} from "../../../../src/domain/shared/types";

const caseId = parseUuid("11111111-2222-4333-8aaa-bbbbccccdddd");
const evidenceSnapshotId = parseSha256("a".repeat(64));
if (!caseId.ok || !evidenceSnapshotId.ok) throw new Error("Invalid fixture.");

const payload = () => ({
  schemaVersion: "1.0.0" as const,
  caseId: caseId.value,
  evidenceSnapshotId: evidenceSnapshotId.value,
  ...createEmptyCaseReviewState(),
});

describe("case review persistence", () => {
  it("creates and parses a deterministic immutable review snapshot", async () => {
    const first = await createCaseReviewSnapshot(payload());
    const second = await createCaseReviewSnapshot(payload());
    expect(first.reviewSnapshotId).toBe(second.reviewSnapshotId);
    await expect(parseCaseReviewSnapshot(first)).resolves.toEqual({
      ok: true,
      value: first,
    });
  });

  it("rejects review content that no longer matches its content hash", async () => {
    const snapshot = await createCaseReviewSnapshot(payload());
    const tampered = {
      ...snapshot,
      quarantineItems: [{ artifactSha256: "not-the-original-state" }],
    };
    const parsed = await parseCaseReviewSnapshot(tampered);
    expect(parsed.ok).toBe(false);
  });

  it("accepts a pointer with only a valid review hash", async () => {
    const snapshot = await createCaseReviewSnapshot(payload());
    const parsed = parseCaseReviewPointer({
      reviewSnapshotId: snapshot.reviewSnapshotId,
      writtenAt: "2026-08-09T09:00:00.000Z",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects a pointer with an invalid hash or timestamp", () => {
    expect(parseCaseReviewPointer({ reviewSnapshotId: "invalid" }).ok).toBe(
      false,
    );
    expect(
      parseCaseReviewPointer({
        reviewSnapshotId: "b".repeat(64),
        writtenAt: "yesterday",
      }).ok,
    ).toBe(false);
  });
});
