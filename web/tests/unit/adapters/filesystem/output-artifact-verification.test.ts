import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isCaseOutputPath,
  verifyOutputArtifactReferences,
} from "../../../../src/adapters/filesystem/output-artifact-verification";
import type { CaseworkOutputArtifactInput } from "../../../../src/domain/case-output/models";
import type { ChunkReaderPort } from "../../../../src/domain/ports";
import { parseSha256, parseUuid } from "../../../../src/domain/shared/types";

const caseIdResult = parseUuid("00000000-0000-4000-8000-000000000001");
if (!caseIdResult.ok) throw new Error("Bad fixture case");
const caseId = caseIdResult.value;
const prefix = `cases/${caseId}/outputs/`;
const bytes = new TextEncoder().encode("synthetic artifact");
const digest = parseSha256(createHash("sha256").update(bytes).digest("hex"));
if (!digest.ok) throw new Error("Bad fixture hash");
const sha = digest.value;
function artifact(path: string | null): CaseworkOutputArtifactInput {
  return {
    artifactType: "build-spec",
    artifactId: "synthetic",
    contentSha256: sha,
    mediaType: "application/json",
    storagePath: path,
    description: "synthetic",
  };
}
function reader(data: Uint8Array): ChunkReaderPort<string> {
  return {
    sizeBytes: data.length,
    read: ({ offsetBytes, lengthBytes }) =>
      Promise.resolve({
        ok: true,
        value: {
          offsetBytes,
          bytes: data.slice(offsetBytes, offsetBytes + lengthBytes),
          endOfSource: offsetBytes + lengthBytes >= data.length,
        },
      }),
  };
}
describe("output artifact byte verification", () => {
  it("accepts only normalized paths inside the selected case", () => {
    expect(isCaseOutputPath(`${prefix}spec.json`, caseId)).toBe(true);
    for (const path of [
      null,
      "",
      `cases/${caseId}/`,
      `${prefix}../other`,
      `${prefix}a//b`,
      `cases/${caseId}0/outputs/spec.json`,
      "/absolute",
      "cases/other/outputs/spec.json",
    ]) {
      expect(isCaseOutputPath(path, caseId)).toBe(false);
    }
  });
  it("verifies matching bytes and rejects changed, missing, unreadable or outside-case files", async () => {
    const workspace = {
      openChunkReader: (path: string) => {
        if (path.endsWith("throw"))
          return Promise.reject(new Error("read failure"));
        if (path.endsWith("missing"))
          return Promise.resolve({ ok: false as const, error: "missing" });
        return Promise.resolve({
          ok: true as const,
          value: reader(
            path.endsWith("changed")
              ? new TextEncoder().encode("changed")
              : bytes,
          ),
        });
      },
    };
    const valid = artifact(`${prefix}valid`);
    const rejected = [
      artifact(`${prefix}changed`),
      artifact(`${prefix}missing`),
      artifact(`${prefix}throw`),
      artifact("cases/other/outputs/a"),
      artifact(null),
    ];
    const result = await verifyOutputArtifactReferences(workspace, caseId, [
      valid,
      ...rejected,
    ]);
    expect(result.verified).toEqual([valid]);
    expect(result.rejected).toEqual(rejected);
  });
  it("rejects a reader that fails while hashing", async () => {
    const broken = artifact(`${prefix}broken`);
    const result = await verifyOutputArtifactReferences(
      {
        openChunkReader: () =>
          Promise.resolve({
            ok: true as const,
            value: {
              sizeBytes: 1,
              read: () =>
                Promise.resolve({ ok: false as const, error: "read error" }),
            },
          }),
      },
      caseId,
      [broken],
    );
    expect(result.verified).toEqual([]);
    expect(result.rejected).toEqual([broken]);
  });
  it("rejects an invalid size even when the claimed hash is the empty digest", async () => {
    const emptyDigest = parseSha256(
      createHash("sha256").update("").digest("hex"),
    );
    if (!emptyDigest.ok) throw new Error("Bad empty digest");
    const invalid = {
      ...artifact(`${prefix}invalid-size`),
      contentSha256: emptyDigest.value,
    };
    const result = await verifyOutputArtifactReferences(
      {
        openChunkReader: () =>
          Promise.resolve({
            ok: true as const,
            value: {
              sizeBytes: NaN,
              read: () => {
                throw new Error("Unexpected read");
              },
            },
          }),
      },
      caseId,
      [invalid],
    );
    expect(result.verified).toEqual([]);
    expect(result.rejected).toEqual([invalid]);
  });
  it("handles an empty list without opening anything", async () => {
    const result = await verifyOutputArtifactReferences(
      {
        openChunkReader: () => {
          throw new Error("unexpected");
        },
      },
      caseId,
      [],
    );
    expect(result).toEqual({ verified: [], rejected: [] });
  });
});
