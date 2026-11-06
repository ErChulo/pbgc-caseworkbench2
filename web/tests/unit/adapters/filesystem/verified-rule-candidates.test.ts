import { describe, expect, it } from "vitest";
import { verifyRuleCandidatesInWorkspace } from "../../../../src/adapters/filesystem/verified-rule-candidates";
import { inspectPassive } from "../../../../src/adapters/parsers/passive-inspection";
import { bytesReader } from "../../../../src/app/utilities/file-readers";
import { createPackageSnapshot } from "../../../../src/domain/attempts/snapshot";
import { buildEvidenceCatalog } from "../../../../src/domain/evidence/catalog";
import { extractCandidates } from "../../../../src/domain/plan-rules/candidate-extraction";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import {
  parseUuid,
  parseUtcTimestamp,
} from "../../../../src/domain/shared/types";

async function fixture(text = "Executed plan. Effective 2020-01-01.") {
  const bytes = new TextEncoder().encode(text);
  const hash = await sha256Bytes(bytes);
  const id = parseUuid("00000000-0000-4000-8000-000000000001");
  const now = parseUtcTimestamp("2026-01-01T00:00:00Z");
  if (!id.ok || !now.ok) throw new Error("Fixture metadata invalid");
  const snapshot = await createPackageSnapshot(
    [
      {
        observedRelativePath: "plan.txt",
        normalizedDisplayPath: "plan.txt",
        sha256: hash,
        sizeBytes: bytes.length,
        declaredMediaType: "text/plain",
        lastModifiedObserved: null,
      },
    ],
    { uuid: { generate: () => id.value }, clock: { now: () => now.value } },
  );
  const catalog = await buildEvidenceCatalog({
    catalogId: id.value,
    caseId: id.value,
    builtAt: now.value,
    caseEvidence: [
      {
        artifactId: id.value,
        sha256: hash,
        sizeBytes: bytes.length,
        locator: "plan.txt",
        mediaType: "text/plain",
        receiptId: id.value,
        receiptIds: [id.value],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "executed-plan-document",
        reviewStatus: "released",
        importedAt: now.value,
      },
    ],
    referenceOnly: [],
    excludedQuarantined: [],
  });
  if (!catalog.ok) throw new Error(catalog.error.message);
  const extracted = await extractCandidates(
    hash,
    inspectPassive("plan.txt", bytes),
  );
  if (!extracted.ok) throw new Error(extracted.error.message);
  const workspace = {
    openChunkReader: () =>
      Promise.resolve({ ok: true as const, value: bytesReader(bytes) }),
  };
  return {
    bytes,
    hash,
    snapshot,
    catalog: catalog.value,
    candidates: extracted.value.candidates,
    workspace,
  };
}

describe("case-bound rule source verification", () => {
  it("reconstructs a selected case candidate from current source bytes", async () => {
    const request = await fixture();
    expect(await verifyRuleCandidatesInWorkspace(request)).toEqual({
      ok: true,
    });
    const candidate = request.candidates[0];
    if (!candidate) throw new Error("Missing candidate");
    expect(
      await verifyRuleCandidatesInWorkspace({
        ...request,
        candidates: [{ ...candidate, verbatimText: "Changed" }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("blocks changed source bytes and invalid or missing snapshot membership", async () => {
    const request = await fixture();
    const modified = request.bytes.slice();
    modified[0] = (modified[0] ?? 0) ^ 1;
    const workspace = {
      openChunkReader: () =>
        Promise.resolve({ ok: true as const, value: bytesReader(modified) }),
    };
    expect(
      await verifyRuleCandidatesInWorkspace({ ...request, workspace }),
    ).toMatchObject({
      ok: false,
      message: "The preserved source bytes do not match the candidate.",
    });
    expect(
      await verifyRuleCandidatesInWorkspace({
        ...request,
        snapshot: { ...request.snapshot, entries: [] },
      }),
    ).toMatchObject({
      ok: false,
      message: "The current evidence snapshot is invalid.",
    });
    const empty = await createPackageSnapshot([], {
      uuid: { generate: () => request.snapshot.snapshotRecordId },
      clock: { now: () => request.snapshot.frozenAt },
    });
    expect(
      await verifyRuleCandidatesInWorkspace({ ...request, snapshot: empty }),
    ).toMatchObject({
      ok: false,
      message: "The selected source is not in the current evidence snapshot.",
    });
  });

  it("does not promote worked examples into governing rule evidence", async () => {
    const request = await fixture(
      "Formula: benefit = pay * 0.015. Example: $100,000 * 0.015 = $1,500.",
    );
    const example = request.candidates.find((candidate) =>
      candidate.artifactLocator.includes("example-offset"),
    );
    if (!example) throw new Error("Missing worked example");
    expect(
      await verifyRuleCandidatesInWorkspace({
        ...request,
        candidates: [example],
      }),
    ).toMatchObject({
      ok: false,
      message:
        "A selected candidate is not an eligible exact match for the current source inspection.",
    });
  });
});
