import { describe, expect, it } from "vitest";
import {
  listProvisionalOracleCandidates,
  preserveProvisionalOracle,
  readProvisionalOracle,
} from "../../../../src/adapters/filesystem/provisional-oracle-workspace";
import type { ChunkReaderPort } from "../../../../src/domain/ports";
import { parseUuid } from "../../../../src/domain/shared/types";
import type { V1Workbook } from "../../../../src/domain/workbook-builder/models";
import { computeWorkbookContentHash } from "../../../../src/domain/workbook-builder/workbook-hash";
import { bytesReader } from "../../../../src/app/utilities/file-readers";

const parsed = parseUuid("00000000-0000-4000-8000-000000000001");
if (!parsed.ok) throw new Error("Invalid case fixture");
const caseId = parsed.value;
class Workspace {
  readonly files = new Map<string, Uint8Array>();
  failWrites = false;
  openChunkReader(path: string) {
    const bytes = this.files.get(path);
    return Promise.resolve(
      bytes === undefined
        ? { ok: false as const, error: { code: "NOT_FOUND" as const } }
        : { ok: true as const, value: bytesReader(bytes) },
    );
  }
  createDirectory(path: string) {
    return Promise.resolve({
      ok: true as const,
      value: {
        relativePath: path,
        kind: "directory" as const,
        sizeBytes: null,
      },
    });
  }
  async createImmutable(
    path: string,
    source: ChunkReaderPort<{ readonly code: "NOT_FOUND" }>,
  ) {
    if (this.failWrites || this.files.has(path))
      return { ok: false as const, error: { code: "NOT_FOUND" as const } };
    const chunk = await source.read({
      offsetBytes: 0,
      lengthBytes: source.sizeBytes,
    });
    if (!chunk.ok)
      return { ok: false as const, error: { code: "NOT_FOUND" as const } };
    this.files.set(path, chunk.value.bytes.slice());
    return {
      ok: true as const,
      value: { relativePath: path, sizeBytes: chunk.value.bytes.length },
    };
  }
}
async function fixture() {
  const draft = {
    caseId,
    workbookContentSha256: "0".repeat(64),
    buildSpecContentSha256: "a".repeat(64),
    populationProfileContentSha256: "b".repeat(64),
    formulaCells: [{ formulaId: "f1", cellAddress: "A1" }],
  } as unknown as V1Workbook;
  const workbook = {
    ...draft,
    workbookContentSha256: await computeWorkbookContentHash(draft),
  };
  const workspace = new Workspace();
  workspace.files.set(
    `cases/${caseId}/case.json`,
    new TextEncoder().encode(JSON.stringify({ caseId, status: "active" })),
  );
  return {
    workspace,
    caseId,
    workbook,
    sourceBytes: new TextEncoder().encode(
      JSON.stringify({ formulaId: "f1", cellAddress: "A1", value: 0 }),
    ),
    format: "workbench-jsonl-v1" as const,
  };
}

describe("local provisional oracle workspace", () => {
  it("lists only case-scoped syntactic hash candidates, never verified evidence", async () => {
    const input = await fixture();
    const base = `cases/${caseId}/evidence/provisional-oracles`;
    const entries = [
      {
        relativePath: `${base}/${"b".repeat(64)}`,
        kind: "directory" as const,
        sizeBytes: null,
      },
      {
        relativePath: `${base}/${"a".repeat(64)}`,
        kind: "directory" as const,
        sizeBytes: null,
      },
      {
        relativePath: `${base}/other`,
        kind: "directory" as const,
        sizeBytes: null,
      },
      {
        relativePath: `${base}/${"c".repeat(64)}`,
        kind: "file" as const,
        sizeBytes: 0,
      },
      {
        relativePath: `cases/other/evidence/provisional-oracles/${"d".repeat(64)}`,
        kind: "directory" as const,
        sizeBytes: null,
      },
    ];
    const workspace = {
      openChunkReader: input.workspace.openChunkReader.bind(input.workspace),
      list: () => Promise.resolve({ ok: true as const, value: entries }),
    };
    expect(await listProvisionalOracleCandidates(workspace, caseId)).toEqual({
      ok: true,
      hashes: ["a".repeat(64), "b".repeat(64)],
      ignoredEntries: 3,
    });
    const absent = {
      ...workspace,
      list: () =>
        Promise.resolve({ ok: false as const, error: { code: "NOT_FOUND" } }),
    };
    expect(await listProvisionalOracleCandidates(absent, caseId)).toEqual({
      ok: true,
      hashes: [],
      ignoredEntries: 0,
    });
    const denied = {
      ...workspace,
      list: () =>
        Promise.resolve({ ok: false as const, error: { code: "READ_FAILED" } }),
    };
    expect((await listProvisionalOracleCandidates(denied, caseId)).ok).toBe(
      false,
    );
    const firstEntry = entries[0];
    if (firstEntry === undefined) throw new Error("Missing listing fixture");
    const capped = {
      ...workspace,
      list: () =>
        Promise.resolve({
          ok: false as const,
          error: { code: "TOO_MANY_ENTRIES" },
        }),
    };
    expect(await listProvisionalOracleCandidates(capped, caseId)).toEqual({
      ok: false,
      message:
        "There are too many entries to list safely. Use a known proposal hash.",
    });
    const duplicate = {
      ...workspace,
      list: () =>
        Promise.resolve({
          ok: true as const,
          value: [firstEntry, firstEntry],
        }),
    };
    expect((await listProvisionalOracleCandidates(duplicate, caseId)).ok).toBe(
      false,
    );
    const tooMany = {
      ...workspace,
      list: () =>
        Promise.resolve({
          ok: true as const,
          value: Array.from({ length: 257 }, () => firstEntry),
        }),
    };
    expect((await listProvisionalOracleCandidates(tooMany, caseId)).ok).toBe(
      false,
    );
  });
  it("does not report an empty list when the case changes during enumeration", async () => {
    const input = await fixture();
    const workspace = {
      openChunkReader: input.workspace.openChunkReader.bind(input.workspace),
      list: () => {
        input.workspace.files.delete(`cases/${caseId}/case.json`);
        return Promise.resolve({
          ok: false as const,
          error: { code: "NOT_FOUND" },
        });
      },
    };
    expect((await listProvisionalOracleCandidates(workspace, caseId)).ok).toBe(
      false,
    );
  });
  it("preserves exact source and proposal under the case and verifies restoration", async () => {
    const input = await fixture();
    const saved = await preserveProvisionalOracle(input);
    if (!saved.ok) throw new Error(saved.message);
    expect(saved.sourcePath.startsWith(`cases/${caseId}/`)).toBe(true);
    const stored = input.workspace.files.get(saved.sourcePath);
    if (!stored) throw new Error("Source missing");
    expect(Array.from(stored)).toEqual(Array.from(input.sourceBytes));
    expect(
      await readProvisionalOracle(
        input.workspace,
        caseId,
        saved.evidence.evidenceContentSha256,
        input.workbook,
      ),
    ).toEqual(saved);
    expect(await preserveProvisionalOracle(input)).toEqual(saved);
  });
  it("blocks missing, inactive or mismatched cases before saving", async () => {
    const input = await fixture();
    const path = `cases/${caseId}/case.json`;
    for (const record of [
      null,
      { caseId, status: "closed" },
      { caseId: "other", status: "active" },
    ]) {
      if (record === null) input.workspace.files.delete(path);
      else
        input.workspace.files.set(
          path,
          new TextEncoder().encode(JSON.stringify(record)),
        );
      expect((await preserveProvisionalOracle(input)).ok).toBe(false);
    }
  });
  it("fails closed on changed source, proposal, workbook or missing bytes", async () => {
    const input = await fixture();
    const saved = await preserveProvisionalOracle(input);
    if (!saved.ok) throw new Error(saved.message);
    const original = input.workspace.files.get(saved.sourcePath);
    if (!original) throw new Error("Source missing");
    const changed = original.slice();
    changed[0] = (changed[0] ?? 0) ^ 1;
    input.workspace.files.set(saved.sourcePath, changed);
    expect(
      (
        await readProvisionalOracle(
          input.workspace,
          caseId,
          saved.evidence.evidenceContentSha256,
          input.workbook,
        )
      ).ok,
    ).toBe(false);
    expect((await preserveProvisionalOracle(input)).ok).toBe(false);
    input.workspace.files.set(saved.sourcePath, original);
    expect(
      (
        await readProvisionalOracle(
          input.workspace,
          caseId,
          saved.evidence.evidenceContentSha256,
          { ...input.workbook, formulaCells: [] },
        )
      ).ok,
    ).toBe(false);
    input.workspace.files.set(
      saved.proposalPath,
      new TextEncoder().encode("{}"),
    );
    expect(
      (
        await readProvisionalOracle(
          input.workspace,
          caseId,
          saved.evidence.evidenceContentSha256,
          input.workbook,
        )
      ).ok,
    ).toBe(false);
    input.workspace.files.delete(saved.sourcePath);
    expect(
      (
        await readProvisionalOracle(
          input.workspace,
          caseId,
          saved.evidence.evidenceContentSha256,
          input.workbook,
        )
      ).ok,
    ).toBe(false);
  });
  it("rejects a source changed while a saved proposal is being reconstructed", async () => {
    const input = await fixture();
    const saved = await preserveProvisionalOracle(input);
    if (!saved.ok) throw new Error(saved.message);
    const originalOpen = input.workspace.openChunkReader.bind(input.workspace);
    let changed = false;
    input.workspace.openChunkReader = (path) => {
      const result = originalOpen(path);
      if (path === saved.sourcePath && !changed) {
        changed = true;
        const bytes = input.workspace.files.get(path)?.slice();
        if (!bytes) throw new Error("Source missing");
        bytes[0] = (bytes[0] ?? 0) ^ 1;
        input.workspace.files.set(path, bytes);
      }
      return result;
    };
    expect(
      (
        await readProvisionalOracle(
          input.workspace,
          caseId,
          saved.evidence.evidenceContentSha256,
          input.workbook,
        )
      ).ok,
    ).toBe(false);
  });
  it("blocks saving if the local case becomes inactive during directory creation", async () => {
    const input = await fixture();
    const original = input.workspace.createDirectory.bind(input.workspace);
    input.workspace.createDirectory = (path) => {
      input.workspace.files.set(
        `cases/${caseId}/case.json`,
        new TextEncoder().encode(JSON.stringify({ caseId, status: "closed" })),
      );
      return original(path);
    };
    expect((await preserveProvisionalOracle(input)).ok).toBe(false);
    expect(
      [...input.workspace.files.keys()].some((path) =>
        path.endsWith("source.bin"),
      ),
    ).toBe(false);
  });
  it("reports write failures without fabricating a proposal", async () => {
    const input = await fixture();
    input.workspace.failWrites = true;
    expect((await preserveProvisionalOracle(input)).ok).toBe(false);
  });
});
