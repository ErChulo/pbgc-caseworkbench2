import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";
import { hashTyped } from "../manifests/canonical-json";

export type ArtifactRole =
  "submitted-container" | "submitted-file" | "extracted-member";

export interface ContentObject {
  readonly sha256: Sha256;
  readonly sizeBytes: number;
  readonly objectPath: string;
  readonly preservationStatus:
    "pending" | "copying" | "verified" | "integrity-failed" | "write-failed";
  readonly postWriteSha256: Sha256 | null;
  readonly firstPreservedAt: UtcTimestamp | null;
}

export interface ReceiptRecord {
  readonly receiptId: Uuid;
  readonly attemptId: Uuid;
  readonly caseId: Uuid;
  readonly sha256: Sha256;
  readonly originalFilename: string;
  readonly observedRelativePath: string;
  readonly submittedBy: string | null;
  readonly submittedAt: UtcTimestamp | null;
  readonly sourceLocation: string | null;
  readonly transferContext: string | null;
  readonly declaredDescription: string | null;
  readonly parentArtifactId: Uuid | null;
}

export interface ArtifactRecord {
  readonly artifactId: Uuid;
  readonly receiptId: Uuid;
  readonly sha256: Sha256;
  readonly attemptId: Uuid;
  readonly caseId: Uuid;
  readonly artifactRole: ArtifactRole;
  readonly signatureMediaType: string | null;
  readonly processingStatus:
    | "pending"
    | "preserved"
    | "screening"
    | "quarantined"
    | "extracting"
    | "normalized"
    | "unsupported"
    | "unreadable"
    | "failed"
    | "completed";
  readonly downstreamEligibility:
    "blocked" | "proposed-only" | "pending-human-decision";
  readonly statusHistory: readonly string[];
}

export interface ContainmentEdge {
  readonly edgeId: string;
  readonly parentArtifactId: Uuid;
  readonly childArtifactId: Uuid;
  readonly parentSha256: Sha256;
  readonly childSha256: Sha256;
  readonly observedMemberPath: string;
  readonly normalizedDisplayPath: string;
  readonly sequence: number;
  readonly compressedSize: number | null;
  readonly expandedSize: number | null;
  readonly crc32: string | null;
  readonly extractionResult: "success" | "partial";
  readonly extractorId: string;
  readonly extractorVersion: string;
}

export interface MemberExtractionObservation {
  readonly parentArtifactId: Uuid;
  readonly parentSha256: Sha256;
  readonly observedMemberPath: string;
  readonly sequence: number;
  readonly compressedSize: number | null;
  readonly expandedSize: number | null;
  readonly crc32: string | null;
  readonly outcome:
    "unsupported" | "encrypted" | "corrupt" | "blocked-limit" | "failed";
  readonly failureReason: string;
  readonly extractorId: string;
  readonly extractorVersion: string;
}

export function contentObjectPath(sha256: Sha256): string {
  return `objects/sha256/${sha256.slice(0, 2)}/${sha256}`;
}

export async function createContainmentEdge(
  input: Omit<ContainmentEdge, "edgeId">,
): Promise<ContainmentEdge> {
  const edgeId = await hashTyped(
    {
      recordType: "containment-edge",
      parentSha256: input.parentSha256,
      childSha256: input.childSha256,
      observedMemberPath: input.observedMemberPath,
      sequence: input.sequence,
      extractorId: input.extractorId,
      extractorVersion: input.extractorVersion,
    },
    {},
  );
  return Object.freeze({ edgeId, ...input });
}
