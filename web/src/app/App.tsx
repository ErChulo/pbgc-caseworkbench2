import { useRef, useState } from "react";

import {
  BrowserDirectoryWorkspace,
  openCaseWorkspace,
  saveCaseWorkspace,
} from "../adapters/filesystem/case-workspace";
import {
  CaseCreation,
  type CaseCreationView,
  type ProductionCaseRequest,
} from "../components/case-intake/CaseCreation";
import { FeasibilityStatus } from "../components/FeasibilityStatus";
import { HelpPanel } from "../components/HelpPanel";
import {
  PackageIntake,
  type PackageIntakeResult,
} from "../components/case-intake/PackageIntake";
import type { ArtifactInventoryItem } from "../components/inventory/ArtifactInventory";
import {
  caseIndexEntry,
  type CaseRecord,
  type WorkspaceCatalog,
} from "../domain/case/case";
import {
  CaseRegistry,
  type CaseCollision,
  type CollisionResolutionInput,
} from "../domain/case/case-registry";
import {
  validateCaseIdentifier,
  type CaseIdentifierRule,
} from "../domain/case/case-identifier";
import {
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type Uuid,
} from "../domain/shared/types";
import { canonicalize } from "../domain/manifests/canonical-json";
import { preserveContent } from "../adapters/filesystem/content-store";
import {
  createPackageSnapshot,
  compareSnapshots,
} from "../domain/attempts/snapshot";
import type { PackageSnapshot, SnapshotEntry } from "../domain/attempts/models";
import { hashChunkReader } from "../workers/hash.worker";
import type { BrowserWorkspaceError } from "../adapters/filesystem/case-workspace";
import type { ChunkReaderPort } from "../domain/ports";
import type { ArtifactRecord, ReceiptRecord } from "../domain/artifacts/models";
import { reconcileInventory } from "../domain/manifests/reconciliation";
import { screenBinaryRisk } from "../adapters/screening/binary-risk";
import { screenSensitiveText } from "../adapters/screening/sensitive-data";
import {
  QuarantineQueue,
  type QuarantineQueueItem,
} from "../components/quarantine/QuarantineQueue";
import { quarantineDecisionContentHash } from "../domain/quarantine/release-service";
import type { QuarantineDecision } from "../domain/quarantine/models";
import { parseSha256 } from "../domain/shared/types";
import { inspectPassive } from "../adapters/parsers/passive-inspection";
import {
  ClassificationReview,
  type ClassificationReviewItem,
  type DateCandidateReviewItem,
} from "../components/review/ClassificationReview";
import {
  RelationshipReview,
  type RelationshipReviewItem,
} from "../components/review/RelationshipReview";
import { proposeClassifications } from "../domain/classification/classifier";
import {
  classificationDecisionContentHash,
  replayClassificationApprovals,
} from "../domain/classification/classification-review";
import {
  createRelationshipProposal,
  relationshipDecisionContentHash,
  replayRelationshipDecisions,
} from "../domain/classification/relationship-service";
import { proposeNearDuplicate } from "../domain/classification/near-duplicates";
import type {
  ClassificationApproval,
  DateSelectionDecision,
  RelationshipDecision,
} from "../domain/classification/models";
import {
  extractDateCandidates,
  validateDateSelection,
} from "../domain/classification/date-candidates";
import {
  PopulationReview,
  type PopulationReviewItem,
} from "../components/review/PopulationReview";
import { adaptTabularExtraction } from "../domain/population/tabular-adapter";
import { adaptWorkbookExtraction } from "../domain/population/workbook-adapter";
import {
  detectTabularPopulation,
  detectWorkbookPopulation,
} from "../domain/population/population-detector";
import {
  populationDecisionContentHash,
  replayPopulationCandidateDecisions,
  type PopulationCandidateDecision,
} from "../domain/population/population-profile";
import {
  ManifestExport,
  type ManifestExportSummary,
} from "../components/inventory/ManifestExport";

const identifierRule: CaseIdentifierRule = {
  ruleId: "pbgc-case-id-basic",
  ruleVersion: "1.0.0",
  minimumLength: 3,
  maximumLength: 64,
  syntax: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
  unicodeNormalization: "NFC",
  letterCase: "preserve",
};

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

interface InventoryCheckpointReference {
  readonly attemptId: Uuid;
  readonly snapshot: PackageSnapshot;
}

export function App() {
  const workspace = useRef<BrowserDirectoryWorkspace | null>(null);
  const catalog = useRef<WorkspaceCatalog | null>(null);
  const registry = useRef<CaseRegistry | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState(
    "Select an approved local directory. No case data leaves this device.",
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [view, setView] = useState<CaseCreationView>({ kind: "ready" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null);
  const priorSnapshot = useRef<PackageSnapshot | null>(null);
  const inventoryCheckpoints = useRef(
    new Map<string, InventoryCheckpointReference>(),
  );
  const lastCheckpoint = useRef<InventoryCheckpointReference | null>(null);
  const quarantineHistory = useRef(new Map<string, QuarantineDecision[]>());
  const [quarantineItems, setQuarantineItems] = useState<
    readonly QuarantineQueueItem[]
  >([]);
  const classificationHistory = useRef(
    new Map<string, ClassificationApproval[]>(),
  );
  const relationshipHistory = useRef(new Map<string, RelationshipDecision[]>());
  const [classificationItems, setClassificationItems] = useState<
    readonly ClassificationReviewItem[]
  >([]);
  const [dateCandidateItems, setDateCandidateItems] = useState<
    readonly DateCandidateReviewItem[]
  >([]);
  const [relationshipItems, setRelationshipItems] = useState<
    readonly RelationshipReviewItem[]
  >([]);
  const populationHistory = useRef(
    new Map<string, PopulationCandidateDecision[]>(),
  );
  const [populationItems, setPopulationItems] = useState<
    readonly PopulationReviewItem[]
  >([]);
  const [manifestSummary, setManifestSummary] =
    useState<ManifestExportSummary | null>(null);
  const [sharedReviewer, setSharedReviewer] = useState("");
  const [sharedRationale, setSharedRationale] = useState("");

  const activateCase = (caseRecord: CaseRecord) => {
    if (activeCase?.caseId !== caseRecord.caseId) {
      priorSnapshot.current = null;
      inventoryCheckpoints.current.clear();
      lastCheckpoint.current = null;
    }
    setActiveCase(caseRecord);
  };

  const selectWorkspace = async (): Promise<void> => {
    setBusy(true);
    setWorkspaceError(null);
    try {
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
    } catch {
      setWorkspaceError(
        "Workspace selection was cancelled or could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createProduction = async ({
    authoritativeCaseId,
    actor,
  }: ProductionCaseRequest): Promise<void> => {
    setError(null);
    const activeRegistry = registry.current;
    if (!workspaceReady || activeRegistry === null) {
      setError("Select an approved local workspace before creating a case.");
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
      createdBy: actor,
    });
    if (result.kind === "rejected") {
      setError(result.error.safeMessage);
    } else if (result.kind === "collision") {
      setView({ kind: "collision", collision: result });
    } else if (!(await persistCreatedCase(result.caseRecord))) {
      registry.current = new CaseRegistry(dependencies, before);
    } else {
      setView({
        kind: "created",
        caseRecord: result.caseRecord,
        message: "Production case created",
        collisionDecisionRecorded: false,
      });
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
      setBusy(false);
      return;
    }
    if (resolution.value.kind === "resumed-existing") {
      setView({
        kind: "resumed",
        caseRecord: collision.existingCase,
        message: "Resume decision recorded",
      });
      activateCase(collision.existingCase);
    } else if (await persistCreatedCase(resolution.value.caseRecord)) {
      setView({
        kind: "created",
        caseRecord: resolution.value.caseRecord,
        message: `${purposeLabel(resolution.value.caseRecord)} case created`,
        collisionDecisionRecorded: true,
      });
      activateCase(resolution.value.caseRecord);
    } else {
      registry.current = new CaseRegistry(dependencies, before);
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

  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <p className="eyebrow">PBGC Case Workbench 2</p>
          <h1>Evidence intake foundation</h1>
        </div>
        <span
          className="phase-badge"
          aria-label="Current implementation maturity: controlled case intake"
        >
          Case intake
        </span>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <section className="intro" aria-labelledby="intro-title">
          <p className="section-label">Local-first workspace</p>
          <h2 id="intro-title">Begin with a governed case identity</h2>
          <p>
            Create or resume a case without transmitting evidence, inventing
            case facts, or silently duplicating a production identifier.
          </p>
          <FeasibilityStatus />
        </section>
        <HelpPanel />
        <CaseCreation
          workspaceReady={workspaceReady}
          workspaceLabel={workspaceLabel}
          workspaceError={workspaceError}
          busy={busy}
          view={view}
          error={error}
          onSelectWorkspace={selectWorkspace}
          onCreateProduction={createProduction}
          onResolveCollision={resolveCollision}
          onCreateAnother={() => {
            setError(null);
            setView({ kind: "ready" });
          }}
        />
        <PackageIntake
          enabled={workspaceReady && activeCase !== null}
          onProcess={processPackage}
        />
        <QuarantineQueue
          items={quarantineItems}
          reviewer={sharedReviewer}
          rationale={sharedRationale}
          onReviewerChange={setSharedReviewer}
          onRationaleChange={setSharedRationale}
          onDecision={recordQuarantineDecision}
        />
        <ClassificationReview
          items={classificationItems}
          dateCandidates={dateCandidateItems}
          reviewer={sharedReviewer}
          rationale={sharedRationale}
          onReviewerChange={setSharedReviewer}
          onRationaleChange={setSharedRationale}
          onDecision={recordClassificationDecision}
          onDateSelect={recordDateSelection}
        />
        <RelationshipReview
          items={relationshipItems}
          reviewer={sharedReviewer}
          rationale={sharedRationale}
          onReviewerChange={setSharedReviewer}
          onRationaleChange={setSharedRationale}
          onDecision={recordRelationshipDecision}
        />
        <PopulationReview
          items={populationItems}
          reviewer={sharedReviewer}
          rationale={sharedRationale}
          onReviewerChange={setSharedReviewer}
          onRationaleChange={setSharedRationale}
          onDecision={recordPopulationDecision}
        />
        <ManifestExport
          summary={manifestSummary}
          onExport={exportCurrentManifest}
        />
      </main>
    </div>
  );

  async function processPackage(
    files: readonly File[],
    signal: AbortSignal,
    update: (items: readonly ArtifactInventoryItem[]) => void,
  ): Promise<PackageIntakeResult> {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) {
      throw new Error("Controlled workspace is unavailable.");
    }
    let items: ArtifactInventoryItem[] = files
      .map((file, index) => ({
        id: `${String(index)}:${file.name}`,
        path: file.webkitRelativePath || file.name,
        sizeBytes: file.size,
        sha256: null,
        status: "queued" as const,
        message: "Awaiting deterministic hash.",
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const fileByItemId = new Map(
      files.map((file, index) => [`${String(index)}:${file.name}`, file]),
    );
    update(items);
    const entries: SnapshotEntry[] = [];
    const seenHashes = new Set<string>();
    const comparableArtifacts: {
      readonly sha256: Sha256;
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
        return {
          items,
          snapshotId: null,
          resumeKind: "first",
          packageStatus: "interrupted",
        };
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
          return {
            items,
            snapshotId: null,
            resumeKind: "first",
            packageStatus: "interrupted",
          };
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
      const isPassiveText =
        file.type.startsWith("text/") ||
        /\.(?:csv|json|tsv|txt)$/iu.test(file.name);
      const sensitiveRisk = isPassiveText
        ? await screenSensitiveText(
            new TextDecoder("utf-8", { fatal: false }).decode(bytes),
            hashed.value.sha256,
            {
              authorizedRealPii: false,
              expectedFields: [],
              maximumSensitiveMatches: 8,
            },
          )
        : null;
      const initialBlockingFindings = [
        ...binaryRisk.findings,
        ...(sensitiveRisk?.findings ?? []),
      ].filter((finding) => finding.blocksDownstream);
      const passive =
        initialBlockingFindings.length === 0
          ? inspectPassive(file.name, bytes)
          : null;
      const passiveBlocked =
        passive !== null &&
        (passive.status !== "success" || passive.riskIndicators.length > 0);
      const blockingFindings = [
        ...initialBlockingFindings,
        ...(passiveBlocked
          ? [
              {
                category: passive.riskIndicators.join(", ") || passive.status,
                blocksDownstream: true,
              },
            ]
          : []),
      ];
      if (blockingFindings.length === 0 && passive?.status === "success") {
        const population =
          passive.parserId === "workbook-passive"
            ? await detectWorkbookPopulation(
                hashed.value.sha256,
                adaptWorkbookExtraction(passive),
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
          setPopulationItems((current) => [
            ...current.filter(
              (candidate) =>
                candidate.candidate.artifactSha256 !== hashed.value.sha256,
            ),
            {
              displayName: item.path,
              candidate: population.candidate,
              projection: {
                status: "provisional",
                effectiveDecisionId: null,
                provenance: [],
              },
              structuralFinding:
                population.candidate.candidateStatus === "proposed"
                  ? "Likely population structure detected; governed use remains blocked pending human review."
                  : "Structure is ambiguous or incomplete; route to unresolved review.",
            },
          ]);
        }
        const proposals = await proposeClassifications({
          artifactSha256: hashed.value.sha256,
          filename: item.path,
          mediaType: file.type || null,
          text: passive.text,
        });
        setClassificationItems((current) => [
          ...current.filter(
            (candidate) =>
              candidate.proposal.artifactSha256 !== hashed.value.sha256,
          ),
          ...proposals.map((proposal) => ({
            displayName: item.path,
            proposal,
            effectiveStatus: "provisional" as const,
            reviewer: null,
            rationale: null,
            provenanceCount: 0,
          })),
        ]);
        const dateCandidates = await extractDateCandidates(
          hashed.value.sha256,
          passive.text,
        );
        setDateCandidateItems((current) => [
          ...current.filter(
            (candidate) =>
              candidate.candidate.artifactSha256 !== hashed.value.sha256,
          ),
          ...dateCandidates.map((candidate) => ({
            displayName: item.path,
            candidate,
            selected: false,
            reviewer: null,
          })),
        ]);
        for (const prior of comparableArtifacts) {
          const relationship =
            prior.sha256 === hashed.value.sha256
              ? await createRelationshipProposal({
                  fromSha256: prior.sha256,
                  toSha256: hashed.value.sha256,
                  relationshipType: "exact-duplicate",
                  status: "proposed",
                  confidence: 1,
                  supportingEvidence: [],
                  ruleSetVersion: "feature-009-classification-v1",
                })
              : await proposeNearDuplicate(
                  prior.sha256,
                  hashed.value.sha256,
                  prior.text,
                  passive.text,
                  0.35,
                );
          if (relationship) {
            setRelationshipItems((current) => [
              ...current.filter(
                (candidate) =>
                  candidate.relationship.relationshipKey !==
                  relationship.relationshipKey,
              ),
              {
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
        setQuarantineItems((current) => {
          const next: QuarantineQueueItem = {
            artifactSha256: hashed.value.sha256,
            displayName: item.path,
            accountingStatus: "pending-human-disposition",
            provisionalState: "provisional-safety-block",
            findingSummary: blockingFindings
              .map((finding) => finding.category)
              .join(", "),
            evidenceRequired:
              "An authorized reviewer must check the exact files and findings.",
            nextAction:
              "Release for use, permanently quarantine, or reject with a reason.",
            effectiveHumanStatus: "none",
            reviewer: null,
            rationale: null,
            inheritanceAvailable:
              quarantineHistory.current.get(hashed.value.sha256)?.at(-1)
                ?.resultingStatus === "released",
          };
          return [
            ...current.filter(
              (candidate) => candidate.artifactSha256 !== next.artifactSha256,
            ),
            next,
          ];
        });
      }
      entries.push({
        observedRelativePath: item.path,
        normalizedDisplayPath: item.path.normalize("NFC"),
        sha256: hashed.value.sha256,
        sizeBytes: file.size,
        declaredMediaType: file.type || null,
        lastModifiedObserved: null,
      });
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
    priorSnapshot.current = snapshot;
    await activeWorkspace.createDirectory(
      `cases/${activeCase.caseId}/snapshots`,
    );
    const snapshotBytes = new TextEncoder().encode(
      `${canonicalize(snapshot)}\n`,
    );
    const snapshotPath = `cases/${activeCase.caseId}/snapshots/${snapshot.snapshotId}.json`;
    const snapshotStored = await activeWorkspace.stat(snapshotPath);
    if (!snapshotStored.ok) {
      const saved = await activeWorkspace.createImmutable(
        snapshotPath,
        bytesReader(snapshotBytes),
      );
      if (!saved.ok) throw new Error("Snapshot could not be preserved.");
    }
    if (existingCheckpoint === undefined) {
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
          submittedBy: null,
          submittedAt: null,
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
          signatureMediaType: null,
          processingStatus: "preserved",
          downstreamEligibility: "blocked",
          statusHistory: Object.freeze([]),
        });
      }
      const seenHashes = new Set<string>();
      const reconciliation = reconcileInventory(
        artifacts.map((artifact) => artifact.artifactId),
        artifacts.map((artifact) => ({
          recordId: artifact.artifactId,
          category: "source-artifact",
        })),
        artifacts.map((artifact) => {
          const duplicate = seenHashes.has(artifact.sha256);
          seenHashes.add(artifact.sha256);
          return {
            recordId: artifact.artifactId,
            category: duplicate
              ? ("duplicate" as const)
              : ("pending-human-disposition" as const),
          };
        }),
      );
      const checkpoint = Object.freeze({
        attemptId,
        priorAttemptId:
          resumeKind === "linked-divergence"
            ? (lastCheckpoint.current?.attemptId ?? null)
            : null,
        divergenceReason:
          resumeKind === "linked-divergence" ? difference : null,
        snapshot,
        receipts: Object.freeze(receipts),
        artifacts: Object.freeze(artifacts),
        reconciliation,
        downstreamBlocked: true,
      });
      inventoryCheckpoints.current.set(snapshot.snapshotId, checkpoint);
      lastCheckpoint.current = checkpoint;
      await activeWorkspace.createDirectory(
        `cases/${activeCase.caseId}/manifests`,
      );
      const manifestBytes = new TextEncoder().encode(
        `${canonicalize(checkpoint)}\n`,
      );
      const saved = await activeWorkspace.createImmutable(
        `cases/${activeCase.caseId}/manifests/${snapshot.snapshotId}.json`,
        bytesReader(manifestBytes),
      );
      if (!saved.ok)
        throw new Error("Inventory checkpoint could not be preserved.");
    } else {
      lastCheckpoint.current = existingCheckpoint;
    }
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
        "Review quarantine, classification, relationship, and population queues.",
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
    return {
      items,
      snapshotId: snapshot.snapshotId,
      resumeKind,
      packageStatus: failures === 0 ? "completed" : "partial",
    };
  }

  async function recordQuarantineDecision(
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ): Promise<void> {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
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
      findingIds: Object.freeze([`ui-finding:${item.artifactSha256}`]),
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
    const path = `cases/${activeCase?.caseId ?? "unavailable"}/reviews/events.jsonl`;
    const saved = await activeWorkspace.append(
      path,
      new TextEncoder().encode(`${canonicalize(decision)}\n`),
    );
    if (!saved.ok) throw new Error("Decision could not be preserved.");
    quarantineHistory.current.set(item.artifactSha256, [...history, decision]);
    setQuarantineItems((current) =>
      current.map((candidate) =>
        candidate.artifactSha256 === item.artifactSha256
          ? {
              ...candidate,
              effectiveHumanStatus: resultingStatus,
              reviewer,
              rationale,
              nextAction:
                resultingStatus === "released"
                  ? "Evidence is released for governed processing; revocation remains available."
                  : "Disposition recorded. A later permitted typed decision requires predecessor linkage.",
            }
          : candidate,
      ),
    );
  }

  async function recordClassificationDecision(
    item: ClassificationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> {
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
    await appendReviewEvent(decision);
    classificationHistory.current.set(item.proposal.proposalKey, [
      ...history,
      decision,
    ]);
    setClassificationItems((current) =>
      current.map((candidate) =>
        candidate.proposal.proposalKey === item.proposal.proposalKey
          ? {
              ...candidate,
              effectiveStatus: replay.value.status,
              reviewer,
              rationale,
              provenanceCount: replay.value.provenance.length,
            }
          : candidate,
      ),
    );
  }

  async function recordRelationshipDecision(
    item: RelationshipReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> {
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
    const base = {
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
        actorType: "human",
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
    await appendReviewEvent(decision);
    relationshipHistory.current.set(key, [...history, decision]);
    setRelationshipItems((current) =>
      current.map((candidate) =>
        candidate.relationship.relationshipKey === key
          ? {
              ...candidate,
              effectiveStatus: replay.value.status,
              rationale,
              provenanceCount: replay.value.provenance.length,
            }
          : candidate,
      ),
    );
  }

  async function recordDateSelection(
    item: DateCandidateReviewItem,
    reviewer: string,
    rationale: string,
  ): Promise<void> {
    const decision: DateSelectionDecision = {
      decisionId: dependencies.uuid.generate(),
      artifactSha256: item.candidate.artifactSha256,
      selectedCandidateKey: item.candidate.candidateKey,
      actor: {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted date-candidate reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
      ruleSetVersion: "feature-009-classification-v1",
    };
    const validation = validateDateSelection(
      dateCandidateItems.map((candidate) => candidate.candidate),
      decision,
    );
    if (!validation.ok) throw new Error(validation.error.safeMessage);
    await appendReviewEvent(decision);
    setDateCandidateItems((current) =>
      current.map((candidate) =>
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
      ),
    );
  }

  async function recordPopulationDecision(
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> {
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
    const replay = await replayPopulationCandidateDecisions(item.candidate, [
      ...history,
      decision,
    ]);
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    await appendReviewEvent(decision);
    populationHistory.current.set(key, [...history, decision]);
    setPopulationItems((current) =>
      current.map((candidate) =>
        candidate.candidate.candidateKey === key
          ? { ...candidate, projection: replay.value }
          : candidate,
      ),
    );
  }

  async function appendReviewEvent(event: object): Promise<void> {
    const activeWorkspace = workspace.current;
    if (!activeWorkspace) throw new Error("Workspace unavailable.");
    const saved = await activeWorkspace.append(
      `cases/${activeCase?.caseId ?? "unavailable"}/reviews/events.jsonl`,
      new TextEncoder().encode(`${canonicalize(event)}\n`),
    );
    if (!saved.ok) throw new Error("Review event could not be preserved.");
  }

  async function exportCurrentManifest(): Promise<void> {
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
  }
}

function replaceItem(
  items: readonly ArtifactInventoryItem[],
  id: string,
  change: Partial<ArtifactInventoryItem>,
): ArtifactInventoryItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...change } : item));
}

function fileReader(file: File): ChunkReaderPort<BrowserWorkspaceError> {
  return {
    sizeBytes: file.size,
    read: async ({ offsetBytes, lengthBytes }) => {
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
            endOfSource: offsetBytes + bytes.length >= file.size,
          },
        };
      } catch {
        return { ok: false, error: { code: "READ_FAILED" } };
      }
    },
  };
}

function bytesReader(
  bytes: Uint8Array,
): ChunkReaderPort<BrowserWorkspaceError> {
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

function purposeLabel(caseRecord: CaseRecord): string {
  switch (caseRecord.purpose) {
    case "test":
      return "Test";
    case "training":
      return "Training";
    case "duplicate-investigation":
      return "Duplicate investigation";
    case "production":
      return "Production";
  }
}
