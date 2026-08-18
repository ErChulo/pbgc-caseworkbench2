import { useMemo, useRef, useState } from "react";
import scenarioSelectionYaml from "../../../../rules/scenario-selection.yaml?raw";
import tabSelectionYaml from "../../../../rules/tab-selection.yaml?raw";
import iobClassificationYaml from "../../../../rules/iob-classification.yaml?raw";
import fieldNameGlossaryYaml from "../../../../rules/field-name-glossary.yaml?raw";

import {
  BrowserDirectoryWorkspace,
  openCaseWorkspace,
  saveCaseWorkspace,
} from "../../adapters/filesystem/case-workspace";
import {
  detectFileSystemCapability,
  PRODUCTION_CAPABILITY_POLICY,
  type FileSystemCapability,
} from "../../adapters/filesystem/capability";
import {
  appendProvisionCandidates,
  appendUnresolvedItems,
  readCurrentEvidenceCatalog,
  readProvisionCandidates,
  readUnresolvedItems,
  writeCurrentEvidenceCatalog,
} from "../../adapters/filesystem/evidence-record-workspace";
import { canonicalize } from "../../domain/manifests/canonical-json";
import { preserveContent } from "../../adapters/filesystem/content-store";
import {
  createPackageSnapshot,
  compareSnapshots,
  computePackageSnapshotId,
} from "../../domain/attempts/snapshot";
import { hashChunkReader } from "../../workers/hash.worker";
import { screenBinaryRisk } from "../../adapters/screening/binary-risk";
import { screenSensitiveText } from "../../adapters/screening/sensitive-data";
import { inspectPassive } from "../../adapters/parsers/passive-inspection";
import {
  extractLocalPdfMachineText,
  splitPdfMachineTextPages,
} from "../../adapters/parsers/local-pdf";
import { proposeClassifications } from "../../domain/classification/classifier";
import { proposeNearDuplicate } from "../../domain/classification/near-duplicates";
import { createRelationshipProposal } from "../../domain/classification/relationship-service";
import { extractDateCandidates } from "../../domain/classification/date-candidates";
import { adaptTabularExtraction } from "../../domain/population/tabular-adapter";
import {
  adaptWorkbookExtraction,
  workbookProfileContentHash,
} from "../../domain/population/workbook-adapter";
import {
  detectTabularPopulation,
  detectWorkbookPopulation,
} from "../../domain/population/population-detector";
import { fileReader } from "../utilities/file-readers";
import { replaceItem } from "../utilities/replace-item";
import type { ArtifactInventoryItem } from "../../components/inventory/ArtifactInventory";
import type { PackageIntakeResult } from "../../components/case-intake/PackageIntake";
import type {
  PackageSnapshot,
  SnapshotEntry,
} from "../../domain/attempts/models";
import type {
  ArtifactRecord,
  ReceiptRecord,
} from "../../domain/artifacts/models";
import { contentObjectPath } from "../../domain/artifacts/models";
import { reconcileInventory } from "../../domain/manifests/reconciliation";
import { buildEvidenceCatalogFromScreenedOutcomes } from "../../domain/evidence/catalog";
import type { CatalogArtifactInput } from "../../domain/evidence/catalog";
import type { EvidenceCatalog } from "../../domain/evidence/models";
import type {
  CaseRecord,
  HumanActor,
  WorkspaceCatalog,
} from "../../domain/case/case";
import { caseIndexEntry } from "../../domain/case/case";
import {
  CaseRegistry,
  type CaseCollision,
  type CollisionResolutionInput,
} from "../../domain/case/case-registry";
import {
  validateCaseIdentifier,
  type CaseIdentifierRule,
} from "../../domain/case/case-identifier";
import {
  parseUtcTimestamp,
  parseUuid,
  parseSha256,
  type Result,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../../domain/shared/types";
import type {
  ArtifactEligibilityDecision,
  QuarantineDecision,
} from "../../domain/quarantine/models";
import type {
  ClassificationApproval,
  DateSelectionDecision,
  RelationshipDecision,
} from "../../domain/classification/models";
import { evidenceReviewDemo } from "../../components/evidence/demo-evidence";
import type {
  RuleAuthorCandidate,
  RuleAuthoringDraft,
} from "../../components/evidence/PlanRuleAuthor";
import type { ManifestExportSummary } from "../../components/inventory/ManifestExport";
import type { QuarantineQueueItem } from "../../components/quarantine/QuarantineQueue";
import type {
  ClassificationReviewItem,
  DateCandidateReviewItem,
} from "../../components/review/ClassificationReview";
import type { RelationshipReviewItem } from "../../components/review/RelationshipReview";
import type { PopulationReviewItem } from "../../components/review/PopulationReview";
import type { ArtifactEligibilityReviewItem } from "../../components/review/ArtifactEligibilityReview";
import type { EvidenceViewerArtifact } from "../../components/evidence/EvidenceViewer";
import type {
  AuthorityOverride,
  NearDuplicateRelationship,
  PlanRuleRecord,
  ProvisionCandidate,
  SupersessionProposal,
  UnresolvedItem,
} from "../../domain/plan-rules/models";
import { extractCandidates } from "../../domain/plan-rules/candidate-extraction";
import { detectNearDuplicates } from "../../domain/plan-rules/near-duplicates";
import { detectSupersession } from "../../domain/plan-rules/supersession";
import {
  authorRule,
  type GovernanceDependencies,
  validateRuleRecord,
} from "../../domain/plan-rules/rule-authoring";
import { resolveItem } from "../../domain/plan-rules/unresolved-items";
import type {
  CaseworkOutputArtifactInput,
  FinalCaseworkOutputInput,
} from "../../domain/case-output/models";
import type { DraftV1SummaryArtifact } from "../../domain/draft-v1-summary/models";
import type { CaseOutputArtifactLinkDraft } from "../../components/case-output/CaseOutputPackagePanel";
import type { ArchitectureSelection } from "../../components/architecture/ArchitectureStage";
import type { ArchitecturePolicyReviewItem } from "../../components/architecture/ArchitecturePolicyReview";
import { buildArchitecture } from "../../domain/architecture/architecture-builder";
import type { V1Architecture } from "../../domain/architecture/models";
import {
  readArchitectureJson,
  writeArchitectureJson,
} from "../../domain/architecture/workspace-adapter";
import { createDraftV1SummaryArtifact } from "../../domain/draft-v1-summary/draft-builder";
import { deterministicUuid } from "../../domain/build-spec/identity";
import { buildSpecEngine } from "../../domain/build-spec/build-spec-engine";
import type { BuildSpecV2 } from "../../domain/build-spec/models";
import { compileBuildSpec } from "../../domain/formula-compiler/compiler";
import type { CompilationResult } from "../../domain/formula-compiler/models";
import { buildWorkbook } from "../../domain/workbook-builder/workbook-builder";
import type { V1Workbook } from "../../domain/workbook-builder/models";
import {
  buildXLSXSpec,
  writeXLSXBytes,
} from "../../domain/workbook-builder/serialization";
import { validateContract } from "../../contracts/schema-validator";
import {
  createEvidenceExtraction,
  parseEvidenceExtraction,
  parseEvidenceExtractionPointer,
  type EvidenceExtraction,
} from "../../domain/extraction/evidence-extraction";
import {
  createEvidenceTextCorrection,
  parseEvidenceCorrectionPointer,
  parseEvidenceTextCorrection,
  type EvidenceTextCorrection,
} from "../../domain/extraction/evidence-correction";

import {
  artifactEligibilityContentHash,
  quarantineDecisionContentHash,
  replayArtifactEligibility,
  replayQuarantineDecisions,
} from "../../domain/quarantine/release-service";
import {
  architecturePolicyDecisionContentHash,
  replayArchitecturePolicyApprovals,
  type ArchitecturePolicyApproval,
} from "../../domain/architecture/architecture-policy-approval";
import { loadBundledRuleSets } from "../../domain/architecture/rule-loader";
import {
  caseControlContentHash,
  type AuthenticatedCaseControls,
} from "../../domain/architecture/scenario-selector";

import {
  classificationDecisionContentHash,
  replayClassificationApprovals,
} from "../../domain/classification/classification-review";
import {
  relationshipDecisionContentHash,
  replayRelationshipDecisions,
} from "../../domain/classification/relationship-service";
import {
  populationDecisionContentHash,
  replayPopulationCandidateDecisions,
  type PopulationCandidateDecision,
} from "../../domain/population/population-profile";
import { validateDateSelection } from "../../domain/classification/date-candidates";
import {
  createEmptyPlanSummaryRecord,
  approvePlanSummaryAttribute,
  type PlanSummaryRecord,
  type PlanSummaryDecision,
} from "../../domain/plan-summary";
import type { FormulaApprovalRecord } from "../../domain/build-spec/models";
import { formulaApprovalContentHash } from "../../domain/build-spec/formula-approval";
import { bytesReader, readAllBytes } from "../utilities/file-readers";
import {
  createFinalOutputInput,
  parseCaseOutputArtifactReferences,
  compareCaseOutputArtifacts,
  normalizeWorkspacePath,
} from "../utilities/case-output-helpers";
import {
  createCaseReviewSnapshot,
  createEmptyCaseReviewState,
  parseCaseReviewPointer,
  parseCaseReviewSnapshot,
  type CaseReviewState,
} from "./case-review-persistence";

const ruleSourceArtifacts = [
  {
    path: "rules/scenario-selection.yaml",
    content: scenarioSelectionYaml,
  },
  {
    path: "rules/tab-selection.yaml",
    content: tabSelectionYaml,
  },
  {
    path: "rules/iob-classification.yaml",
    content: iobClassificationYaml,
  },
  {
    path: "rules/field-name-glossary.yaml",
    content: fieldNameGlossaryYaml,
  },
] as const;

interface InventoryCheckpointReference {
  readonly attemptId: Uuid;
  readonly snapshot: PackageSnapshot;
  readonly inventoryItems: readonly ArtifactInventoryItem[];
  readonly packageStatus: "completed" | "partial";
  readonly receipts: readonly ReceiptRecord[];
  readonly artifacts: readonly ArtifactRecord[];
}

export interface PersistedEvidenceCheckpoint {
  readonly schemaVersion: "1.0.0";
  readonly caseId: Uuid;
  readonly attemptId: Uuid;
  readonly priorAttemptId: Uuid | null;
  readonly divergenceReason: string | null;
  readonly snapshot: PackageSnapshot;
  readonly inventoryItems: readonly ArtifactInventoryItem[];
  readonly packageStatus: "completed" | "partial";
  readonly receipts: readonly ReceiptRecord[];
  readonly artifacts: readonly ArtifactRecord[];
}

export interface PersistedCheckpointError {
  readonly code: "INVALID_PERSISTED_CHECKPOINT";
  readonly message: string;
}

export function parsePersistedCheckpoint(
  value: unknown,
): Result<PersistedEvidenceCheckpoint, PersistedCheckpointError> {
  const invalid = (
    message: string,
  ): Result<never, PersistedCheckpointError> => ({
    ok: false,
    error: { code: "INVALID_PERSISTED_CHECKPOINT", message },
  });
  if (typeof value !== "object" || value === null) {
    return invalid("Persisted evidence checkpoint is not a JSON object.");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== "1.0.0") {
    return invalid("Persisted evidence checkpoint schemaVersion is invalid.");
  }
  if (typeof record.caseId !== "string") {
    return invalid("Persisted evidence checkpoint caseId is missing.");
  }
  const caseId = parseUuid(record.caseId);
  if (!caseId.ok) return invalid("Persisted evidence caseId is invalid.");
  if (typeof record.attemptId !== "string") {
    return invalid("Persisted evidence checkpoint attemptId is missing.");
  }
  const attemptId = parseUuid(record.attemptId);
  if (!attemptId.ok) return invalid("Persisted evidence attemptId is invalid.");
  let priorAttemptId: Uuid | null = null;
  if (record.priorAttemptId !== null && record.priorAttemptId !== undefined) {
    if (typeof record.priorAttemptId !== "string") {
      return invalid("Persisted evidence priorAttemptId is invalid.");
    }
    const prior = parseUuid(record.priorAttemptId);
    if (!prior.ok) {
      return invalid("Persisted evidence priorAttemptId is invalid.");
    }
    priorAttemptId = prior.value;
  }
  if (
    record.divergenceReason !== null &&
    typeof record.divergenceReason !== "string"
  ) {
    return invalid("Persisted evidence divergenceReason is invalid.");
  }
  const divergenceReason = record.divergenceReason;
  if (typeof record.snapshot !== "object" || record.snapshot === null) {
    return invalid("Persisted evidence snapshot is missing.");
  }
  const snapshotRecord = record.snapshot as Record<string, unknown>;
  if (typeof snapshotRecord.snapshotId !== "string") {
    return invalid("Persisted evidence snapshotId is missing.");
  }
  const snapshotId = parseSha256(snapshotRecord.snapshotId);
  if (!snapshotId.ok) {
    return invalid("Persisted evidence snapshotId is invalid.");
  }
  if (typeof snapshotRecord.snapshotRecordId !== "string") {
    return invalid("Persisted evidence snapshotRecordId is missing.");
  }
  const snapshotRecordId = parseUuid(snapshotRecord.snapshotRecordId);
  if (!snapshotRecordId.ok) {
    return invalid("Persisted evidence snapshotRecordId is invalid.");
  }
  if (typeof snapshotRecord.frozenAt !== "string") {
    return invalid("Persisted evidence frozenAt is missing.");
  }
  const frozenAt = parseUtcTimestamp(snapshotRecord.frozenAt);
  if (!frozenAt.ok) {
    return invalid("Persisted evidence frozenAt is invalid.");
  }
  if (!Array.isArray(snapshotRecord.entries)) {
    return invalid("Persisted evidence entries are missing.");
  }
  const entries: SnapshotEntry[] = [];
  const entryKeys = new Set<string>();
  for (const entryValue of snapshotRecord.entries) {
    if (
      typeof entryValue !== "object" ||
      entryValue === null ||
      Array.isArray(entryValue)
    ) {
      return invalid("Persisted evidence entry is invalid.");
    }
    const entry = entryValue as Record<string, unknown>;
    if (
      typeof entry.observedRelativePath !== "string" ||
      entry.observedRelativePath.length === 0
    ) {
      return invalid("Persisted evidence entry path is invalid.");
    }
    if (
      typeof entry.normalizedDisplayPath !== "string" ||
      entry.normalizedDisplayPath !==
        entry.observedRelativePath.normalize("NFC")
    ) {
      return invalid("Persisted evidence normalized path is invalid.");
    }
    if (typeof entry.sha256 !== "string") {
      return invalid("Persisted evidence entry sha256 is missing.");
    }
    const sha256 = parseSha256(entry.sha256);
    if (!sha256.ok) {
      return invalid("Persisted evidence entry sha256 is invalid.");
    }
    if (
      typeof entry.sizeBytes !== "number" ||
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes < 0
    ) {
      return invalid("Persisted evidence entry sizeBytes is invalid.");
    }
    if (
      typeof entry.declaredMediaType !== "string" &&
      entry.declaredMediaType !== null
    ) {
      return invalid("Persisted evidence entry media type is invalid.");
    }
    let lastModifiedObserved: UtcTimestamp | null = null;
    if (entry.lastModifiedObserved !== null) {
      if (typeof entry.lastModifiedObserved !== "string") {
        return invalid("Persisted evidence entry modified time is invalid.");
      }
      const parsedModified = parseUtcTimestamp(entry.lastModifiedObserved);
      if (!parsedModified.ok) {
        return invalid("Persisted evidence entry modified time is invalid.");
      }
      lastModifiedObserved = parsedModified.value;
    }
    const entryKey = `${entry.observedRelativePath}\0${sha256.value}`;
    if (entryKeys.has(entryKey)) {
      return invalid(
        "Persisted evidence entries contain a duplicate identity.",
      );
    }
    entryKeys.add(entryKey);
    entries.push({
      observedRelativePath: entry.observedRelativePath,
      normalizedDisplayPath: entry.normalizedDisplayPath,
      sha256: sha256.value,
      sizeBytes: entry.sizeBytes,
      declaredMediaType: entry.declaredMediaType,
      lastModifiedObserved,
    });
  }
  if (
    typeof snapshotRecord.discoveredCount !== "number" ||
    !Number.isSafeInteger(snapshotRecord.discoveredCount) ||
    snapshotRecord.discoveredCount !== entries.length
  ) {
    return invalid("Persisted evidence discoveredCount is invalid.");
  }
  const expectedTotalBytes = entries.reduce(
    (total, entry) => total + entry.sizeBytes,
    0,
  );
  if (
    typeof snapshotRecord.totalBytes !== "number" ||
    !Number.isSafeInteger(snapshotRecord.totalBytes) ||
    snapshotRecord.totalBytes !== expectedTotalBytes
  ) {
    return invalid("Persisted evidence totalBytes is invalid.");
  }
  if (!Array.isArray(record.inventoryItems)) {
    return invalid("Persisted evidence inventory projection is missing.");
  }
  const inventoryItems: ArtifactInventoryItem[] = [];
  const inventoryIds = new Set<string>();
  for (const itemValue of record.inventoryItems) {
    if (
      typeof itemValue !== "object" ||
      itemValue === null ||
      Array.isArray(itemValue)
    ) {
      return invalid("Persisted evidence inventory item is invalid.");
    }
    const item = itemValue as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      item.id.length === 0 ||
      inventoryIds.has(item.id) ||
      typeof item.path !== "string" ||
      item.path.length === 0 ||
      typeof item.sizeBytes !== "number" ||
      !Number.isSafeInteger(item.sizeBytes) ||
      item.sizeBytes < 0 ||
      typeof item.message !== "string" ||
      !isRestorableInventoryStatus(item.status)
    ) {
      return invalid("Persisted evidence inventory item is invalid.");
    }
    let itemSha256: Sha256 | null = null;
    if (item.sha256 !== null) {
      if (typeof item.sha256 !== "string") {
        return invalid("Persisted evidence inventory hash is invalid.");
      }
      const parsedItemSha256 = parseSha256(item.sha256);
      if (!parsedItemSha256.ok) {
        return invalid("Persisted evidence inventory hash is invalid.");
      }
      itemSha256 = parsedItemSha256.value;
    }
    if (
      itemSha256 === null &&
      item.status !== "failed" &&
      item.status !== "interrupted"
    ) {
      return invalid("Persisted evidence inventory hash is missing.");
    }
    inventoryIds.add(item.id);
    inventoryItems.push({
      id: item.id,
      path: item.path,
      sizeBytes: item.sizeBytes,
      sha256: itemSha256,
      status: item.status,
      message: item.message,
    });
  }
  for (const entry of entries) {
    const represented = inventoryItems.some(
      (item) =>
        item.path === entry.observedRelativePath &&
        item.sha256 === entry.sha256 &&
        item.sizeBytes === entry.sizeBytes,
    );
    if (!represented) {
      return invalid(
        "Persisted evidence inventory does not represent every entry.",
      );
    }
  }
  if (
    record.packageStatus !== "completed" &&
    record.packageStatus !== "partial"
  ) {
    return invalid("Persisted evidence packageStatus is invalid.");
  }
  const ledger = parseCheckpointLedger(
    record.receipts,
    record.artifacts,
    caseId.value,
    attemptId.value,
    entries,
  );
  if (
    !ledger.ok ||
    typeof record.reconciliation !== "object" ||
    record.reconciliation === null ||
    record.downstreamBlocked !== true
  ) {
    return invalid("Persisted evidence checkpoint ledger is invalid.");
  }
  return {
    ok: true,
    value: {
      schemaVersion: "1.0.0",
      caseId: caseId.value,
      attemptId: attemptId.value,
      priorAttemptId,
      divergenceReason,
      snapshot: Object.freeze({
        snapshotId: snapshotId.value,
        snapshotRecordId: snapshotRecordId.value,
        entries: Object.freeze(entries),
        discoveredCount: entries.length,
        totalBytes: expectedTotalBytes,
        frozenAt: frozenAt.value,
      }),
      inventoryItems: Object.freeze(inventoryItems),
      packageStatus: record.packageStatus,
      receipts: ledger.value.receipts,
      artifacts: ledger.value.artifacts,
    },
  };
}

function parseCheckpointLedger(
  receiptValue: unknown,
  artifactValue: unknown,
  caseId: Uuid,
  attemptId: Uuid,
  entries: readonly SnapshotEntry[],
): Result<
  {
    readonly receipts: readonly ReceiptRecord[];
    readonly artifacts: readonly ArtifactRecord[];
  },
  PersistedCheckpointError
> {
  if (!Array.isArray(receiptValue) || !Array.isArray(artifactValue)) {
    return invalidCheckpoint(
      "Persisted evidence checkpoint ledger is invalid.",
    );
  }
  if (receiptValue.length === 0 && artifactValue.length === 0) {
    return {
      ok: true,
      value: { receipts: Object.freeze([]), artifacts: Object.freeze([]) },
    };
  }
  const receipts: ReceiptRecord[] = [];
  const receiptIds = new Set<Uuid>();
  for (const value of receiptValue) {
    if (!isObjectRecord(value)) {
      return invalidCheckpoint("Persisted evidence receipt is invalid.");
    }
    const receiptId = parseOptionalUuid(value.receiptId, false);
    const receiptAttemptId = parseOptionalUuid(value.attemptId, false);
    const receiptCaseId = parseOptionalUuid(value.caseId, false);
    const sha256 =
      typeof value.sha256 === "string" ? parseSha256(value.sha256) : null;
    const parentArtifactId = parseOptionalUuid(value.parentArtifactId, true);
    const submittedAt = parseOptionalTimestamp(value.submittedAt);
    if (
      receiptId === null ||
      receiptAttemptId !== attemptId ||
      receiptCaseId !== caseId ||
      sha256 === null ||
      !sha256.ok ||
      parentArtifactId === undefined ||
      submittedAt === undefined ||
      receiptIds.has(receiptId) ||
      typeof value.originalFilename !== "string" ||
      value.originalFilename.length === 0 ||
      typeof value.observedRelativePath !== "string" ||
      value.observedRelativePath.length === 0 ||
      !isNullableString(value.submittedBy) ||
      !isNullableString(value.sourceLocation) ||
      !isNullableString(value.transferContext) ||
      !isNullableString(value.declaredDescription)
    ) {
      return invalidCheckpoint("Persisted evidence receipt is invalid.");
    }
    receiptIds.add(receiptId);
    receipts.push({
      receiptId,
      attemptId: receiptAttemptId,
      caseId: receiptCaseId,
      sha256: sha256.value,
      originalFilename: value.originalFilename,
      observedRelativePath: value.observedRelativePath,
      submittedBy: value.submittedBy,
      submittedAt,
      sourceLocation: value.sourceLocation,
      transferContext: value.transferContext,
      declaredDescription: value.declaredDescription,
      parentArtifactId,
    });
  }
  const receiptsById = new Map(
    receipts.map((receipt) => [receipt.receiptId, receipt]),
  );
  const artifacts: ArtifactRecord[] = [];
  const artifactIds = new Set<Uuid>();
  for (const value of artifactValue) {
    if (!isObjectRecord(value)) {
      return invalidCheckpoint("Persisted evidence artifact is invalid.");
    }
    const artifactId = parseOptionalUuid(value.artifactId, false);
    const receiptId = parseOptionalUuid(value.receiptId, false);
    const artifactAttemptId = parseOptionalUuid(value.attemptId, false);
    const artifactCaseId = parseOptionalUuid(value.caseId, false);
    const sha256 =
      typeof value.sha256 === "string" ? parseSha256(value.sha256) : null;
    const receipt =
      receiptId === null ? undefined : receiptsById.get(receiptId);
    if (
      artifactId === null ||
      receiptId === null ||
      artifactAttemptId !== attemptId ||
      artifactCaseId !== caseId ||
      sha256 === null ||
      !sha256.ok ||
      artifactIds.has(artifactId) ||
      receipt?.sha256 !== sha256.value ||
      !isArtifactRole(value.artifactRole) ||
      !isNullableString(value.signatureMediaType) ||
      !isArtifactProcessingStatus(value.processingStatus) ||
      !isDownstreamEligibility(value.downstreamEligibility) ||
      !Array.isArray(value.statusHistory) ||
      !value.statusHistory.every((item) => typeof item === "string")
    ) {
      return invalidCheckpoint("Persisted evidence artifact is invalid.");
    }
    artifactIds.add(artifactId);
    artifacts.push({
      artifactId,
      receiptId,
      sha256: sha256.value,
      attemptId: artifactAttemptId,
      caseId: artifactCaseId,
      artifactRole: value.artifactRole,
      signatureMediaType: value.signatureMediaType,
      processingStatus: value.processingStatus,
      downstreamEligibility: value.downstreamEligibility,
      statusHistory: Object.freeze([...value.statusHistory]),
    });
  }
  if (
    receipts.some(
      (receipt) =>
        !entries.some(
          (entry) =>
            entry.sha256 === receipt.sha256 &&
            entry.observedRelativePath === receipt.observedRelativePath,
        ),
    ) ||
    receipts.some(
      (receipt) =>
        !artifacts.some((artifact) => artifact.receiptId === receipt.receiptId),
    )
  ) {
    return invalidCheckpoint(
      "Persisted evidence ledger does not match the inventory snapshot.",
    );
  }
  return {
    ok: true,
    value: {
      receipts: Object.freeze(receipts),
      artifacts: Object.freeze(artifacts),
    },
  };
}

function parseOptionalUuid(value: unknown, nullable: false): Uuid | null;
function parseOptionalUuid(
  value: unknown,
  nullable: true,
): Uuid | null | undefined;
function parseOptionalUuid(
  value: unknown,
  nullable: boolean,
): Uuid | null | undefined {
  if (nullable && value === null) return null;
  if (typeof value !== "string") return nullable ? undefined : null;
  const parsed = parseUuid(value);
  return parsed.ok ? parsed.value : nullable ? undefined : null;
}

function parseOptionalTimestamp(
  value: unknown,
): UtcTimestamp | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const parsed = parseUtcTimestamp(value);
  return parsed.ok ? parsed.value : undefined;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isArtifactRole(
  value: unknown,
): value is ArtifactRecord["artifactRole"] {
  return (
    value === "submitted-container" ||
    value === "submitted-file" ||
    value === "extracted-member"
  );
}

function isArtifactProcessingStatus(
  value: unknown,
): value is ArtifactRecord["processingStatus"] {
  return [
    "pending",
    "preserved",
    "screening",
    "quarantined",
    "extracting",
    "normalized",
    "unsupported",
    "unreadable",
    "failed",
    "completed",
  ].includes(String(value));
}

function isDownstreamEligibility(
  value: unknown,
): value is ArtifactRecord["downstreamEligibility"] {
  return (
    value === "blocked" ||
    value === "proposed-only" ||
    value === "pending-human-decision"
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidCheckpoint(
  message: string,
): Result<never, PersistedCheckpointError> {
  return {
    ok: false,
    error: { code: "INVALID_PERSISTED_CHECKPOINT", message },
  };
}

function isRestorableInventoryStatus(
  value: unknown,
): value is ArtifactInventoryItem["status"] {
  return (
    value === "preserved" ||
    value === "duplicate" ||
    value === "provisional-blocked" ||
    value === "failed" ||
    value === "interrupted"
  );
}

export function selectCurrentCheckpoint(
  checkpoints: readonly PersistedEvidenceCheckpoint[],
): PersistedEvidenceCheckpoint | null {
  if (checkpoints.length === 0) return null;
  const referenced = new Set<string>();
  for (const checkpoint of checkpoints) {
    if (checkpoint.priorAttemptId !== null) {
      referenced.add(checkpoint.priorAttemptId);
    }
  }
  const heads = checkpoints.filter(
    (checkpoint) => !referenced.has(checkpoint.attemptId),
  );
  const candidates = heads.length > 0 ? heads : checkpoints;
  return (
    [...candidates].sort((left, right) => {
      const byFrozenAt = right.snapshot.frozenAt.localeCompare(
        left.snapshot.frozenAt,
      );
      if (byFrozenAt !== 0) return byFrozenAt;
      return right.snapshot.snapshotId.localeCompare(left.snapshot.snapshotId);
    })[0] ?? null
  );
}

export interface PersistedCheckpointPointer {
  readonly checkpointSnapshotId: Sha256;
  readonly writtenAt: UtcTimestamp | null;
}

export function parsePersistedCheckpointPointer(
  value: unknown,
): Result<PersistedCheckpointPointer, PersistedCheckpointError> {
  const invalid = (
    message: string,
  ): Result<never, PersistedCheckpointError> => ({
    ok: false,
    error: { code: "INVALID_PERSISTED_CHECKPOINT", message },
  });
  if (typeof value !== "object" || value === null) {
    return invalid("Persisted checkpoint pointer is not a JSON object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.checkpointSnapshotId !== "string") {
    return invalid(
      "Persisted checkpoint pointer is missing checkpointSnapshotId.",
    );
  }
  const checkpointSnapshotId = parseSha256(record.checkpointSnapshotId);
  if (!checkpointSnapshotId.ok) {
    return invalid(
      "Persisted checkpoint pointer references an invalid SHA-256.",
    );
  }
  let writtenAt: UtcTimestamp | null = null;
  if (record.writtenAt !== null && record.writtenAt !== undefined) {
    if (typeof record.writtenAt !== "string") {
      return invalid("Persisted checkpoint pointer writtenAt is invalid.");
    }
    const parsedWrittenAt = parseUtcTimestamp(record.writtenAt);
    if (!parsedWrittenAt.ok) {
      return invalid("Persisted checkpoint pointer writtenAt is invalid.");
    }
    writtenAt = parsedWrittenAt.value;
  }
  return {
    ok: true,
    value: { checkpointSnapshotId: checkpointSnapshotId.value, writtenAt },
  };
}

type EvidenceReviewView = "catalog" | "candidates" | "rules" | "unresolved";

const identifierRule: CaseIdentifierRule = {
  ruleId: "pbgc-case-id-basic",
  ruleVersion: "1.0.0",
  minimumLength: 3,
  maximumLength: 64,
  syntax: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
  unicodeNormalization: "NFC",
  letterCase: "preserve",
};

const EMPTY_AUTHORITY_OVERRIDES: readonly AuthorityOverride[] = [];
const SYNTHETIC_RULE_SCOPE = "benefit/accrual-freeze/participant-group";

const dependencies = {
  uuid: {
    generate: () => {
      const parsed = parseUuid(globalThis.crypto.randomUUID());
      if (!parsed.ok) throw new Error("Browser UUID generation failed.");
      return parsed.value;
    },
  },
  clock: {
    now: () => {
      const parsed = parseUtcTimestamp(new Date().toISOString());
      if (!parsed.ok) throw new Error("Browser clock generation failed.");
      return parsed.value;
    },
  },
};

function createSessionGovernanceDependencies(): GovernanceDependencies {
  let sequence = 500;
  return {
    now: () => "2026-07-29T13:00:00.000Z",
    uuid: () => {
      sequence += 1;
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
    },
  };
}

interface SessionPreviewOutcome {
  readonly kind: "success" | "error";
  readonly message: string;
}

export interface CaseOrchestrator {
  readonly workspaceReady: boolean;
  readonly workspaceLabel: string;
  readonly workspaceError: string | null;
  readonly fileSystemCapability: FileSystemCapability | null;
  readonly activeCase: CaseRecord | null;
  readonly reviewerIdentity: HumanActor | null;
  readonly cases: readonly CaseRecord[];
  readonly error: string | null;
  readonly busy: boolean;
  readonly quarantineItems: readonly QuarantineQueueItem[];
  readonly eligibilityItems: readonly ArtifactEligibilityReviewItem[];
  readonly classificationItems: readonly ClassificationReviewItem[];
  readonly dateCandidateItems: readonly DateCandidateReviewItem[];
  readonly relationshipItems: readonly RelationshipReviewItem[];
  readonly populationItems: readonly PopulationReviewItem[];
  readonly manifestSummary: ManifestExportSummary | null;
  readonly sharedReviewer: string;
  readonly sharedRationale: string;
  readonly evidenceReviewView: EvidenceReviewView;
  readonly evidenceCatalog: EvidenceCatalog | null;
  readonly provisionCandidates: readonly ProvisionCandidate[];
  readonly ruleAuthorCandidates: readonly RuleAuthorCandidate[];
  readonly candidateNearDuplicates: readonly NearDuplicateRelationship[];
  readonly candidateSupersessions: readonly SupersessionProposal[];
  readonly evidenceReviewMessage: string | null;
  readonly evidenceUnresolvedItems: readonly UnresolvedItem[];
  readonly previewRules: readonly PlanRuleRecord[];
  readonly ruleAuthoringOutcome: SessionPreviewOutcome | null;
  readonly ruleAuthoringBusy: boolean;
  readonly caseOutputExportMessage: string | null;
  readonly caseOutputLinkMessage: string | null;
  readonly caseOutputArtifacts: readonly CaseworkOutputArtifactInput[];
  readonly draftV1Summary: DraftV1SummaryArtifact | null;
  readonly draftV1SummaryMessage: string | null;
  readonly planSummaryRecord: PlanSummaryRecord | null;
  readonly planSummaryMessage: string | null;
  readonly planSummaryDecisions: readonly PlanSummaryDecision[];
  readonly formulaApprovalRecords: readonly FormulaApprovalRecord[];
  readonly initializePlanSummary: () => Promise<void>;
  readonly approvePlanSummaryAttribute: (
    attributeId: string,
    selectedValue: string | null,
    rationale: string,
  ) => Promise<void>;
  readonly approveFormula: (
    cellKey: string,
    scenarioId: string,
    formulaText: string,
    sourcePlanRuleIds: readonly string[],
    rationale: string,
  ) => Promise<void>;
  readonly architectureSelection: ArchitectureSelection | null;
  readonly architectureBuildMessage: string | null;
  readonly architecturePolicyItems: readonly ArchitecturePolicyReviewItem[];
  readonly architecturePolicyApprovals: readonly ArchitecturePolicyApproval[];
  readonly architecturePolicyMessage: string | null;
  readonly caseControls: AuthenticatedCaseControls | null;
  readonly caseControlsMessage: string | null;
  readonly v1Architecture: V1Architecture | null;
  readonly v1BuildSpec: BuildSpecV2 | null;
  readonly v1CompilationResult: CompilationResult | null;
  readonly v1Workbook: V1Workbook | null;
  readonly v1XlsxBytes: Uint8Array | null;
  readonly v1OutputMessage: string | null;
  readonly downloadV1Workbook: () => void;
  readonly finalOutputInput: FinalCaseworkOutputInput | null;
  readonly evidenceItems: readonly ArtifactInventoryItem[];
  readonly evidencePackageSummary: PackageIntakeResult | null;
  readonly evidenceRestoreMessage: string | null;
  readonly evidenceViewerArtifact: EvidenceViewerArtifact | null;
  readonly evidenceViewerLoading: boolean;
  readonly evidenceViewerError: string | null;
  readonly setSharedReviewer: (value: string) => void;
  readonly setSharedRationale: (value: string) => void;
  readonly setEvidenceReviewView: (view: EvidenceReviewView) => void;
  readonly setManifestSummary: (summary: ManifestExportSummary | null) => void;
  readonly selectWorkspace: () => Promise<void>;
  readonly createProduction: (input: {
    readonly authoritativeCaseId: string;
  }) => Promise<void>;
  readonly establishReviewerIdentity: (
    reviewerId: string,
    reviewerDisplayName: string,
  ) => void;
  readonly openCase: (caseId: string) => void;
  readonly returnToWorkspaceHome: () => void;
  readonly resolveCollision: (
    collision: CaseCollision,
    input: CollisionResolutionInput,
  ) => Promise<void>;
  readonly resetEvidenceSessionPreview: () => void;
  readonly recordUnresolvedAction: (
    item: UnresolvedItem,
    action: string,
    interpretationId: string | null,
    reviewer: string,
    rationale: string,
  ) => Promise<{ ok: boolean; message: string }>;
  readonly recordRuleAuthoring: (draft: RuleAuthoringDraft) => Promise<void>;
  readonly recordQuarantineDecision: (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordArtifactEligibilityDecision: (
    item: ArtifactEligibilityReviewItem,
    action: "approve" | "block" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordClassificationDecision: (
    item: ClassificationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordRelationshipDecision: (
    item: RelationshipReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordDateSelection: (
    item: DateCandidateReviewItem,
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordPopulationDecision: (
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordArchitecturePolicyApproval: (
    item: ArchitecturePolicyReviewItem,
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordCaseControls: (draft: {
    readonly singleCalculation: boolean;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly reviewer: string;
    readonly rationale: string;
  }) => Promise<void>;
  readonly linkCaseOutputArtifact: (
    draft: CaseOutputArtifactLinkDraft,
  ) => Promise<void>;
  readonly exportFinalCaseworkOutputPackage: () => Promise<void>;
  readonly exportCurrentManifest: () => Promise<void>;
  readonly generateDraftV1Summary: (file: File) => Promise<void>;
  readonly recordArchitectureSelection: (
    selection: ArchitectureSelection,
  ) => Promise<void>;
  readonly processPackage: (
    files: readonly File[],
    signal: AbortSignal,
    update: (items: readonly ArtifactInventoryItem[]) => void,
  ) => Promise<PackageIntakeResult>;
  readonly openEvidence: (item: ArtifactInventoryItem) => Promise<void>;
  readonly saveEvidenceCorrection: (correctedText: string) => Promise<void>;
  readonly closeEvidence: () => void;
  readonly setError: (error: string | null) => void;
  readonly setView: (view: unknown) => void;
  readonly view: unknown;
}

export function useCaseOrchestrator(
  evidenceGovernanceDependencies?: GovernanceDependencies,
): CaseOrchestrator {
  const workspace = useRef<BrowserDirectoryWorkspace | null>(null);
  const catalog = useRef<WorkspaceCatalog | null>(null);
  const registry = useRef<CaseRegistry | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState(
    "Select an approved local directory. No case data leaves this device.",
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const fileSystemCapability = detectFileSystemCapability(
    globalThis,
    PRODUCTION_CAPABILITY_POLICY,
  );
  const [view, setView] = useState<unknown>({ kind: "ready" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null);
  const [cases, setCases] = useState<readonly CaseRecord[]>([]);
  const [reviewerIdentity, setReviewerIdentity] = useState<HumanActor | null>(
    null,
  );
  const activeCaseId = useRef<Uuid | null>(null);
  const priorSnapshot = useRef<PackageSnapshot | null>(null);
  const inventoryCheckpoints = useRef(
    new Map<string, InventoryCheckpointReference>(),
  );
  const lastCheckpoint = useRef<InventoryCheckpointReference | null>(null);
  const quarantineHistory = useRef(new Map<string, QuarantineDecision[]>());
  const eligibilityHistory = useRef(
    new Map<string, ArtifactEligibilityDecision[]>(),
  );
  const classificationHistory = useRef(
    new Map<string, ClassificationApproval[]>(),
  );
  const relationshipHistory = useRef(new Map<string, RelationshipDecision[]>());
  const populationHistory = useRef(
    new Map<string, PopulationCandidateDecision[]>(),
  );
  const caseReviewState = useRef<CaseReviewState>(createEmptyCaseReviewState());
  const [quarantineItems, setQuarantineItems] = useState<
    readonly QuarantineQueueItem[]
  >([]);
  const [eligibilityItems, setEligibilityItems] = useState<
    readonly ArtifactEligibilityReviewItem[]
  >([]);
  const [classificationItems, setClassificationItems] = useState<
    readonly ClassificationReviewItem[]
  >([]);
  const [dateCandidateItems, setDateCandidateItems] = useState<
    readonly DateCandidateReviewItem[]
  >([]);
  const [relationshipItems, setRelationshipItems] = useState<
    readonly RelationshipReviewItem[]
  >([]);
  const [populationItems, setPopulationItems] = useState<
    readonly PopulationReviewItem[]
  >([]);
  const [manifestSummary, setManifestSummary] =
    useState<ManifestExportSummary | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<
    readonly ArtifactInventoryItem[]
  >([]);
  const [evidencePackageSummary, setEvidencePackageSummary] =
    useState<PackageIntakeResult | null>(null);
  const [evidenceRestoreMessage, setEvidenceRestoreMessage] = useState<
    string | null
  >(null);
  const [evidenceViewerArtifact, setEvidenceViewerArtifact] =
    useState<EvidenceViewerArtifact | null>(null);
  const [evidenceViewerLoading, setEvidenceViewerLoading] = useState(false);
  const [evidenceViewerError, setEvidenceViewerError] = useState<string | null>(
    null,
  );
  const [sharedReviewer, setSharedReviewer] = useState("");
  const [sharedRationale, setSharedRationale] = useState("");
  const [evidenceReviewView, setEvidenceReviewView] =
    useState<EvidenceReviewView>("catalog");
  const evidenceCatalogRef = useRef<EvidenceCatalog | null>(null);
  const [evidenceCatalog, setEvidenceCatalog] =
    useState<EvidenceCatalog | null>(null);
  const [provisionCandidates, setProvisionCandidates] = useState<
    readonly ProvisionCandidate[]
  >([]);
  const [candidateNearDuplicates, setCandidateNearDuplicates] = useState<
    readonly NearDuplicateRelationship[]
  >([]);
  const [candidateSupersessions, setCandidateSupersessions] = useState<
    readonly SupersessionProposal[]
  >([]);
  const [evidenceReviewMessage, setEvidenceReviewMessage] = useState<
    string | null
  >(null);
  const [evidenceUnresolvedItems, setEvidenceUnresolvedItems] = useState<
    readonly UnresolvedItem[]
  >(() => evidenceReviewDemo.unresolvedItems);
  const [evidenceUnresolvedRecords, setEvidenceUnresolvedRecords] = useState<
    readonly UnresolvedItem[]
  >(() => evidenceReviewDemo.unresolvedItems);
  const [previewRules, setPreviewRules] = useState<readonly PlanRuleRecord[]>(
    [],
  );
  const [ruleAuthoringOutcome, setRuleAuthoringOutcome] =
    useState<SessionPreviewOutcome | null>(null);
  const [ruleAuthoringBusy, setRuleAuthoringBusy] = useState(false);
  const ruleAuthorCandidates = useMemo(
    () => buildRuleAuthorCandidates(evidenceCatalog, provisionCandidates),
    [evidenceCatalog, provisionCandidates],
  );
  const [caseOutputExportMessage, setCaseOutputExportMessage] = useState<
    string | null
  >(null);
  const [caseOutputLinkMessage, setCaseOutputLinkMessage] = useState<
    string | null
  >(null);
  const [caseOutputArtifacts, setCaseOutputArtifacts] = useState<
    readonly CaseworkOutputArtifactInput[]
  >([]);
  const [draftV1Summary, setDraftV1Summary] =
    useState<DraftV1SummaryArtifact | null>(null);
  const [draftV1SummaryMessage, setDraftV1SummaryMessage] = useState<
    string | null
  >(null);
  const [architectureSelection, setArchitectureSelection] =
    useState<ArchitectureSelection | null>(null);
  const [architectureBuildMessage, setArchitectureBuildMessage] = useState<
    string | null
  >(null);
  const [architecturePolicyItems, setArchitecturePolicyItems] = useState<
    readonly ArchitecturePolicyReviewItem[]
  >([]);
  const [architecturePolicyApprovals, setArchitecturePolicyApprovals] =
    useState<readonly ArchitecturePolicyApproval[]>([]);
  const [architecturePolicyMessage, setArchitecturePolicyMessage] = useState<
    string | null
  >(null);
  const [caseControls, setCaseControls] =
    useState<AuthenticatedCaseControls | null>(null);
  const [caseControlsMessage, setCaseControlsMessage] = useState<string | null>(
    null,
  );
  const [v1Architecture, setV1Architecture] = useState<V1Architecture | null>(
    null,
  );
  const [v1BuildSpec, setV1BuildSpec] = useState<BuildSpecV2 | null>(null);
  const [v1CompilationResult, setV1CompilationResult] =
    useState<CompilationResult | null>(null);
  const [v1Workbook, setV1Workbook] = useState<V1Workbook | null>(null);
  const [v1XlsxBytes, setV1XlsxBytes] = useState<Uint8Array | null>(null);
  const [v1OutputMessage, setV1OutputMessage] = useState<string | null>(null);
  const [planSummaryRecord, setPlanSummaryRecord] =
    useState<PlanSummaryRecord | null>(null);
  const [planSummaryMessage, setPlanSummaryMessage] = useState<string | null>(
    null,
  );
  const [planSummaryDecisions, setPlanSummaryDecisions] = useState<
    readonly PlanSummaryDecision[]
  >([]);
  const [formulaApprovalRecords, setFormulaApprovalRecords] = useState<
    readonly FormulaApprovalRecord[]
  >([]);

  const [sessionGovernanceDependencies, setSessionGovernanceDependencies] =
    useState<GovernanceDependencies>(createSessionGovernanceDependencies);
  const activeGovernanceDependencies =
    evidenceGovernanceDependencies ?? sessionGovernanceDependencies;

  const storeQuarantineItems = (
    items: readonly QuarantineQueueItem[],
  ): void => {
    caseReviewState.current = {
      ...caseReviewState.current,
      quarantineItems: items,
    };
    setQuarantineItems(items);
  };
  const storeEligibilityItems = (
    items: readonly ArtifactEligibilityReviewItem[],
  ): void => {
    caseReviewState.current = {
      ...caseReviewState.current,
      eligibilityItems: items,
    };
    setEligibilityItems(items);
  };
  const storeClassificationItems = (
    items: readonly ClassificationReviewItem[],
  ): void => {
    caseReviewState.current = {
      ...caseReviewState.current,
      classificationItems: items,
    };
    setClassificationItems(items);
  };
  const storeDateCandidateItems = (
    items: readonly DateCandidateReviewItem[],
  ): void => {
    caseReviewState.current = {
      ...caseReviewState.current,
      dateCandidateItems: items,
    };
    setDateCandidateItems(items);
  };
  const storeRelationshipItems = (
    items: readonly RelationshipReviewItem[],
  ): void => {
    caseReviewState.current = {
      ...caseReviewState.current,
      relationshipItems: items,
    };
    setRelationshipItems(items);
  };
  const storePopulationItems = (
    items: readonly PopulationReviewItem[],
  ): void => {
    caseReviewState.current = {
      ...caseReviewState.current,
      populationItems: items,
    };
    setPopulationItems(items);
  };

  const resetCaseScopedState = (previewMode: boolean): void => {
    priorSnapshot.current = null;
    inventoryCheckpoints.current.clear();
    lastCheckpoint.current = null;
    quarantineHistory.current.clear();
    eligibilityHistory.current.clear();
    classificationHistory.current.clear();
    relationshipHistory.current.clear();
    populationHistory.current.clear();
    caseReviewState.current = createEmptyCaseReviewState();
    setQuarantineItems([]);
    setEligibilityItems([]);
    setClassificationItems([]);
    setDateCandidateItems([]);
    setRelationshipItems([]);
    setPopulationItems([]);
    setManifestSummary(null);
    setEvidenceItems([]);
    setEvidencePackageSummary(null);
    setEvidenceRestoreMessage(null);
    setEvidenceViewerArtifact(null);
    setEvidenceViewerLoading(false);
    setEvidenceViewerError(null);
    setSharedReviewer("");
    setSharedRationale("");
    setEvidenceReviewView("catalog");
    evidenceCatalogRef.current = null;
    setEvidenceCatalog(null);
    setProvisionCandidates([]);
    setCandidateNearDuplicates([]);
    setCandidateSupersessions([]);
    setEvidenceReviewMessage(null);
    setEvidenceUnresolvedItems(
      previewMode ? evidenceReviewDemo.unresolvedItems : [],
    );
    setEvidenceUnresolvedRecords(
      previewMode ? evidenceReviewDemo.unresolvedItems : [],
    );
    setPreviewRules([]);
    setRuleAuthoringOutcome(null);
    setRuleAuthoringBusy(false);
    setCaseOutputArtifacts([]);
    setCaseOutputLinkMessage(null);
    setCaseOutputExportMessage(null);
    setDraftV1Summary(null);
    setDraftV1SummaryMessage(null);
    setArchitectureSelection(null);
    setArchitectureBuildMessage(null);
    setArchitecturePolicyItems([]);
    setArchitecturePolicyApprovals([]);
    setArchitecturePolicyMessage(null);
    setCaseControls(null);
    setCaseControlsMessage(null);
    setV1BuildSpec(null);
    setV1CompilationResult(null);
    setV1Workbook(null);
    setV1XlsxBytes(null);
    setV1OutputMessage(null);
    setPlanSummaryRecord(null);
    setPlanSummaryMessage(null);
    setPlanSummaryDecisions([]);
    setFormulaApprovalRecords([]);
  };

  const activateCase = (caseRecord: CaseRecord) => {
    if (activeCase?.caseId !== caseRecord.caseId) {
      resetCaseScopedState(false);
    }
    activeCaseId.current = caseRecord.caseId;
    setActiveCase(caseRecord);
    void loadCaseOutputArtifactReferences(caseRecord);
    void loadDraftV1SummaryArtifact(caseRecord);
    void loadArchitectureSelection(caseRecord);
    void loadPersistedCaseState(caseRecord);
  };

  const selectWorkspace = async (): Promise<void> => {
    setBusy(true);
    setWorkspaceError(null);
    try {
      const capability = fileSystemCapability;
      if (capability.mode !== "production-local-workspace") {
        setWorkspaceError(
          capability.blockingReasons.includes("DIRECTORY_PICKER_UNAVAILABLE")
            ? "This browser cannot select a production local workspace. Use an approved Chromium or Edge profile."
            : capability.blockingReasons.includes("SECURE_CONTEXT_REQUIRED")
              ? "This browser is not running in a secure context. Use https or file://."
              : "This browser cannot select a production local workspace. Use an approved Chromium or Edge profile.",
        );
        return;
      }
      const picker = (
        globalThis as typeof globalThis & {
          showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker;
      if (typeof picker !== "function") {
        setWorkspaceError(
          "This browser cannot select a production local workspace. Use an approved Chromium or Edge profile.",
        );
        return;
      }
      const handle = await picker();
      const selected = new BrowserDirectoryWorkspace(handle);
      const index = await selected.stat("case-index.json");
      if (index.ok) {
        const opened = await openCaseWorkspace(selected);
        if (!opened.ok) {
          setWorkspaceError(opened.error.safeMessage);
          return;
        }
        catalog.current = opened.value.catalog;
        registry.current = new CaseRegistry(dependencies, opened.value.cases);
      } else if (index.error.code === "NOT_FOUND") {
        catalog.current = {
          schemaVersion: "1.0.0",
          workspaceId: dependencies.uuid.generate(),
          createdAt: dependencies.clock.now(),
          cases: [],
        };
        registry.current = new CaseRegistry(dependencies);
      } else {
        setWorkspaceError(
          "The selected workspace could not be read safely. No workspace files were changed.",
        );
        return;
      }
      workspace.current = selected;
      setWorkspaceReady(true);
      setWorkspaceLabel(`Selected local workspace: ${handle.name}`);
      setCases(registry.current.cases());
      setView({ kind: "identity" });
    } catch {
      setWorkspaceError(
        "Workspace selection was cancelled or could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const establishReviewerIdentity = (
    reviewerId: string,
    reviewerDisplayName: string,
  ): void => {
    setReviewerIdentity({
      actorType: "human",
      actorKey: reviewerId,
      displayName: reviewerDisplayName,
      authorityContext: "case-intake-and-collision-review",
    });
    setView({ kind: "ready" });
  };

  const openCase = (caseId: string): void => {
    setBusy(true);
    setError(null);
    const activeRegistry = registry.current;
    if (activeRegistry === null) {
      setError("The local case registry is unavailable.");
      setBusy(false);
      return;
    }
    const caseRecord = activeRegistry.cases().find((c) => c.caseId === caseId);
    if (caseRecord === undefined) {
      setError("The selected case was not found in the workspace.");
      setBusy(false);
      return;
    }
    activateCase(caseRecord);
    setView({ kind: "ready" });
    setBusy(false);
  };

  const returnToWorkspaceHome = (): void => {
    activeCaseId.current = null;
    resetCaseScopedState(true);
    setActiveCase(null);
    setView({ kind: "ready" });
  };

  const createProduction = async ({
    authoritativeCaseId,
  }: {
    readonly authoritativeCaseId: string;
  }): Promise<void> => {
    setError(null);
    const activeRegistry = registry.current;
    if (!workspaceReady || activeRegistry === null) {
      setError("Select an approved local workspace before creating a case.");
      return;
    }
    if (reviewerIdentity === null) {
      setError("Reviewer identity must be established before creating a case.");
      return;
    }
    const validated = validateCaseIdentifier(
      authoritativeCaseId,
      identifierRule,
    );
    if (!validated.ok) {
      setError(validated.error.safeMessage);
      return;
    }
    setBusy(true);
    const before = activeRegistry.cases();
    const result = activeRegistry.create({
      authoritativeCaseId: validated.value.value,
      purpose: "production",
      designationRationale: null,
      createdBy: reviewerIdentity,
    });
    if (result.kind === "rejected") {
      setError(result.error.safeMessage);
    } else if (result.kind === "collision") {
      setView({ kind: "collision", collision: result });
    } else if (!(await persistCreatedCase(result.caseRecord))) {
      registry.current = new CaseRegistry(dependencies, before);
      setCases(before);
    } else {
      setView({
        kind: "created",
        caseRecord: result.caseRecord,
        message: "Production case created",
        collisionDecisionRecorded: false,
      });
      setCases(activeRegistry.cases());
      activateCase(result.caseRecord);
    }
    setBusy(false);
  };

  const resolveCollision = async (
    collision: CaseCollision,
    input: CollisionResolutionInput,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    const activeRegistry = registry.current;
    if (activeRegistry === null) {
      setError("The local case registry is unavailable.");
      setBusy(false);
      return;
    }
    const before = activeRegistry.cases();
    const resolution = activeRegistry.resolveCollision(collision, input);
    if (!resolution.ok) {
      setError(resolution.error.safeMessage);
      setBusy(false);
      return;
    }
    if (!(await persistDecision(resolution.value.decision))) {
      registry.current = new CaseRegistry(dependencies, before);
      setCases(before);
      setBusy(false);
      return;
    }
    if (resolution.value.kind === "resumed-existing") {
      setView({
        kind: "resumed",
        caseRecord: collision.existingCase,
        message: "Resume decision recorded",
      });
      setCases(activeRegistry.cases());
      activateCase(collision.existingCase);
    } else if (await persistCreatedCase(resolution.value.caseRecord)) {
      setView({
        kind: "created",
        caseRecord: resolution.value.caseRecord,
        message: `${resolution.value.caseRecord.purpose} case created`,
        collisionDecisionRecorded: true,
      });
      setCases(activeRegistry.cases());
      activateCase(resolution.value.caseRecord);
    } else {
      registry.current = new CaseRegistry(dependencies, before);
      setCases(before);
    }
    setBusy(false);
  };

  const persistCreatedCase = async (
    caseRecord: CaseRecord,
  ): Promise<boolean> => {
    const activeWorkspace = workspace.current;
    const activeCatalog = catalog.current;
    if (activeWorkspace === null || activeCatalog === null) {
      setError("The selected local workspace is unavailable.");
      return false;
    }
    const nextCatalog: WorkspaceCatalog = {
      ...activeCatalog,
      cases: [...activeCatalog.cases, caseIndexEntry(caseRecord)].sort(
        (left, right) => left.caseId.localeCompare(right.caseId),
      ),
    };
    const saved = await saveCaseWorkspace(
      activeWorkspace,
      nextCatalog,
      caseRecord,
    );
    if (!saved.ok) {
      setError(saved.error.safeMessage);
      return false;
    }
    catalog.current = nextCatalog;
    return true;
  };

  const persistDecision = async (
    decision: ReturnType<CaseRegistry["collisionHistory"]>[number],
  ): Promise<boolean> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) {
      setError("The selected local workspace is unavailable.");
      return false;
    }
    const bytes = new TextEncoder().encode(`${canonicalize(decision)}\n`);
    const saved = await activeWorkspace.append(
      "case-collision-decisions.jsonl",
      bytes,
    );
    if (!saved.ok) {
      setError("The collision decision could not be preserved locally.");
      return false;
    }
    return true;
  };

  const recordUnresolvedAction = async (
    item: UnresolvedItem,
    action: string,
    interpretationId: string | null,
    reviewer: string,
    rationale: string,
  ) => {
    const result = await resolveItem(
      item,
      action as "accept" | "reject" | "supersede" | "branch",
      interpretationId,
      rationale,
      {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext:
          activeCase === null
            ? "synthetic-session-preview"
            : "Locally asserted unresolved-item reviewer",
      },
      activeGovernanceDependencies,
    );
    if (!result.ok) {
      return {
        ok: false,
        message: `Resolution validation failed: ${result.error}`,
      };
    }
    const revisions = [
      result.value.item,
      ...(result.value.branchedItem === null
        ? []
        : [result.value.branchedItem]),
    ];
    if (activeCase !== null && workspace.current !== null) {
      const persisted = await appendUnresolvedItems(
        workspace.current,
        activeCase.caseId,
        revisions,
      );
      if (!persisted.ok) {
        return { ok: false, message: persisted.error.safeMessage };
      }
      setEvidenceUnresolvedRecords(persisted.value);
      setEvidenceUnresolvedItems(latestUnresolvedItems(persisted.value));
    } else {
      setEvidenceUnresolvedItems((current) => [
        ...current.map((candidate) =>
          candidate.itemId === item.itemId ? result.value.item : candidate,
        ),
        ...(result.value.branchedItem === null
          ? []
          : [result.value.branchedItem]),
      ]);
      setEvidenceUnresolvedRecords((current) => [...current, ...revisions]);
    }
    setRuleAuthoringOutcome(null);
    return {
      ok: true,
      message:
        activeCase === null
          ? `${action} passed governed validation in this synthetic session preview. The decision was not persisted.`
          : `${action} was appended to the active case unresolved-item history.`,
    };
  };

  const recordRuleAuthoring = async (draft: RuleAuthoringDraft) => {
    setRuleAuthoringBusy(true);
    setRuleAuthoringOutcome(null);
    const selectedIds = new Set(draft.candidateIds);
    const sources =
      activeCase === null && evidenceCatalog === null
        ? evidenceReviewDemo.candidates
        : ruleAuthorCandidates;
    const selectedCandidates = sources
      .filter((entry) => selectedIds.has(entry.candidate.candidateId))
      .map((entry) => entry.candidate);
    const primaryCandidate = selectedCandidates.find(
      (candidate) =>
        candidate.artifactSha256 === draft.primaryCitation.artifactSha256 &&
        candidate.artifactLocator === draft.primaryCitation.artifactLocator,
    );
    const catalog = evidenceCatalogRef.current ?? evidenceReviewDemo.catalog;
    const predecessor =
      draft.predecessorRuleId === null
        ? null
        : (previewRules.find(
            (rule) => rule.ruleId === draft.predecessorRuleId,
          ) ?? null);
    const result = await authorRule(
      {
        proposedCandidates: selectedCandidates,
        primaryCitation: draft.primaryCitation,
        catalog,
        unresolvedRecords: evidenceUnresolvedRecords,
        authorityOverrides: EMPTY_AUTHORITY_OVERRIDES,
        governingRestatement: draft.governingRestatement,
        effectiveDate: draft.effectiveDate,
        endDate: null,
        adoptionOrExecutionDate:
          primaryCandidate?.extractedAdoptionDate ?? null,
        applicabilityConditions: [
          {
            dimension: draft.applicabilityDimension,
            value: draft.applicabilityValue,
            evidence: [draft.primaryCitation],
          },
        ],
        requiredApplicabilityDimensions: [draft.applicabilityDimension],
        affectedScope: `provision/${primaryCandidate?.provisionIdentifier ?? SYNTHETIC_RULE_SCOPE}`,
        reviewer: {
          actorType: "human",
          actorKey: draft.reviewer,
          displayName: draft.reviewer,
          authorityContext:
            activeCase === null
              ? `synthetic-session-preview: ${draft.rationale}`
              : `case-orchestrator: ${draft.rationale}`,
        },
        approvalRationale: draft.rationale,
        confidence: Math.min(
          ...selectedCandidates.map((candidate) => candidate.confidence),
        ),
        predecessor,
        linkType: predecessor === null ? undefined : "supersession",
        ruleSetVersion: "feature-001-plan-rule-v1",
      },
      activeGovernanceDependencies,
    );
    if (!result.ok) {
      setRuleAuthoringOutcome({
        kind: "error",
        message: `${result.error.code}: ${result.error.message}`,
      });
      setRuleAuthoringBusy(false);
      return;
    }
    const persisted = await persistPlanRuleRecord(result.value);
    setPreviewRules((current) => [...current, result.value]);
    setRuleAuthoringOutcome({
      kind: "success",
      message: persisted
        ? `Governed validation passed and the plan-rule record was persisted locally for this case effective ${result.value.effectiveDate}.`
        : `Governed validation passed for a synthetic session preview effective ${result.value.effectiveDate}. Select a workspace and active case to persist rule records.`,
    });
    setCaseOutputExportMessage(null);
    setRuleAuthoringBusy(false);
  };

  const resetEvidenceSessionPreview = () => {
    if (evidenceGovernanceDependencies === undefined) {
      setSessionGovernanceDependencies(createSessionGovernanceDependencies());
    }
    setEvidenceUnresolvedItems(evidenceReviewDemo.unresolvedItems);
    setEvidenceUnresolvedRecords(evidenceReviewDemo.unresolvedItems);
    setPreviewRules([]);
    setRuleAuthoringOutcome(null);
    setRuleAuthoringBusy(false);
  };

  const recordQuarantineDecision = async (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null || priorSnapshot.current === null) {
      throw new Error("Active evidence checkpoint is unavailable.");
    }
    const artifactSha256 = parseSha256(item.artifactSha256);
    if (!artifactSha256.ok) throw new Error("Artifact hash is invalid.");
    const history = quarantineHistory.current.get(item.artifactSha256) ?? [];
    const prior = history.at(-1) ?? null;
    const resultingStatus =
      action === "release" || action === "inherit-release"
        ? ("released" as const)
        : action === "final-quarantine"
          ? ("final-quarantine" as const)
          : action === "reject"
            ? ("rejected" as const)
            : ("revoked" as const);
    const base = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      artifactSha256: artifactSha256.value,
      findingIds: item.findingIds,
      action,
      resultingStatus,
      ruleSetVersion: "feature-009-screening-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: QuarantineDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await quarantineDecisionContentHash(base),
      reviewer: {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted authorized reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
    };
    const nextHistory = [...history, decision];
    const replay = await replayQuarantineDecisions(
      artifactSha256.value,
      nextHistory,
    );
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    const currentEligibilityHistory =
      eligibilityHistory.current.get(item.artifactSha256) ?? [];
    const eligibilityReplay = await replayArtifactEligibility(
      artifactSha256.value,
      currentEligibilityHistory,
      nextHistory,
    );
    if (!eligibilityReplay.ok)
      throw new Error(eligibilityReplay.error.safeMessage);
    const nextItems = caseReviewState.current.quarantineItems.map(
      (candidate) =>
        candidate.artifactSha256 === item.artifactSha256
          ? {
              ...candidate,
              effectiveHumanStatus: resultingStatus,
              reviewer,
              rationale,
              nextAction:
                resultingStatus === "released"
                  ? "The safety hold is released. Separate artifact eligibility approval is still required."
                  : "Disposition recorded. A later permitted typed decision requires predecessor linkage.",
            }
          : candidate,
    );
    const nextEligibilityItems = caseReviewState.current.eligibilityItems.map(
      (candidate) =>
        candidate.artifactSha256 === artifactSha256.value
          ? {
              ...candidate,
              quarantineReleased: replay.value.eligible,
              projection: eligibilityReplay.value,
            }
          : candidate,
    );
    const nextState: CaseReviewState = {
      ...caseReviewState.current,
      quarantineItems: nextItems,
      eligibilityItems: nextEligibilityItems,
      quarantineDecisions: [
        ...caseReviewState.current.quarantineDecisions,
        decision,
      ],
    };
    await appendReviewEvent({ eventType: "quarantine-decision", decision });
    await persistCaseReviewState(
      activeCase.caseId,
      priorSnapshot.current.snapshotId,
      nextState,
    );
    quarantineHistory.current.set(item.artifactSha256, nextHistory);
    caseReviewState.current = nextState;
    setQuarantineItems(nextItems);
    setEligibilityItems(nextEligibilityItems);
    await refreshGovernedEvidenceRecords(activeCase.caseId);
  };

  const recordArtifactEligibilityDecision = async (
    item: ArtifactEligibilityReviewItem,
    action: "approve" | "block" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null || priorSnapshot.current === null) {
      throw new Error("Active evidence checkpoint is unavailable.");
    }
    const artifactSha256 = parseSha256(item.artifactSha256);
    if (!artifactSha256.ok) throw new Error("Artifact hash is invalid.");
    const history = eligibilityHistory.current.get(item.artifactSha256) ?? [];
    const prior = history.at(-1) ?? null;
    const quarantineDecisions =
      quarantineHistory.current.get(item.artifactSha256) ?? [];
    const quarantine = await replayQuarantineDecisions(
      artifactSha256.value,
      quarantineDecisions,
    );
    if (!quarantine.ok) throw new Error(quarantine.error.safeMessage);
    const releaseDecision = item.requiresQuarantineRelease
      ? quarantineDecisions.find(
          (decision) =>
            decision.decisionId === quarantine.value.effectiveDecisionId &&
            decision.resultingStatus === "released",
        )
      : undefined;
    if (
      action === "approve" &&
      item.requiresQuarantineRelease &&
      (!quarantine.value.eligible || releaseDecision === undefined)
    ) {
      throw new Error(
        "An effective same-artifact quarantine release is required before eligibility approval.",
      );
    }
    const decisionAction: ArtifactEligibilityDecision["action"] =
      action === "approve" && item.requiresQuarantineRelease
        ? "inherit-approval"
        : action;
    const resultingStatus: ArtifactEligibilityDecision["resultingStatus"] =
      action === "approve"
        ? "eligible"
        : action === "block"
          ? "blocked"
          : action === "revoke"
            ? "revoked"
            : "superseded";
    const base = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      artifactSha256: artifactSha256.value,
      action: decisionAction,
      resultingStatus,
      sourceQuarantineDecisionContentSha256:
        releaseDecision?.decisionContentSha256 ?? null,
      ruleSetVersion: "feature-009-screening-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: ArtifactEligibilityDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await artifactEligibilityContentHash(base),
      sourceQuarantineDecisionId: releaseDecision?.decisionId ?? null,
      actor: {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted artifact eligibility reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
    };
    const nextHistory = [...history, decision];
    const replay = await replayArtifactEligibility(
      artifactSha256.value,
      nextHistory,
      quarantineDecisions,
    );
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    const nextItems = caseReviewState.current.eligibilityItems.map(
      (candidate) =>
        candidate.artifactSha256 === artifactSha256.value
          ? {
              ...candidate,
              quarantineReleased:
                candidate.requiresQuarantineRelease &&
                quarantine.value.eligible,
              projection: replay.value,
            }
          : candidate,
    );
    const nextQuarantineItems = caseReviewState.current.quarantineItems.map(
      (candidate) =>
        candidate.artifactSha256 === artifactSha256.value
          ? { ...candidate, eligibilityDecisionCount: nextHistory.length }
          : candidate,
    );
    const nextState: CaseReviewState = {
      ...caseReviewState.current,
      quarantineItems: nextQuarantineItems,
      eligibilityItems: nextItems,
      eligibilityDecisions: [
        ...caseReviewState.current.eligibilityDecisions,
        decision,
      ],
    };
    await appendReviewEvent({
      eventType: "artifact-eligibility-decision",
      decision,
    });
    await persistCaseReviewState(
      activeCase.caseId,
      priorSnapshot.current.snapshotId,
      nextState,
    );
    eligibilityHistory.current.set(item.artifactSha256, nextHistory);
    caseReviewState.current = nextState;
    setQuarantineItems(nextQuarantineItems);
    setEligibilityItems(nextItems);
    await refreshGovernedEvidenceRecords(activeCase.caseId);
  };

  const recordClassificationDecision = async (
    item: ClassificationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null || priorSnapshot.current === null) {
      throw new Error("Active evidence checkpoint is unavailable.");
    }
    const history =
      classificationHistory.current.get(item.proposal.proposalKey) ?? [];
    const prior = history.at(-1) ?? null;
    const status =
      action === "approve"
        ? ("approved" as const)
        : action === "reject"
          ? ("rejected" as const)
          : action === "revoke"
            ? ("revoked" as const)
            : ("superseded" as const);
    const base = {
      appendOrdinal: history.length + 1,
      priorApprovalId: prior?.approvalId ?? null,
      priorApprovalContentSha256: prior?.decisionContentSha256 ?? null,
      proposalKey: item.proposal.proposalKey,
      artifactSha256: item.proposal.artifactSha256,
      decisionType: action,
      status,
      ruleSetVersion: "feature-009-classification-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: ClassificationApproval = {
      ...base,
      approvalId: dependencies.uuid.generate(),
      decisionContentSha256: await classificationDecisionContentHash(base),
      actor: {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted classification reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
    };
    const replay = await replayClassificationApprovals(item.proposal, [
      ...history,
      decision,
    ]);
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    const nextHistory = [...history, decision];
    const nextItems = caseReviewState.current.classificationItems.map(
      (candidate) =>
        candidate.proposal.proposalKey === item.proposal.proposalKey
          ? {
              ...candidate,
              effectiveStatus: replay.value.status,
              reviewer,
              rationale,
              provenanceCount: replay.value.provenance.length,
            }
          : candidate,
    );
    const nextState: CaseReviewState = {
      ...caseReviewState.current,
      classificationItems: nextItems,
      classificationDecisions: [
        ...caseReviewState.current.classificationDecisions,
        decision,
      ],
    };
    await appendReviewEvent({ eventType: "classification-decision", decision });
    await persistCaseReviewState(
      activeCase.caseId,
      priorSnapshot.current.snapshotId,
      nextState,
    );
    classificationHistory.current.set(item.proposal.proposalKey, nextHistory);
    caseReviewState.current = nextState;
    setClassificationItems(nextItems);
    await refreshGovernedEvidenceRecords(activeCase.caseId);
  };

  const recordRelationshipDecision = async (
    item: RelationshipReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null || priorSnapshot.current === null) {
      throw new Error("Active evidence checkpoint is unavailable.");
    }
    const key = item.relationship.relationshipKey;
    const history = relationshipHistory.current.get(key) ?? [];
    const prior = history.at(-1) ?? null;
    const resultingGovernedStatus =
      action === "approve"
        ? ("approved" as const)
        : action === "reject"
          ? ("rejected" as const)
          : action === "revoke"
            ? ("revoked" as const)
            : ("superseded" as const);
    const base: Omit<
      RelationshipDecision,
      | "decisionId"
      | "decisionContentSha256"
      | "actor"
      | "decidedAt"
      | "rationale"
      | "evidenceConsidered"
    > = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      relationshipKey: key,
      fromSha256: item.relationship.fromSha256,
      toSha256: item.relationship.toSha256,
      decisionType: action,
      resultingGovernedStatus,
      ruleSetVersion: "feature-009-classification-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: RelationshipDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await relationshipDecisionContentHash(base),
      actor: {
        actorType: "human" as const,
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted relationship reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
      evidenceConsidered: item.relationship.supportingEvidence,
    };
    const replay = await replayRelationshipDecisions(item.relationship, [
      ...history,
      decision,
    ]);
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    const nextHistory = [...history, decision];
    const nextItems = caseReviewState.current.relationshipItems.map(
      (candidate) =>
        candidate.relationship.relationshipKey === key
          ? {
              ...candidate,
              effectiveStatus: replay.value.status,
              rationale,
              provenanceCount: replay.value.provenance.length,
            }
          : candidate,
    );
    const nextState: CaseReviewState = {
      ...caseReviewState.current,
      relationshipItems: nextItems,
      relationshipDecisions: [
        ...caseReviewState.current.relationshipDecisions,
        decision,
      ],
    };
    await appendReviewEvent({ eventType: "relationship-decision", decision });
    await persistCaseReviewState(
      activeCase.caseId,
      priorSnapshot.current.snapshotId,
      nextState,
    );
    relationshipHistory.current.set(key, nextHistory);
    caseReviewState.current = nextState;
    setRelationshipItems(nextItems);
  };

  const recordDateSelection = async (
    item: DateCandidateReviewItem,
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null || priorSnapshot.current === null) {
      throw new Error("Active evidence checkpoint is unavailable.");
    }
    const decision: DateSelectionDecision = {
      decisionId: dependencies.uuid.generate(),
      artifactSha256: item.candidate.artifactSha256,
      selectedCandidateKey: item.candidate.candidateKey,
      actor: {
        actorType: "human" as const,
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted date-candidate reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
      ruleSetVersion: "feature-009-classification-v1",
    };
    const validation = validateDateSelection(
      caseReviewState.current.dateCandidateItems.map(
        (candidate) => candidate.candidate,
      ),
      decision,
    );
    if (!validation.ok) throw new Error(validation.error.safeMessage);
    const nextItems = caseReviewState.current.dateCandidateItems.map(
      (candidate) =>
        candidate.candidate.artifactSha256 === item.candidate.artifactSha256 &&
        candidate.candidate.dateKind === item.candidate.dateKind
          ? {
              ...candidate,
              selected:
                candidate.candidate.candidateKey ===
                item.candidate.candidateKey,
              reviewer:
                candidate.candidate.candidateKey === item.candidate.candidateKey
                  ? reviewer
                  : candidate.reviewer,
            }
          : candidate,
    );
    const nextState: CaseReviewState = {
      ...caseReviewState.current,
      dateCandidateItems: nextItems,
      dateSelections: [...caseReviewState.current.dateSelections, decision],
    };
    await appendReviewEvent({ eventType: "date-selection", decision });
    await persistCaseReviewState(
      activeCase.caseId,
      priorSnapshot.current.snapshotId,
      nextState,
    );
    caseReviewState.current = nextState;
    setDateCandidateItems(nextItems);
  };

  const recordPopulationDecision = async (
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null || priorSnapshot.current === null) {
      throw new Error("Active evidence checkpoint is unavailable.");
    }
    const key = item.candidate.candidateKey;
    const history = populationHistory.current.get(key) ?? [];
    const prior = history.at(-1) ?? null;
    const resultingStatus =
      action === "approve"
        ? ("approved" as const)
        : action === "reject"
          ? ("rejected" as const)
          : action === "revoke"
            ? ("revoked" as const)
            : ("superseded" as const);
    const base = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      candidateKey: item.candidate.candidateKey,
      artifactSha256: item.candidate.artifactSha256,
      workbookProfileContentSha256: item.workbookProfileContentSha256,
      decisionType: action,
      resultingStatus,
      ruleSetVersion: "feature-009-population-v1",
      schemaVersion: "1.0.0",
    } as const;
    const decision: PopulationCandidateDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await populationDecisionContentHash(base),
      humanActor: {
        actorType: "human",
        actorId: reviewer,
        displayName: reviewer,
      },
      rationale,
      decisionTimestamp: dependencies.clock.now(),
    };
    const replay = await replayPopulationCandidateDecisions(
      item.candidate,
      item.workbookProfileContentSha256,
      [...history, decision],
    );
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    const nextHistory = [...history, decision];
    const nextItems = caseReviewState.current.populationItems.map(
      (candidate) =>
        candidate.candidate.candidateKey === key
          ? { ...candidate, projection: replay.value }
          : candidate,
    );
    const nextState: CaseReviewState = {
      ...caseReviewState.current,
      populationItems: nextItems,
      populationDecisions: [
        ...caseReviewState.current.populationDecisions,
        decision,
      ],
    };
    await appendReviewEvent({ eventType: "population-decision", decision });
    await persistCaseReviewState(
      activeCase.caseId,
      priorSnapshot.current.snapshotId,
      nextState,
    );
    populationHistory.current.set(key, nextHistory);
    caseReviewState.current = nextState;
    setPopulationItems(nextItems);
  };

  const persistPlanRuleRecord = async (
    rule: PlanRuleRecord,
  ): Promise<boolean> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) return false;
    await activeWorkspace.createDirectory(
      `cases/${activeCase.caseId}/evidence`,
    );
    const saved = await activeWorkspace.append(
      `cases/${activeCase.caseId}/evidence/rule-records.jsonl`,
      new TextEncoder().encode(`${canonicalize(rule)}\n`),
    );
    if (!saved.ok) throw new Error("Plan-rule record could not be preserved.");
    await appendReviewEvent({
      eventType: "plan-rule-recorded",
      ruleId: rule.ruleId,
      ruleContentSha256: rule.ruleContentSha256,
      effectiveDate: rule.effectiveDate,
      recordedAt: dependencies.clock.now(),
      schemaVersion: "1.0.0",
    });
    return true;
  };

  const appendReviewEvent = async (event: object): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (!activeWorkspace) throw new Error("Workspace unavailable.");
    const saved = await activeWorkspace.append(
      `cases/${activeCase?.caseId ?? "unavailable"}/reviews/events.jsonl`,
      new TextEncoder().encode(`${canonicalize(event)}\n`),
    );
    if (!saved.ok) throw new Error("Review event could not be preserved.");
  };

  const persistCaseReviewState = async (
    caseId: Uuid,
    evidenceSnapshotId: Sha256,
    state: CaseReviewState,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    const snapshot = await createCaseReviewSnapshot({
      schemaVersion: "1.0.0",
      caseId,
      evidenceSnapshotId,
      ...state,
    });
    await activeWorkspace.createDirectory(`cases/${caseId}/reviews`);
    await activeWorkspace.createDirectory(`cases/${caseId}/reviews/snapshots`);
    const snapshotPath = `cases/${caseId}/reviews/snapshots/${snapshot.reviewSnapshotId}.json`;
    const existing = await activeWorkspace.openChunkReader(snapshotPath);
    if (existing.ok) {
      let parsed: Awaited<ReturnType<typeof parseCaseReviewSnapshot>>;
      try {
        parsed = await parseCaseReviewSnapshot(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              await readAllBytes(existing.value),
            ),
          ) as unknown,
        );
      } catch {
        throw new Error("Existing review snapshot is invalid.");
      }
      if (
        !parsed.ok ||
        parsed.value.reviewSnapshotId !== snapshot.reviewSnapshotId
      ) {
        throw new Error("Existing review snapshot is invalid.");
      }
    } else {
      if (existing.error.code !== "NOT_FOUND") {
        throw new Error("Review snapshot could not be inspected.");
      }
      const saved = await activeWorkspace.createImmutable(
        snapshotPath,
        bytesReader(new TextEncoder().encode(`${canonicalize(snapshot)}\n`)),
      );
      if (!saved.ok) throw new Error("Review snapshot could not be preserved.");
    }
    const pointerSaved = await activeWorkspace.writeAtomic(
      `cases/${caseId}/reviews/current.json`,
      new TextEncoder().encode(
        `${canonicalize({
          reviewSnapshotId: snapshot.reviewSnapshotId,
          writtenAt: dependencies.clock.now(),
        })}\n`,
      ),
    );
    if (!pointerSaved.ok)
      throw new Error("Review pointer could not be preserved.");
  };

  const persistEvidenceExtraction = async (
    caseId: Uuid,
    artifactSha256: Sha256,
    passive: Parameters<typeof createEvidenceExtraction>[1],
  ): Promise<EvidenceExtraction> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    const extraction = await createEvidenceExtraction(artifactSha256, passive);
    await activeWorkspace.createDirectory(`cases/${caseId}/extractions`);
    await activeWorkspace.createDirectory(
      `cases/${caseId}/extractions/${artifactSha256}`,
    );
    const extractionPath = `cases/${caseId}/extractions/${artifactSha256}/${extraction.extractionContentSha256}.json`;
    const existing = await activeWorkspace.openChunkReader(extractionPath);
    if (existing.ok) {
      let parsed: Awaited<ReturnType<typeof parseEvidenceExtraction>>;
      try {
        parsed = await parseEvidenceExtraction(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              await readAllBytes(existing.value),
            ),
          ) as unknown,
        );
      } catch {
        throw new Error("Existing evidence extraction is invalid.");
      }
      if (
        !parsed.ok ||
        parsed.value.extractionContentSha256 !==
          extraction.extractionContentSha256
      ) {
        throw new Error("Existing evidence extraction is invalid.");
      }
    } else {
      if (existing.error.code !== "NOT_FOUND") {
        throw new Error("Evidence extraction could not be inspected.");
      }
      const saved = await activeWorkspace.createImmutable(
        extractionPath,
        bytesReader(new TextEncoder().encode(`${canonicalize(extraction)}\n`)),
      );
      if (!saved.ok)
        throw new Error("Evidence extraction could not be preserved.");
    }
    const pointerSaved = await activeWorkspace.writeAtomic(
      `cases/${caseId}/extractions/${artifactSha256}/current.json`,
      new TextEncoder().encode(
        `${canonicalize({
          extractionContentSha256: extraction.extractionContentSha256,
          writtenAt: dependencies.clock.now(),
        })}\n`,
      ),
    );
    if (!pointerSaved.ok) {
      throw new Error("Evidence extraction pointer could not be preserved.");
    }
    return extraction;
  };

  const readEvidenceExtraction = async (
    caseId: Uuid,
    artifactSha256: Sha256,
  ): Promise<EvidenceExtraction | null> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    const pointerOpened = await activeWorkspace.openChunkReader(
      `cases/${caseId}/extractions/${artifactSha256}/current.json`,
    );
    if (!pointerOpened.ok) {
      if (pointerOpened.error.code === "NOT_FOUND") return null;
      throw new Error("Evidence extraction pointer could not be read.");
    }
    const pointer = parseEvidenceExtractionPointer(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(pointerOpened.value),
        ),
      ) as unknown,
    );
    if (!pointer.ok) throw new Error(pointer.error.message);
    const extractionOpened = await activeWorkspace.openChunkReader(
      `cases/${caseId}/extractions/${artifactSha256}/${pointer.value.extractionContentSha256}.json`,
    );
    if (!extractionOpened.ok)
      throw new Error("Evidence extraction is missing.");
    const parsed = await parseEvidenceExtraction(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(extractionOpened.value),
        ),
      ) as unknown,
    );
    if (
      !parsed.ok ||
      parsed.value.artifactSha256 !== artifactSha256 ||
      parsed.value.extractionContentSha256 !==
        pointer.value.extractionContentSha256
    ) {
      throw new Error("Evidence extraction failed integrity validation.");
    }
    return parsed.value;
  };

  const persistEvidenceCorrection = async (
    caseId: Uuid,
    correction: EvidenceTextCorrection,
  ): Promise<EvidenceTextCorrection> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    const artifactSha256 = correction.artifactSha256;
    await activeWorkspace.createDirectory(`cases/${caseId}/corrections`);
    await activeWorkspace.createDirectory(
      `cases/${caseId}/corrections/${artifactSha256}`,
    );
    const correctionPath = `cases/${caseId}/corrections/${artifactSha256}/${correction.correctionContentSha256}.json`;
    const existing = await activeWorkspace.openChunkReader(correctionPath);
    if (!existing.ok) {
      if (existing.error.code !== "NOT_FOUND") {
        throw new Error("Evidence correction could not be inspected.");
      }
      const saved = await activeWorkspace.createImmutable(
        correctionPath,
        bytesReader(new TextEncoder().encode(`${canonicalize(correction)}\n`)),
      );
      if (!saved.ok)
        throw new Error("Evidence correction could not be preserved.");
    } else {
      const parsed = await parseEvidenceTextCorrection(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await readAllBytes(existing.value),
          ),
        ) as unknown,
      );
      if (
        !parsed.ok ||
        parsed.value.correctionContentSha256 !==
          correction.correctionContentSha256
      ) {
        throw new Error("Existing evidence correction is invalid.");
      }
    }
    const pointerSaved = await activeWorkspace.writeAtomic(
      `cases/${caseId}/corrections/${artifactSha256}/current.json`,
      new TextEncoder().encode(
        `${canonicalize({
          correctionContentSha256: correction.correctionContentSha256,
          writtenAt: dependencies.clock.now(),
        })}\n`,
      ),
    );
    if (!pointerSaved.ok) {
      throw new Error("Evidence correction pointer could not be preserved.");
    }
    return correction;
  };

  const readEvidenceCorrection = async (
    caseId: Uuid,
    artifactSha256: Sha256,
    extractionContentSha256: Sha256,
  ): Promise<EvidenceTextCorrection | null> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    const pointerOpened = await activeWorkspace.openChunkReader(
      `cases/${caseId}/corrections/${artifactSha256}/current.json`,
    );
    if (!pointerOpened.ok) {
      if (pointerOpened.error.code === "NOT_FOUND") return null;
      throw new Error("Evidence correction pointer could not be read.");
    }
    const pointer = parseEvidenceCorrectionPointer(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(pointerOpened.value),
        ),
      ) as unknown,
    );
    if (!pointer.ok) throw new Error(pointer.error.message);
    const correctionOpened = await activeWorkspace.openChunkReader(
      `cases/${caseId}/corrections/${artifactSha256}/${pointer.value.correctionContentSha256}.json`,
    );
    if (!correctionOpened.ok)
      throw new Error("Evidence correction is missing.");
    const parsed = await parseEvidenceTextCorrection(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(correctionOpened.value),
        ),
      ) as unknown,
    );
    if (
      !parsed.ok ||
      parsed.value.artifactSha256 !== artifactSha256 ||
      parsed.value.extractionContentSha256 !== extractionContentSha256 ||
      parsed.value.correctionContentSha256 !==
        pointer.value.correctionContentSha256
    ) {
      throw new Error("Evidence correction failed integrity validation.");
    }
    return parsed.value;
  };

  const loadCaseReviewState = async (
    caseRecord: CaseRecord,
    evidenceSnapshotId: Sha256,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const failReviewRestore = (): void => {
      if (activeCaseId.current === caseRecord.caseId) {
        setEvidenceRestoreMessage(
          "Evidence review restoration is unavailable because persisted review state could not be verified. No files were changed.",
        );
      }
    };
    const pointerOpened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/reviews/current.json`,
    );
    if (!pointerOpened.ok) {
      if (pointerOpened.error.code !== "NOT_FOUND") failReviewRestore();
      return;
    }
    try {
      const pointer = parseCaseReviewPointer(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await readAllBytes(pointerOpened.value),
          ),
        ) as unknown,
      );
      if (!pointer.ok) throw new Error(pointer.error.message);
      const snapshotOpened = await activeWorkspace.openChunkReader(
        `cases/${caseRecord.caseId}/reviews/snapshots/${pointer.value.reviewSnapshotId}.json`,
      );
      if (!snapshotOpened.ok) throw new Error("Review snapshot is missing.");
      const parsed = await parseCaseReviewSnapshot(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await readAllBytes(snapshotOpened.value),
          ),
        ) as unknown,
      );
      if (
        !parsed.ok ||
        parsed.value.reviewSnapshotId !== pointer.value.reviewSnapshotId ||
        parsed.value.caseId !== caseRecord.caseId ||
        parsed.value.evidenceSnapshotId !== evidenceSnapshotId
      ) {
        throw new Error("Review snapshot binding is invalid.");
      }
      const restored = parsed.value;
      const restoredQuarantineHistory = new Map<string, QuarantineDecision[]>();
      const projectedQuarantineItems: QuarantineQueueItem[] = [];
      for (const item of restored.quarantineItems) {
        const history = restored.quarantineDecisions.filter(
          (decision) => decision.artifactSha256 === item.artifactSha256,
        );
        if (
          history.some((decision) =>
            decision.findingIds.some(
              (findingId) => !item.findingIds.includes(findingId),
            ),
          )
        ) {
          throw new Error("Quarantine decision findings do not match.");
        }
        const replay = await replayQuarantineDecisions(
          item.artifactSha256 as Sha256,
          history,
        );
        if (!replay.ok) throw new Error(replay.error.safeMessage);
        const prior = history.at(-1) ?? null;
        const effectiveHumanStatus =
          replay.value.effectiveStatus === "provisional" ||
          replay.value.effectiveStatus === "blocked"
            ? ("none" as const)
            : replay.value.effectiveStatus;
        if (effectiveHumanStatus === "superseded") {
          throw new Error("Unsupported quarantine projection.");
        }
        restoredQuarantineHistory.set(item.artifactSha256, [...history]);
        projectedQuarantineItems.push({
          ...item,
          effectiveHumanStatus,
          reviewer: prior?.reviewer.displayName ?? null,
          rationale: prior?.rationale ?? null,
          nextAction:
            effectiveHumanStatus === "released"
              ? "The safety hold is released. Separate artifact eligibility approval is still required."
              : item.nextAction,
        });
      }

      const restoredEligibilityHistory = new Map<
        string,
        ArtifactEligibilityDecision[]
      >();
      const projectedEligibilityItems: ArtifactEligibilityReviewItem[] = [];
      for (const item of restored.eligibilityItems) {
        const history = restored.eligibilityDecisions.filter(
          (decision) => decision.artifactSha256 === item.artifactSha256,
        );
        const quarantineDecisions = restored.quarantineDecisions.filter(
          (decision) => decision.artifactSha256 === item.artifactSha256,
        );
        const quarantine = await replayQuarantineDecisions(
          item.artifactSha256,
          quarantineDecisions,
        );
        if (!quarantine.ok) throw new Error(quarantine.error.safeMessage);
        const replay = await replayArtifactEligibility(
          item.artifactSha256,
          history,
          quarantineDecisions,
        );
        if (!replay.ok) throw new Error(replay.error.safeMessage);
        restoredEligibilityHistory.set(item.artifactSha256, [...history]);
        projectedEligibilityItems.push({
          ...item,
          quarantineReleased:
            item.requiresQuarantineRelease && quarantine.value.eligible,
          projection: replay.value,
        });
      }

      const restoredClassificationHistory = new Map<
        string,
        ClassificationApproval[]
      >();
      const projectedClassificationItems: ClassificationReviewItem[] = [];
      for (const item of restored.classificationItems) {
        const history = restored.classificationDecisions.filter(
          (decision) => decision.proposalKey === item.proposal.proposalKey,
        );
        const replay = await replayClassificationApprovals(
          item.proposal,
          history,
        );
        if (!replay.ok) throw new Error(replay.error.safeMessage);
        const prior = history.at(-1) ?? null;
        restoredClassificationHistory.set(item.proposal.proposalKey, [
          ...history,
        ]);
        projectedClassificationItems.push({
          ...item,
          effectiveStatus: replay.value.status,
          reviewer: prior?.actor.displayName ?? null,
          rationale: prior?.rationale ?? null,
          provenanceCount: replay.value.provenance.length,
        });
      }

      const candidates = restored.dateCandidateItems.map(
        (item) => item.candidate,
      );
      const selectedByGroup = new Map<string, DateSelectionDecision>();
      for (const decision of restored.dateSelections) {
        const selected = candidates.find(
          (candidate) =>
            candidate.candidateKey === decision.selectedCandidateKey,
        );
        if (selected === undefined) continue;
        const validation = validateDateSelection(candidates, decision);
        if (!validation.ok) throw new Error(validation.error.safeMessage);
        selectedByGroup.set(
          `${selected.artifactSha256}\0${selected.dateKind}`,
          decision,
        );
      }
      const projectedDateItems = restored.dateCandidateItems.map((item) => {
        const selected = selectedByGroup.get(
          `${item.candidate.artifactSha256}\0${item.candidate.dateKind}`,
        );
        return {
          ...item,
          selected:
            selected?.selectedCandidateKey === item.candidate.candidateKey,
          reviewer:
            selected?.selectedCandidateKey === item.candidate.candidateKey
              ? selected.actor.displayName
              : null,
        };
      });

      const restoredRelationshipHistory = new Map<
        string,
        RelationshipDecision[]
      >();
      const projectedRelationshipItems: RelationshipReviewItem[] = [];
      for (const item of restored.relationshipItems) {
        const history = restored.relationshipDecisions.filter(
          (decision) =>
            decision.relationshipKey === item.relationship.relationshipKey,
        );
        const replay = await replayRelationshipDecisions(
          item.relationship,
          history,
        );
        if (!replay.ok) throw new Error(replay.error.safeMessage);
        const prior = history.at(-1) ?? null;
        restoredRelationshipHistory.set(item.relationship.relationshipKey, [
          ...history,
        ]);
        projectedRelationshipItems.push({
          ...item,
          effectiveStatus: replay.value.status,
          rationale: prior?.rationale ?? null,
          provenanceCount: replay.value.provenance.length,
        });
      }

      const restoredPopulationHistory = new Map<
        string,
        PopulationCandidateDecision[]
      >();
      const projectedPopulationItems: PopulationReviewItem[] = [];
      for (const item of restored.populationItems) {
        const history = restored.populationDecisions.filter(
          (decision) => decision.candidateKey === item.candidate.candidateKey,
        );
        const replay = await replayPopulationCandidateDecisions(
          item.candidate,
          item.workbookProfileContentSha256,
          history,
        );
        if (!replay.ok) throw new Error(replay.error.safeMessage);
        restoredPopulationHistory.set(item.candidate.candidateKey, [
          ...history,
        ]);
        projectedPopulationItems.push({ ...item, projection: replay.value });
      }
      const projectedQuarantineWithEligibility = projectedQuarantineItems.map(
        (item) => ({
          ...item,
          eligibilityDecisionCount: restored.eligibilityDecisions.filter(
            (decision) => decision.artifactSha256 === item.artifactSha256,
          ).length,
        }),
      );
      if (activeCaseId.current !== caseRecord.caseId) return;
      const projectedState: CaseReviewState = {
        ...restored,
        quarantineItems: projectedQuarantineWithEligibility,
        eligibilityItems: projectedEligibilityItems,
        classificationItems: projectedClassificationItems,
        dateCandidateItems: projectedDateItems,
        relationshipItems: projectedRelationshipItems,
        populationItems: projectedPopulationItems,
      };
      caseReviewState.current = projectedState;
      quarantineHistory.current = restoredQuarantineHistory;
      eligibilityHistory.current = restoredEligibilityHistory;
      classificationHistory.current = restoredClassificationHistory;
      relationshipHistory.current = restoredRelationshipHistory;
      populationHistory.current = restoredPopulationHistory;
      setQuarantineItems(projectedQuarantineWithEligibility);
      setEligibilityItems(projectedEligibilityItems);
      setClassificationItems(projectedClassificationItems);
      setDateCandidateItems(projectedDateItems);
      setRelationshipItems(projectedRelationshipItems);
      setPopulationItems(projectedPopulationItems);
      setArchitecturePolicyApprovals(restored.architecturePolicyApprovals);
      setCaseControls(restored.authenticatedCaseControls);
    } catch {
      failReviewRestore();
    }
  };

  const clearGovernedEvidenceRecords = (message: string): void => {
    evidenceCatalogRef.current = null;
    setEvidenceCatalog(null);
    setArchitecturePolicyItems([]);
    setArchitecturePolicyMessage(null);
    setProvisionCandidates([]);
    setCandidateNearDuplicates([]);
    setCandidateSupersessions([]);
    setEvidenceReviewMessage(message);
  };

  const applyProvisionCandidateState = async (
    candidates: readonly ProvisionCandidate[],
  ): Promise<void> => {
    const nearDuplicateRelationships = await detectNearDuplicates(candidates);
    const byContentHash = new Map(
      candidates.map((candidate) => [
        candidate.candidateContentSha256,
        candidate,
      ]),
    );
    const nearDuplicates: NearDuplicateRelationship[] =
      nearDuplicateRelationships.flatMap((relationship) => {
        const predecessor = byContentHash.get(relationship.fromSha256);
        const successor = byContentHash.get(relationship.toSha256);
        return predecessor === undefined ||
          successor === undefined ||
          relationship.confidence === null
          ? []
          : [
              {
                predecessorCandidateId: predecessor.candidateId,
                successorCandidateId: successor.candidateId,
                similarity: relationship.confidence,
              },
            ];
      });
    setProvisionCandidates(candidates);
    setCandidateNearDuplicates(Object.freeze(nearDuplicates));
    setCandidateSupersessions(await detectSupersession(candidates));
  };

  const catalogMatchesCurrentReview = (value: EvidenceCatalog): boolean => {
    const included = [...value.caseEvidence, ...value.referenceOnly];
    if (
      !included.every((artifact) => {
        if (
          value.referenceOnly.some((item) => item.sha256 === artifact.sha256)
        ) {
          return (
            artifact.reviewStatus === "released" ||
            artifact.reviewStatus === "provisional"
          );
        }
        const eligibility = caseReviewState.current.eligibilityItems.find(
          (item) => item.artifactSha256 === artifact.sha256,
        );
        const sourceRole = caseReviewState.current.classificationItems.find(
          (item) =>
            item.proposal.artifactSha256 === artifact.sha256 &&
            item.proposal.dimension === "source-role" &&
            item.proposal.proposedValue === artifact.sourceRole &&
            item.effectiveStatus === "approved",
        );
        return (
          eligibility?.projection.eligible === true && sourceRole !== undefined
        );
      })
    ) {
      return false;
    }
    const checkpoint = lastCheckpoint.current;
    if (checkpoint === null || checkpoint.artifacts.length === 0) return true;
    const currentHashes = new Set(
      checkpoint.artifacts.map((artifact) => artifact.sha256),
    );
    const includedHashes = new Set(included.map((artifact) => artifact.sha256));
    return (
      currentHashes.size === includedHashes.size &&
      [...currentHashes].every((sha256) => includedHashes.has(sha256))
    );
  };

  const loadGovernedEvidenceRecords = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const catalogResult = await readCurrentEvidenceCatalog(
      activeWorkspace,
      caseRecord.caseId,
    );
    if (!catalogResult.ok) {
      clearGovernedEvidenceRecords(catalogResult.error.safeMessage);
      return;
    }
    if (catalogResult.value === null) {
      clearGovernedEvidenceRecords(
        "Governed evidence catalog is pending artifact eligibility and source-role approval.",
      );
      return;
    }
    if (!catalogMatchesCurrentReview(catalogResult.value)) {
      clearGovernedEvidenceRecords(
        "The stored catalog is historical; current review state does not permit governed use.",
      );
      return;
    }
    const candidates = await readProvisionCandidates(
      activeWorkspace,
      caseRecord.caseId,
    );
    if (!candidates.ok) {
      clearGovernedEvidenceRecords(candidates.error.safeMessage);
      return;
    }
    const includedHashes = new Set(
      [
        ...catalogResult.value.caseEvidence,
        ...catalogResult.value.referenceOnly,
      ].map((artifact) => artifact.sha256),
    );
    const currentCandidates = candidates.value.filter((candidate) =>
      includedHashes.has(candidate.artifactSha256),
    );
    const unresolved = await readUnresolvedItems(
      activeWorkspace,
      caseRecord.caseId,
    );
    if (!unresolved.ok) {
      clearGovernedEvidenceRecords(unresolved.error.safeMessage);
      return;
    }
    const latestUnresolved = latestUnresolvedItems(unresolved.value);
    if (activeCaseId.current !== caseRecord.caseId) return;
    evidenceCatalogRef.current = catalogResult.value;
    setEvidenceCatalog(catalogResult.value);
    await refreshArchitecturePolicyItems(
      catalogResult.value,
      caseReviewState.current.architecturePolicyApprovals,
    );
    await applyProvisionCandidateState(currentCandidates);
    setEvidenceUnresolvedRecords(unresolved.value);
    setEvidenceUnresolvedItems(latestUnresolved);
    setEvidenceReviewMessage(
      `Restored governed catalog ${catalogResult.value.catalogContentSha256.slice(0, 12)} and ${String(currentCandidates.length)} proposal-only candidate(s).`,
    );
  };

  const refreshGovernedEvidenceRecords = async (
    caseId: Uuid,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    const checkpoint = lastCheckpoint.current;
    if (
      activeWorkspace === null ||
      checkpoint === null ||
      activeCaseId.current !== caseId
    ) {
      return;
    }
    const builtAt = dependencies.clock.now();
    const ruleArtifacts = await preservedRuleSourceArtifacts(caseId, builtAt);
    for (const ruleArtifact of ruleArtifacts) {
      const preserved = await preserveContent(
        activeWorkspace,
        bytesReader(ruleArtifact.bytes),
        ruleArtifact.sha256,
        dependencies.clock,
      );
      if (!preserved.ok || preserved.value.sha256 !== ruleArtifact.sha256) {
        clearGovernedEvidenceRecords(
          "Rule-source preservation failed exact-byte verification.",
        );
        return;
      }
    }
    storeEligibilityItems([
      ...caseReviewState.current.eligibilityItems.filter(
        (item) =>
          !ruleArtifacts.some(
            (artifact) => artifact.sha256 === item.artifactSha256,
          ),
      ),
      ...ruleArtifacts.map((ruleArtifact) => {
        const existing = caseReviewState.current.eligibilityItems.find(
          (item) => item.artifactSha256 === ruleArtifact.sha256,
        );
        return (
          existing ?? {
            artifactSha256: ruleArtifact.sha256,
            displayName: ruleArtifact.artifact.locator,
            requiresQuarantineRelease: false,
            quarantineReleased: true,
            projection: {
              artifactSha256: ruleArtifact.sha256,
              eligible: false,
              effectiveStatus: "provisional" as const,
              effectiveDecisionId: null,
              provenance: [],
            },
          }
        );
      }),
    ]);
    const allArtifactHashes = [
      ...new Set(checkpoint.artifacts.map((artifact) => artifact.sha256)),
    ];
    if (
      allArtifactHashes.length === 0 ||
      allArtifactHashes.some(
        (sha256) =>
          caseReviewState.current.eligibilityItems.find(
            (item) => item.artifactSha256 === sha256,
          )?.projection.eligible !== true,
      )
    ) {
      clearGovernedEvidenceRecords(
        "Governed evidence catalog is pending artifact eligibility and source-role approval.",
      );
      return;
    }
    const storedCatalog = await readCurrentEvidenceCatalog(
      activeWorkspace,
      caseId,
    );
    if (!storedCatalog.ok) {
      clearGovernedEvidenceRecords(storedCatalog.error.safeMessage);
      return;
    }
    for (const ruleArtifact of ruleArtifacts) {
      const preserved = await preserveContent(
        activeWorkspace,
        bytesReader(ruleArtifact.bytes),
        ruleArtifact.sha256,
        dependencies.clock,
      );
      if (
        !preserved.ok ||
        preserved.value.sha256 !== ruleArtifact.artifact.sha256
      ) {
        clearGovernedEvidenceRecords(
          "Rule-source preservation failed exact-byte verification.",
        );
        return;
      }
    }
    const built = await buildEvidenceCatalogFromScreenedOutcomes({
      catalogId: storedCatalog.value?.catalogId ?? dependencies.uuid.generate(),
      caseId,
      builtAt,
      screenedOutcomes: checkpoint.artifacts.map((artifact) => ({
        artifact,
        screening: {
          artifactSha256: artifact.sha256,
          findings: [],
          provisionalState:
            caseReviewState.current.quarantineItems.find(
              (item) => item.artifactSha256 === artifact.sha256,
            )?.provisionalState ?? "screening-pending",
          downstreamBlocked: true,
          ruleSetVersion: "feature-009-screening-v1",
        },
        passiveExtractionAttempted: true,
        downstreamBlocked: true,
      })),
      contentObjects: checkpoint.snapshot.entries.map((entry) => ({
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes,
        objectPath: contentObjectPath(entry.sha256),
        preservationStatus: "verified" as const,
        postWriteSha256: entry.sha256,
        firstPreservedAt:
          checkpoint.receipts.find((receipt) => receipt.sha256 === entry.sha256)
            ?.submittedAt ?? null,
      })),
      receipts: checkpoint.receipts,
      classificationProposals: caseReviewState.current.classificationItems.map(
        (item) => item.proposal,
      ),
      referenceOnlyArtifacts: ruleArtifacts.map(
        (ruleArtifact) => ruleArtifact.artifact,
      ),
      classificationApprovals: caseReviewState.current.classificationDecisions,
      containmentEdges: [],
      quarantineDecisions: caseReviewState.current.quarantineDecisions,
      eligibilityDecisions: caseReviewState.current.eligibilityDecisions,
      origins: checkpoint.artifacts.map((artifact) => ({
        artifactSha256: artifact.sha256,
        origin: "case-package" as const,
      })),
      quarantineMetadata: [],
      unresolvedItems: evidenceUnresolvedRecords,
    });
    if (!built.ok) {
      clearGovernedEvidenceRecords(`Catalog pending: ${built.error.message}`);
      return;
    }
    const stored = await writeCurrentEvidenceCatalog(
      activeWorkspace,
      caseId,
      built.value.catalog,
      builtAt,
    );
    if (!stored.ok) {
      clearGovernedEvidenceRecords(stored.error.safeMessage);
      return;
    }
    await refreshArchitecturePolicyItems(
      built.value.catalog,
      caseReviewState.current.architecturePolicyApprovals,
    );

    const candidates: ProvisionCandidate[] = [];
    const unresolvedItems: UnresolvedItem[] = [];
    let correctedArtifactsSkipped = 0;
    for (const artifact of [
      ...built.value.catalog.caseEvidence,
      ...built.value.catalog.referenceOnly,
    ]) {
      const extraction = await readEvidenceExtraction(caseId, artifact.sha256);
      if (extraction !== null) {
        const correction = await readEvidenceCorrection(
          caseId,
          artifact.sha256,
          extraction.extractionContentSha256,
        );
        if (correction !== null) {
          correctedArtifactsSkipped += 1;
          continue;
        }
      }
      const opened = await activeWorkspace.openChunkReader(
        contentObjectPath(artifact.sha256),
      );
      if (!opened.ok) {
        clearGovernedEvidenceRecords(
          "Candidate extraction could not open preserved evidence.",
        );
        return;
      }
      const verified = await hashChunkReader(opened.value);
      if (!verified.ok || verified.value.sha256 !== artifact.sha256) {
        clearGovernedEvidenceRecords(
          "Candidate extraction failed preserved-byte verification.",
        );
        return;
      }
      const sourceBytes = await readAllBytes(opened.value);
      let passive = inspectPassive(artifact.locator, sourceBytes);
      if (
        passive.status === "success" &&
        passive.riskIndicators.length === 0 &&
        artifact.mediaType === "application/pdf"
      ) {
        passive = await extractLocalPdfMachineText(sourceBytes);
      }
      if (passive.status !== "success" && passive.status !== "partial") {
        continue;
      }
      const extracted = await extractCandidates(artifact.sha256, passive, {
        openedAt: builtAt,
        sourceSection: built.value.catalog.referenceOnly.some(
          (reference) => reference.sha256 === artifact.sha256,
        )
          ? "reference-only"
          : "case-evidence",
      });
      if (!extracted.ok) {
        clearGovernedEvidenceRecords(extracted.error.message);
        return;
      }
      candidates.push(...extracted.value.candidates);
      unresolvedItems.push(...extracted.value.unresolvedItems);
    }
    const orderedCandidates = Object.freeze(
      [...candidates].sort((left, right) =>
        left.candidateContentSha256.localeCompare(right.candidateContentSha256),
      ),
    );
    const candidatesStored = await appendProvisionCandidates(
      activeWorkspace,
      caseId,
      orderedCandidates,
    );
    if (!candidatesStored.ok) {
      clearGovernedEvidenceRecords(candidatesStored.error.safeMessage);
      return;
    }
    const unresolvedStored = await appendUnresolvedItems(
      activeWorkspace,
      caseId,
      unresolvedItems,
    );
    if (!unresolvedStored.ok) {
      clearGovernedEvidenceRecords(unresolvedStored.error.safeMessage);
      return;
    }
    if (activeCaseId.current !== caseId) return;
    evidenceCatalogRef.current = built.value.catalog;
    setEvidenceCatalog(built.value.catalog);
    await applyProvisionCandidateState(orderedCandidates);
    setEvidenceUnresolvedRecords(unresolvedStored.value);
    setEvidenceUnresolvedItems(latestUnresolvedItems(unresolvedStored.value));
    setEvidenceReviewMessage(
      correctedArtifactsSkipped === 0
        ? `Governed catalog ${built.value.catalog.catalogContentSha256.slice(0, 12)} produced ${String(orderedCandidates.length)} proposal-only candidate(s).`
        : `${String(correctedArtifactsSkipped)} corrected artifact(s) await a correction-bound candidate contract; no stale candidates were emitted for them.`,
    );
  };

  const loadPersistedCaseState = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    await loadEvidenceManifest(caseRecord);
    if (
      activeCaseId.current === caseRecord.caseId &&
      priorSnapshot.current !== null
    ) {
      await loadCaseReviewState(caseRecord, priorSnapshot.current.snapshotId);
      if (lastCheckpoint.current?.artifacts.length) {
        await refreshGovernedEvidenceRecords(caseRecord.caseId);
      } else {
        await loadGovernedEvidenceRecords(caseRecord);
      }
    }
  };

  const loadCaseOutputArtifactReferences = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const opened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/outputs/artifact-references.json`,
    );
    if (!opened.ok) {
      if (opened.error.code !== "NOT_FOUND") {
        setCaseOutputLinkMessage(
          "Existing final-output artifact references could not be read.",
        );
      }
      return;
    }
    try {
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(opened.value),
        ),
      ) as unknown;
      setCaseOutputArtifacts(parseCaseOutputArtifactReferences(value));
    } catch {
      setCaseOutputLinkMessage(
        "Existing final-output artifact references are not valid JSON and were ignored.",
      );
    }
  };

  const INVALID_POINTER_RESTORE_MESSAGE =
    "Evidence restoration is unavailable because the persisted inventory pointer could not be accepted. No files were changed.";
  const MISSING_CHECKPOINT_RESTORE_MESSAGE =
    "Evidence restoration is unavailable because the referenced checkpoint manifest does not exist. No files were changed.";
  const INVALID_CHECKPOINT_RESTORE_MESSAGE =
    "Evidence restoration is unavailable because the referenced checkpoint manifest is not valid. No files were changed.";
  const INVALID_CONTENT_RESTORE_MESSAGE =
    "Evidence restoration is unavailable because preserved evidence could not be verified. No files were changed.";

  const loadEvidenceManifest = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const reportRestoreFailure = (message: string): void => {
      if (activeCaseId.current === caseRecord.caseId) {
        setEvidenceRestoreMessage(message);
      }
    };
    const pointerOpened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/manifests/current.json`,
    );
    if (!pointerOpened.ok) {
      if (pointerOpened.error.code !== "NOT_FOUND") {
        reportRestoreFailure(INVALID_POINTER_RESTORE_MESSAGE);
      }
      return;
    }
    let pointerValue: unknown;
    try {
      pointerValue = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(pointerOpened.value),
        ),
      ) as unknown;
    } catch {
      reportRestoreFailure(INVALID_POINTER_RESTORE_MESSAGE);
      return;
    }
    const pointer = parsePersistedCheckpointPointer(pointerValue);
    if (!pointer.ok) {
      reportRestoreFailure(INVALID_POINTER_RESTORE_MESSAGE);
      return;
    }
    const manifestOpened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/manifests/${pointer.value.checkpointSnapshotId}.json`,
    );
    if (!manifestOpened.ok) {
      reportRestoreFailure(
        manifestOpened.error.code === "NOT_FOUND"
          ? MISSING_CHECKPOINT_RESTORE_MESSAGE
          : INVALID_CHECKPOINT_RESTORE_MESSAGE,
      );
      return;
    }
    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(manifestOpened.value),
        ),
      ) as unknown;
    } catch {
      reportRestoreFailure(INVALID_CHECKPOINT_RESTORE_MESSAGE);
      return;
    }
    const parsed = parsePersistedCheckpoint(manifestValue);
    if (!parsed.ok) {
      reportRestoreFailure(INVALID_CHECKPOINT_RESTORE_MESSAGE);
      return;
    }
    const current = parsed.value;
    let recomputedSnapshotId: Sha256;
    try {
      recomputedSnapshotId = await computePackageSnapshotId(
        current.snapshot.entries,
      );
    } catch {
      reportRestoreFailure(INVALID_CHECKPOINT_RESTORE_MESSAGE);
      return;
    }
    if (
      current.caseId !== caseRecord.caseId ||
      current.snapshot.snapshotId !== pointer.value.checkpointSnapshotId ||
      recomputedSnapshotId !== current.snapshot.snapshotId
    ) {
      reportRestoreFailure(INVALID_CHECKPOINT_RESTORE_MESSAGE);
      return;
    }
    for (const entry of current.snapshot.entries) {
      const objectOpened = await activeWorkspace.openChunkReader(
        contentObjectPath(entry.sha256),
      );
      if (
        !objectOpened.ok ||
        objectOpened.value.sizeBytes !== entry.sizeBytes
      ) {
        reportRestoreFailure(INVALID_CONTENT_RESTORE_MESSAGE);
        return;
      }
      const verified = await hashChunkReader(objectOpened.value);
      if (!verified.ok || verified.value.sha256 !== entry.sha256) {
        reportRestoreFailure(INVALID_CONTENT_RESTORE_MESSAGE);
        return;
      }
    }
    if (activeCaseId.current !== caseRecord.caseId) return;
    priorSnapshot.current = current.snapshot;
    lastCheckpoint.current = {
      attemptId: current.attemptId,
      snapshot: current.snapshot,
      inventoryItems: current.inventoryItems,
      packageStatus: current.packageStatus,
      receipts: current.receipts,
      artifacts: current.artifacts,
    };
    inventoryCheckpoints.current.clear();
    inventoryCheckpoints.current.set(current.snapshot.snapshotId, {
      attemptId: current.attemptId,
      snapshot: current.snapshot,
      inventoryItems: current.inventoryItems,
      packageStatus: current.packageStatus,
      receipts: current.receipts,
      artifacts: current.artifacts,
    });
    const entries = current.snapshot.entries;
    const restoredItems = current.inventoryItems;
    setEvidenceItems(restoredItems);
    setEvidenceRestoreMessage(null);
    setEvidencePackageSummary({
      items: restoredItems,
      snapshotId: current.snapshot.snapshotId,
      resumeKind: "restored",
      packageStatus: current.packageStatus,
    });
    setManifestSummary({
      artifactCount: entries.length,
      validationCount: restoredItems.length,
      unresolvedCount: restoredItems.filter(
        (item) =>
          item.status === "provisional-blocked" || item.status === "failed",
      ).length,
      accountingStatus:
        current.packageStatus === "completed"
          ? "Awaiting human review"
          : "Partial — some files failed",
      provisionalBlockReason:
        "Evidence is pending until all required reviews are complete.",
      requiredReview:
        "Review quarantine, artifact eligibility, classification, relationship, and population queues.",
      nextAction: "Complete all reviews, then export the final manifest.",
      deterministicManifestHash: current.snapshot.snapshotId,
      lineage: entries.map((entry, index) => ({
        nodeId: `artifact-${String(index + 1)}`,
        label: entry.observedRelativePath,
        sourceHash: entry.sha256,
        sourceLocator: entry.observedRelativePath,
        status: "provisional" as const,
      })),
    });
  };

  const loadDraftV1SummaryArtifact = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const opened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/outputs/draft-v1-summary.json`,
    );
    if (!opened.ok) {
      if (opened.error.code !== "NOT_FOUND") {
        setDraftV1SummaryMessage(
          "Existing draft V1 summary artifact could not be read.",
        );
      }
      return;
    }
    try {
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(opened.value),
        ),
      ) as unknown;
      const validation = validateContract("draftV1Summary", value);
      if (!validation.valid) {
        setDraftV1SummaryMessage(
          "Existing draft V1 summary artifact failed runtime validation and was ignored.",
        );
        return;
      }
      setDraftV1Summary(value as DraftV1SummaryArtifact);
    } catch {
      setDraftV1SummaryMessage(
        "Existing draft V1 summary artifact is not valid UTF-8 JSON and was ignored.",
      );
    }
  };

  const generateDraftV1Summary = async (file: File): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) {
      setDraftV1SummaryMessage(
        "Select an active local case before generating a draft V1 summary.",
      );
      return;
    }
    setDraftV1SummaryMessage(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let r5Summary: unknown;
    try {
      r5Summary = JSON.parse(
        new TextDecoder("utf-8", { fatal: true })
          .decode(bytes)
          .replace(/^\uFEFF/u, ""),
      );
    } catch {
      setDraftV1SummaryMessage(
        "The selected R5 summary must be valid UTF-8 JSON.",
      );
      return;
    }
    const hashed = await hashChunkReader(bytesReader(bytes));
    if (!hashed.ok) {
      setDraftV1SummaryMessage(hashed.error.safeMessage);
      return;
    }
    const artifact = await createDraftV1SummaryArtifact({
      caseId: activeCase.caseId,
      r5Summary,
      r5SummaryContentSha256: hashed.value.sha256,
      r5SummaryFileName: file.name,
      generatedAt: dependencies.clock.now(),
      generatedBy: sharedReviewer.trim() === "" ? null : sharedReviewer.trim(),
    });
    const validation = validateContract("draftV1Summary", artifact);
    if (!validation.valid) {
      setDraftV1SummaryMessage(
        `Draft V1 summary failed runtime validation: ${validation.issues[0]?.message ?? "unknown issue"}`,
      );
      return;
    }
    await activeWorkspace.createDirectory(`cases/${activeCase.caseId}/outputs`);
    const storagePath = `cases/${activeCase.caseId}/outputs/draft-v1-summary.json`;
    const saved = await activeWorkspace.writeAtomic(
      storagePath,
      new TextEncoder().encode(`${canonicalize(artifact)}\n`),
    );
    if (!saved.ok) {
      setDraftV1SummaryMessage("Draft V1 summary artifact could not be saved.");
      return;
    }
    await appendReviewEvent({
      eventType: "draft-v1-summary-generated",
      artifactType: artifact.artifactType,
      draftContentSha256: artifact.contentSha256,
      r5SourceSha256: artifact.deterministicPayload.r5Source.contentSha256,
      selectedReferenceSha256:
        artifact.deterministicPayload.selectedScaffold.referenceContentSha256,
      generatedAt: artifact.operationalMetadata.generatedAt,
      schemaVersion: "1.0.0",
    });
    setDraftV1Summary(artifact);
    setDraftV1SummaryMessage(
      `Draft V1 summary saved to ${storagePath} with scaffold ${artifact.deterministicPayload.selectedScaffold.workbookName} and hash ${artifact.contentSha256}.`,
    );
  };

  const initializePlanSummary = async (): Promise<void> => {
    if (activeCase === null) {
      setPlanSummaryMessage(
        "Select an active case before initializing Plan Summary.",
      );
      return;
    }
    setPlanSummaryMessage(null);
    try {
      const record = await createEmptyPlanSummaryRecord(activeCase.caseId, {
        uuid: { generate: () => dependencies.uuid.generate() },
        clock: { now: () => dependencies.clock.now() },
      });
      setPlanSummaryRecord(record);
      caseReviewState.current = {
        ...caseReviewState.current,
        planSummaryRecord: record,
      };
      setPlanSummaryMessage(
        "Plan Summary initialized. Add attributes from approved evidence.",
      );
    } catch (error) {
      setPlanSummaryMessage(
        error instanceof Error
          ? error.message
          : "Failed to initialize Plan Summary.",
      );
    }
  };

  const approvePlanSummaryAttributeAction = async (
    attributeId: string,
    selectedValue: string | null,
    rationale: string,
  ): Promise<void> => {
    if (planSummaryRecord === null || activeCase === null) {
      setPlanSummaryMessage("No active Plan Summary record.");
      return;
    }
    setPlanSummaryMessage(null);
    try {
      const parsedAttributeId = parseUuid(attributeId);
      if (!parsedAttributeId.ok) {
        setPlanSummaryMessage("Invalid attribute ID.");
        return;
      }
      const result = await approvePlanSummaryAttribute(
        planSummaryRecord,
        parsedAttributeId.value,
        selectedValue,
        null,
        rationale,
        {
          actorType: "human",
          actorKey:
            sharedReviewer.trim() === "" ? "anonymous" : sharedReviewer.trim(),
          displayName:
            sharedReviewer.trim() === "" ? "Anonymous" : sharedReviewer.trim(),
          authorityContext: "actuary",
        },
        {
          uuid: { generate: () => dependencies.uuid.generate() },
          clock: { now: () => dependencies.clock.now() },
        },
      );
      setPlanSummaryRecord(result.record);
      setPlanSummaryDecisions((prev) => [...prev, result.decision]);
      caseReviewState.current = {
        ...caseReviewState.current,
        planSummaryRecord: result.record,
        planSummaryDecisions: [
          ...caseReviewState.current.planSummaryDecisions,
          result.decision,
        ],
      };
      setPlanSummaryMessage("Attribute approved successfully.");
    } catch (error) {
      setPlanSummaryMessage(
        error instanceof Error ? error.message : "Failed to approve attribute.",
      );
    }
  };

  const approveFormulaAction = async (
    cellKey: string,
    scenarioId: string,
    formulaText: string,
    sourcePlanRuleIds: readonly string[],
    rationale: string,
  ): Promise<void> => {
    if (activeCase === null) {
      setArchitectureBuildMessage(
        "Select an active case before approving formulas.",
      );
      return;
    }
    setArchitectureBuildMessage(null);
    try {
      const parsedRuleIds = sourcePlanRuleIds.map((id) => parseUuid(id));
      const invalidRule = parsedRuleIds.find((r) => !r.ok);
      if (invalidRule) {
        setArchitectureBuildMessage("Invalid plan rule ID provided.");
        return;
      }
      const validRuleIds = parsedRuleIds
        .filter((r) => r.ok)
        .map((r) => r.value);

      const cell = v1Architecture?.cells.get(cellKey);
      if (cell === undefined) {
        setArchitectureBuildMessage(
          "Build the architecture before approving a formula cell.",
        );
        return;
      }
      const runClassification = cell.perRunClassification.get(scenarioId);
      if (runClassification === undefined) {
        setArchitectureBuildMessage(
          `Cell ${cellKey} is not classified for scenario ${scenarioId}.`,
        );
        return;
      }
      if (runClassification.iob !== "O" && runClassification.iob !== "B") {
        setArchitectureBuildMessage(
          `Cell ${cellKey} is classified ${runClassification.iob}, not O or B; only O/B formula cells can be approved.`,
        );
        return;
      }

      const existingRecords = formulaApprovalRecords.filter(
        (r) =>
          formulaApprovalCellKey(r) === cellKey && r.scenarioId === scenarioId,
      );
      const nextOrdinal = existingRecords.length + 1;
      const lastDecision = existingRecords[existingRecords.length - 1];

      const sourcePlanRuleHashes = previewRules
        .filter((rule) => validRuleIds.includes(rule.ruleId))
        .map((rule) => ({
          ruleId: rule.ruleId,
          ruleContentSha256: rule.ruleContentSha256,
          relationship: "governing" as const,
        }));

      const decisionId = dependencies.uuid.generate();
      const recordWithoutHash: Omit<
        FormulaApprovalRecord,
        "decisionContentSha256"
      > = {
        decisionId,
        appendOrdinal: nextOrdinal,
        priorDecisionId: lastDecision?.decisionId ?? null,
        priorDecisionContentSha256: lastDecision?.decisionContentSha256 ?? null,
        decisionType: "approve",
        resultingStatus: "approved",
        formulaText,
        target: {
          tabName: cell.sourceTab,
          cellAddress: cell.cellAddress,
          genericField: cell.genericField,
        },
        scenarioId,
        iobClassification: runClassification.iob,
        sourcePlanRules: sourcePlanRuleHashes,
        derivationDescription: `Formula approved for cell ${cellKey}`,
        affectedTestIds: [`TEST-${cellKey}`],
        regenerationImpact: "none",
        validationOracleIds: [`ORACLE-${cellKey}`],
        humanActor: {
          actorType: "human",
          actorKey:
            sharedReviewer.trim() === "" ? "anonymous" : sharedReviewer.trim(),
          displayName:
            sharedReviewer.trim() === "" ? "Anonymous" : sharedReviewer.trim(),
          authorityContext: "actuary",
        },
        rationale,
        decidedAt: dependencies.clock.now(),
        schemaVersion: "1.0.0",
      };
      const decisionContentSha256 =
        await formulaApprovalContentHash(recordWithoutHash);
      const newRecord: FormulaApprovalRecord = {
        ...recordWithoutHash,
        decisionContentSha256,
      };

      setFormulaApprovalRecords((prev) => [...prev, newRecord]);
      caseReviewState.current = {
        ...caseReviewState.current,
        formulaApprovalRecords: [
          ...caseReviewState.current.formulaApprovalRecords,
          newRecord,
        ],
      };
      setArchitectureBuildMessage(`Formula approved for cell ${cellKey}.`);
    } catch (error) {
      setArchitectureBuildMessage(
        error instanceof Error ? error.message : "Failed to approve formula.",
      );
    }
  };

  const recordArchitectureSelection = async (): Promise<void> => {
    if (
      activeCase === null ||
      evidenceCatalogRef.current === null ||
      caseControls === null
    ) {
      setArchitectureBuildMessage(
        "Active case, approved evidence catalog, and case controls are required.",
      );
      return;
    }
    setArchitectureBuildMessage(null);
    try {
      const activeWorkspace = workspace.current;
      if (activeWorkspace === null) throw new Error("Workspace unavailable.");

      const rules = previewRules;
      for (const rule of rules) {
        const validation = await validateRuleRecord(rule);
        if (!validation.ok) throw new Error(validation.error);
      }
      const overrides: readonly AuthorityOverride[] = [];

      const populationItems = caseReviewState.current.populationItems;
      const populationCandidates = populationItems.flatMap((item) =>
        item.projection.status === "approved" && item.workbook
          ? [
              {
                candidate: item.candidate,
                workbook: item.workbook,
                namedRanges: item.namedRanges,
                evidenceObservations: item.evidenceObservations ?? [],
                decisions: caseReviewState.current.populationDecisions.filter(
                  (d) => d.candidateKey === item.candidate.candidateKey,
                ),
              },
            ]
          : [],
      );

      const loadedPolicies = await loadBundledRuleSets({
        scenarioSelection: scenarioSelectionYaml,
        tabSelection: tabSelectionYaml,
        iobClassification: iobClassificationYaml,
        fieldNameGlossary: fieldNameGlossaryYaml,
        mode: "production",
        approvalContext: {
          evidenceCatalog: evidenceCatalogRef.current,
          decisions: architecturePolicyApprovals,
        },
      });
      if (!loadedPolicies.ok)
        throw new Error("Architecture policies could not be loaded.");

      const architectureResult = await buildArchitecture({
        caseId: activeCase.caseId,
        planRules: rules,
        evidenceCatalog: evidenceCatalogRef.current,
        authorityOverrides: overrides,
        population: { candidates: populationCandidates },
        caseControls,
        policies: loadedPolicies.value,
        policyApprovals: {
          decisions: architecturePolicyApprovals,
        },
        dependencies: {
          uuid: () => dependencies.uuid.generate(),
          now: () => dependencies.clock.now(),
        },
      });

      if (!architectureResult.ok) {
        const blocker = architectureResult.error;
        const message =
          "code" in blocker && blocker.code === "ARCHITECTURE_BLOCKED"
            ? ((
                blocker as unknown as {
                  unresolvedItems?: readonly { consequence?: string }[];
                }
              ).unresolvedItems?.[0]?.consequence ?? blocker.message)
            : blocker.message;
        setArchitectureBuildMessage(`Architecture build blocked: ${message}`);
        return;
      }

      const architecture = architectureResult.value.architecture;
      await persistArchitecture(activeCase.caseId, architecture);
      setV1Architecture(architecture);
      setArchitectureSelection(null);

      const buildSpecResult = await buildSpecEngine({
        architecture,
        architectureGovernance: {
          caseId: activeCase.caseId,
          planRules: rules,
          evidenceCatalog: evidenceCatalogRef.current,
          authorityOverrides: overrides,
          population: { candidates: populationCandidates },
          caseControls,
          policies: loadedPolicies.value,
          policyApprovals: { decisions: architecturePolicyApprovals },
        },
        formulaGovernance: {
          approvedPlanRules: rules,
          formulas: formulaApprovalRecords.reduce<
            {
              cellKey: string;
              scenarioId: string;
              approvalDecisions: readonly FormulaApprovalRecord[];
            }[]
          >((entries, record) => {
            const cellKey = formulaApprovalCellKey(record);
            const existing = entries.find(
              (e) =>
                e.cellKey === cellKey && e.scenarioId === record.scenarioId,
            );
            if (existing) {
              return entries.map((e) =>
                e === existing
                  ? {
                      ...e,
                      approvalDecisions: [...e.approvalDecisions, record],
                    }
                  : e,
              );
            }
            return [
              ...entries,
              {
                cellKey,
                scenarioId: record.scenarioId,
                approvalDecisions: [record],
              },
            ];
          }, []),
        },
      });

      if (!buildSpecResult.ok) {
        const messages = buildSpecResult.errors
          .map((e) => e.message)
          .join("; ");
        setArchitectureBuildMessage(
          `Architecture built but BuildSpec generation failed: ${messages}`,
        );
        return;
      }
      const buildSpec = buildSpecResult.buildSpec;
      setV1BuildSpec(buildSpec);

      const compilation = await compileBuildSpec({
        buildSpec,
        compilerVersion: "1.0.0",
        clock: { now: () => dependencies.clock.now() },
        uuid: { generate: () => dependencies.uuid.generate() },
      });
      setV1CompilationResult(compilation);

      const approvedPopulationItem = populationItems.find(
        (item) =>
          item.projection.status === "approved" &&
          item.projection.effectiveDecisionId !== null,
      );

      const populationProfile = approvedPopulationItem?.projection ?? {
        effectiveDecisionId: null,
        effectiveWorkbookProfileContentSha256: null,
        status: "provisional" as const,
        provenance: [],
      };

      const workbookContentSha256 =
        populationProfile.effectiveWorkbookProfileContentSha256 ??
        buildSpec.buildSpecContentSha256;

      let populationData:
        | ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>>
        | undefined;
      if (approvedPopulationItem?.workbook) {
        const dataMap = new Map<string, Map<string, unknown[]>>();
        for (const sheet of approvedPopulationItem.workbook.sheets) {
          const columnMap = new Map<string, unknown[]>();
          for (const cell of sheet.cells) {
            const colMatch = /^([A-Z]+)/.exec(cell.address);
            const column = colMatch?.[1] ?? "A";
            const existing = columnMap.get(column) ?? [];
            existing.push(cell.storedValue);
            columnMap.set(column, existing);
          }
          dataMap.set(sheet.name, columnMap);
        }
        populationData = dataMap;
      }

      const workbookResult = await buildWorkbook({
        buildSpec,
        populationProfile,
        workbookProfileContentSha256: workbookContentSha256,
        generatorVersion: "1.0.0",
        populationData,
      });

      if (!workbookResult.ok) {
        const messages = workbookResult.errors.map((e) => e.message).join("; ");
        setV1OutputMessage(`Workbook generation failed: ${messages}`);
        setArchitectureBuildMessage(
          `Architecture built and BuildSpec generated, but workbook failed: ${messages}`,
        );
        return;
      }
      const workbook = workbookResult.workbook;
      setV1Workbook(workbook);

      const xlsxSpec = buildXLSXSpec(workbook);
      const xlsxBytes = writeXLSXBytes(xlsxSpec);
      setV1XlsxBytes(xlsxBytes);

      setArchitectureBuildMessage(
        `V1 output built: architecture → BuildSpec → ${compilation.status} compilation → workbook (${String(xlsxBytes.byteLength)} bytes). Hash: ${architecture.architectureContentSha256.slice(0, 12)}.`,
      );
    } catch (error) {
      setArchitectureBuildMessage(
        error instanceof Error ? error.message : "Architecture build failed.",
      );
    }
  };

  const persistArchitecture = async (
    caseId: Uuid,
    architecture: V1Architecture,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    try {
      await activeWorkspace.createDirectory(`cases/${caseId}/architecture`);
      const encoded = await writeArchitectureJson(architecture);
      if (!encoded.ok) throw new Error(encoded.error.message);
      const target = `cases/${caseId}/architecture/${architecture.architectureId}.json`;
      const saved = await activeWorkspace.createImmutable(
        target,
        bytesReader(encoded.value),
      );
      if (!saved.ok) throw new Error("Architecture file could not be saved.");
      const verified = await activeWorkspace.openChunkReader(target);
      if (!verified.ok)
        throw new Error("Architecture file could not be verified.");
      const bytes = await readAllBytes(verified.value);
      const decoded = await readArchitectureJson(bytes);
      if (!decoded.ok)
        throw new Error("Architecture file failed post-write validation.");
      if (
        decoded.value.architectureContentSha256 !==
        architecture.architectureContentSha256
      )
        throw new Error(
          "Architecture content hash mismatch after persistence.",
        );
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Architecture persistence failed.");
    }
  };

  const refreshArchitecturePolicyItems = async (
    evidenceCatalog: EvidenceCatalog | null,
    approvals: readonly ArchitecturePolicyApproval[] = architecturePolicyApprovals,
  ): Promise<void> => {
    const loaded = await loadBundledRuleSets({
      scenarioSelection: scenarioSelectionYaml,
      tabSelection: tabSelectionYaml,
      iobClassification: iobClassificationYaml,
      fieldNameGlossary: fieldNameGlossaryYaml,
      mode: "candidate",
    });
    if (!loaded.ok) {
      setArchitecturePolicyItems([]);
      setArchitecturePolicyMessage(
        "Architecture policy sources could not be loaded or validated.",
      );
      return;
    }
    const policyItems: ArchitecturePolicyReviewItem[] = [];
    for (const policy of [
      loaded.value.scenarioSelection,
      loaded.value.tabSelection,
      loaded.value.iobClassification,
      loaded.value.fieldNameGlossary,
    ] as const) {
      const sourcePath = `rules/${policy.kind}.yaml`;
      const artifact = evidenceCatalog?.referenceOnly.find(
        (item) => item.locator === sourcePath,
      );
      const eligibility = artifact?.reviewStatus === "released";
      const projection = evidenceCatalog
        ? await replayArchitecturePolicyApprovals(
            policy,
            approvals.filter((approval) => approval.policyKind === policy.kind),
            evidenceCatalog,
          )
        : {
            ok: true as const,
            value: {
              status: "provisional" as const,
              effectiveDecisionId: null,
              effectiveDecisionContentSha256: null,
            },
          };
      if (!projection.ok) {
        setArchitecturePolicyMessage(projection.error);
        policyItems.push({
          policy,
          sourcePath,
          eligibility,
          approval: {
            status: "provisional",
            effectiveDecisionId: null,
            effectiveDecisionContentSha256: null,
          },
        });
        continue;
      }
      policyItems.push({
        policy,
        sourcePath,
        eligibility,
        approval: projection.value,
      });
    }
    setArchitecturePolicyItems(policyItems);
  };

  const recordArchitecturePolicyApproval = async (
    item: ArchitecturePolicyReviewItem,
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    if (
      activeCase === null ||
      evidenceCatalogRef.current === null ||
      priorSnapshot.current === null
    ) {
      setArchitecturePolicyMessage(
        "An active governed evidence snapshot and catalog are required.",
      );
      return;
    }
    try {
      const evidenceSnapshotId = priorSnapshot.current.snapshotId;
      const policyHistory = architecturePolicyApprovals.filter(
        (approval) => approval.policyKind === item.policy.kind,
      );
      const prior = policyHistory.at(-1) ?? null;
      const decidedAt = activeGovernanceDependencies.now();
      const decisionWithoutHash = {
        decisionId: activeGovernanceDependencies.uuid() as never,
        appendOrdinal: (prior?.appendOrdinal ?? 0) + 1,
        priorDecisionId: prior?.decisionId ?? null,
        priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
        decisionType: "approve" as const,
        resultingStatus: "approved" as const,
        policyKind: item.policy.kind,
        policyVersion: item.policy.version,
        policyContentSha256: item.policy.policyContentSha256,
        sourceFileSha256: item.policy.sourceFileSha256,
        evidenceCatalogId: evidenceCatalogRef.current.catalogId,
        evidenceCatalogContentSha256:
          evidenceCatalogRef.current.catalogContentSha256,
        evidenceCitations: [
          {
            sourceArtifactSha256: item.policy.sourceFileSha256,
            sourceLocator: item.sourcePath,
            effectiveDate: decidedAt.slice(0, 10),
            adoptionDate: null,
            supersedesArtifactSha256: null,
          },
        ],
        humanActor: {
          actorType: "human" as const,
          actorKey: reviewer,
          displayName: reviewer,
          authorityContext: "case-orchestrator",
        },
        rationale,
        decidedAt: decidedAt as never,
        schemaVersion: "1.0.0" as const,
      };
      const decision = {
        ...decisionWithoutHash,
        decisionContentSha256:
          await architecturePolicyDecisionContentHash(decisionWithoutHash),
      };
      const nextApprovals = [...architecturePolicyApprovals, decision].sort(
        (left, right) =>
          left.policyKind.localeCompare(right.policyKind) ||
          left.appendOrdinal - right.appendOrdinal,
      );
      setArchitecturePolicyApprovals(nextApprovals);
      caseReviewState.current = {
        ...caseReviewState.current,
        architecturePolicyApprovals: nextApprovals,
      };
      await persistCaseReviewState(
        activeCase.caseId,
        evidenceSnapshotId,
        caseReviewState.current,
      );
      await refreshArchitecturePolicyItems(
        evidenceCatalogRef.current,
        nextApprovals,
      );
      setArchitecturePolicyMessage(
        `${item.policy.kind} approved by ${reviewer}.`,
      );
    } catch (error) {
      setArchitecturePolicyMessage(
        error instanceof Error ? error.message : "Approval failed.",
      );
    }
  };

  const recordCaseControls = async (draft: {
    readonly singleCalculation: boolean;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly reviewer: string;
    readonly rationale: string;
  }): Promise<void> => {
    if (
      activeCase === null ||
      evidenceCatalogRef.current === null ||
      priorSnapshot.current === null
    ) {
      setCaseControlsMessage(
        "An active governed evidence snapshot and catalog are required.",
      );
      return;
    }
    try {
      const evidenceSnapshotId = priorSnapshot.current.snapshotId;
      const controlWithoutHash: Omit<
        AuthenticatedCaseControls,
        "caseControlContentSha256"
      > = {
        controlId: activeGovernanceDependencies.uuid() as never,
        dimensions: draft.singleCalculation
          ? { "case-purpose": "single-calculation" }
          : {},
        effectiveDateRange: {
          startDate: draft.startDate,
          endDate: draft.endDate,
        },
        reviewStatus: "human-approved",
        approvedBy: draft.reviewer,
        approvalRationale: draft.rationale,
      };
      const control = {
        ...controlWithoutHash,
        caseControlContentSha256:
          await caseControlContentHash(controlWithoutHash),
      };
      setCaseControls(control);
      caseReviewState.current = {
        ...caseReviewState.current,
        authenticatedCaseControls: control,
      };
      await persistCaseReviewState(
        activeCase.caseId,
        evidenceSnapshotId,
        caseReviewState.current,
      );
      setCaseControlsMessage(
        `Case controls approved for ${draft.startDate} by ${draft.reviewer}.`,
      );
    } catch (error) {
      setCaseControlsMessage(
        error instanceof Error ? error.message : "Approval failed.",
      );
    }
  };

  const downloadV1Workbook = (): void => {
    if (v1XlsxBytes === null || activeCase === null) return;
    const blob = new Blob([v1XlsxBytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `V1-Workbook-${String(activeCase.caseId)}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const loadArchitectureSelection = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const opened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/outputs/architecture-selection.json`,
    );
    if (!opened.ok) {
      if (opened.error.code !== "NOT_FOUND") {
        setArchitectureBuildMessage(
          "Existing architecture selection could not be read.",
        );
      }
      return;
    }
    try {
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(opened.value),
        ),
      ) as unknown;
      if (
        typeof value === "object" &&
        value !== null &&
        "scenarioIds" in value &&
        "tabNames" in value &&
        "reviewer" in value &&
        "rationale" in value
      ) {
        setArchitectureSelection(value as ArchitectureSelection);
      }
    } catch {
      setArchitectureBuildMessage(
        "Existing architecture selection is not valid UTF-8 JSON and was ignored.",
      );
    }
  };

  const persistCaseOutputArtifactReferences = async (
    caseId: Uuid,
    references: readonly CaseworkOutputArtifactInput[],
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    await activeWorkspace.createDirectory(`cases/${caseId}/outputs`);
    const saved = await activeWorkspace.writeAtomic(
      `cases/${caseId}/outputs/artifact-references.json`,
      new TextEncoder().encode(`${canonicalize(references)}\n`),
    );
    if (!saved.ok) {
      throw new Error("Final-output artifact references could not be saved.");
    }
  };

  const linkCaseOutputArtifact = async (
    draft: CaseOutputArtifactLinkDraft,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) {
      setCaseOutputLinkMessage(
        "Select an active local case before linking output artifacts.",
      );
      return;
    }
    const artifactId = draft.artifactId.trim();
    const storagePath = normalizeWorkspacePath(draft.storagePath);
    const mediaType = draft.mediaType.trim();
    const description = draft.description.trim();
    if (
      artifactId === "" ||
      storagePath === null ||
      mediaType === "" ||
      description === ""
    ) {
      setCaseOutputLinkMessage(
        "Artifact type, ID, workspace path, media type, and description are required. Paths must be relative workspace paths without '..'.",
      );
      return;
    }
    const opened = await activeWorkspace.openChunkReader(storagePath);
    if (!opened.ok) {
      setCaseOutputLinkMessage(
        `Workspace artifact could not be opened at ${storagePath}.`,
      );
      return;
    }
    const hashed = await hashChunkReader(opened.value);
    if (!hashed.ok) {
      setCaseOutputLinkMessage(hashed.error.safeMessage);
      return;
    }
    const linked: CaseworkOutputArtifactInput = {
      artifactType: draft.artifactType,
      artifactId,
      contentSha256: hashed.value.sha256,
      mediaType,
      storagePath,
      description,
      maturityLevel: draft.maturityLevel,
    };
    const next = [
      ...caseOutputArtifacts.filter(
        (artifact) => artifact.artifactType !== linked.artifactType,
      ),
      linked,
    ].sort(compareCaseOutputArtifacts);
    await persistCaseOutputArtifactReferences(activeCase.caseId, next);
    setCaseOutputArtifacts(next);
    setCaseOutputExportMessage(null);
    setCaseOutputLinkMessage(
      `Linked ${linked.artifactType} from ${storagePath} with SHA-256 ${linked.contentSha256}.`,
    );
  };

  const exportCurrentManifest = async (): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (!activeWorkspace || !activeCase || !manifestSummary)
      throw new Error("No local manifest is available for export.");
    await activeWorkspace.createDirectory(`cases/${activeCase.caseId}/exports`);
    const bytes = new TextEncoder().encode(
      `${canonicalize({
        deterministicManifestHash: manifestSummary.deterministicManifestHash,
        artifactCount: manifestSummary.artifactCount,
        validationCount: manifestSummary.validationCount,
        unresolvedCount: manifestSummary.unresolvedCount,
        accountingStatus: manifestSummary.accountingStatus,
        lineage: manifestSummary.lineage,
      })}\n`,
    );
    const saved = await activeWorkspace.writeAtomic(
      `cases/${activeCase.caseId}/exports/evidence-manifest.json`,
      bytes,
    );
    if (!saved.ok) throw new Error("Local manifest export failed.");
  };

  const openEvidence = async (item: ArtifactInventoryItem): Promise<void> => {
    const activeWorkspace = workspace.current;
    const selectedCase = activeCase;
    if (
      activeWorkspace === null ||
      selectedCase === null ||
      item.sha256 === null
    ) {
      setEvidenceViewerError("A verified active-case artifact is required.");
      return;
    }
    const artifactSha256 = parseSha256(item.sha256);
    if (!artifactSha256.ok) {
      setEvidenceViewerError("The artifact identity is invalid.");
      return;
    }
    if (item.sizeBytes > 128 * 1024 * 1024) {
      setEvidenceViewerError(
        "This artifact exceeds the 128 MiB bounded in-app preview limit. Its original bytes remain preserved.",
      );
      return;
    }
    setEvidenceViewerLoading(true);
    setEvidenceViewerError(null);
    setEvidenceViewerArtifact(null);
    try {
      const opened = await activeWorkspace.openChunkReader(
        contentObjectPath(artifactSha256.value),
      );
      if (!opened.ok || opened.value.sizeBytes !== item.sizeBytes) {
        throw new Error("Preserved evidence could not be opened or sized.");
      }
      const verified = await hashChunkReader(opened.value);
      if (!verified.ok || verified.value.sha256 !== artifactSha256.value) {
        throw new Error("Preserved evidence failed SHA-256 verification.");
      }
      const bytes = await readAllBytes(opened.value);
      let extraction: EvidenceExtraction | null = null;
      let correction: EvidenceTextCorrection | null = null;
      let extractionWarning: string | null = null;
      try {
        extraction = await readEvidenceExtraction(
          selectedCase.caseId,
          artifactSha256.value,
        );
        if (extraction !== null) {
          correction = await readEvidenceCorrection(
            selectedCase.caseId,
            artifactSha256.value,
            extraction.extractionContentSha256,
          );
        }
      } catch {
        extractionWarning =
          "The original is verified, but its extraction or correction state could not be verified and was not displayed.";
        extraction = null;
        correction = null;
      }
      if (activeCaseId.current !== selectedCase.caseId) return;
      const declaredMediaType = priorSnapshot.current?.entries.find(
        (entry) =>
          entry.sha256 === artifactSha256.value &&
          entry.observedRelativePath === item.path,
      )?.declaredMediaType;
      setEvidenceViewerArtifact({
        path: item.path,
        sha256: artifactSha256.value,
        mediaType:
          extraction?.mediaType ??
          (declaredMediaType === "" ? null : declaredMediaType) ??
          inferEvidenceMediaType(item.path),
        bytes,
        extraction,
        correction,
      });
      setEvidenceViewerError(extractionWarning);
    } catch {
      if (activeCaseId.current === selectedCase.caseId) {
        setEvidenceViewerError(
          "Evidence could not be opened because its preserved bytes failed local integrity verification.",
        );
      }
    } finally {
      if (activeCaseId.current === selectedCase.caseId) {
        setEvidenceViewerLoading(false);
      }
    }
  };

  const closeEvidence = (): void => {
    setEvidenceViewerArtifact(null);
    setEvidenceViewerError(null);
    setEvidenceViewerLoading(false);
  };

  const saveEvidenceCorrection = async (
    correctedText: string,
  ): Promise<void> => {
    const selectedCase = activeCase;
    const artifact = evidenceViewerArtifact;
    const evidenceSnapshotId = priorSnapshot.current?.snapshotId ?? null;
    if (
      selectedCase === null ||
      artifact?.extraction == null ||
      reviewerIdentity === null ||
      evidenceSnapshotId === null
    ) {
      throw new Error(
        "A verified extraction, evidence checkpoint, and asserted session reviewer are required.",
      );
    }
    const artifactSha256 = parseSha256(artifact.sha256);
    if (!artifactSha256.ok) throw new Error("Artifact identity is invalid.");
    const reviewState = caseReviewState.current;
    const quarantineDecisions = [
      ...(quarantineHistory.current.get(artifact.sha256) ?? []),
    ];
    const sensitiveRisk = await screenSensitiveText(
      correctedText,
      artifactSha256.value,
      {
        authorizedRealPii: false,
        expectedFields: [],
        maximumSensitiveMatches: 8,
      },
    );
    const blockingFindings = sensitiveRisk.findings.filter(
      (finding) => finding.blocksDownstream,
    );
    if (blockingFindings.length > 0) {
      const release = await replayQuarantineDecisions(
        artifactSha256.value,
        quarantineDecisions,
      );
      const effectiveDecision = release.ok
        ? quarantineDecisions.find(
            (decision) =>
              decision.decisionId === release.value.effectiveDecisionId,
          )
        : undefined;
      if (
        !release.ok ||
        !release.value.eligible ||
        effectiveDecision === undefined ||
        blockingFindings.some(
          (finding) =>
            !effectiveDecision.findingIds.includes(finding.findingId),
        )
      ) {
        throw new Error(
          "Corrected text was not saved because it introduced sensitive-data findings that are not covered by an effective same-artifact release.",
        );
      }
    }
    const correction = await createEvidenceTextCorrection({
      schemaVersion: "1.0.0",
      artifactSha256: artifactSha256.value,
      extractionContentSha256: artifact.extraction.extractionContentSha256,
      correctedText,
      correctedBy: reviewerIdentity.displayName,
      correctedAt: dependencies.clock.now(),
    });
    const analysisSourceLocator = `correction:${correction.correctionContentSha256}`;
    const proposals = [
      ...new Map(
        (
          await Promise.all(
            evidenceClassificationScopes(correctedText, artifact.mediaType).map(
              (scope) =>
                proposeClassifications({
                  artifactSha256: artifactSha256.value,
                  filename: artifact.path,
                  mediaType: artifact.mediaType,
                  text: scope.text,
                  analysisSourceLocator,
                  ...(scope.textLocator === undefined
                    ? {}
                    : { textLocator: scope.textLocator }),
                }),
            ),
          )
        )
          .flat()
          .map((proposal) => [proposal.proposalKey, proposal] as const),
      ).values(),
    ];
    const nextClassificationItems: ClassificationReviewItem[] = [
      ...reviewState.classificationItems.filter(
        (item) => item.proposal.artifactSha256 !== artifactSha256.value,
      ),
      ...proposals.map(
        (proposal) =>
          reviewState.classificationItems.find(
            (item) => item.proposal.proposalKey === proposal.proposalKey,
          ) ?? {
            displayName: artifact.path,
            proposal,
            effectiveStatus: "provisional" as const,
            reviewer: null,
            rationale: null,
            provenanceCount: 0,
          },
      ),
    ];
    const dateCandidates = await extractDateCandidates(
      artifactSha256.value,
      correctedText,
      analysisSourceLocator,
    );
    const nextDateItems: DateCandidateReviewItem[] = [
      ...reviewState.dateCandidateItems.filter(
        (item) => item.candidate.artifactSha256 !== artifactSha256.value,
      ),
      ...dateCandidates.map(
        (candidate) =>
          reviewState.dateCandidateItems.find(
            (item) => item.candidate.candidateKey === candidate.candidateKey,
          ) ?? {
            displayName: artifact.path,
            candidate,
            selected: false,
            reviewer: null,
          },
      ),
    ];
    const nextRelationshipItems = reviewState.relationshipItems.filter(
      (item) =>
        item.relationship.fromSha256 !== artifactSha256.value &&
        item.relationship.toSha256 !== artifactSha256.value,
    );
    const nextPopulationItems = reviewState.populationItems.filter(
      (item) => item.candidate.artifactSha256 !== artifactSha256.value,
    );
    const nextState: CaseReviewState = {
      ...reviewState,
      classificationItems: nextClassificationItems,
      dateCandidateItems: nextDateItems,
      relationshipItems: nextRelationshipItems,
      populationItems: nextPopulationItems,
    };
    await persistEvidenceCorrection(selectedCase.caseId, correction);
    await persistCaseReviewState(
      selectedCase.caseId,
      evidenceSnapshotId,
      nextState,
    );
    if (activeCaseId.current !== selectedCase.caseId) return;
    caseReviewState.current = nextState;
    setClassificationItems(nextClassificationItems);
    setDateCandidateItems(nextDateItems);
    setRelationshipItems(nextRelationshipItems);
    setPopulationItems(nextPopulationItems);
    setEvidenceViewerArtifact({ ...artifact, correction });
    setEvidenceViewerError(null);
    await refreshGovernedEvidenceRecords(selectedCase.caseId);
  };

  const processPackage = async (
    files: readonly File[],
    signal: AbortSignal,
    update: (items: readonly ArtifactInventoryItem[]) => void,
  ): Promise<PackageIntakeResult> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) {
      throw new Error("Controlled workspace is unavailable.");
    }
    const priorEntries = priorSnapshot.current?.entries ?? [];
    const selections = files
      .map((file) => ({
        file,
        item: {
          id: `pending:${dependencies.uuid.generate()}:${file.name}`,
          path: file.webkitRelativePath || file.name,
          sizeBytes: file.size,
          sha256: null,
          status: "queued" as const,
          message: "Awaiting deterministic hash.",
        },
      }))
      .sort((left, right) => left.item.path.localeCompare(right.item.path));
    const pendingItems: ArtifactInventoryItem[] = selections.map(
      (selection) => selection.item,
    );
    let items: ArtifactInventoryItem[] = [...evidenceItems, ...pendingItems];
    const fileByItemId = new Map(
      selections.map(({ item, file }) => [item.id, file] as const),
    );
    update(items);
    const entries: SnapshotEntry[] = [...priorEntries];
    const entryIdentities = new Set(
      priorEntries.map(
        (entry) => `${entry.observedRelativePath}\0${entry.sha256}`,
      ),
    );
    const receivedEntries: SnapshotEntry[] = [];
    const redundantItemIds = new Set<string>();
    const seenHashes = new Set<string>(
      priorEntries.map((entry) => entry.sha256),
    );
    const comparableArtifacts: {
      readonly sha256: string;
      readonly text: string;
      readonly label: string;
    }[] = [];
    let failures = 0;
    for (const item of items) {
      if (signal.aborted) {
        items = items.map((candidate) =>
          candidate.status === "queued" || candidate.status === "hashing"
            ? {
                ...candidate,
                status: "interrupted",
                message: "Work stopped at a durable boundary.",
              }
            : candidate,
        );
        update(items);
        setEvidenceItems(items);
        const interruptedResult = {
          items,
          snapshotId: priorSnapshot.current?.snapshotId ?? null,
          resumeKind:
            priorSnapshot.current === null ? "first" : "unchanged-resume",
          packageStatus: "interrupted",
        } as const;
        setEvidencePackageSummary(interruptedResult);
        return interruptedResult;
      }
      const file = fileByItemId.get(item.id);
      if (!file) continue;
      items = replaceItem(items, item.id, {
        status: "hashing",
        message: "Reading fixed-size local chunks.",
      });
      update(items);
      const reader = fileReader(file);
      const hashed = await hashChunkReader(reader, { signal });
      if (!hashed.ok) {
        items = replaceItem(items, item.id, {
          status:
            hashed.error.code === "HASH_CANCELLED" ? "interrupted" : "failed",
          message: hashed.error.safeMessage,
        });
        update(items);
        if (hashed.error.code === "HASH_CANCELLED") {
          const interruptedResult = {
            items,
            snapshotId: priorSnapshot.current?.snapshotId ?? null,
            resumeKind:
              priorSnapshot.current === null ? "first" : "unchanged-resume",
            packageStatus: "interrupted",
          } as const;
          setEvidenceItems(items);
          setEvidencePackageSummary(interruptedResult);
          return interruptedResult;
        }
        failures += 1;
        continue;
      }
      const preserved = await preserveContent(
        activeWorkspace,
        fileReader(file),
        hashed.value.sha256,
        dependencies.clock,
      );
      if (!preserved.ok) {
        failures += 1;
        items = replaceItem(items, item.id, {
          status: "failed",
          sha256: hashed.value.sha256,
          message: preserved.error.safeMessage,
        });
        update(items);
        continue;
      }
      const duplicate = seenHashes.has(hashed.value.sha256);
      seenHashes.add(hashed.value.sha256);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const binaryRisk = await screenBinaryRisk(
        bytes,
        hashed.value.sha256,
        file.type || null,
        file.name,
      );
      const initialBlockingFindings = binaryRisk.findings.filter(
        (finding) => finding.blocksDownstream,
      );
      let passive =
        initialBlockingFindings.length === 0
          ? inspectPassive(file.name, bytes)
          : null;
      if (
        passive?.status === "success" &&
        passive.riskIndicators.length === 0 &&
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const structuralLimitations = passive.limitations;
        const machineExtraction = await extractLocalPdfMachineText(bytes);
        passive = Object.freeze({
          ...machineExtraction,
          limitations: Object.freeze([
            ...structuralLimitations,
            ...machineExtraction.limitations,
          ]),
        });
      }
      let persistedExtraction: EvidenceExtraction | null = null;
      if (passive?.status === "success") {
        persistedExtraction = await persistEvidenceExtraction(
          activeCase.caseId,
          hashed.value.sha256,
          passive,
        );
      }
      const sensitiveRisk =
        passive?.status === "success" && passive.text.trim() !== ""
          ? await screenSensitiveText(passive.text, hashed.value.sha256, {
              authorizedRealPii: false,
              expectedFields: [],
              maximumSensitiveMatches: 8,
            })
          : null;
      const blockingFindings = [
        ...initialBlockingFindings,
        ...(sensitiveRisk?.findings ?? []).filter(
          (finding) => finding.blocksDownstream,
        ),
        ...(passive !== null &&
        (passive.status !== "success" || passive.riskIndicators.length > 0)
          ? [
              {
                category:
                  passive.riskIndicators.length > 0
                    ? passive.riskIndicators.join(", ")
                    : passive.status,
                blocksDownstream: true,
              },
            ]
          : []),
      ];
      const existingEligibilityItem =
        caseReviewState.current.eligibilityItems.find(
          (candidate) => candidate.artifactSha256 === hashed.value.sha256,
        );
      storeEligibilityItems([
        ...caseReviewState.current.eligibilityItems.filter(
          (candidate) => candidate.artifactSha256 !== hashed.value.sha256,
        ),
        existingEligibilityItem ?? {
          artifactSha256: hashed.value.sha256,
          displayName: item.path,
          requiresQuarantineRelease: blockingFindings.length > 0,
          quarantineReleased: false,
          projection: {
            artifactSha256: hashed.value.sha256,
            eligible: false,
            effectiveStatus: "provisional",
            effectiveDecisionId: null,
            provenance: [],
          },
        },
      ]);
      if (blockingFindings.length === 0 && passive?.status === "success") {
        if (persistedExtraction === null) {
          throw new Error("Verified machine extraction is unavailable.");
        }
        const analysisSourceLocator = `machine-extraction:${persistedExtraction.extractionContentSha256}`;
        const workbookProfile =
          passive.parserId === "workbook-passive"
            ? adaptWorkbookExtraction(passive)
            : null;
        const population =
          workbookProfile !== null
            ? await detectWorkbookPopulation(
                hashed.value.sha256,
                workbookProfile,
                "unknown",
              )
            : passive.mediaType === "text/csv" ||
                passive.mediaType === "text/tab-separated-values" ||
                passive.mediaType === "application/json" ||
                passive.mediaType.startsWith("text/")
              ? await detectTabularPopulation(
                  hashed.value.sha256,
                  adaptTabularExtraction(passive),
                  "unknown",
                )
              : null;
        if (population !== null) {
          const workbookProfileContentSha256 =
            workbookProfile === null
              ? population.candidate.candidateKey
              : await workbookProfileContentHash(workbookProfile, []);
          const existingPopulationItem =
            caseReviewState.current.populationItems.find(
              (candidate) =>
                candidate.candidate.candidateKey ===
                population.candidate.candidateKey,
            );
          storePopulationItems([
            ...caseReviewState.current.populationItems.filter(
              (candidate) =>
                candidate.candidate.artifactSha256 !== hashed.value.sha256,
            ),
            existingPopulationItem ?? {
              displayName: item.path,
              candidate: population.candidate,
              workbookProfileContentSha256,
              projection: {
                status: "provisional",
                effectiveDecisionId: null,
                effectiveWorkbookProfileContentSha256: null,
                provenance: [],
              },
              structuralFinding:
                population.candidate.candidateStatus === "proposed"
                  ? "Likely population structure detected; governed use remains blocked pending human review."
                  : "Structure is ambiguous or incomplete; route to unresolved review.",
              evidenceObservations: population.observations,
              ...(workbookProfile === null
                ? {}
                : { workbook: workbookProfile }),
            },
          ]);
        }
        const classificationScopes = evidenceClassificationScopes(
          passive.text,
          passive.mediaType,
        );
        const proposals = [
          ...new Map(
            (
              await Promise.all(
                classificationScopes.map((scope) =>
                  proposeClassifications({
                    artifactSha256: hashed.value.sha256,
                    filename: item.path,
                    mediaType: file.type || null,
                    text: scope.text,
                    analysisSourceLocator,
                    ...(scope.textLocator === undefined
                      ? {}
                      : { textLocator: scope.textLocator }),
                  }),
                ),
              )
            )
              .flat()
              .map((proposal) => [proposal.proposalKey, proposal] as const),
          ).values(),
        ];
        storeClassificationItems([
          ...caseReviewState.current.classificationItems.filter(
            (candidate) =>
              candidate.proposal.artifactSha256 !== hashed.value.sha256,
          ),
          ...proposals.map(
            (proposal) =>
              caseReviewState.current.classificationItems.find(
                (candidate) =>
                  candidate.proposal.proposalKey === proposal.proposalKey,
              ) ?? {
                displayName: item.path,
                proposal,
                effectiveStatus: "provisional" as const,
                reviewer: null,
                rationale: null,
                provenanceCount: 0,
              },
          ),
        ]);
        const dateCandidates = await extractDateCandidates(
          hashed.value.sha256,
          passive.text,
          analysisSourceLocator,
        );
        storeDateCandidateItems([
          ...caseReviewState.current.dateCandidateItems.filter(
            (candidate) =>
              candidate.candidate.artifactSha256 !== hashed.value.sha256,
          ),
          ...dateCandidates.map(
            (candidate) =>
              caseReviewState.current.dateCandidateItems.find(
                (existing) =>
                  existing.candidate.candidateKey === candidate.candidateKey,
              ) ?? {
                displayName: item.path,
                candidate,
                selected: false,
                reviewer: null,
              },
          ),
        ]);
        for (const prior of comparableArtifacts) {
          const relationship =
            prior.sha256 === hashed.value.sha256
              ? await createRelationshipProposal({
                  fromSha256: prior.sha256 as Sha256,
                  toSha256: hashed.value.sha256,
                  relationshipType: "exact-duplicate",
                  status: "proposed",
                  confidence: 1,
                  supportingEvidence: [],
                  ruleSetVersion: "feature-009-classification-v1",
                })
              : await proposeNearDuplicate(
                  prior.sha256 as Sha256,
                  hashed.value.sha256,
                  prior.text,
                  passive.text,
                  0.35,
                );
          if (relationship) {
            storeRelationshipItems([
              ...caseReviewState.current.relationshipItems.filter(
                (candidate) =>
                  candidate.relationship.relationshipKey !==
                  relationship.relationshipKey,
              ),
              caseReviewState.current.relationshipItems.find(
                (candidate) =>
                  candidate.relationship.relationshipKey ===
                  relationship.relationshipKey,
              ) ?? {
                relationship,
                fromLabel: prior.label,
                toLabel: item.path,
                effectiveStatus: "provisional",
                rationale: null,
                provenanceCount: 0,
              },
            ]);
          }
        }
        comparableArtifacts.push({
          sha256: hashed.value.sha256,
          text: passive.text,
          label: item.path,
        });
      }
      if (blockingFindings.length > 0) {
        {
          const next: QuarantineQueueItem = {
            artifactSha256: hashed.value.sha256,
            displayName: item.path,
            accountingStatus: "pending-human-disposition",
            provisionalState: "provisional-safety-block",
            findingIds: Object.freeze(
              blockingFindings.map((finding, index) =>
                "findingId" in finding && typeof finding.findingId === "string"
                  ? finding.findingId
                  : `passive:${hashed.value.sha256}:${String(index)}`,
              ),
            ),
            findingSummary: blockingFindings
              .map((finding) => finding.category)
              .join(", "),
            evidenceRequired:
              "An authorized reviewer must check the exact files and findings.",
            nextAction:
              "Release the safety hold, permanently quarantine, or reject with a reason.",
            effectiveHumanStatus: "none",
            reviewer: null,
            rationale: null,
            inheritanceAvailable:
              quarantineHistory.current.get(hashed.value.sha256)?.at(-1)
                ?.resultingStatus === "released",
            eligibilityDecisionCount: 0,
          };
          storeQuarantineItems([
            ...caseReviewState.current.quarantineItems.filter(
              (candidate) => candidate.artifactSha256 !== next.artifactSha256,
            ),
            next,
          ]);
        }
      }
      const receivedEntry: SnapshotEntry = {
        observedRelativePath: item.path,
        normalizedDisplayPath: item.path.normalize("NFC"),
        sha256: hashed.value.sha256,
        sizeBytes: file.size,
        declaredMediaType: file.type || null,
        lastModifiedObserved: null,
      };
      receivedEntries.push(receivedEntry);
      const entryIdentity = `${receivedEntry.observedRelativePath}\0${receivedEntry.sha256}`;
      if (entryIdentities.has(entryIdentity)) {
        redundantItemIds.add(item.id);
      } else {
        entryIdentities.add(entryIdentity);
        entries.push(receivedEntry);
      }
      items = replaceItem(items, item.id, {
        status:
          blockingFindings.length > 0
            ? "provisional-blocked"
            : duplicate
              ? "duplicate"
              : "preserved",
        sha256: hashed.value.sha256,
        message:
          blockingFindings.length > 0
            ? "Safety review needed. An authorized reviewer must decide before use."
            : duplicate
              ? "Same content as another file. Kept separately; no approval given."
              : "File preserved. Downstream use blocked until all reviews complete.",
      });
      update(items);
    }
    const attemptedItems = items.filter((item) => fileByItemId.has(item.id));
    items = items.filter((item) => !redundantItemIds.has(item.id));
    const snapshot = await createPackageSnapshot(entries, dependencies);
    const difference =
      priorSnapshot.current === null
        ? null
        : compareSnapshots(priorSnapshot.current, snapshot);
    const resumeKind =
      difference === null
        ? "first"
        : difference === "unchanged"
          ? "unchanged-resume"
          : "linked-divergence";
    const existingCheckpoint = inventoryCheckpoints.current.get(
      snapshot.snapshotId,
    );
    const packageStatus = failures === 0 ? "completed" : "partial";
    const manifestPath = `cases/${activeCase.caseId}/manifests/${snapshot.snapshotId}.json`;
    let checkpointReference = existingCheckpoint;
    if (checkpointReference === undefined) {
      const existingManifest =
        await activeWorkspace.openChunkReader(manifestPath);
      if (existingManifest.ok) {
        try {
          const value = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              await readAllBytes(existingManifest.value),
            ),
          ) as unknown;
          const parsed = parsePersistedCheckpoint(value);
          if (
            !parsed.ok ||
            parsed.value.caseId !== activeCase.caseId ||
            parsed.value.snapshot.snapshotId !== snapshot.snapshotId ||
            (await computePackageSnapshotId(parsed.value.snapshot.entries)) !==
              snapshot.snapshotId
          ) {
            throw new Error("Existing inventory checkpoint is invalid.");
          }
          checkpointReference = {
            attemptId: parsed.value.attemptId,
            snapshot: parsed.value.snapshot,
            inventoryItems: parsed.value.inventoryItems,
            packageStatus: parsed.value.packageStatus,
            receipts: parsed.value.receipts,
            artifacts: parsed.value.artifacts,
          };
        } catch {
          throw new Error("Existing inventory checkpoint is invalid.");
        }
      } else if (existingManifest.error.code !== "NOT_FOUND") {
        throw new Error("Inventory checkpoint could not be inspected.");
      }
    }
    if (checkpointReference === undefined) {
      const receipts: ReceiptRecord[] = [];
      const artifacts: ArtifactRecord[] = [];
      const attemptId = dependencies.uuid.generate();
      for (const entry of entries) {
        const receiptId = dependencies.uuid.generate();
        receipts.push({
          receiptId,
          attemptId,
          caseId: activeCase.caseId,
          sha256: entry.sha256,
          originalFilename:
            entry.observedRelativePath.split("/").at(-1) ??
            entry.observedRelativePath,
          observedRelativePath: entry.observedRelativePath,
          submittedBy: reviewerIdentity?.actorKey ?? null,
          submittedAt: dependencies.clock.now(),
          sourceLocation: "user-selected-local-package",
          transferContext: null,
          declaredDescription: null,
          parentArtifactId: null,
        });
        artifacts.push({
          artifactId: dependencies.uuid.generate(),
          receiptId,
          sha256: entry.sha256,
          attemptId,
          caseId: activeCase.caseId,
          artifactRole: "submitted-file",
          signatureMediaType: entry.declaredMediaType,
          processingStatus: "preserved",
          downstreamEligibility: "blocked",
          statusHistory: Object.freeze([]),
        });
      }
      const seenReceiptHashes = new Set<string>();
      const reconciliation = reconcileInventory(
        artifacts.map((artifact) => artifact.artifactId),
        artifacts.map((artifact) => ({
          recordId: artifact.artifactId,
          category: "source-artifact",
        })),
        artifacts.map((artifact) => {
          const isDup = seenReceiptHashes.has(artifact.sha256);
          seenReceiptHashes.add(artifact.sha256);
          return {
            recordId: artifact.artifactId,
            category: isDup
              ? ("duplicate" as const)
              : ("pending-human-disposition" as const),
          };
        }),
      );
      const checkpoint = Object.freeze({
        schemaVersion: "1.0.0" as const,
        caseId: activeCase.caseId,
        attemptId,
        priorAttemptId:
          resumeKind === "linked-divergence"
            ? (lastCheckpoint.current?.attemptId ?? null)
            : null,
        divergenceReason:
          resumeKind === "linked-divergence" ? difference : null,
        snapshot,
        inventoryItems: Object.freeze(items),
        packageStatus,
        receipts: Object.freeze(receipts),
        artifacts: Object.freeze(artifacts),
        reconciliation,
        downstreamBlocked: true,
      });
      await activeWorkspace.createDirectory(
        `cases/${activeCase.caseId}/snapshots`,
      );
      const snapshotPath = `cases/${activeCase.caseId}/snapshots/${snapshot.snapshotId}.json`;
      const snapshotStored = await activeWorkspace.stat(snapshotPath);
      if (!snapshotStored.ok) {
        if (snapshotStored.error.code !== "NOT_FOUND") {
          throw new Error("Snapshot could not be inspected.");
        }
        const saved = await activeWorkspace.createImmutable(
          snapshotPath,
          bytesReader(new TextEncoder().encode(`${canonicalize(snapshot)}\n`)),
        );
        if (!saved.ok) throw new Error("Snapshot could not be preserved.");
      }
      await activeWorkspace.createDirectory(
        `cases/${activeCase.caseId}/manifests`,
      );
      const manifestBytes = new TextEncoder().encode(
        `${canonicalize(checkpoint)}\n`,
      );
      const saved = await activeWorkspace.createImmutable(
        manifestPath,
        bytesReader(manifestBytes),
      );
      if (!saved.ok)
        throw new Error("Inventory checkpoint could not be preserved.");
      checkpointReference = {
        attemptId: checkpoint.attemptId,
        snapshot: checkpoint.snapshot,
        inventoryItems: checkpoint.inventoryItems,
        packageStatus: checkpoint.packageStatus,
        receipts: checkpoint.receipts,
        artifacts: checkpoint.artifacts,
      };
    }
    await activeWorkspace.createDirectory(`cases/${activeCase.caseId}/intake`);
    const intakeEventSaved = await activeWorkspace.append(
      `cases/${activeCase.caseId}/intake/events.jsonl`,
      new TextEncoder().encode(
        `${canonicalize({
          schemaVersion: "1.0.0",
          eventId: dependencies.uuid.generate(),
          caseId: activeCase.caseId,
          recordedAt: dependencies.clock.now(),
          resultingSnapshotId: checkpointReference.snapshot.snapshotId,
          items: attemptedItems,
          receivedEntries,
        })}\n`,
      ),
    );
    if (!intakeEventSaved.ok) {
      throw new Error("Evidence intake provenance could not be preserved.");
    }
    const pointerBytes = new TextEncoder().encode(
      `${canonicalize({
        checkpointSnapshotId: checkpointReference.snapshot.snapshotId,
        writtenAt: dependencies.clock.now(),
      })}\n`,
    );
    const pointerSaved = await activeWorkspace.writeAtomic(
      `cases/${activeCase.caseId}/manifests/current.json`,
      pointerBytes,
    );
    if (!pointerSaved.ok) {
      throw new Error("Inventory checkpoint pointer could not be preserved.");
    }
    await persistCaseReviewState(
      activeCase.caseId,
      checkpointReference.snapshot.snapshotId,
      caseReviewState.current,
    );

    priorSnapshot.current = checkpointReference.snapshot;
    inventoryCheckpoints.current.set(
      checkpointReference.snapshot.snapshotId,
      checkpointReference,
    );
    lastCheckpoint.current = checkpointReference;
    await refreshGovernedEvidenceRecords(activeCase.caseId);
    items = [...checkpointReference.inventoryItems];
    setManifestSummary({
      artifactCount: entries.length,
      validationCount: entries.length,
      unresolvedCount: items.filter(
        (item) =>
          item.status === "provisional-blocked" || item.status === "failed",
      ).length,
      accountingStatus:
        failures === 0
          ? "Awaiting human review"
          : "Partial — some files failed",
      provisionalBlockReason:
        entries.length === 0
          ? "No evidence files were available for processing."
          : "Evidence is pending until all required reviews are complete.",
      requiredReview:
        "Review quarantine, artifact eligibility, classification, relationship, and population queues.",
      nextAction: "Complete all reviews, then export the final manifest.",
      deterministicManifestHash: snapshot.snapshotId,
      lineage: entries.map((entry, index) => ({
        nodeId: `artifact-${String(index + 1)}`,
        label: entry.observedRelativePath,
        sourceHash: entry.sha256,
        sourceLocator: entry.observedRelativePath,
        status: "provisional",
      })),
    });
    setEvidenceItems(items);
    setEvidencePackageSummary({
      items,
      snapshotId: snapshot.snapshotId,
      resumeKind,
      packageStatus: failures === 0 ? "completed" : "partial",
    });
    return {
      items,
      snapshotId: snapshot.snapshotId,
      resumeKind,
      packageStatus: failures === 0 ? "completed" : "partial",
    };
  };

  const exportFinalCaseworkOutputPackage = async (): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (!activeWorkspace || !activeCase) {
      throw new Error("No active local case is available for export.");
    }
    const { createFinalCaseworkOutputPackage: createPackage } =
      await import("../../domain/case-output/package-builder");
    const outputInput = createFinalOutputInput({
      caseRecord: activeCase,
      manifestSummary,
      previewRules,
      populationItems,
      caseOutputArtifacts,
      unresolvedItems: evidenceUnresolvedItems,
      createdAt: dependencies.clock.now(),
      createdBy: sharedReviewer.trim() === "" ? null : sharedReviewer.trim(),
    });
    const outputPackage = await createPackage(outputInput);
    await activeWorkspace.createDirectory(`cases/${activeCase.caseId}/exports`);
    const saved = await activeWorkspace.writeAtomic(
      `cases/${activeCase.caseId}/exports/final-casework-output-package.json`,
      new TextEncoder().encode(`${canonicalize(outputPackage)}\n`),
    );
    if (!saved.ok) throw new Error("Final output package export failed.");
    setCaseOutputExportMessage(
      `Final output package exported with status ${outputPackage.deterministicPayload.packageStatus} and hash ${outputPackage.contentSha256}.`,
    );
  };

  const finalOutputInput: FinalCaseworkOutputInput | null = activeCase
    ? createFinalOutputInput({
        caseRecord: activeCase,
        manifestSummary,
        previewRules,
        populationItems,
        caseOutputArtifacts,
        unresolvedItems: evidenceUnresolvedItems,
        createdAt: dependencies.clock.now(),
        createdBy: sharedReviewer.trim() === "" ? null : sharedReviewer.trim(),
      })
    : null;

  return {
    workspaceReady,
    workspaceLabel,
    workspaceError,
    fileSystemCapability,
    activeCase,
    reviewerIdentity,
    cases,
    error,
    busy,
    quarantineItems,
    eligibilityItems,
    classificationItems,
    dateCandidateItems,
    relationshipItems,
    populationItems,
    manifestSummary,
    sharedReviewer,
    sharedRationale,
    evidenceReviewView,
    evidenceCatalog,
    provisionCandidates,
    ruleAuthorCandidates,
    candidateNearDuplicates,
    candidateSupersessions,
    evidenceReviewMessage,
    evidenceUnresolvedItems,
    previewRules,
    ruleAuthoringOutcome,
    ruleAuthoringBusy,
    caseOutputExportMessage,
    caseOutputLinkMessage,
    caseOutputArtifacts,
    draftV1Summary,
    draftV1SummaryMessage,
    architectureSelection,
    architectureBuildMessage,
    architecturePolicyItems,
    architecturePolicyApprovals,
    architecturePolicyMessage,
    caseControls,
    caseControlsMessage,
    v1Architecture,
    v1BuildSpec,
    v1CompilationResult,
    v1Workbook,
    v1XlsxBytes,
    v1OutputMessage,
    downloadV1Workbook,
    recordArchitecturePolicyApproval,
    recordCaseControls,
    finalOutputInput,
    evidenceItems,
    evidencePackageSummary,
    evidenceRestoreMessage,
    evidenceViewerArtifact,
    evidenceViewerLoading,
    evidenceViewerError,
    setSharedReviewer,
    setSharedRationale,
    setEvidenceReviewView,
    selectWorkspace,
    createProduction,
    establishReviewerIdentity,
    openCase,
    returnToWorkspaceHome,
    resolveCollision,
    resetEvidenceSessionPreview,
    recordUnresolvedAction,
    recordRuleAuthoring,
    recordQuarantineDecision,
    recordArtifactEligibilityDecision,
    recordClassificationDecision,
    recordRelationshipDecision,
    recordDateSelection,
    recordPopulationDecision,
    linkCaseOutputArtifact,
    exportFinalCaseworkOutputPackage,
    exportCurrentManifest,
    generateDraftV1Summary,
    planSummaryRecord,
    planSummaryMessage,
    planSummaryDecisions,
    formulaApprovalRecords,
    initializePlanSummary,
    approvePlanSummaryAttribute: approvePlanSummaryAttributeAction,
    approveFormula: approveFormulaAction,
    recordArchitectureSelection,
    processPackage,
    openEvidence,
    saveEvidenceCorrection,
    closeEvidence,
    setError,
    setView,
    setManifestSummary,
    view,
  };
}

async function preservedRuleSourceArtifacts(
  caseId: Uuid,
  now: string,
): Promise<
  readonly {
    readonly artifact: CatalogArtifactInput;
    readonly bytes: Uint8Array;
    readonly sha256: Sha256;
  }[]
> {
  return Promise.all(
    ruleSourceArtifacts.map(async (source) => {
      const bytes = new TextEncoder().encode(source.content);
      const hashed = await hashChunkReader(bytesReader(bytes));
      if (!hashed.ok) throw new Error(hashed.error.safeMessage);
      const artifactId = await deterministicUuid("ReferenceRuleArtifact", {
        caseId,
        locator: source.path,
        sha256: hashed.value.sha256,
      });
      const receiptId = await deterministicUuid("ReferenceRuleReceipt", {
        caseId,
        locator: source.path,
        sha256: hashed.value.sha256,
      });
      return {
        artifact: {
          artifactId,
          sha256: hashed.value.sha256,
          sizeBytes: bytes.byteLength,
          locator: source.path,
          mediaType: "text/yaml",
          receiptId,
          receiptIds: [receiptId],
          exactDuplicateOfSha256: null,
          containedBySha256: null,
          sourceRole: "other",
          reviewStatus: "provisional",
          importedAt: now,
        },
        bytes,
        sha256: hashed.value.sha256,
      };
    }),
  );
}

function formulaApprovalCellKey(record: FormulaApprovalRecord): string {
  // Architecture cell keys are `${sourceTab}::${cellAddress}`; the approval
  // record carries those pieces separately in its target.
  return `${record.target.tabName}::${record.target.cellAddress}`;
}

function buildRuleAuthorCandidates(
  catalog: EvidenceCatalog | null,
  candidates: readonly ProvisionCandidate[],
): readonly RuleAuthorCandidate[] {
  if (catalog === null) return [];
  const releasedCaseEvidence = catalog.caseEvidence.filter(
    (artifact) => artifact.reviewStatus === "released",
  );
  const artifactBySha256 = new Map(
    releasedCaseEvidence.map((artifact) => [artifact.sha256, artifact]),
  );
  return candidates.flatMap((candidate) => {
    const artifact = artifactBySha256.get(candidate.artifactSha256);
    if (artifact === undefined) return [];
    // The rule-authoring contract resolves the primary citation against BOTH
    // the proposed candidate (by artifactSha256 + artifactLocator) and the
    // released catalog artifact (by sha256 + locator + sourceRole + released).
    // Production candidates carry segment locators while released catalog
    // artifacts carry the observed file-path locator, so present the pairing
    // with the catalog artifact's locator and preserve the precise segment in
    // citationLocator.
    return [
      {
        candidate: {
          ...candidate,
          artifactLocator: artifact.locator,
        },
        citation: {
          artifactSha256: artifact.sha256,
          artifactLocator: artifact.locator,
          sourceRole: artifact.sourceRole,
          provisionIdentifier: candidate.provisionIdentifier,
          citationLocator: candidate.artifactLocator,
        },
      },
    ];
  });
}

function latestUnresolvedItems(
  records: readonly UnresolvedItem[],
): readonly UnresolvedItem[] {
  const latest = new Map<Uuid, UnresolvedItem>();
  for (const record of records) {
    const prior = latest.get(record.itemId);
    if (prior === undefined || record.revisionOrdinal > prior.revisionOrdinal) {
      latest.set(record.itemId, record);
    }
  }
  return Object.freeze(
    [...latest.values()].sort((left, right) =>
      left.itemId.localeCompare(right.itemId),
    ),
  );
}

function evidenceClassificationScopes(
  text: string,
  mediaType: string,
): readonly {
  readonly text: string;
  readonly textLocator?: string;
}[] {
  return [
    { text },
    ...(mediaType === "application/pdf"
      ? splitPdfMachineTextPages(text).map((page) => ({
          text: page.text,
          textLocator: `pdf:page=${String(page.pageNumber)}`,
        }))
      : []),
  ];
}

function inferEvidenceMediaType(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}
