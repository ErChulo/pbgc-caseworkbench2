import {
  caseIndexEntry,
  type CaseIndexEntry,
  type CaseRecord,
  type CaseStatusEvent,
  type WorkspaceCatalog,
} from "../../domain/case/case";
import type { WorkspacePort } from "../../domain/ports";
import type {
  BinaryChunk,
  ChunkReadRequest,
  ChunkReaderPort,
  WorkspaceEntry,
  WorkspaceWriteReceipt,
} from "../../domain/ports";
import { canonicalize } from "../../domain/manifests/canonical-json";
import {
  parseUtcTimestamp,
  parseUuid,
  type Result,
} from "../../domain/shared/types";

const CASE_INDEX_PATH = "case-index.json";

export interface BrowserWorkspaceError {
  readonly code:
    | "NOT_FOUND"
    | "ALREADY_EXISTS"
    | "READ_FAILED"
    | "WRITE_FAILED"
    | "UNSUPPORTED_OPERATION";
}

export class BrowserDirectoryWorkspace implements WorkspacePort<BrowserWorkspaceError> {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  list(): Promise<Result<readonly WorkspaceEntry[], BrowserWorkspaceError>> {
    return Promise.resolve({
      ok: false,
      error: { code: "UNSUPPORTED_OPERATION" },
    });
  }

  async stat(
    relativePath: string,
  ): Promise<Result<WorkspaceEntry, BrowserWorkspaceError>> {
    try {
      const file = await this.fileHandle(relativePath, false);
      const value = await file.getFile();
      return {
        ok: true,
        value: {
          relativePath,
          kind: "file",
          sizeBytes: value.size,
        },
      };
    } catch (error) {
      return { ok: false, error: browserReadError(error) };
    }
  }

  async openChunkReader(
    relativePath: string,
  ): Promise<
    Result<ChunkReaderPort<BrowserWorkspaceError>, BrowserWorkspaceError>
  > {
    try {
      const handle = await this.fileHandle(relativePath, false);
      const file = await handle.getFile();
      const reader: ChunkReaderPort<BrowserWorkspaceError> = {
        sizeBytes: file.size,
        read: async ({
          offsetBytes,
          lengthBytes,
        }: ChunkReadRequest): Promise<
          Result<BinaryChunk, BrowserWorkspaceError>
        > => {
          try {
            const bytes = new Uint8Array(
              await file
                .slice(offsetBytes, offsetBytes + lengthBytes)
                .arrayBuffer(),
            );
            return {
              ok: true,
              value: {
                offsetBytes,
                bytes,
                endOfSource: offsetBytes + bytes.byteLength >= file.size,
              },
            };
          } catch {
            return { ok: false, error: { code: "READ_FAILED" } };
          }
        },
      };
      return { ok: true, value: reader };
    } catch (error) {
      return { ok: false, error: browserReadError(error) };
    }
  }

  async createDirectory(
    relativePath: string,
  ): Promise<Result<WorkspaceEntry, BrowserWorkspaceError>> {
    try {
      await this.directoryHandle(relativePath, true);
      return {
        ok: true,
        value: {
          relativePath,
          kind: "directory",
          sizeBytes: null,
        },
      };
    } catch {
      return { ok: false, error: { code: "WRITE_FAILED" } };
    }
  }

  async createImmutable(
    relativePath: string,
    source: ChunkReaderPort<BrowserWorkspaceError>,
  ): Promise<Result<WorkspaceWriteReceipt, BrowserWorkspaceError>> {
    const existing = await this.stat(relativePath);
    if (existing.ok) {
      return { ok: false, error: { code: "ALREADY_EXISTS" } };
    }
    if (existing.error.code !== "NOT_FOUND") {
      return existing;
    }
    const bytes = await readPortBytes(source);
    if (!bytes.ok) return bytes;
    return this.writeAtomic(relativePath, bytes.value);
  }

  async writeAtomic(
    relativePath: string,
    bytes: Uint8Array,
  ): Promise<Result<WorkspaceWriteReceipt, BrowserWorkspaceError>> {
    try {
      const handle = await this.fileHandle(relativePath, true);
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(bytes));
      await writable.close();
      return {
        ok: true,
        value: { relativePath, sizeBytes: bytes.byteLength },
      };
    } catch {
      return { ok: false, error: { code: "WRITE_FAILED" } };
    }
  }

  async append(
    relativePath: string,
    bytes: Uint8Array,
  ): Promise<Result<WorkspaceWriteReceipt, BrowserWorkspaceError>> {
    const existing = await this.openChunkReader(relativePath);
    if (!existing.ok && existing.error.code !== "NOT_FOUND") {
      return existing;
    }
    const prior = existing.ok
      ? await readPortBytes(existing.value)
      : ({ ok: true, value: new Uint8Array() } as const);
    if (!prior.ok) return prior;
    const combined = new Uint8Array(prior.value.byteLength + bytes.byteLength);
    combined.set(prior.value);
    combined.set(bytes, prior.value.byteLength);
    return this.writeAtomic(relativePath, combined);
  }

  private async directoryHandle(
    relativePath: string,
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    let current = this.root;
    for (const segment of safeSegments(relativePath)) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  private async fileHandle(
    relativePath: string,
    create: boolean,
  ): Promise<FileSystemFileHandle> {
    const segments = safeSegments(relativePath);
    const fileName = segments.pop();
    if (fileName === undefined) throw new Error("File path is empty.");
    const directory = await this.directoryHandle(segments.join("/"), create);
    return directory.getFileHandle(fileName, { create });
  }
}

function browserReadError(error: unknown): BrowserWorkspaceError {
  return {
    code:
      error instanceof DOMException && error.name === "NotFoundError"
        ? "NOT_FOUND"
        : "READ_FAILED",
  };
}

export interface OpenedCaseWorkspace {
  readonly catalog: WorkspaceCatalog;
  readonly cases: readonly CaseRecord[];
}

export interface CaseWorkspaceError {
  readonly code:
    | "WORKSPACE_DIRECTORY_FAILED"
    | "CASE_WRITE_FAILED"
    | "CASE_READ_BACK_MISMATCH"
    | "CATALOG_WRITE_FAILED"
    | "CATALOG_READ_BACK_MISMATCH"
    | "WORKSPACE_READ_FAILED"
    | "WORKSPACE_RECORD_INVALID";
  readonly safeMessage: string;
  readonly blocksDownstream: true;
}

export async function saveCaseWorkspace<StorageError>(
  workspace: WorkspacePort<StorageError>,
  catalog: WorkspaceCatalog,
  caseRecord: CaseRecord,
): Promise<Result<void, CaseWorkspaceError>> {
  const expectedEntry = caseIndexEntry(caseRecord);
  const catalogEntry = catalog.cases.find(
    (entry) => entry.caseId === caseRecord.caseId,
  );
  if (
    catalogEntry === undefined ||
    canonicalize(catalogEntry) !== canonicalize(expectedEntry)
  ) {
    return failure(
      "WORKSPACE_RECORD_INVALID",
      "The case catalog entry does not match the case record.",
    );
  }

  const casesDirectory = await workspace.createDirectory("cases");
  if (!casesDirectory.ok) {
    return failure(
      "WORKSPACE_DIRECTORY_FAILED",
      "The local cases directory could not be created.",
    );
  }
  const caseDirectory = await workspace.createDirectory(
    `cases/${caseRecord.caseId}`,
  );
  if (!caseDirectory.ok) {
    return failure(
      "WORKSPACE_DIRECTORY_FAILED",
      "The local case directory could not be created.",
    );
  }

  const casePath = expectedEntry.casePath;
  const caseBytes = encode(caseRecord);
  const caseWrite = await workspace.writeAtomic(casePath, caseBytes);
  if (!caseWrite.ok) {
    return failure(
      "CASE_WRITE_FAILED",
      "The case record could not be written atomically.",
    );
  }
  if (!(await readBackMatches(workspace, casePath, caseBytes))) {
    return failure(
      "CASE_READ_BACK_MISMATCH",
      "The case record failed read-back validation.",
    );
  }

  const canonicalCatalog = canonicalCatalogRecord(catalog);
  const catalogBytes = encode(canonicalCatalog);
  const catalogWrite = await workspace.writeAtomic(
    CASE_INDEX_PATH,
    catalogBytes,
  );
  if (!catalogWrite.ok) {
    return failure(
      "CATALOG_WRITE_FAILED",
      "The case catalog could not be written atomically.",
    );
  }
  if (!(await readBackMatches(workspace, CASE_INDEX_PATH, catalogBytes))) {
    return failure(
      "CATALOG_READ_BACK_MISMATCH",
      "The case catalog failed read-back validation.",
    );
  }
  return { ok: true, value: undefined };
}

export async function openCaseWorkspace<StorageError>(
  workspace: WorkspacePort<StorageError>,
): Promise<Result<OpenedCaseWorkspace, CaseWorkspaceError>> {
  const catalogValue = await readJson(workspace, CASE_INDEX_PATH);
  if (!catalogValue.ok) return catalogValue;
  const catalog = parseCatalog(catalogValue.value);
  if (!catalog.ok) return catalog;

  const cases: CaseRecord[] = [];
  for (const entry of catalog.value.cases) {
    const caseValue = await readJson(workspace, entry.casePath);
    if (!caseValue.ok) return caseValue;
    const caseRecord = parseCaseRecord(caseValue.value);
    if (
      !caseRecord.ok ||
      canonicalize(caseIndexEntry(caseRecord.value)) !== canonicalize(entry)
    ) {
      return failure(
        "WORKSPACE_RECORD_INVALID",
        "A stored case does not match its catalog entry.",
      );
    }
    cases.push(caseRecord.value);
  }
  return {
    ok: true,
    value: Object.freeze({
      catalog: catalog.value,
      cases: Object.freeze(cases),
    }),
  };
}

function canonicalCatalogRecord(catalog: WorkspaceCatalog): WorkspaceCatalog {
  return Object.freeze({
    ...catalog,
    cases: Object.freeze(
      [...catalog.cases].sort((left, right) =>
        left.caseId.localeCompare(right.caseId),
      ),
    ),
  });
}

async function readBackMatches<StorageError>(
  workspace: WorkspacePort<StorageError>,
  relativePath: string,
  expected: Uint8Array,
): Promise<boolean> {
  const actual = await readBytes(workspace, relativePath);
  if (!actual.ok || actual.value.byteLength !== expected.byteLength) {
    return false;
  }
  return actual.value.every((byte, index) => byte === expected[index]);
}

async function readJson<StorageError>(
  workspace: WorkspacePort<StorageError>,
  relativePath: string,
): Promise<Result<unknown, CaseWorkspaceError>> {
  const bytes = await readBytes(workspace, relativePath);
  if (!bytes.ok) return bytes;
  try {
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.value),
      ),
    };
  } catch {
    return failure(
      "WORKSPACE_RECORD_INVALID",
      "A local workspace record is not valid UTF-8 JSON.",
    );
  }
}

async function readBytes<StorageError>(
  workspace: WorkspacePort<StorageError>,
  relativePath: string,
): Promise<Result<Uint8Array, CaseWorkspaceError>> {
  const opened = await workspace.openChunkReader(relativePath);
  if (!opened.ok) {
    return failure(
      "WORKSPACE_READ_FAILED",
      "A required local workspace record could not be opened.",
    );
  }
  const bytes = new Uint8Array(opened.value.sizeBytes);
  let offsetBytes = 0;
  while (offsetBytes < bytes.byteLength) {
    const chunk = await opened.value.read({
      offsetBytes,
      lengthBytes: Math.min(64 * 1024, bytes.byteLength - offsetBytes),
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offsetBytes ||
      chunk.value.bytes.byteLength === 0
    ) {
      return failure(
        "WORKSPACE_READ_FAILED",
        "A required local workspace record could not be read completely.",
      );
    }
    bytes.set(chunk.value.bytes, offsetBytes);
    offsetBytes += chunk.value.bytes.byteLength;
  }
  return { ok: true, value: bytes };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalize(value)}\n`);
}

function parseCatalog(
  value: unknown,
): Result<WorkspaceCatalog, CaseWorkspaceError> {
  if (!isRecord(value) || value.schemaVersion !== "1.0.0") {
    return invalidRecord();
  }
  if (
    typeof value.workspaceId !== "string" ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.cases)
  ) {
    return invalidRecord();
  }
  const workspaceId = parseUuid(value.workspaceId);
  const createdAt = parseUtcTimestamp(value.createdAt);
  if (!workspaceId.ok || !createdAt.ok) return invalidRecord();
  const cases: CaseIndexEntry[] = [];
  for (const item of value.cases) {
    const parsed = parseIndexEntry(item);
    if (!parsed.ok) return parsed;
    cases.push(parsed.value);
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: "1.0.0",
      workspaceId: workspaceId.value,
      createdAt: createdAt.value,
      cases: Object.freeze(cases),
    }),
  };
}

function parseIndexEntry(
  value: unknown,
): Result<CaseIndexEntry, CaseWorkspaceError> {
  if (!isRecord(value)) return invalidRecord();
  if (typeof value.caseId !== "string") return invalidRecord();
  const caseId = parseUuid(value.caseId);
  if (
    !caseId.ok ||
    !isPurpose(value.purpose) ||
    !isStatus(value.status) ||
    typeof value.casePath !== "string" ||
    (typeof value.authoritativeCaseId !== "string" &&
      value.authoritativeCaseId !== null)
  ) {
    return invalidRecord();
  }
  if (value.casePath !== `cases/${caseId.value}/case.json`) {
    return invalidRecord();
  }
  return {
    ok: true,
    value: Object.freeze({
      caseId: caseId.value,
      authoritativeCaseId: value.authoritativeCaseId,
      purpose: value.purpose,
      casePath: value.casePath,
      status: value.status,
    }),
  };
}

function parseCaseRecord(
  value: unknown,
): Result<CaseRecord, CaseWorkspaceError> {
  if (!isRecord(value)) return invalidRecord();
  if (
    typeof value.caseId !== "string" ||
    typeof value.createdAt !== "string" ||
    (typeof value.collisionDecisionId !== "string" &&
      value.collisionDecisionId !== null)
  ) {
    return invalidRecord();
  }
  const caseId = parseUuid(value.caseId);
  const createdAt = parseUtcTimestamp(value.createdAt);
  const collisionDecisionId =
    value.collisionDecisionId === null
      ? { ok: true as const, value: null }
      : parseUuid(value.collisionDecisionId);
  const statusHistory = parseStatusHistory(value.statusHistory);
  if (
    !caseId.ok ||
    !createdAt.ok ||
    !collisionDecisionId.ok ||
    !statusHistory.ok ||
    !isPurpose(value.purpose) ||
    !isStatus(value.status) ||
    !isHumanActor(value.createdBy) ||
    (typeof value.authoritativeCaseId !== "string" &&
      value.authoritativeCaseId !== null) ||
    (typeof value.designationRationale !== "string" &&
      value.designationRationale !== null)
  ) {
    return invalidRecord();
  }
  return {
    ok: true,
    value: Object.freeze({
      caseId: caseId.value,
      authoritativeCaseId: value.authoritativeCaseId,
      purpose: value.purpose,
      designationRationale: value.designationRationale,
      createdBy: Object.freeze(value.createdBy),
      createdAt: createdAt.value,
      collisionDecisionId: collisionDecisionId.value,
      status: value.status,
      statusHistory: statusHistory.value,
    }),
  };
}

function parseStatusHistory(
  value: unknown,
): Result<readonly CaseStatusEvent[], CaseWorkspaceError> {
  if (!Array.isArray(value)) return invalidRecord();
  const events: CaseStatusEvent[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !isStatus(item.status) ||
      typeof item.occurredAt !== "string" ||
      !isHumanActor(item.actor) ||
      typeof item.rationale !== "string"
    ) {
      return invalidRecord();
    }
    const occurredAt = parseUtcTimestamp(item.occurredAt);
    if (!occurredAt.ok) return invalidRecord();
    events.push(
      Object.freeze({
        status: item.status,
        occurredAt: occurredAt.value,
        actor: Object.freeze(item.actor),
        rationale: item.rationale,
      }),
    );
  }
  return { ok: true, value: Object.freeze(events) };
}

function isHumanActor(value: unknown): value is CaseRecord["createdBy"] {
  return (
    isRecord(value) &&
    value.actorType === "human" &&
    typeof value.actorKey === "string" &&
    typeof value.displayName === "string" &&
    typeof value.authorityContext === "string"
  );
}

function isPurpose(value: unknown): value is CaseRecord["purpose"] {
  return (
    value === "production" ||
    value === "test" ||
    value === "training" ||
    value === "duplicate-investigation"
  );
}

function isStatus(value: unknown): value is CaseRecord["status"] {
  return (
    value === "active" ||
    value === "closed" ||
    value === "archived" ||
    value === "blocked"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidRecord(): Result<never, CaseWorkspaceError> {
  return failure(
    "WORKSPACE_RECORD_INVALID",
    "A local workspace record failed structural validation.",
  );
}

function failure(
  code: CaseWorkspaceError["code"],
  safeMessage: string,
): Result<never, CaseWorkspaceError> {
  return {
    ok: false,
    error: { code, safeMessage, blocksDownstream: true },
  };
}

function safeSegments(relativePath: string): string[] {
  if (
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\") ||
    relativePath.includes("\\")
  ) {
    throw new Error("Workspace path must be relative.");
  }
  const segments = relativePath.split("/").filter((segment) => segment !== "");
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment !== segment.normalize("NFC"),
    )
  ) {
    throw new Error("Workspace path contains an unsafe segment.");
  }
  return segments;
}

async function readPortBytes(
  source: ChunkReaderPort<BrowserWorkspaceError>,
): Promise<Result<Uint8Array, BrowserWorkspaceError>> {
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
      return { ok: false, error: { code: "READ_FAILED" } };
    }
    bytes.set(chunk.value.bytes, offsetBytes);
    offsetBytes += chunk.value.bytes.byteLength;
  }
  return { ok: true, value: bytes };
}
