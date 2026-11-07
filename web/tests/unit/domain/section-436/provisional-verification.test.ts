import { describe, expect, it } from "vitest";
import {
  createProvisionalSection436Preview,
  section436InputTemplate,
} from "../../../../src/domain/section-436/provisional-preview";
import { verifyProvisionalSection436Preview } from "../../../../src/domain/section-436/provisional-verification";
import { hashTyped } from "../../../../src/domain/manifests/canonical-json";
import {
  parseUtcTimestamp,
  parseUuid,
} from "../../../../src/domain/shared/types";

const parsed = parseUuid("00000000-0000-4000-8000-000000000001");
const other = parseUuid("00000000-0000-4000-8000-000000000002");
const parsedTime = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
if (!parsed.ok || !other.ok || !parsedTime.ok) throw new Error("Bad fixture");
const id = parsed.value,
  otherId = other.value,
  time = parsedTime.value;
const source = new TextEncoder().encode(section436InputTemplate(id));
const encode = (input: unknown) =>
  new TextEncoder().encode(JSON.stringify(input));

describe("provisional Section 436 preview verification", () => {
  it("verifies a regenerated preview and both file hashes", async () => {
    const generated = await createProvisionalSection436Preview(
      source,
      id,
      time,
    );
    const result = await verifyProvisionalSection436Preview(
      generated.bytes,
      source,
      id,
    );
    expect(result.previewFileSha256).toBe(generated.bytesSha256);
    expect(result.sourceFileSha256).toBe(generated.preview.sourceFileSha256);
    expect(result.previewContentSha256).toBe(
      generated.preview.previewContentSha256,
    );
    expect(result.evaluationStatus).toBe("blocked");
  });
  it("rejects a changed input, wrong case, malformed preview, and oversized files", async () => {
    const generated = await createProvisionalSection436Preview(
      source,
      id,
      time,
    );
    await expect(
      verifyProvisionalSection436Preview(
        generated.bytes,
        encode({ caseId: id, facts: [], rules: [] }),
        id,
      ),
    ).rejects.toThrow(/input file hash/);
    await expect(
      verifyProvisionalSection436Preview(generated.bytes, source, otherId),
    ).rejects.toThrow(/case ID/);
    await expect(
      verifyProvisionalSection436Preview(new Uint8Array([255]), source, id),
    ).rejects.toThrow(/UTF-8/);
    await expect(
      verifyProvisionalSection436Preview(
        new Uint8Array(4 * 1024 * 1024 + 1),
        source,
        id,
      ),
    ).rejects.toThrow(/too large/);
    await expect(
      verifyProvisionalSection436Preview(
        encode({ ...generated.preview, limitations: [{ nested: true }] }),
        source,
        id,
      ),
    ).rejects.toThrow(/format/);
  });
  it("rejects changed output even when the inner and outer hashes are recalculated", async () => {
    const generated = await createProvisionalSection436Preview(
      source,
      id,
      time,
    );
    const altered = structuredClone(generated.preview);
    const payload = {
      ...altered.evaluation.deterministicPayload,
      conclusionCode: "restriction-applies" as const,
    };
    const evaluation = {
      ...altered.evaluation,
      deterministicPayload: payload,
      contentSha256: await hashTyped(payload, {
        typeName: "Section436Evaluation",
      }),
    };
    const { previewContentSha256: _hash, ...outer } = {
      ...altered,
      evaluation,
    };
    expect(_hash).toBe(generated.preview.previewContentSha256);
    const forged = {
      ...outer,
      previewContentSha256: await hashTyped(outer, {
        typeName: "ProvisionalSection436Preview",
      }),
    };
    await expect(
      verifyProvisionalSection436Preview(encode(forged), source, id),
    ).rejects.toThrow(/does not match regeneration/);
  });
  it("snapshots both supplied files", async () => {
    const generated = await createProvisionalSection436Preview(
      source,
      id,
      time,
    );
    const previewBytes = new Uint8Array(generated.bytes);
    const inputBytes = new Uint8Array(source);
    const check = verifyProvisionalSection436Preview(
      previewBytes,
      inputBytes,
      id,
    );
    previewBytes.fill(0);
    inputBytes.fill(0);
    expect((await check).previewFileSha256).toBe(generated.bytesSha256);
  });
});
