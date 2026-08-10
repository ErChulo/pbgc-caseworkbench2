import { validateContract } from "../../contracts/schema-validator";
import { catalogContentSha256 } from "../../domain/evidence/catalog";
import type { EvidenceCatalog } from "../../domain/evidence/models";
import { canonicalize, hashTyped } from "../../domain/manifests/canonical-json";
import type {
  ProvisionCandidate,
  UnresolvedItem,
} from "../../domain/plan-rules/models";
import { projectLatestUnresolvedItems } from "../../domain/plan-rules/unresolved-items";
import type { ChunkReaderPort, WorkspacePort } from "../../domain/ports";
import {
  parseSha256,
  parseUtcTimestamp,
  type Result,
  type Sha256,
  type Uuid,
} from "../../domain/shared/types";

export interface EvidenceRecordWorkspaceError {
  readonly code:
    "INVALID_RECORD" | "READ_FAILED" | "WRITE_FAILED" | "LINEAGE_MISMATCH";
  readonly safeMessage: string;
}

interface CatalogPointer {
  readonly schemaVersion: "1.0.0";
  readonly catalogContentSha256: Sha256;
  readonly writtenAt: string;
}

export async function writeCurrentEvidenceCatalog<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
  catalog: EvidenceCatalog,
  writtenAt: string,
): Promise<Result<void, EvidenceRecordWorkspaceError>> {
  if (catalog.caseId !== caseId) {
    return invalid("Evidence catalog belongs to a different case.");
  }
  const catalogValidation = await validateCatalog(catalog, caseId);
  if (!catalogValidation.ok) return catalogValidation;
  const parsedWrittenAt = parseUtcTimestamp(writtenAt);
  if (!parsedWrittenAt.ok) {
    return invalid("Evidence catalog pointer timestamp is invalid.");
  }
  const current = await readCurrentEvidenceCatalog(workspace, caseId);
  if (!current.ok) return current;
  if (current.value !== null && current.value.catalogId !== catalog.catalogId) {
    return failure(
      "LINEAGE_MISMATCH",
      "Evidence catalog lineage must preserve one stable catalogId.",
    );
  }

  const directory = `cases/${caseId}/evidence/catalogs`;
  const created = await workspace.createDirectory(directory);
  if (!created.ok) {
    return failure(
      "WRITE_FAILED",
      "Evidence catalog directory could not be created.",
    );
  }
  const snapshotPath = `${directory}/${catalog.catalogContentSha256}.json`;
  const snapshotBytes = encodeJson(catalog);
  const existing = await workspace.stat(snapshotPath);
  if (!existing.ok) {
    if (!hasErrorCode(existing.error, "NOT_FOUND")) {
      return failure(
        "READ_FAILED",
        "Evidence catalog snapshot could not be inspected.",
      );
    }
    const saved = await workspace.createImmutable(
      snapshotPath,
      bytesReader(snapshotBytes),
    );
    if (!saved.ok) {
      return failure(
        "WRITE_FAILED",
        "Evidence catalog snapshot could not be preserved.",
      );
    }
  }
  const snapshot = await readCatalogSnapshot(
    workspace,
    caseId,
    catalog.catalogContentSha256,
  );
  if (!snapshot.ok) return snapshot;
  if (snapshot.value.catalogId !== catalog.catalogId) {
    return failure(
      "LINEAGE_MISMATCH",
      "Evidence catalog snapshot does not match the case lineage.",
    );
  }

  const pointer: CatalogPointer = {
    schemaVersion: "1.0.0",
    catalogContentSha256: catalog.catalogContentSha256,
    writtenAt: parsedWrittenAt.value,
  };
  const pointerSaved = await workspace.writeAtomic(
    `${directory}/current.json`,
    encodeJson(pointer),
  );
  if (!pointerSaved.ok) {
    return failure(
      "WRITE_FAILED",
      "Evidence catalog pointer could not be preserved.",
    );
  }
  const restored = await readCurrentEvidenceCatalog(workspace, caseId);
  if (
    !restored.ok ||
    restored.value?.catalogContentSha256 !== catalog.catalogContentSha256
  ) {
    return failure(
      "READ_FAILED",
      "Evidence catalog pointer failed verified restoration.",
    );
  }
  return { ok: true, value: undefined };
}

export async function readCurrentEvidenceCatalog<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
): Promise<Result<EvidenceCatalog | null, EvidenceRecordWorkspaceError>> {
  const pointerPath = `cases/${caseId}/evidence/catalogs/current.json`;
  const pointerBytes = await readWorkspaceBytes(workspace, pointerPath, true);
  if (!pointerBytes.ok) return pointerBytes;
  if (pointerBytes.value === null) return { ok: true, value: null };
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(pointerBytes.value),
    ) as unknown;
  } catch {
    return invalid("Evidence catalog pointer is not valid UTF-8 JSON.");
  }
  const pointer = parseCatalogPointer(value);
  if (!pointer.ok) return pointer;
  return readCatalogSnapshot(
    workspace,
    caseId,
    pointer.value.catalogContentSha256,
  );
}

export async function appendProvisionCandidates<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
  candidates: readonly ProvisionCandidate[],
): Promise<
  Result<readonly ProvisionCandidate[], EvidenceRecordWorkspaceError>
> {
  const existing = await readProvisionCandidates(workspace, caseId);
  if (!existing.ok) return existing;
  const byId = new Map(
    existing.value.map((candidate) => [candidate.candidateId, candidate]),
  );
  const additions: ProvisionCandidate[] = [];
  for (const candidate of candidates) {
    const validated = await validateCandidate(candidate);
    if (!validated.ok) return validated;
    const prior = byId.get(candidate.candidateId);
    if (prior !== undefined) {
      if (prior.candidateContentSha256 !== candidate.candidateContentSha256) {
        return invalid("Provision candidate identity has conflicting content.");
      }
      continue;
    }
    byId.set(candidate.candidateId, candidate);
    additions.push(candidate);
  }
  if (additions.length === 0) return { ok: true, value: existing.value };

  const evidenceDirectory = `cases/${caseId}/evidence`;
  const created = await workspace.createDirectory(evidenceDirectory);
  if (!created.ok) {
    return failure(
      "WRITE_FAILED",
      "Evidence record directory could not be created.",
    );
  }
  const appended = await workspace.append(
    `${evidenceDirectory}/provision-candidates.jsonl`,
    encodeJsonLines(additions),
  );
  if (!appended.ok) {
    return failure(
      "WRITE_FAILED",
      "Provision candidates could not be appended.",
    );
  }
  const restored = await readProvisionCandidates(workspace, caseId);
  if (!restored.ok) return restored;
  if (restored.value.length !== byId.size) {
    return failure(
      "READ_FAILED",
      "Provision candidate append failed verified restoration.",
    );
  }
  return restored;
}

export async function readProvisionCandidates<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
): Promise<
  Result<readonly ProvisionCandidate[], EvidenceRecordWorkspaceError>
> {
  const bytes = await readWorkspaceBytes(
    workspace,
    `cases/${caseId}/evidence/provision-candidates.jsonl`,
    true,
  );
  if (!bytes.ok) return bytes;
  if (bytes.value === null) return { ok: true, value: [] };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.value);
  } catch {
    return invalid("Provision candidate log is not valid UTF-8.");
  }
  if (text.length > 0 && !text.endsWith("\n")) {
    return invalid("Provision candidate log must end with a newline.");
  }
  const candidates: ProvisionCandidate[] = [];
  const ids = new Set<Uuid>();
  try {
    for (const line of text === "" ? [] : text.slice(0, -1).split("\n")) {
      const value = JSON.parse(line) as unknown;
      const validated = await validateCandidate(value);
      if (!validated.ok) return validated;
      if (ids.has(validated.value.candidateId)) {
        return invalid(
          "Provision candidate log contains a duplicate identity.",
        );
      }
      ids.add(validated.value.candidateId);
      candidates.push(validated.value);
    }
  } catch {
    return invalid("Provision candidate log is not valid JSONL.");
  }
  return { ok: true, value: Object.freeze(candidates) };
}

export async function appendUnresolvedItems<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
  items: readonly UnresolvedItem[],
): Promise<Result<readonly UnresolvedItem[], EvidenceRecordWorkspaceError>> {
  const existing = await readUnresolvedItems(workspace, caseId);
  if (!existing.ok) return existing;
  const revisions = new Set(
    existing.value.map((item) => item.revisionContentSha256),
  );
  const additions = items.filter(
    (item) => !revisions.has(item.revisionContentSha256),
  );
  const projected = await projectLatestUnresolvedItems([
    ...existing.value,
    ...additions,
  ]);
  if (!projected.ok) return invalid(projected.error);
  if (additions.length === 0) return existing;
  const directory = `cases/${caseId}/evidence`;
  const created = await workspace.createDirectory(directory);
  if (!created.ok) {
    return failure(
      "WRITE_FAILED",
      "Evidence record directory could not be created.",
    );
  }
  const appended = await workspace.append(
    `${directory}/unresolved-items.jsonl`,
    encodeJsonLines(additions),
  );
  if (!appended.ok) {
    return failure("WRITE_FAILED", "Unresolved items could not be appended.");
  }
  return readUnresolvedItems(workspace, caseId);
}

export async function readUnresolvedItems<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
): Promise<Result<readonly UnresolvedItem[], EvidenceRecordWorkspaceError>> {
  const values = await readJsonLines(
    workspace,
    `cases/${caseId}/evidence/unresolved-items.jsonl`,
    "Unresolved item",
  );
  if (!values.ok) return values;
  for (const value of values.value) {
    const validation = validateContract("evidenceUnresolvedItem", value);
    if (!validation.valid)
      return invalid("Unresolved item contract is invalid.");
  }
  const items = values.value as unknown as readonly UnresolvedItem[];
  const projection = await projectLatestUnresolvedItems(items);
  if (!projection.ok) return invalid(projection.error);
  return { ok: true, value: deepFreeze([...items]) };
}

async function readCatalogSnapshot<StorageError>(
  workspace: WorkspacePort<StorageError>,
  caseId: Uuid,
  catalogSha256: Sha256,
): Promise<Result<EvidenceCatalog, EvidenceRecordWorkspaceError>> {
  const bytes = await readWorkspaceBytes(
    workspace,
    `cases/${caseId}/evidence/catalogs/${catalogSha256}.json`,
    false,
  );
  if (!bytes.ok) return bytes;
  if (bytes.value === null) {
    return failure("READ_FAILED", "Evidence catalog snapshot is missing.");
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.value),
    ) as unknown;
  } catch {
    return invalid("Evidence catalog snapshot is not valid UTF-8 JSON.");
  }
  const validated = await validateCatalog(value, caseId);
  if (!validated.ok) return validated;
  if (validated.value.catalogContentSha256 !== catalogSha256) {
    return invalid("Evidence catalog pointer and snapshot hashes differ.");
  }
  return validated;
}

async function validateCatalog(
  value: unknown,
  caseId: Uuid,
): Promise<Result<EvidenceCatalog, EvidenceRecordWorkspaceError>> {
  const validation = validateContract("evidenceCatalog", value);
  if (!validation.valid)
    return invalid("Evidence catalog contract is invalid.");
  const catalog = value as EvidenceCatalog;
  if (catalog.caseId !== caseId) {
    return invalid("Evidence catalog belongs to a different case.");
  }
  const { catalogContentSha256: expected, ...content } = catalog;
  if ((await catalogContentSha256(content)) !== expected) {
    return invalid("Evidence catalog content hash is invalid.");
  }
  return { ok: true, value: deepFreeze(catalog) };
}

async function validateCandidate(
  value: unknown,
): Promise<Result<ProvisionCandidate, EvidenceRecordWorkspaceError>> {
  const validation = validateContract("provisionCandidate", value);
  if (!validation.valid)
    return invalid("Provision candidate contract is invalid.");
  const candidate = value as ProvisionCandidate;
  const {
    candidateId: ignoredId,
    candidateContentSha256,
    ...payload
  } = candidate;
  void ignoredId;
  const expected = parseSha256(
    await hashTyped(payload, {
      schemaId: "provision-candidate.schema.json",
      typeName: "ProvisionCandidateContent",
    }),
  );
  if (!expected.ok || expected.value !== candidateContentSha256) {
    return invalid("Provision candidate content hash is invalid.");
  }
  return { ok: true, value: deepFreeze(candidate) };
}

function parseCatalogPointer(
  value: unknown,
): Result<CatalogPointer, EvidenceRecordWorkspaceError> {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !==
      "catalogContentSha256,schemaVersion,writtenAt" ||
    value.schemaVersion !== "1.0.0" ||
    typeof value.catalogContentSha256 !== "string" ||
    typeof value.writtenAt !== "string"
  ) {
    return invalid("Evidence catalog pointer is invalid.");
  }
  const catalogContentSha256 = parseSha256(value.catalogContentSha256);
  const writtenAt = parseUtcTimestamp(value.writtenAt);
  if (!catalogContentSha256.ok || !writtenAt.ok) {
    return invalid("Evidence catalog pointer identity is invalid.");
  }
  return {
    ok: true,
    value: {
      schemaVersion: "1.0.0",
      catalogContentSha256: catalogContentSha256.value,
      writtenAt: writtenAt.value,
    },
  };
}

async function readWorkspaceBytes<StorageError>(
  workspace: WorkspacePort<StorageError>,
  path: string,
  missingAllowed: boolean,
): Promise<Result<Uint8Array | null, EvidenceRecordWorkspaceError>> {
  const opened = await workspace.openChunkReader(path);
  if (!opened.ok) {
    return missingAllowed && hasErrorCode(opened.error, "NOT_FOUND")
      ? { ok: true, value: null }
      : failure(
          "READ_FAILED",
          "Evidence workspace record could not be opened.",
        );
  }
  try {
    return { ok: true, value: await readAllBytes(opened.value) };
  } catch {
    return failure(
      "READ_FAILED",
      "Evidence workspace record could not be read completely.",
    );
  }
}

async function readJsonLines<StorageError>(
  workspace: WorkspacePort<StorageError>,
  path: string,
  label: string,
): Promise<Result<readonly unknown[], EvidenceRecordWorkspaceError>> {
  const bytes = await readWorkspaceBytes(workspace, path, true);
  if (!bytes.ok) return bytes;
  if (bytes.value === null) return { ok: true, value: [] };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.value);
  } catch {
    return invalid(`${label} log is not valid UTF-8.`);
  }
  if (text.length > 0 && !text.endsWith("\n")) {
    return invalid(`${label} log must end with a newline.`);
  }
  try {
    return {
      ok: true,
      value: Object.freeze(
        text === ""
          ? []
          : text
              .slice(0, -1)
              .split("\n")
              .map((line) => JSON.parse(line) as unknown),
      ),
    };
  } catch {
    return invalid(`${label} log is not valid JSONL.`);
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalize(value)}\n`);
}

function encodeJsonLines(values: readonly unknown[]): Uint8Array {
  return new TextEncoder().encode(
    `${values.map((value) => canonicalize(value)).join("\n")}\n`,
  );
}

function bytesReader<StorageError>(
  bytes: Uint8Array,
): ChunkReaderPort<StorageError> {
  return {
    sizeBytes: bytes.byteLength,
    read: ({ offsetBytes, lengthBytes }) =>
      Promise.resolve({
        ok: true,
        value: {
          offsetBytes,
          bytes: bytes.slice(offsetBytes, offsetBytes + lengthBytes),
          endOfSource: offsetBytes + lengthBytes >= bytes.byteLength,
        },
      }),
  };
}

async function readAllBytes<StorageError>(
  source: ChunkReaderPort<StorageError>,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(source.sizeBytes);
  let offsetBytes = 0;
  while (offsetBytes < bytes.byteLength) {
    const chunk = await source.read({
      offsetBytes,
      lengthBytes: Math.min(64 * 1024, bytes.byteLength - offsetBytes),
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offsetBytes ||
      chunk.value.bytes.byteLength === 0
    ) {
      throw new Error("Workspace file could not be read completely.");
    }
    bytes.set(chunk.value.bytes, offsetBytes);
    offsetBytes += chunk.value.bytes.byteLength;
  }
  return bytes;
}

function hasErrorCode(value: unknown, code: string): boolean {
  return isRecord(value) && value.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(
  safeMessage: string,
): Result<never, EvidenceRecordWorkspaceError> {
  return failure("INVALID_RECORD", safeMessage);
}

function failure(
  code: EvidenceRecordWorkspaceError["code"],
  safeMessage: string,
): Result<never, EvidenceRecordWorkspaceError> {
  return { ok: false, error: { code, safeMessage } };
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
