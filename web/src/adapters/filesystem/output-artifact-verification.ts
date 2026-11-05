import type { CaseworkOutputArtifactInput } from "../../domain/case-output/models";
import type { WorkspacePort } from "../../domain/ports";
import type { Uuid } from "../../domain/shared/types";
import { normalizeWorkspacePath } from "../../domain/shared/workspace-path";
import { hashChunkReader } from "../../workers/hash.worker";

export function isCaseOutputPath(
  path: string | null | undefined,
  caseId: Uuid,
): path is string {
  if (path == null || normalizeWorkspacePath(path) !== path) return false;
  return (
    path.startsWith(`cases/${caseId}/`) &&
    path.length > `cases/${caseId}/`.length
  );
}

/** Verifies current bytes, not artifact meaning, approval, or derivation. */
export async function verifyOutputArtifactReferences<StorageError>(
  workspace: Pick<WorkspacePort<StorageError>, "openChunkReader">,
  caseId: Uuid,
  artifacts: readonly CaseworkOutputArtifactInput[],
): Promise<{
  readonly verified: readonly CaseworkOutputArtifactInput[];
  readonly rejected: readonly CaseworkOutputArtifactInput[];
}> {
  const verified: CaseworkOutputArtifactInput[] = [];
  const rejected: CaseworkOutputArtifactInput[] = [];
  for (const artifact of artifacts) {
    try {
      if (!isCaseOutputPath(artifact.storagePath, caseId)) {
        rejected.push(artifact);
        continue;
      }
      const opened = await workspace.openChunkReader(artifact.storagePath);
      if (!opened.ok) {
        rejected.push(artifact);
        continue;
      }
      const hashed = await hashChunkReader(opened.value);
      if (!hashed.ok || hashed.value.sha256 !== artifact.contentSha256) {
        rejected.push(artifact);
        continue;
      }
      verified.push(artifact);
    } catch {
      rejected.push(artifact);
    }
  }
  return { verified, rejected };
}
