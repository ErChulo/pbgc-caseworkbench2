import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";

import { validateContract } from "../../contracts/schema-validator";
import { catalogContentSha256 } from "../../domain/evidence/catalog";
import type { EvidenceCatalog } from "../../domain/evidence/models";
import { canonicalize } from "../../domain/manifests/canonical-json";
import { hashTyped } from "../../domain/manifests/canonical-json";
import {
  effectiveAuthorityOverrides,
  validateAuthorityOverride,
} from "../../domain/plan-rules/authority-override";
import { getSupersessionChain } from "../../domain/plan-rules/authority-service";
import {
  validateRuleGovernance,
  validateRuleRecord,
  validateRuleUnresolvedBlockers,
} from "../../domain/plan-rules/rule-authoring";
import { projectLatestUnresolvedItems } from "../../domain/plan-rules/unresolved-items";
import type {
  AuthorityOverride,
  PlanRuleRecord,
  ProvisionCandidate,
  UnresolvedItem,
} from "../../domain/plan-rules/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../../domain/shared/types";

const directoryMode = 0o700;
const fileMode = 0o600;
const catalogPointerSchemaVersion = "1.0.0" as const;
const catalogDirectoryName = "catalogs";
const catalogPointerName = "current.json";

const files = {
  candidates: "provision-candidates.jsonl",
  rules: "rule-records.jsonl",
  unresolved: "unresolved-items.jsonl",
  overrides: "authority-overrides.jsonl",
} as const;

type EvidenceLogFile = (typeof files)[keyof typeof files];

interface CatalogPointer {
  readonly schemaVersion: typeof catalogPointerSchemaVersion;
  readonly catalogContentSha256: Sha256;
  readonly writtenAt: UtcTimestamp;
}

interface CatalogDirectoryIdentity {
  readonly path: string;
  readonly device: bigint;
  readonly inode: bigint;
}

export class EvidenceWorkspace {
  private constructor(
    readonly workspacePath: string,
    readonly caseId: Uuid,
    private readonly workspaceDevice: bigint,
    private readonly workspaceInode: bigint,
  ) {}

  static async open(
    workspaceRoot: string,
    caseId: string,
  ): Promise<Result<EvidenceWorkspace, string>> {
    const parsedCaseId = parseUuid(caseId);
    if (!parsedCaseId.ok) return fail(parsedCaseId.error.message);

    try {
      const root = resolve(workspaceRoot);
      await secureDirectory(root);
      const canonicalRoot = await realpath(root);
      const casesPath = join(canonicalRoot, "cases");
      const casePath = join(casesPath, parsedCaseId.value);
      const evidencePath = join(casePath, "evidence");
      for (const path of [casesPath, casePath, evidencePath]) {
        await secureDirectory(path);
        await assertNoSymlink(path);
      }
      const canonicalEvidencePath = await realpath(evidencePath);
      if (!isWithin(canonicalRoot, canonicalEvidencePath)) {
        return fail("The case evidence path escapes the selected workspace.");
      }
      const identity = await lstat(canonicalEvidencePath, { bigint: true });
      return {
        ok: true,
        value: new EvidenceWorkspace(
          canonicalEvidencePath,
          parsedCaseId.value,
          identity.dev,
          identity.ino,
        ),
      };
    } catch (error) {
      return fail(`Failed to open evidence workspace: ${errorMessage(error)}`);
    }
  }

  async writeCatalog(
    catalog: EvidenceCatalog,
    pointerWrittenAt = new Date().toISOString(),
  ): Promise<Result<void, string>> {
    if (catalog.caseId !== this.caseId) {
      return fail("Catalog caseId does not match the evidence workspace.");
    }
    const validation = validateContract("evidenceCatalog", catalog);
    if (!validation.valid) return fail(formatValidation(validation.issues));

    const { catalogContentSha256: expected, ...content } = catalog;
    if ((await catalogContentSha256(content)) !== expected) {
      return fail(
        "Catalog content hash does not match its deterministic payload.",
      );
    }
    const writtenAt = parseUtcTimestamp(pointerWrittenAt);
    if (!writtenAt.ok) {
      return fail("Catalog pointer write timestamp is invalid.");
    }

    const bytes = encodeJson(catalog);
    let release: (() => Promise<void>) | null = null;
    try {
      release = await acquireLock(join(this.workspacePath, ".evidence.lock"));
      await this.assertStable();
      const directory = await this.openCatalogDirectory(true);
      const existing = await this.readCurrentCatalog(directory, true);
      if (!existing.ok) return existing;
      if (
        existing.value !== null &&
        existing.value.catalogId !== catalog.catalogId
      ) {
        return fail("Catalog lineage must preserve one stable catalogId.");
      }

      const snapshotPath = this.catalogSnapshotPath(
        directory,
        catalog.catalogContentSha256,
      );
      const created = await createImmutable(snapshotPath, bytes, () =>
        this.assertCatalogDirectoryStable(directory),
      );
      if (created && !(await bytesMatch(snapshotPath, bytes))) {
        return fail("Evidence catalog failed post-write verification.");
      }

      const stored = await this.readCatalogSnapshot(
        directory,
        catalog.catalogContentSha256,
      );
      if (!stored.ok) return stored;
      if (stored.value.catalogId !== catalog.catalogId) {
        return fail("Catalog snapshot does not match the catalog lineage.");
      }

      const pointer: CatalogPointer = {
        schemaVersion: catalogPointerSchemaVersion,
        catalogContentSha256: catalog.catalogContentSha256,
        writtenAt: writtenAt.value,
      };
      const pointerBytes = encodeJson(pointer);
      const pointerPath = join(directory.path, catalogPointerName);
      await writeAtomic(pointerPath, pointerBytes, () =>
        this.assertCatalogDirectoryStable(directory),
      );
      if (!(await bytesMatch(pointerPath, pointerBytes))) {
        return fail("Evidence catalog pointer failed post-write verification.");
      }
      const current = await this.readCurrentCatalog(directory);
      if (
        !current.ok ||
        current.value?.catalogContentSha256 !== catalog.catalogContentSha256
      ) {
        return fail("Evidence catalog pointer failed verified restoration.");
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return fail(`Failed to write evidence catalog: ${errorMessage(error)}`);
    } finally {
      await release?.();
    }
  }

  async readCatalog(): Promise<Result<EvidenceCatalog, string>> {
    try {
      const directory = await this.openCatalogDirectory(false);
      const current = await this.readCurrentCatalog(directory);
      if (!current.ok) return current;
      if (current.value === null) {
        return fail("Current evidence catalog pointer is missing.");
      }
      return { ok: true, value: current.value };
    } catch (error) {
      return fail(`Failed to read evidence catalog: ${errorMessage(error)}`);
    }
  }

  appendCandidates(
    candidates: readonly ProvisionCandidate[],
  ): Promise<Result<void, string>> {
    return this.appendRecords(
      files.candidates,
      "provisionCandidate",
      candidates,
    );
  }

  readCandidates(): Promise<Result<readonly ProvisionCandidate[], string>> {
    return this.readRecords(files.candidates, "provisionCandidate");
  }

  async appendRules(
    rules: readonly PlanRuleRecord[],
  ): Promise<Result<void, string>> {
    return this.appendRecords(files.rules, "planRuleRecord", rules, () =>
      this.validateRuleGovernance(rules),
    );
  }

  async readRules(): Promise<Result<readonly PlanRuleRecord[], string>> {
    const rules = await this.readRecords<PlanRuleRecord>(
      files.rules,
      "planRuleRecord",
    );
    if (!rules.ok) return rules;
    const governance = await this.validateRuleGovernance(rules.value);
    return governance.ok ? rules : fail(governance.error);
  }

  appendUnresolved(
    items: readonly UnresolvedItem[],
  ): Promise<Result<void, string>> {
    return this.appendRecords(
      files.unresolved,
      "evidenceUnresolvedItem",
      items,
    );
  }

  readUnresolved(): Promise<Result<readonly UnresolvedItem[], string>> {
    return this.readRecords(files.unresolved, "evidenceUnresolvedItem");
  }

  async appendOverrides(
    overrides: readonly AuthorityOverride[],
  ): Promise<Result<void, string>> {
    return this.appendRecords(
      files.overrides,
      "authorityOverride",
      overrides,
      async () => {
        const existing = await this.readRecords<AuthorityOverride>(
          files.overrides,
          "authorityOverride",
          true,
        );
        if (!existing.ok) return existing;
        const catalog = await this.readCatalog();
        if (!catalog.ok) return catalog;
        const effective = await effectiveAuthorityOverrides(
          [...existing.value, ...overrides],
          catalog.value,
        );
        return effective.ok ? { ok: true, value: undefined } : effective;
      },
    );
  }

  async readOverrides(): Promise<Result<readonly AuthorityOverride[], string>> {
    const overrides = await this.readRecords<AuthorityOverride>(
      files.overrides,
      "authorityOverride",
    );
    if (!overrides.ok) return overrides;
    const catalog = await this.readCatalog();
    if (!catalog.ok) return catalog;
    const effective = await effectiveAuthorityOverrides(
      overrides.value,
      catalog.value,
    );
    return effective.ok ? overrides : effective;
  }

  private path(fileName: EvidenceLogFile): string {
    const path = join(this.workspacePath, fileName);
    if (dirname(path) !== this.workspacePath) {
      throw new Error("Evidence file path escapes its workspace.");
    }
    return path;
  }

  private async openCatalogDirectory(
    create: boolean,
  ): Promise<CatalogDirectoryIdentity> {
    await this.assertStable();
    const path = join(this.workspacePath, catalogDirectoryName);
    if (dirname(path) !== this.workspacePath) {
      throw new Error("Catalog directory escapes the evidence workspace.");
    }
    if (create) {
      try {
        await mkdir(path, { mode: directoryMode });
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
    }
    const identity = await lstat(path, { bigint: true });
    if (identity.isSymbolicLink() || !identity.isDirectory()) {
      throw new Error("Evidence catalogs path is not a safe directory.");
    }
    const canonical = await realpath(path);
    if (
      !isWithin(this.workspacePath, canonical) ||
      dirname(canonical) !== this.workspacePath
    ) {
      throw new Error("Evidence catalogs path escapes its workspace.");
    }
    await chmod(path, directoryMode);
    return {
      path,
      device: identity.dev,
      inode: identity.ino,
    };
  }

  private async assertCatalogDirectoryStable(
    directory: CatalogDirectoryIdentity,
  ): Promise<void> {
    await this.assertStable();
    const identity = await lstat(directory.path, { bigint: true });
    if (
      identity.isSymbolicLink() ||
      !identity.isDirectory() ||
      identity.dev !== directory.device ||
      identity.ino !== directory.inode
    ) {
      throw new Error(
        "Evidence catalogs directory was replaced after opening.",
      );
    }
  }

  private catalogSnapshotPath(
    directory: CatalogDirectoryIdentity,
    catalogSha256: Sha256,
  ): string {
    const path = join(directory.path, `${catalogSha256}.json`);
    if (dirname(path) !== directory.path) {
      throw new Error("Catalog snapshot path escapes its directory.");
    }
    return path;
  }

  private async readCurrentCatalog(
    directory: CatalogDirectoryIdentity,
    missingAllowed = false,
  ): Promise<Result<EvidenceCatalog | null, string>> {
    let value: unknown;
    try {
      await this.assertCatalogDirectoryStable(directory);
      const text = (
        await readSecure(join(directory.path, catalogPointerName))
      ).toString("utf8");
      value = JSON.parse(text) as unknown;
    } catch (error) {
      if (missingAllowed && isNotFound(error)) {
        return { ok: true, value: null };
      }
      return fail(
        `Failed to read current evidence catalog pointer: ${errorMessage(error)}`,
      );
    }
    const pointer = parseCatalogPointer(value);
    if (!pointer.ok) return pointer;
    return this.readCatalogSnapshot(
      directory,
      pointer.value.catalogContentSha256,
    );
  }

  private async readCatalogSnapshot(
    directory: CatalogDirectoryIdentity,
    expectedSha256: Sha256,
  ): Promise<Result<EvidenceCatalog, string>> {
    let value: unknown;
    try {
      await this.assertCatalogDirectoryStable(directory);
      const text = (
        await readSecure(this.catalogSnapshotPath(directory, expectedSha256))
      ).toString("utf8");
      value = JSON.parse(text) as unknown;
    } catch (error) {
      return fail(
        `Failed to read evidence catalog snapshot: ${errorMessage(error)}`,
      );
    }
    const validation = validateContract("evidenceCatalog", value);
    if (!validation.valid) return fail(formatValidation(validation.issues));
    const catalog = value as EvidenceCatalog;
    if (catalog.caseId !== this.caseId) {
      return fail("Stored catalog belongs to a different case.");
    }
    if (catalog.catalogContentSha256 !== expectedSha256) {
      return fail("Catalog pointer and snapshot content hash do not match.");
    }
    const { catalogContentSha256: expected, ...content } = catalog;
    if ((await catalogContentSha256(content)) !== expected) {
      return fail("Stored catalog content hash is invalid.");
    }
    return { ok: true, value: deepFreeze(catalog) };
  }

  private async appendRecords(
    fileName: EvidenceLogFile,
    contract: string,
    records: readonly unknown[],
    preCommit?: () => Promise<Result<void, string>>,
  ): Promise<Result<void, string>> {
    const target = this.path(fileName);
    const release = await acquireLock(
      join(this.workspacePath, ".evidence.lock"),
    );
    try {
      await this.assertStable();
      if (preCommit !== undefined) {
        const validation = await preCommit();
        if (!validation.ok) return validation;
      }
      const existing = await this.readRecords<unknown>(
        fileName,
        contract,
        true,
      );
      if (!existing.ok) return existing;
      for (const record of records) {
        const validation = validateContract(contract, record);
        if (!validation.valid) return fail(formatValidation(validation.issues));
      }
      const combined = [...existing.value, ...records];
      const semantic = await validateRecordSet(contract, combined);
      if (!semantic.ok) return semantic;
      const bytes = encodeJsonLines(combined);
      await writeAtomic(target, bytes, () => this.assertStable());
      if (!(await bytesMatch(target, bytes))) {
        return fail("Evidence event log failed post-write verification.");
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return fail(`Failed to append evidence records: ${errorMessage(error)}`);
    } finally {
      await release();
    }
  }

  private async readRecords<T>(
    fileName: EvidenceLogFile,
    contract: string,
    missingIsEmpty = false,
  ): Promise<Result<readonly T[], string>> {
    let text: string;
    try {
      await this.assertStable();
      text = (await readSecure(this.path(fileName))).toString("utf8");
    } catch (error) {
      if (missingIsEmpty && isNotFound(error)) return { ok: true, value: [] };
      return fail(`Failed to read evidence records: ${errorMessage(error)}`);
    }
    try {
      if (text.length > 0 && !text.endsWith("\n")) {
        return fail("Evidence JSONL must end with a newline.");
      }
      const values: unknown[] =
        text.length === 0
          ? []
          : text
              .slice(0, -1)
              .split("\n")
              .map((line) => JSON.parse(line) as unknown);
      for (const value of values) {
        const validation = validateContract(contract, value);
        if (!validation.valid) return fail(formatValidation(validation.issues));
      }
      const semantic = await validateRecordSet(contract, values);
      if (!semantic.ok) return semantic;
      return { ok: true, value: deepFreeze(values as T[]) };
    } catch (error) {
      return fail(`Evidence JSONL is invalid: ${errorMessage(error)}`);
    }
  }

  private async assertStable(): Promise<void> {
    const identity = await lstat(this.workspacePath, { bigint: true });
    if (
      identity.isSymbolicLink() ||
      identity.dev !== this.workspaceDevice ||
      identity.ino !== this.workspaceInode
    ) {
      throw new Error("Evidence workspace was replaced after it was opened.");
    }
  }

  private async validateRuleGovernance(
    rules: readonly PlanRuleRecord[],
  ): Promise<Result<void, string>> {
    const catalog = await this.readCatalog();
    if (!catalog.ok) return catalog;
    const overrides = await this.readRecords<AuthorityOverride>(
      files.overrides,
      "authorityOverride",
      true,
    );
    if (!overrides.ok) return overrides;
    const unresolved = await this.readRecords<UnresolvedItem>(
      files.unresolved,
      "evidenceUnresolvedItem",
      true,
    );
    if (!unresolved.ok) return unresolved;
    for (const rule of rules) {
      const validation = await validateRuleGovernance(
        rule,
        catalog.value,
        overrides.value,
      );
      if (!validation.ok) return validation;
      const blockers = await validateRuleUnresolvedBlockers(
        rule.affectedScope,
        unresolved.value,
      );
      if (!blockers.ok) return blockers;
    }
    return { ok: true, value: undefined };
  }
}

async function validateRecordSet(
  contract: string,
  values: readonly unknown[],
): Promise<Result<void, string>> {
  if (contract === "provisionCandidate") {
    const candidates = values as readonly ProvisionCandidate[];
    if (
      new Set(candidates.map((value) => value.candidateId)).size !==
      candidates.length
    ) {
      return fail(
        "Provision candidate identities must be unique in the event log.",
      );
    }
    for (const value of candidates) {
      const { candidateId: _id, candidateContentSha256, ...payload } = value;
      void _id;
      const expected = parseSha256(
        await hashTyped(payload, {
          schemaId: "provision-candidate.schema.json",
          typeName: "ProvisionCandidateContent",
        }),
      );
      if (!expected.ok || expected.value !== candidateContentSha256) {
        return fail("Provision candidate content hash is invalid.");
      }
    }
  } else if (contract === "planRuleRecord") {
    const rules = values as readonly PlanRuleRecord[];
    if (new Set(rules.map((value) => value.ruleId)).size !== rules.length) {
      return fail("Plan rule identities must be unique in the event log.");
    }
    for (const rule of rules) {
      const validation = await validateRuleRecord(rule);
      if (!validation.ok) return validation;
    }
    if (rules.length > 0) {
      const graph = getSupersessionChain(rules, rules[0]?.ruleId ?? "");
      if (!graph.ok) return graph;
    }
  } else if (contract === "evidenceUnresolvedItem") {
    const items = values as readonly UnresolvedItem[];
    const projection = await projectLatestUnresolvedItems(items);
    if (!projection.ok) return projection;
  } else if (contract === "authorityOverride") {
    const overrides = values as readonly AuthorityOverride[];
    if (
      new Set(overrides.map((value) => value.overrideId)).size !==
      overrides.length
    ) {
      return fail(
        "Authority override identities must be unique in the event log.",
      );
    }
    const byId = new Map(overrides.map((value) => [value.overrideId, value]));
    for (const override of overrides) {
      const validation = await validateAuthorityOverride(override);
      if (!validation.ok) return validation;
      const links = override.supersessionChain;
      const latest = links.at(-1);
      if (latest?.priorOverrideId != null) {
        const prior = byId.get(latest.priorOverrideId);
        if (
          prior?.overrideContentSha256 !== latest.priorOverrideContentSha256 ||
          canonicalize(links.slice(0, -1)) !==
            canonicalize(prior.supersessionChain)
        ) {
          return fail(
            "Authority override chain does not bind to its immutable predecessor.",
          );
        }
      }
    }
  }
  return { ok: true, value: undefined };
}

function parseCatalogPointer(value: unknown): Result<CatalogPointer, string> {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !==
      "catalogContentSha256,schemaVersion,writtenAt" ||
    value.schemaVersion !== catalogPointerSchemaVersion ||
    typeof value.catalogContentSha256 !== "string" ||
    typeof value.writtenAt !== "string"
  ) {
    return fail("Current evidence catalog pointer is invalid.");
  }
  const catalogContentSha256 = parseSha256(value.catalogContentSha256);
  const writtenAt = parseUtcTimestamp(value.writtenAt);
  if (!catalogContentSha256.ok || !writtenAt.ok) {
    return fail("Current evidence catalog pointer is invalid.");
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: catalogPointerSchemaVersion,
      catalogContentSha256: catalogContentSha256.value,
      writtenAt: writtenAt.value,
    }),
  };
}

async function secureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: directoryMode });
  await chmod(path, directoryMode);
}

async function assertNoSymlink(path: string): Promise<void> {
  if ((await lstat(path)).isSymbolicLink()) {
    throw new Error("Symbolic links are not allowed in case evidence paths.");
  }
}

async function createImmutable(
  path: string,
  bytes: Uint8Array,
  verifyParent: () => Promise<void>,
): Promise<boolean> {
  await assertFinalSafe(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeNewFile(temporary, bytes);
  try {
    await verifyParent();
    await assertFinalSafe(path);
    await link(temporary, path);
    await chmod(path, fileMode);
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function writeAtomic(
  path: string,
  bytes: Uint8Array,
  verifyParent: () => Promise<void>,
): Promise<void> {
  await assertFinalSafe(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeNewFile(temporary, bytes);
  try {
    await verifyParent();
    await assertFinalSafe(path);
    await rename(temporary, path);
    await chmod(path, fileMode);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function writeNewFile(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, "wx", fileMode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalize(value)}\n`);
}

function encodeJsonLines(values: readonly unknown[]): Uint8Array {
  const text = values.map((value) => canonicalize(value)).join("\n");
  return new TextEncoder().encode(text.length === 0 ? "" : `${text}\n`);
}

async function bytesMatch(
  path: string,
  expected: Uint8Array,
): Promise<boolean> {
  const actual = await readSecure(path);
  return (
    actual.byteLength === expected.byteLength &&
    actual.every((byte, index) => byte === expected[index])
  );
}

async function readSecure(path: string): Promise<Buffer> {
  await assertFinalSafe(path, false);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile())
      throw new Error("Evidence path is not a regular file.");
    const current = await lstat(path, { bigint: true });
    if (
      current.isSymbolicLink() ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino
    ) {
      throw new Error("Evidence file was substituted after it was opened.");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertFinalSafe(
  path: string,
  missingAllowed = true,
): Promise<void> {
  try {
    const identity = await lstat(path);
    if (identity.isSymbolicLink()) {
      throw new Error("Symbolic links are not allowed for evidence files.");
    }
  } catch (error) {
    if (missingAllowed && isNotFound(error)) return;
    throw error;
  }
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      await assertFinalSafe(path);
      const handle = await open(path, "wx", fileMode);
      const opened = await handle.stat({ bigint: true });
      await handle.sync();
      return async () => {
        await handle.close();
        const current = await lstat(path, { bigint: true }).catch(() => null);
        if (
          current !== null &&
          !current.isSymbolicLink() &&
          current.dev === opened.dev &&
          current.ino === opened.ino
        ) {
          await unlink(path).catch(() => undefined);
        }
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    }
  }
  throw new Error("Timed out acquiring the evidence append lock.");
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function formatValidation(
  issues: readonly { readonly code: string; readonly instancePath: string }[],
): string {
  return `Evidence contract validation failed: ${issues
    .map((issue) => `${issue.code}${issue.instancePath}`)
    .join(", ")}`;
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === "EEXIST";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function fail(error: string): Result<never, string> {
  return { ok: false, error };
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
