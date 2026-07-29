import { hashTyped } from "../manifests/canonical-json";
import type { ScreenedArtifactOutcome } from "../attempts/intake-pipeline";
import type {
  ArtifactRecord,
  ContainmentEdge,
  ContentObject,
  ReceiptRecord,
} from "../artifacts/models";
import { replayClassificationApprovals } from "../classification/classification-review";
import type {
  ClassificationApproval,
  ClassificationProposal,
} from "../classification/models";
import type { UnresolvedItem } from "../plan-rules/models";
import { validateUnresolvedItem } from "../plan-rules/unresolved-items";
import type {
  ArtifactEligibilityDecision,
  QuarantineDecision,
} from "../quarantine/models";
import {
  replayArtifactEligibility,
  replayQuarantineDecisions,
} from "../quarantine/release-service";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
} from "../shared/types";
import {
  evidenceSchemaVersion,
  type CatalogBuildError,
  type EvidenceArtifact,
  type EvidenceCatalog,
  type ExcludedQuarantinedEntry,
} from "./models";
import { isValidSourceRole } from "./source-roles";

export interface CatalogArtifactInput {
  readonly artifactId: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly locator: string;
  readonly mediaType: string | null;
  readonly receiptId: string;
  readonly receiptIds: readonly string[];
  readonly exactDuplicateOfSha256: string | null;
  readonly containedBySha256: string | null;
  readonly sourceRole: string;
  readonly reviewStatus: "provisional" | "released" | "stale";
  readonly importedAt: string;
}

export interface ExcludedQuarantinedInput {
  readonly artifactId: string;
  readonly sha256: string;
  readonly quarantineDecisionId: string;
  readonly linkedUnresolvedItemId: string;
}

export interface BuildCatalogInput {
  readonly catalogId: string;
  readonly caseId: string;
  readonly builtAt: string;
  readonly caseEvidence: readonly CatalogArtifactInput[];
  readonly referenceOnly: readonly CatalogArtifactInput[];
  readonly excludedQuarantined: readonly ExcludedQuarantinedInput[];
}

export interface ArtifactOriginMetadata {
  readonly artifactSha256: string;
  readonly origin: "case-package" | "reference-library";
}

export interface QuarantineCatalogMetadata {
  readonly artifactSha256: string;
  readonly quarantineDecisionId: string;
  readonly linkedUnresolvedItemId: string;
}

export interface ScreenedCatalogAdapterInput {
  readonly catalogId: string;
  readonly caseId: string;
  readonly builtAt: string;
  readonly screenedOutcomes: readonly ScreenedArtifactOutcome[];
  readonly contentObjects: readonly ContentObject[];
  readonly receipts: readonly ReceiptRecord[];
  readonly classificationProposals: readonly ClassificationProposal[];
  readonly classificationApprovals: readonly ClassificationApproval[];
  readonly containmentEdges: readonly ContainmentEdge[];
  readonly quarantineDecisions: readonly QuarantineDecision[];
  readonly eligibilityDecisions: readonly ArtifactEligibilityDecision[];
  readonly origins: readonly ArtifactOriginMetadata[];
  readonly quarantineMetadata: readonly QuarantineCatalogMetadata[];
  readonly unresolvedItems: readonly UnresolvedItem[];
}

export interface ScreenedCatalogAdapterResult {
  readonly catalog: EvidenceCatalog;
  readonly unresolvedItems: readonly UnresolvedItem[];
}

export type CatalogBuildResult = Result<EvidenceCatalog, CatalogBuildError>;

export async function buildEvidenceCatalog(
  input: BuildCatalogInput,
): Promise<CatalogBuildResult> {
  if (
    input.caseEvidence.length +
      input.referenceOnly.length +
      input.excludedQuarantined.length ===
    0
  ) {
    return failure("EMPTY_INVENTORY", "The evidence inventory is empty.");
  }

  const catalogId = parseUuid(input.catalogId);
  const caseId = parseUuid(input.caseId);
  const builtAt = parseUtcTimestamp(input.builtAt);
  if (!catalogId.ok || !caseId.ok || !builtAt.ok) {
    return failure(
      "INVALID_SCREENED_OUTCOME",
      "Catalog identity or build timestamp is invalid.",
    );
  }

  const caseEvidence = parseArtifacts(input.caseEvidence);
  const referenceOnly = parseArtifacts(input.referenceOnly);
  const excludedQuarantined = parseExcluded(input.excludedQuarantined);
  if (!caseEvidence.ok) return caseEvidence;
  if (!referenceOnly.ok) return referenceOnly;
  if (!excludedQuarantined.ok) return excludedQuarantined;

  const allHashes = [
    ...caseEvidence.value.map((artifact) => artifact.sha256),
    ...referenceOnly.value.map((artifact) => artifact.sha256),
  ];
  if (new Set(allHashes).size !== allHashes.length) {
    return failure(
      "INVALID_SCREENED_OUTCOME",
      "Each artifact hash must occur exactly once across catalog sections.",
    );
  }

  const sortedCaseEvidence = sortArtifacts(caseEvidence.value);
  const sortedReferenceOnly = sortArtifacts(referenceOnly.value);
  const sortedExcluded = Object.freeze(
    [...excludedQuarantined.value].sort((left, right) =>
      `${left.sha256}\u0000${left.artifactId}`.localeCompare(
        `${right.sha256}\u0000${right.artifactId}`,
      ),
    ),
  );
  const deterministicPayload = {
    catalogId: catalogId.value,
    caseId: caseId.value,
    caseEvidence: sortedCaseEvidence,
    referenceOnly: sortedReferenceOnly,
    excludedQuarantined: sortedExcluded,
  };

  try {
    const digest = parseSha256(
      await hashTyped(deterministicPayload, {
        schemaId: "evidence-catalog.schema.json",
        typeName: "EvidenceCatalogContent",
      }),
    );
    if (!digest.ok) {
      return failure("HASH_COMPUTATION_FAILED", digest.error.message);
    }
    return {
      ok: true,
      value: Object.freeze({
        ...deterministicPayload,
        builtAt: builtAt.value,
        schemaVersion: evidenceSchemaVersion,
        catalogContentSha256: digest.value,
      }),
    };
  } catch {
    return failure(
      "HASH_COMPUTATION_FAILED",
      "The evidence catalog content hash could not be computed.",
    );
  }
}

export async function buildEvidenceCatalogFromScreenedOutcomes(
  input: ScreenedCatalogAdapterInput,
): Promise<Result<ScreenedCatalogAdapterResult, CatalogBuildError>> {
  const caseId = parseUuid(input.caseId);
  if (!caseId.ok) {
    return failure("INVALID_SCREENED_OUTCOME", "The case identity is invalid.");
  }
  if (input.screenedOutcomes.length === 0) {
    return failure("EMPTY_INVENTORY", "The screened inventory is empty.");
  }

  const outcomesByHash = groupBy(
    input.screenedOutcomes,
    (outcome) => outcome.artifact.sha256,
  );
  const caseEvidence: CatalogArtifactInput[] = [];
  const referenceOnly: CatalogArtifactInput[] = [];
  const excludedQuarantined: ExcludedQuarantinedInput[] = [];
  const emittedUnresolvedItems: UnresolvedItem[] = [];

  for (const [sha256, outcomes] of [...outcomesByHash].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const artifacts = outcomes.map((outcome) => outcome.artifact);
    const artifactSha256 = artifacts[0]?.sha256;
    if (artifactSha256 === undefined) {
      return invalid("A screened outcome group has no artifact.");
    }
    if (
      outcomes.some(
        (outcome) =>
          outcome.screening.artifactSha256 !== sha256 ||
          outcome.artifact.caseId !== caseId.value,
      )
    ) {
      return invalid(
        "Screening, artifact, hash, and case metadata do not agree.",
      );
    }

    const quarantineDecisions = input.quarantineDecisions.filter(
      (decision) => decision.artifactSha256 === sha256,
    );
    const quarantine = await replayQuarantineDecisions(
      artifactSha256,
      quarantineDecisions,
    );
    if (!quarantine.ok) return invalid(quarantine.error.safeMessage);
    const eligibilityDecisions = input.eligibilityDecisions.filter(
      (decision) => decision.artifactSha256 === sha256,
    );
    const eligibility =
      eligibilityDecisions.length === 0
        ? quarantine
        : await replayArtifactEligibility(
            artifactSha256,
            eligibilityDecisions,
            quarantineDecisions,
          );
    if (!eligibility.ok) return invalid(eligibility.error.safeMessage);

    if (!eligibility.value.eligible) {
      if (
        quarantine.value.eligible ||
        !["final-quarantine", "rejected", "revoked"].includes(
          quarantine.value.effectiveStatus,
        )
      ) {
        return invalid(
          "Ineligible evidence lacks an effective final quarantine disposition.",
        );
      }
      const exclusion = await quarantineExclusion(
        sha256,
        artifacts,
        quarantine.value.effectiveDecisionId,
        input,
      );
      if (!exclusion.ok) return exclusion;
      excludedQuarantined.push(exclusion.value.entry);
      emittedUnresolvedItems.push(exclusion.value.item);
      continue;
    }

    const artifact = await releasedArtifact(sha256, artifacts, input);
    if (!artifact.ok) return artifact;
    if (artifact.value.section === "referenceOnly") {
      referenceOnly.push(artifact.value.artifact);
    } else {
      caseEvidence.push(artifact.value.artifact);
    }
  }

  const catalog = await buildEvidenceCatalog({
    catalogId: input.catalogId,
    caseId: input.caseId,
    builtAt: input.builtAt,
    caseEvidence,
    referenceOnly,
    excludedQuarantined,
  });
  return catalog.ok
    ? {
        ok: true,
        value: Object.freeze({
          catalog: catalog.value,
          unresolvedItems: Object.freeze(
            [...emittedUnresolvedItems].sort((left, right) =>
              left.itemId.localeCompare(right.itemId),
            ),
          ),
        }),
      }
    : catalog;
}

export async function catalogContentSha256(
  catalog: Omit<EvidenceCatalog, "catalogContentSha256">,
): Promise<Sha256> {
  const digest = parseSha256(
    await hashTyped(
      {
        catalogId: catalog.catalogId,
        caseId: catalog.caseId,
        caseEvidence: sortArtifacts(catalog.caseEvidence),
        referenceOnly: sortArtifacts(catalog.referenceOnly),
        excludedQuarantined: [...catalog.excludedQuarantined].sort(
          (left, right) =>
            `${left.sha256}\u0000${left.artifactId}`.localeCompare(
              `${right.sha256}\u0000${right.artifactId}`,
            ),
        ),
      },
      {
        schemaId: "evidence-catalog.schema.json",
        typeName: "EvidenceCatalogContent",
      },
    ),
  );
  if (!digest.ok) throw new Error("Internal SHA-256 generation failed.");
  return digest.value;
}

function parseArtifacts(
  inputs: readonly CatalogArtifactInput[],
): Result<readonly EvidenceArtifact[], CatalogBuildError> {
  const artifacts: EvidenceArtifact[] = [];
  for (const input of inputs) {
    const artifactId = parseUuid(input.artifactId);
    const sha256 = parseSha256(input.sha256);
    const receiptId = parseUuid(input.receiptId);
    const sortedReceiptIdInputs = [...input.receiptIds].sort((left, right) =>
      left.localeCompare(right),
    );
    const receiptIds = sortedReceiptIdInputs.map(parseUuid);
    const importedAt = parseUtcTimestamp(input.importedAt);
    const duplicate = parseNullableSha256(input.exactDuplicateOfSha256);
    const container = parseNullableSha256(input.containedBySha256);
    if (
      !artifactId.ok ||
      !sha256.ok ||
      !receiptId.ok ||
      receiptIds.length === 0 ||
      receiptIds.some((value) => !value.ok) ||
      new Set(input.receiptIds).size !== input.receiptIds.length ||
      sortedReceiptIdInputs[0] !== input.receiptId ||
      !importedAt.ok ||
      !duplicate.ok ||
      !container.ok ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 0 ||
      input.locator.length === 0 ||
      !isValidSourceRole(input.sourceRole)
    ) {
      return failure(
        "INVALID_SCREENED_OUTCOME",
        "A catalog artifact does not satisfy the evidence contract.",
      );
    }
    artifacts.push(
      Object.freeze({
        artifactId: artifactId.value,
        sha256: sha256.value,
        sizeBytes: input.sizeBytes,
        locator: input.locator,
        mediaType: input.mediaType,
        receiptId: receiptId.value,
        receiptIds: Object.freeze(
          receiptIds.map((value) => {
            if (!value.ok)
              throw new Error("Validated receipt UUID is invalid.");
            return value.value;
          }),
        ),
        exactDuplicateOfSha256: duplicate.value,
        containedBySha256: container.value,
        sourceRole: input.sourceRole,
        reviewStatus: input.reviewStatus,
        importedAt: importedAt.value,
      }),
    );
  }
  return { ok: true, value: Object.freeze(artifacts) };
}

async function releasedArtifact(
  sha256: string,
  artifacts: readonly ArtifactRecord[],
  input: ScreenedCatalogAdapterInput,
): Promise<
  Result<
    {
      readonly artifact: CatalogArtifactInput;
      readonly section: "caseEvidence" | "referenceOnly";
    },
    CatalogBuildError
  >
> {
  const content = exactlyOne(
    input.contentObjects.filter((value) => value.sha256 === sha256),
  );
  if (content === null) {
    return invalid(
      "Released evidence lacks one verified content inventory record.",
    );
  }
  if (
    content.preservationStatus !== "verified" ||
    content.postWriteSha256 !== content.sha256 ||
    !Number.isSafeInteger(content.sizeBytes) ||
    content.sizeBytes < 0
  ) {
    return invalid(
      "Released evidence lacks one verified content inventory record.",
    );
  }
  const artifactReceiptIds = new Set(
    artifacts.map((artifact) => artifact.receiptId),
  );
  const receipts = input.receipts
    .filter(
      (receipt) =>
        receipt.sha256 === sha256 && receipt.caseId === artifacts[0]?.caseId,
    )
    .sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  if (
    artifactReceiptIds.size !== artifacts.length ||
    receipts.length !== artifactReceiptIds.size ||
    receipts.some((receipt) => !artifactReceiptIds.has(receipt.receiptId)) ||
    receipts.some(
      (receipt) =>
        receipt.sha256 !== sha256 ||
        receipt.caseId !== artifacts[0]?.caseId ||
        receipt.submittedAt === null ||
        receipt.observedRelativePath.trim() === "",
    )
  ) {
    return invalid(
      "Released evidence has missing or inconsistent receipt metadata.",
    );
  }
  const canonicalReceipt = receipts[0];
  const canonicalArtifact = artifacts.find(
    (artifact) => artifact.receiptId === canonicalReceipt?.receiptId,
  );
  if (canonicalReceipt === undefined || canonicalArtifact === undefined) {
    return invalid("A canonical receipt cannot be resolved to its artifact.");
  }
  const importedAt = canonicalReceipt.submittedAt;
  if (importedAt === null) {
    return invalid("The canonical receipt lacks an import timestamp.");
  }
  if (
    artifacts.some(
      (artifact) =>
        artifact.signatureMediaType !== canonicalArtifact.signatureMediaType,
    ) ||
    new Set(artifacts.map((artifact) => artifact.artifactRole)).size !== 1
  ) {
    return invalid(
      "Same-byte artifacts have conflicting media-type or containment-role metadata.",
    );
  }

  const sourceRole = await approvedSourceRole(sha256, input);
  if (!sourceRole.ok) return sourceRole;
  const origin = exactlyOne(
    input.origins.filter((value) => value.artifactSha256 === sha256),
  );
  if (origin === null)
    return invalid("Released evidence lacks one explicit origin.");
  const referenceRole =
    sourceRole.value === "regulation" ||
    sourceRole.value === "training-reference";
  if (referenceRole && origin.origin !== "reference-library") {
    return invalid("Source role and case/reference origin are inconsistent.");
  }

  const parent = containmentParent(sha256, artifacts, input.containmentEdges);
  if (!parent.ok) return parent;
  return {
    ok: true,
    value: {
      artifact: {
        artifactId: canonicalArtifact.artifactId,
        sha256,
        sizeBytes: content.sizeBytes,
        locator: canonicalReceipt.observedRelativePath,
        mediaType: canonicalArtifact.signatureMediaType,
        receiptId: canonicalReceipt.receiptId,
        receiptIds: receipts.map((receipt) => receipt.receiptId),
        exactDuplicateOfSha256: receipts.length > 1 ? sha256 : null,
        containedBySha256: parent.value,
        sourceRole: sourceRole.value,
        reviewStatus: "released",
        importedAt,
      },
      section:
        origin.origin === "reference-library"
          ? "referenceOnly"
          : "caseEvidence",
    },
  };
}

async function approvedSourceRole(
  sha256: string,
  input: ScreenedCatalogAdapterInput,
): Promise<Result<string, CatalogBuildError>> {
  const proposals = input.classificationProposals.filter(
    (proposal) =>
      proposal.artifactSha256 === sha256 &&
      proposal.dimension === "source-role",
  );
  const approved: string[] = [];
  for (const proposal of proposals) {
    if (!isValidSourceRole(proposal.proposedValue)) continue;
    const replay = await replayClassificationApprovals(
      proposal,
      input.classificationApprovals.filter(
        (approval) => approval.proposalKey === proposal.proposalKey,
      ),
    );
    if (!replay.ok) return invalid(replay.error.safeMessage);
    if (replay.value.status === "approved")
      approved.push(proposal.proposedValue);
  }
  return approved.length === 1
    ? { ok: true, value: approved[0] ?? "" }
    : invalid("Released evidence requires exactly one approved source role.");
}

function containmentParent(
  sha256: string,
  artifacts: readonly ArtifactRecord[],
  edges: readonly ContainmentEdge[],
): Result<string | null, CatalogBuildError> {
  const relevant = edges.filter(
    (edge) =>
      edge.childSha256 === sha256 &&
      artifacts.some(
        (artifact) => artifact.artifactId === edge.childArtifactId,
      ),
  );
  const parentHashes = [...new Set(relevant.map((edge) => edge.parentSha256))];
  const extracted = artifacts.some(
    (artifact) => artifact.artifactRole === "extracted-member",
  );
  if ((extracted && parentHashes.length !== 1) || parentHashes.length > 1) {
    return invalid(
      "Extracted evidence lacks one unambiguous containment parent.",
    );
  }
  return { ok: true, value: parentHashes[0] ?? null };
}

async function quarantineExclusion(
  sha256: string,
  artifacts: readonly ArtifactRecord[],
  effectiveDecisionId: string | null,
  input: ScreenedCatalogAdapterInput,
): Promise<
  Result<
    { readonly entry: ExcludedQuarantinedInput; readonly item: UnresolvedItem },
    CatalogBuildError
  >
> {
  const metadata = exactlyOne(
    input.quarantineMetadata.filter((value) => value.artifactSha256 === sha256),
  );
  if (
    metadata === null ||
    effectiveDecisionId === null ||
    metadata.quarantineDecisionId !== effectiveDecisionId
  ) {
    return invalid("Excluded evidence lacks effective quarantine linkage.");
  }
  const item = exactlyOne(
    input.unresolvedItems.filter(
      (value) => value.itemId === metadata.linkedUnresolvedItemId,
    ),
  );
  if (item === null) {
    return invalid("Excluded evidence lacks one linked open unresolved item.");
  }
  if (
    item.kind !== "other" ||
    item.status !== "open" ||
    item.affectedScope !== `artifact:${sha256}`
  ) {
    return invalid("Excluded evidence lacks one linked open unresolved item.");
  }
  const validation = await validateUnresolvedItem(item);
  if (!validation.ok) return invalid(validation.error);
  const canonicalArtifact = [...artifacts].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  )[0];
  if (canonicalArtifact === undefined)
    return invalid("Quarantined artifact is missing.");
  return {
    ok: true,
    value: {
      entry: {
        artifactId: canonicalArtifact.artifactId,
        sha256,
        quarantineDecisionId: metadata.quarantineDecisionId,
        linkedUnresolvedItemId: metadata.linkedUnresolvedItemId,
      },
      item,
    },
  };
}

function exactlyOne<Value>(values: readonly Value[]): Value | null {
  return values.length === 1 ? (values[0] ?? null) : null;
}

function groupBy<Value>(
  values: readonly Value[],
  key: (value: Value) => string,
): ReadonlyMap<string, readonly Value[]> {
  const groups = new Map<string, Value[]>();
  for (const value of values) {
    const groupKey = key(value);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), value]);
  }
  return groups;
}

function invalid(message: string): Result<never, CatalogBuildError> {
  return failure("INVALID_SCREENED_OUTCOME", message);
}

function parseExcluded(
  inputs: readonly ExcludedQuarantinedInput[],
): Result<readonly ExcludedQuarantinedEntry[], CatalogBuildError> {
  const entries: ExcludedQuarantinedEntry[] = [];
  for (const input of inputs) {
    const artifactId = parseUuid(input.artifactId);
    const sha256 = parseSha256(input.sha256);
    const decisionId = parseUuid(input.quarantineDecisionId);
    const itemId = parseUuid(input.linkedUnresolvedItemId);
    if (!artifactId.ok || !sha256.ok || !decisionId.ok || !itemId.ok) {
      return failure(
        "INVALID_SCREENED_OUTCOME",
        "A quarantine exclusion does not satisfy the evidence contract.",
      );
    }
    entries.push(
      Object.freeze({
        artifactId: artifactId.value,
        sha256: sha256.value,
        quarantineDecisionId: decisionId.value,
        linkedUnresolvedItemId: itemId.value,
      }),
    );
  }
  return { ok: true, value: Object.freeze(entries) };
}

function parseNullableSha256(
  value: string | null,
): Result<Sha256 | null, CatalogBuildError> {
  if (value === null) return { ok: true, value: null };
  const parsed = parseSha256(value);
  return parsed.ok
    ? parsed
    : failure("INVALID_SCREENED_OUTCOME", parsed.error.message);
}

function sortArtifacts(
  artifacts: readonly EvidenceArtifact[],
): readonly EvidenceArtifact[] {
  return Object.freeze(
    [...artifacts].sort((left, right) =>
      `${left.sha256}\u0000${left.receiptId}\u0000${left.locator}`.localeCompare(
        `${right.sha256}\u0000${right.receiptId}\u0000${right.locator}`,
      ),
    ),
  );
}

function failure(
  code: CatalogBuildError["code"],
  message: string,
): Result<never, CatalogBuildError> {
  return { ok: false, error: { code, message } };
}
