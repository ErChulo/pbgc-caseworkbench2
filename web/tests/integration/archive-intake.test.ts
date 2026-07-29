import { describe, expect, it } from "vitest";

import {
  extractArchive,
  extractArchiveStream,
} from "../../src/adapters/parsers/archive-parser";
import { archiveFixtures } from "../fixtures/generators/archives";
import { readerFromBytes } from "../fixtures/generators/artifacts";
import { hashChunkReader } from "../../src/workers/hash.worker";
import { createContainmentEdge } from "../../src/domain/artifacts/models";
import { parseUuid } from "../../src/domain/shared/types";

const limits = {
  maxDepth: 2,
  maxMembers: 10,
  maxExpandedBytes: 1_000_000,
  maxCompressionRatio: 10_000,
};

describe("T045 bounded archive intake", () => {
  const fixtures = archiveFixtures();
  it("preserves deterministic member order and nested container bytes", () => {
    const result = extractArchive(fixtures.nested, "zip", limits);
    expect(result.outcome).toBe("success");
    expect(
      result.members.map((member) => [
        member.sequence,
        member.normalizedDisplayPath,
      ]),
    ).toEqual([
      [1, "docs/readme.txt"],
      [2, "nested/inner.zip"],
    ]);
  });
  it("extracts GZIP as one member", () => {
    expect(extractArchive(fixtures.gzip, "gzip", limits)).toMatchObject({
      outcome: "success",
      members: [{ sequence: 1 }],
    });
  });
  it("streams ZIP and GZIP through bounded chunks", async () => {
    const zip = await extractArchiveStream(
      readerFromBytes(fixtures.nested),
      "zip",
      limits,
      0,
      7,
    );
    const gzip = await extractArchiveStream(
      readerFromBytes(fixtures.gzip),
      "gzip",
      limits,
      0,
      3,
    );
    expect(zip).toMatchObject({ outcome: "success" });
    expect(zip.members).toHaveLength(2);
    expect(gzip).toMatchObject({
      outcome: "success",
      members: [{ sequence: 1 }],
    });
  });
  it("independently hashes parent and child bytes and creates exact containment lineage", async () => {
    const extracted = await extractArchiveStream(
      readerFromBytes(fixtures.nested),
      "zip",
      limits,
    );
    const parent = await hashChunkReader(readerFromBytes(fixtures.nested));
    const child = extracted.members[0];
    if (!parent.ok || child === undefined) throw new Error("fixture");
    const childHash = await hashChunkReader(readerFromBytes(child.bytes));
    const parentId = parseUuid("11111111-1111-4111-8111-111111111111");
    const childId = parseUuid("22222222-2222-4222-8222-222222222222");
    if (!childHash.ok || !parentId.ok || !childId.ok)
      throw new Error("fixture");
    const edge = await createContainmentEdge({
      parentArtifactId: parentId.value,
      childArtifactId: childId.value,
      parentSha256: parent.value.sha256,
      childSha256: childHash.value.sha256,
      observedMemberPath: child.observedMemberPath,
      normalizedDisplayPath: child.normalizedDisplayPath,
      sequence: child.sequence,
      compressedSize: null,
      expandedSize: child.expandedSize,
      crc32: null,
      extractionResult: "success",
      extractorId: "fflate",
      extractorVersion: "0.8.3",
    });
    expect(edge.edgeId).toMatch(/^[0-9a-f]{64}$/u);
    expect(edge.parentSha256).not.toBe(edge.childSha256);
  });
  it.each(["traversal", "absolute", "duplicateNormalized"] as const)(
    "blocks unsafe %s paths with no invented children",
    (name) => {
      const result = extractArchive(fixtures[name], "zip", limits);
      expect(result.outcome).toBe("blocked-limit");
      expect(result.members).toEqual([]);
    },
  );
  it("retains successful members before a limit as a partial result", () => {
    const result = extractArchive(fixtures.excessiveCount, "zip", {
      ...limits,
      maxMembers: 2,
    });
    expect(result).toMatchObject({ outcome: "blocked-limit", members: [] });
  });
  it("blocks excessive nesting and expansion ratios", () => {
    expect(extractArchive(fixtures.nested, "zip", limits, 3)).toMatchObject({
      outcome: "blocked-limit",
      members: [],
    });
    expect(
      extractArchive(fixtures.excessiveRatio, "zip", {
        ...limits,
        maxCompressionRatio: 2,
      }),
    ).toMatchObject({ outcome: "partial" });
  });
  it("fails corrupt input closed", () => {
    expect(extractArchive(fixtures.corrupt, "zip", limits)).toMatchObject({
      outcome: "corrupt",
      members: [],
    });
  });
  it("records unsupported ZIP compression without inventing members", async () => {
    const result = await extractArchiveStream(
      readerFromBytes(fixtures.unsupported),
      "zip",
      limits,
    );
    expect(result).toMatchObject({ outcome: "unsupported", members: [] });
  });
});
