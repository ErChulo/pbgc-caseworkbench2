import { describe, expect, it } from "vitest";

import { exactDuplicateGroups } from "../../../../src/domain/artifacts/exact-duplicates";
import type {
  ArtifactRecord,
  ReceiptRecord,
} from "../../../../src/domain/artifacts/models";
import { parseSha256, parseUuid } from "../../../../src/domain/shared/types";

const id = (digit: string) => {
  const parsed = parseUuid(
    `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`,
  );
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};
const hash = (digit: string) => {
  const parsed = parseSha256(digit.repeat(64));
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};
const artifact = (
  artifactId: ArtifactRecord["artifactId"],
  receiptId: ReceiptRecord["receiptId"],
  sha256: ArtifactRecord["sha256"],
): ArtifactRecord => ({
  artifactId,
  receiptId,
  sha256,
  attemptId: id("3"),
  caseId: id("4"),
  artifactRole: "submitted-file",
  signatureMediaType: null,
  processingStatus: "preserved",
  downstreamEligibility: "blocked",
  statusHistory: [],
});
const receipt = (
  receiptId: ReceiptRecord["receiptId"],
  sha256: ReceiptRecord["sha256"],
  name: string,
): ReceiptRecord => ({
  receiptId,
  attemptId: id("3"),
  caseId: id("4"),
  sha256,
  originalFilename: name,
  observedRelativePath: name,
  submittedBy: null,
  submittedAt: null,
  sourceLocation: null,
  transferContext: null,
  declaredDescription: null,
  parentArtifactId: null,
});

describe("T052 exact duplicate linkage", () => {
  it("groups only identical lowercase SHA-256 while retaining separate receipts", () => {
    const same = hash("a");
    const artifacts = [
      artifact(id("1"), id("5"), same),
      artifact(id("2"), id("6"), same),
      artifact(id("7"), id("8"), hash("b")),
    ];
    const result = exactDuplicateGroups(artifacts, [
      receipt(id("5"), same, "one"),
      receipt(id("6"), same, "two"),
    ]);
    expect(result).toEqual([
      {
        sha256: same,
        artifactIds: [id("1"), id("2")],
        receiptIds: [id("5"), id("6")],
      },
    ]);
    expect(
      artifacts.every((item) => item.downstreamEligibility === "blocked"),
    ).toBe(true);
  });
});
