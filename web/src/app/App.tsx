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
      entries.push({
        observedRelativePath: item.path,
        normalizedDisplayPath: item.path.normalize("NFC"),
        sha256: hashed.value.sha256,
        sizeBytes: file.size,
        declaredMediaType: file.type || null,
        lastModifiedObserved: null,
      });
      items = replaceItem(items, item.id, {
        status: duplicate ? "duplicate" : "preserved",
        sha256: hashed.value.sha256,
        message: duplicate
          ? "Exact bytes linked to a separate receipt; no approval conferred."
          : "Immutable copy verified; downstream use remains blocked.",
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
    return {
      items,
      snapshotId: snapshot.snapshotId,
      resumeKind,
      packageStatus: failures === 0 ? "completed" : "partial",
    };
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
