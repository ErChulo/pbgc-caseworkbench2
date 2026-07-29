import { randomUUID } from "node:crypto";
import {
  chmod,
  constants,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { V1Architecture } from "../../domain/architecture/models";
import type {
  ArchitectureReadError,
  ArchitectureWriteError,
  ArchitectureWriteReceipt,
} from "../../domain/architecture/workspace-adapter";
import {
  readArchitectureJson,
  writeArchitectureJson,
} from "../../domain/architecture/workspace-adapter";
import type { Result, Uuid } from "../../domain/shared/types";
import { parseUuid } from "../../domain/shared/types";

const directoryMode = 0o700;
const fileMode = 0o600;

export class ArchitectureFilesystemWorkspace {
  private constructor(
    readonly workspacePath: string,
    readonly caseId: Uuid,
    private readonly workspaceDevice: bigint,
    private readonly workspaceInode: bigint,
  ) {}

  static async open(
    workspaceRoot: string,
    caseId: string,
  ): Promise<Result<ArchitectureFilesystemWorkspace, ArchitectureWriteError>> {
    const parsedCaseId = parseUuid(caseId);
    if (!parsedCaseId.ok) return writeFailure(parsedCaseId.error.message);
    try {
      const root = resolve(workspaceRoot);
      await secureDirectory(root);
      await assertNoSymlink(root);
      const canonicalRoot = await realpath(root);
      const paths = [
        join(canonicalRoot, "cases"),
        join(canonicalRoot, "cases", parsedCaseId.value),
        join(canonicalRoot, "cases", parsedCaseId.value, "architecture"),
      ];
      for (const path of paths) {
        await secureDirectory(path);
        await assertNoSymlink(path);
      }
      const architecturePath = await realpath(paths[2] ?? "");
      if (!isWithin(canonicalRoot, architecturePath)) {
        return writeFailure(
          "Architecture path escapes the selected workspace.",
        );
      }
      const identity = await lstat(architecturePath, { bigint: true });
      return {
        ok: true,
        value: new ArchitectureFilesystemWorkspace(
          architecturePath,
          parsedCaseId.value,
          identity.dev,
          identity.ino,
        ),
      };
    } catch (error) {
      return writeFailure(
        `Failed to open architecture workspace: ${errorMessage(error)}`,
      );
    }
  }

  async saveArchitecture(
    architecture: V1Architecture,
  ): Promise<Result<ArchitectureWriteReceipt, ArchitectureWriteError>> {
    if (architecture.caseId !== this.caseId) {
      return validationFailure(
        "Architecture caseId does not match its workspace.",
      );
    }
    const encoded = await writeArchitectureJson(architecture);
    if (!encoded.ok) return encoded;
    const target = this.architecturePath(architecture.architectureId);
    try {
      await this.assertStable();
      await assertFinalSafe(target);
      const temporary = `${target}.${randomUUID()}.tmp`;
      await writeNewFile(temporary, encoded.value);
      try {
        await this.assertStable();
        await assertFinalSafe(target);
        await link(temporary, target);
        await chmod(target, fileMode);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
      const stored = await readSecure(target);
      if (!stored.equals(encoded.value)) {
        return writeFailure(
          "Architecture failed post-write byte verification.",
        );
      }
      const decoded = await readArchitectureJson(stored);
      if (!decoded.ok) {
        return writeFailure(
          `Architecture failed post-write validation: ${decoded.error.message}`,
        );
      }
      return {
        ok: true,
        value: {
          architectureId: architecture.architectureId,
          sizeBytes: encoded.value.byteLength,
        },
      };
    } catch (error) {
      return writeFailure(
        `Failed to save architecture: ${errorMessage(error)}`,
      );
    }
  }

  async loadArchitecture(
    architectureId: string,
  ): Promise<Result<V1Architecture, ArchitectureReadError>> {
    const parsedId = parseUuid(architectureId);
    if (!parsedId.ok)
      return readFailure("VALIDATION_ERROR", parsedId.error.message);
    try {
      await this.assertStable();
      const decoded = await readArchitectureJson(
        await readSecure(this.architecturePath(parsedId.value)),
      );
      if (!decoded.ok) return decoded;
      if (decoded.value.architectureId !== parsedId.value) {
        return readFailure(
          "VALIDATION_ERROR",
          "Stored architectureId does not match its file name.",
        );
      }
      if (decoded.value.caseId !== this.caseId) {
        return readFailure(
          "VALIDATION_ERROR",
          "Stored architecture belongs to a different case.",
        );
      }
      return decoded;
    } catch (error) {
      return readFailure(
        isNotFound(error) ? "NOT_FOUND" : "READ_FAILED",
        `Failed to load architecture: ${errorMessage(error)}`,
      );
    }
  }

  private architecturePath(architectureId: Uuid): string {
    const path = join(this.workspacePath, `${architectureId}.json`);
    if (dirname(path) !== this.workspacePath) {
      throw new Error("Architecture file path escapes its workspace.");
    }
    return path;
  }

  private async assertStable(): Promise<void> {
    const identity = await lstat(this.workspacePath, { bigint: true });
    if (
      identity.isSymbolicLink() ||
      identity.dev !== this.workspaceDevice ||
      identity.ino !== this.workspaceInode
    ) {
      throw new Error(
        "Architecture workspace was replaced after it was opened.",
      );
    }
  }
}

export function saveArchitecture(
  workspace: ArchitectureFilesystemWorkspace,
  architecture: V1Architecture,
): Promise<Result<ArchitectureWriteReceipt, ArchitectureWriteError>> {
  return workspace.saveArchitecture(architecture);
}

export function loadArchitecture(
  workspace: ArchitectureFilesystemWorkspace,
  architectureId: string,
): Promise<Result<V1Architecture, ArchitectureReadError>> {
  return workspace.loadArchitecture(architectureId);
}

async function secureDirectory(path: string): Promise<void> {
  try {
    const existing = await lstat(path);
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error(
        "Architecture workspace components must be real directories.",
      );
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await mkdir(path, { recursive: true, mode: directoryMode });
  }
  await chmod(path, directoryMode);
}

async function assertNoSymlink(path: string): Promise<void> {
  if ((await lstat(path)).isSymbolicLink()) {
    throw new Error("Symbolic links are not allowed in architecture paths.");
  }
}

async function assertFinalSafe(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error("Symbolic links are not allowed for architecture files.");
    }
    throw new Error("Architecture files are immutable and cannot be replaced.");
  } catch (error) {
    if (isNotFound(error)) return;
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

async function readSecure(path: string): Promise<Buffer> {
  await assertExistingRegularFile(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino
    ) {
      throw new Error("Architecture file was substituted while being read.");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertExistingRegularFile(path: string): Promise<void> {
  const identity = await lstat(path);
  if (identity.isSymbolicLink() || !identity.isFile()) {
    throw new Error("Architecture path is not a regular file.");
  }
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function isNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error";
}

function writeFailure(message: string): Result<never, ArchitectureWriteError> {
  return { ok: false, error: { code: "WRITE_FAILED", message } };
}

function validationFailure(
  message: string,
): Result<never, ArchitectureWriteError> {
  return { ok: false, error: { code: "VALIDATION_ERROR", message } };
}

function readFailure(
  code: ArchitectureReadError["code"],
  message: string,
): Result<never, ArchitectureReadError> {
  return { ok: false, error: { code, message } };
}
