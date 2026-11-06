import { canonicalize } from "../../domain/manifests/canonical-json";
import type { ChunkReaderPort, WorkspacePort } from "../../domain/ports";
import {
  parseSha256,
  parseUuid,
  type Sha256,
  type Uuid,
} from "../../domain/shared/types";
import type { V1Workbook } from "../../domain/workbook-builder/models";
import {
  createProvisionalOracleEvidence,
  verifyProvisionalOracleEvidence,
  type ProvisionalOracleEvidence,
  type ProvisionalOracleFormat,
} from "../../domain/validation-reconciliation/provisional-oracle-intake";

const CHUNK_SIZE = 64 * 1024;
const MAX_SOURCE = 8 * 1024 * 1024;
const MAX_PROPOSAL = 16 * 1024 * 1024;
type Workspace<StorageError> = Pick<
  WorkspacePort<StorageError>,
  "openChunkReader" | "createDirectory" | "createImmutable"
>;
type StoreResult =
  | {
      readonly ok: true;
      readonly evidence: ProvisionalOracleEvidence;
      readonly proposalPath: string;
      readonly sourcePath: string;
    }
  | { readonly ok: false; readonly message: string };

/** Stores a local proposal and its exact input. This does not authenticate the
 * case, the source, an execution, a reviewer, or the associated workbook. */
export async function preserveProvisionalOracle<StorageError>(input: {
  readonly workspace: Workspace<StorageError>;
  readonly caseId: Uuid;
  readonly workbook: V1Workbook;
  readonly sourceBytes: Uint8Array;
  readonly format: ProvisionalOracleFormat;
}): Promise<StoreResult> {
  try {
    const sourceBytes = new Uint8Array(input.sourceBytes);
    const workbook = structuredClone(input.workbook);
    const caseId = input.caseId;
    if (!(await matchingCase(input.workspace, caseId, true)))
      return failure("An active local case is required.");
    const created = await createProvisionalOracleEvidence({
      caseId,
      workbook,
      sourceBytes,
      format: input.format,
    });
    if (!created.ok) return created;
    const directory = `cases/${caseId}/evidence/provisional-oracles/${created.evidence.evidenceContentSha256}`;
    for (const path of [
      `cases/${caseId}/evidence`,
      `cases/${caseId}/evidence/provisional-oracles`,
      directory,
    ]) {
      if (!(await input.workspace.createDirectory(path)).ok)
        return failure("Oracle proposal directory could not be created.");
    }
    const sourcePath = `${directory}/source.bin`;
    const proposalPath = `${directory}/proposal.json`;
    if (!(await matchingCase(input.workspace, caseId, true)))
      return failure("The active local case changed before preservation.");
    const proposalBytes = new TextEncoder().encode(
      `${canonicalize(created.evidence)}\n`,
    );
    if (proposalBytes.length > MAX_PROPOSAL)
      return failure("Oracle proposal exceeds the supported size.");
    if (
      !(await writeVerified(
        input.workspace,
        sourcePath,
        sourceBytes,
        MAX_SOURCE,
      ))
    )
      return failure("Oracle source could not be preserved exactly.");
    if (
      !(await writeVerified(
        input.workspace,
        proposalPath,
        proposalBytes,
        MAX_PROPOSAL,
      ))
    )
      return failure("Oracle proposal could not be preserved exactly.");
    if (!(await matchingCase(input.workspace, caseId, true)))
      return failure(
        "The case changed after preservation. Inspect the local proposal before retrying.",
      );
    const restored = await readProvisionalOracle(
      input.workspace,
      caseId,
      created.evidence.evidenceContentSha256,
      workbook,
    );
    if (
      !restored.ok ||
      canonicalize(restored.evidence) !== canonicalize(created.evidence)
    )
      return failure("Oracle proposal failed verified restoration.");
    return restored;
  } catch {
    return failure("Oracle proposal could not be preserved.");
  }
}

export async function readProvisionalOracle<StorageError>(
  workspace: Workspace<StorageError>,
  caseId: Uuid,
  evidenceHash: Sha256,
  workbook: V1Workbook,
): Promise<StoreResult> {
  try {
    const frozenWorkbook = structuredClone(workbook);
    if (
      !parseUuid(caseId).ok ||
      !parseSha256(evidenceHash).ok ||
      !(await matchingCase(workspace, caseId, false))
    )
      return failure("The local case or proposal identity is invalid.");
    const directory = `cases/${caseId}/evidence/provisional-oracles/${evidenceHash}`;
    const sourcePath = `${directory}/source.bin`;
    const proposalPath = `${directory}/proposal.json`;
    const proposalBytes = await readBytes(
      workspace,
      proposalPath,
      MAX_PROPOSAL,
    );
    const sourceBytes = await readBytes(workspace, sourcePath, MAX_SOURCE);
    if (proposalBytes === null || sourceBytes === null)
      return failure("Oracle proposal or source is unavailable.");
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(proposalBytes),
    ) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return failure("Oracle proposal is invalid.");
    const evidence = value as ProvisionalOracleEvidence;
    if (
      evidence.caseId !== caseId ||
      evidence.evidenceContentSha256 !== evidenceHash ||
      !(await verifyProvisionalOracleEvidence({
        evidence,
        workbook: frozenWorkbook,
        sourceBytes,
      }))
    )
      return failure(
        "Oracle proposal or source does not match the case workbook.",
      );
    // A second bounded read catches changes made during reconstruction. It
    // cannot make the workspace a cross-window transaction.
    const latestProposal = await readBytes(
      workspace,
      proposalPath,
      MAX_PROPOSAL,
    );
    const latestSource = await readBytes(workspace, sourcePath, MAX_SOURCE);
    if (
      !sameBytes(proposalBytes, latestProposal) ||
      !sameBytes(sourceBytes, latestSource) ||
      !(await matchingCase(workspace, caseId, false))
    )
      return failure(
        "The case, proposal, or source changed during verification.",
      );
    for (const result of evidence.results) Object.freeze(result);
    Object.freeze(evidence.results);
    Object.freeze(evidence.missingFormulaIds);
    Object.freeze(evidence.failedFormulaIds);
    return {
      ok: true,
      evidence: Object.freeze(evidence),
      proposalPath,
      sourcePath,
    };
  } catch {
    return failure("Oracle proposal could not be read or verified.");
  }
}

async function matchingCase<StorageError>(
  workspace: Workspace<StorageError>,
  caseId: Uuid,
  requireActive: boolean,
): Promise<boolean> {
  if (!parseUuid(caseId).ok) return false;
  const bytes = await readBytes(
    workspace,
    `cases/${caseId}/case.json`,
    1024 * 1024,
  );
  if (bytes === null) return false;
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as unknown;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "caseId" in value &&
    value.caseId === caseId &&
    (!requireActive || ("status" in value && value.status === "active"))
  );
}

async function readBytes<StorageError>(
  workspace: Workspace<StorageError>,
  path: string,
  max: number,
): Promise<Uint8Array | null> {
  const opened = await workspace.openChunkReader(path);
  if (!opened.ok) return null;
  const size = opened.value.sizeBytes;
  if (!Number.isSafeInteger(size) || size < 0 || size > max)
    throw new Error("Input size invalid");
  const result = new Uint8Array(size);
  for (let offset = 0; offset < size;) {
    const length = Math.min(CHUNK_SIZE, size - offset);
    const chunk = await opened.value.read({
      offsetBytes: offset,
      lengthBytes: length,
    });
    if (
      !chunk.ok ||
      chunk.value.offsetBytes !== offset ||
      chunk.value.bytes.length !== length ||
      chunk.value.endOfSource !== (offset + length === size)
    )
      throw new Error("Incomplete read");
    result.set(chunk.value.bytes, offset);
    offset += length;
  }
  return result;
}

async function writeVerified<StorageError>(
  workspace: Workspace<StorageError>,
  path: string,
  bytes: Uint8Array,
  max: number,
): Promise<boolean> {
  const existing = await workspace.openChunkReader(path);
  if (!existing.ok) {
    const error: unknown = existing.error;
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "NOT_FOUND"
    )
      return false;
    const reader: ChunkReaderPort<StorageError> = {
      sizeBytes: bytes.length,
      read: ({ offsetBytes, lengthBytes }) =>
        Promise.resolve({
          ok: true,
          value: {
            offsetBytes,
            bytes: bytes.slice(offsetBytes, offsetBytes + lengthBytes),
            endOfSource: offsetBytes + lengthBytes >= bytes.length,
          },
        }),
    };
    const saved = await workspace.createImmutable(path, reader);
    if (!saved.ok) return false;
  }
  const restored = await readBytes(workspace, path, max);
  return (
    restored !== null &&
    restored.length === bytes.length &&
    restored.every((byte, index) => byte === bytes[index])
  );
}

function sameBytes(expected: Uint8Array, actual: Uint8Array | null): boolean {
  return (
    actual !== null &&
    expected.length === actual.length &&
    expected.every((byte, index) => byte === actual[index])
  );
}

function failure(message: string): StoreResult {
  return { ok: false, message };
}
