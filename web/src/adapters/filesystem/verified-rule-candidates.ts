import { contentObjectPath } from "../../domain/artifacts/models";
import { computePackageSnapshotId } from "../../domain/attempts/snapshot";
import type { PackageSnapshot } from "../../domain/attempts/models";
import type { EvidenceCatalog } from "../../domain/evidence/models";
import { canonicalize } from "../../domain/manifests/canonical-json";
import { extractCandidates } from "../../domain/plan-rules/candidate-extraction";
import type { ProvisionCandidate } from "../../domain/plan-rules/models";
import type { WorkspacePort } from "../../domain/ports";
import { sha256Bytes } from "../../domain/shared/digest";
import { inspectPassive } from "../parsers/passive-inspection";
import { screenBinaryRisk } from "../screening/binary-risk";
import { extractLocalPdfMachineText } from "../parsers/local-pdf";

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;

/** Reconstructs selected candidates from current case-package bytes. This does
 * not authenticate the reviewer, catalog, eligibility decision or source. */
export async function verifyRuleCandidatesInWorkspace<StorageError>(input: {
  readonly workspace: Pick<WorkspacePort<StorageError>, "openChunkReader">;
  readonly snapshot: PackageSnapshot;
  readonly catalog: EvidenceCatalog;
  readonly candidates: readonly ProvisionCandidate[];
}): Promise<
  { readonly ok: true } | { readonly ok: false; readonly message: string }
> {
  const failure = (message: string) => ({ ok: false as const, message });
  try {
    const snapshot = structuredClone(input.snapshot);
    const catalog = structuredClone(input.catalog);
    const candidates = structuredClone(input.candidates);
    if (candidates.length === 0) return failure("Select a source candidate.");
    if (
      snapshot.discoveredCount !== snapshot.entries.length ||
      !Number.isSafeInteger(snapshot.totalBytes) ||
      snapshot.entries.some(
        (entry) =>
          !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0,
      ) ||
      snapshot.totalBytes !==
        snapshot.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0) ||
      (await computePackageSnapshotId(snapshot.entries)) !== snapshot.snapshotId
    )
      return failure("The current evidence snapshot is invalid.");

    for (const hash of new Set(
      candidates.map((candidate) => candidate.artifactSha256),
    )) {
      const selected = candidates.filter(
        (candidate) => candidate.artifactSha256 === hash,
      );
      const artifacts = catalog.caseEvidence.filter(
        (artifact) =>
          artifact.sha256 === hash && artifact.reviewStatus === "released",
      );
      if (
        artifacts.length !== 1 ||
        catalog.referenceOnly.some((artifact) => artifact.sha256 === hash)
      )
        return failure(
          "A selected candidate does not identify one released case artifact.",
        );
      const artifact = artifacts[0];
      if (artifact === undefined)
        return failure("The selected source is unavailable.");
      const entries = snapshot.entries.filter((entry) => entry.sha256 === hash);
      if (
        entries.length === 0 ||
        entries.some((entry) => entry.sizeBytes !== artifact.sizeBytes)
      )
        return failure(
          "The selected source is not in the current evidence snapshot.",
        );
      const size = artifact.sizeBytes;
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SOURCE_BYTES)
        return failure(
          "The selected source exceeds the supported inspection size.",
        );
      const opened = await input.workspace.openChunkReader(
        contentObjectPath(hash),
      );
      if (!opened.ok || opened.value.sizeBytes !== size)
        return failure("The preserved source could not be read safely.");
      const bytes = new Uint8Array(size);
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
          return failure("The preserved source could not be read safely.");
        bytes.set(chunk.value.bytes, offset);
        offset += length;
      }
      if ((await sha256Bytes(bytes)) !== hash)
        return failure(
          "The preserved source bytes do not match the candidate.",
        );
      const binaryRisk = await screenBinaryRisk(
        bytes,
        hash,
        null,
        artifact.locator,
      );
      if (binaryRisk.findings.some((finding) => finding.blocksDownstream))
        return failure("The source failed binary risk screening.");
      let passive = inspectPassive(artifact.locator, bytes);
      if (
        passive.status === "success" &&
        passive.riskIndicators.length === 0 &&
        artifact.mediaType === "application/pdf"
      )
        passive = await extractLocalPdfMachineText(bytes);
      if (
        (passive.status !== "success" && passive.status !== "partial") ||
        passive.riskIndicators.length > 0
      )
        return failure("The source could not be safely inspected.");
      const extracted = await extractCandidates(hash, passive, {
        sourceSection: "case-evidence",
      });
      if (!extracted.ok)
        return failure("The source candidates could not be reconstructed.");
      for (const candidate of selected) {
        const observed = extracted.value.candidates.find(
          (value) => value.candidateId === candidate.candidateId,
        );
        const authority = extracted.value.authorityContexts.find(
          (value) =>
            value.candidateContentSha256 === candidate.candidateContentSha256,
        );
        if (
          observed === undefined ||
          canonicalize(observed) !== canonicalize(candidate) ||
          authority?.eligibleForRuleAuthoring !== true
        )
          return failure(
            "A selected candidate is not an eligible exact match for the current source inspection.",
          );
      }
    }
    return { ok: true };
  } catch {
    return failure("The selected source could not be verified.");
  }
}
