import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { EvidenceWorkspace } from "../../../../src/adapters/filesystem/evidence-workspace";
import { buildEvidenceCatalog } from "../../../../src/domain/evidence/catalog";
import { issueOverride } from "../../../../src/domain/plan-rules/authority-override";
import {
  createUnresolvedItem,
  resolveItem,
} from "../../../../src/domain/plan-rules/unresolved-items";
import {
  candidate,
  citation,
  human,
  rule,
  sha,
} from "../../domain/plan-rules/governed-fixtures";

const roots: string[] = [];
const caseId = "00000000-0000-4000-8000-000000000002";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "pbgc-evidence-workspace-"));
  roots.push(path);
  return path;
}

async function catalog() {
  const result = await buildEvidenceCatalog({
    catalogId: "00000000-0000-4000-8000-000000000001",
    caseId,
    builtAt: "2026-07-28T12:00:00.000Z",
    caseEvidence: [
      {
        artifactId: "00000000-0000-4000-8000-000000000003",
        sha256: "a".repeat(64),
        sizeBytes: 10,
        locator: "synthetic/plan.txt",
        mediaType: "text/plain",
        receiptId: "00000000-0000-4000-8000-000000000004",
        receiptIds: ["00000000-0000-4000-8000-000000000004"],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "executed-plan-document",
        reviewStatus: "released",
        importedAt: "2026-07-28T11:00:00.000Z",
      },
    ],
    referenceOnly: [
      {
        artifactId: "00000000-0000-4000-8000-000000000005",
        sha256: "b".repeat(64),
        sizeBytes: 12,
        locator: "synthetic/regulation.txt",
        mediaType: "text/plain",
        receiptId: "00000000-0000-4000-8000-000000000006",
        receiptIds: ["00000000-0000-4000-8000-000000000006"],
        exactDuplicateOfSha256: null,
        containedBySha256: null,
        sourceRole: "regulation",
        reviewStatus: "released",
        importedAt: "2026-07-28T11:00:00.000Z",
      },
    ],
    excludedQuarantined: [],
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("EvidenceWorkspace", () => {
  it("validates a case UUID before creating any case path", async () => {
    const workspaceRoot = await root();
    const result = await EvidenceWorkspace.open(workspaceRoot, "../../escape");
    expect(result.ok).toBe(false);
    await expect(access(join(workspaceRoot, "cases"))).rejects.toThrow();
  });

  it("persists an immutable catalog atomically with owner-only permissions", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    const value = await catalog();

    expect(await opened.value.writeCatalog(value)).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await opened.value.readCatalog()).ok).toBe(true);
    expect((await opened.value.writeCatalog(value)).ok).toBe(false);

    const evidencePath = join(workspaceRoot, "cases", caseId, "evidence");
    expect((await stat(evidencePath)).mode & 0o777).toBe(0o700);
    expect((await stat(join(evidencePath, "catalog.json"))).mode & 0o777).toBe(
      0o600,
    );
    expect(
      (await readFile(join(evidencePath, "catalog.json"), "utf8")).endsWith(
        "\n",
      ),
    ).toBe(true);
  });

  it("validates unknown JSON instead of casting it on read", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    await writeFile(join(opened.value.workspacePath, "catalog.json"), "{}\n", {
      mode: 0o600,
    });
    const result = await opened.value.readCatalog();
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain("contract validation failed");
  });

  it("appends and validates governed JSONL records with owner-only atomic files", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    expect((await opened.value.writeCatalog(await catalog())).ok).toBe(true);
    const unresolved = await createUnresolvedItem(
      {
        kind: "ambiguous-text",
        affectedScope: "benefit/monthly",
        competingInterpretations: [
          {
            interpretationId: "00000000-0000-4000-8000-000000000410" as never,
            statement: "A",
            evidence: [citation],
            sourceCandidateId: null,
          },
          {
            interpretationId: "00000000-0000-4000-8000-000000000411" as never,
            statement: "B",
            evidence: [citation],
            sourceCandidateId: null,
          },
        ],
        consequence: "Synthetic benefit differs.",
        reviewer: human,
      },
      {
        uuid: () => "00000000-0000-4000-8000-000000000412",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    const override = await issueOverride(
      caseId,
      "benefit/monthly",
      "regulation",
      sha("b"),
      "Synthetic authority determination.",
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000413",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    if (!unresolved.ok || !override.ok)
      throw new Error("Synthetic governed fixture failed.");

    expect((await opened.value.appendCandidates([await candidate()])).ok).toBe(
      true,
    );
    expect((await opened.value.appendRules([await rule()])).ok).toBe(true);
    expect((await opened.value.appendUnresolved([unresolved.value])).ok).toBe(
      true,
    );
    expect((await opened.value.appendOverrides([override.value])).ok).toBe(
      true,
    );
    expect((await opened.value.readCandidates()).ok).toBe(true);
    expect((await opened.value.readRules()).ok).toBe(false);
    expect((await opened.value.readUnresolved()).ok).toBe(true);
    expect((await opened.value.readOverrides()).ok).toBe(true);

    for (const file of [
      "provision-candidates.jsonl",
      "rule-records.jsonl",
      "unresolved-items.jsonl",
      "authority-overrides.jsonl",
    ]) {
      expect(
        (await stat(join(opened.value.workspacePath, file))).mode & 0o777,
      ).toBe(0o600);
    }
  });

  it("rejects a tampered canonical content hash on JSONL read", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    const value = await candidate();
    await writeFile(
      join(opened.value.workspacePath, "provision-candidates.jsonl"),
      `${JSON.stringify({ ...value, candidateContentSha256: "f".repeat(64) })}\n`,
      { mode: 0o600 },
    );
    const result = await opened.value.readCandidates();
    expect(result).toMatchObject({
      ok: false,
      error: "Provision candidate content hash is invalid.",
    });
  });

  it("rejects tampered human approval fields during rule replay", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    expect((await opened.value.writeCatalog(await catalog())).ok).toBe(true);
    const governed = await rule();
    await writeFile(
      join(opened.value.workspacePath, "rule-records.jsonl"),
      `${JSON.stringify({
        ...governed,
        authorHuman: { ...governed.authorHuman, actorKey: "tampered-reviewer" },
      })}\n`,
      { mode: 0o600 },
    );
    expect((await opened.value.readRules()).ok).toBe(false);
  });

  it("authenticates override hashes and case relation during workspace replay", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    expect((await opened.value.writeCatalog(await catalog())).ok).toBe(true);
    const valid = await issueOverride(
      caseId,
      "benefit/monthly",
      "regulation",
      sha("b"),
      "Synthetic determination.",
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000430",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    if (!valid.ok) throw new Error(valid.error);
    const path = join(opened.value.workspacePath, "authority-overrides.jsonl");
    await writeFile(
      path,
      `${JSON.stringify({ ...valid.value, scopeRationale: "Tampered" })}\n`,
      { mode: 0o600 },
    );
    expect((await opened.value.readOverrides()).ok).toBe(false);

    const wrongCase = await issueOverride(
      "00000000-0000-4000-8000-000000000431",
      "benefit/monthly",
      "regulation",
      sha("b"),
      "Wrong case determination.",
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000432",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    if (!wrongCase.ok) throw new Error(wrongCase.error);
    await writeFile(path, `${JSON.stringify(wrongCase.value)}\n`, {
      mode: 0o600,
    });
    expect((await opened.value.readOverrides()).ok).toBe(false);
  });

  it("serializes concurrent JSONL appends without losing either update", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    const first = await candidate("Synthetic provision A.");
    const second = await candidate("Synthetic provision B.");
    const results = await Promise.all([
      opened.value.appendCandidates([first]),
      opened.value.appendCandidates([second]),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const replay = await opened.value.readCandidates();
    expect(replay.ok && replay.value).toHaveLength(2);
  });

  it("persists unresolved lifecycle revisions as extending append-only records", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    const created = await createUnresolvedItem(
      {
        kind: "ambiguous-text",
        affectedScope: "benefit/monthly",
        competingInterpretations: [
          {
            interpretationId: "00000000-0000-4000-8000-000000000420" as never,
            statement: "A",
            evidence: [citation],
            sourceCandidateId: null,
          },
          {
            interpretationId: "00000000-0000-4000-8000-000000000421" as never,
            statement: "B",
            evidence: [citation],
            sourceCandidateId: null,
          },
        ],
        consequence: "Synthetic consequence.",
        reviewer: human,
      },
      {
        uuid: () => "00000000-0000-4000-8000-000000000422",
        now: () => "2026-07-28T12:00:00.000Z",
      },
    );
    if (!created.ok) throw new Error(created.error);
    const resolved = await resolveItem(
      created.value,
      "accept",
      created.value.competingInterpretations[0]?.interpretationId ?? null,
      "Synthetic resolution.",
      human,
      {
        uuid: () => "00000000-0000-4000-8000-000000000423",
        now: () => "2026-07-28T13:00:00.000Z",
      },
    );
    if (!resolved.ok) throw new Error(resolved.error);
    expect((await opened.value.appendUnresolved([created.value])).ok).toBe(
      true,
    );
    expect(
      (await opened.value.appendUnresolved([resolved.value.item])).ok,
    ).toBe(true);
    const replay = await opened.value.readUnresolved();
    expect(replay.ok && replay.value).toHaveLength(2);
  });

  it("rejects final-component symlinks and workspace substitution after open", async () => {
    const workspaceRoot = await root();
    const opened = await EvidenceWorkspace.open(workspaceRoot, caseId);
    if (!opened.ok) throw new Error(opened.error);
    const external = join(workspaceRoot, "external.jsonl");
    await writeFile(external, "", { mode: 0o600 });
    await symlink(
      external,
      join(opened.value.workspacePath, "provision-candidates.jsonl"),
    );
    expect((await opened.value.readCandidates()).ok).toBe(false);

    await rm(join(opened.value.workspacePath, "provision-candidates.jsonl"));
    const moved = `${opened.value.workspacePath}.original`;
    await rename(opened.value.workspacePath, moved);
    await mkdir(opened.value.workspacePath, { mode: 0o700 });
    expect((await opened.value.readCandidates()).ok).toBe(false);
  });
});
