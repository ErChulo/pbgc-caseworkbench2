import { useRef, useState } from "react";

import {
  ArtifactInventory,
  type ArtifactInventoryItem,
} from "../inventory/ArtifactInventory";

export interface PackageIntakeResult {
  readonly items: readonly ArtifactInventoryItem[];
  readonly snapshotId: string | null;
  readonly resumeKind: "first" | "unchanged-resume" | "linked-divergence";
  readonly packageStatus: "completed" | "partial" | "interrupted";
}

export function PackageIntake({
  enabled,
  onProcess,
}: {
  readonly enabled: boolean;
  readonly onProcess: (
    files: readonly File[],
    signal: AbortSignal,
    update: (items: readonly ArtifactInventoryItem[]) => void,
  ) => Promise<PackageIntakeResult>;
}) {
  const [items, setItems] = useState<readonly ArtifactInventoryItem[]>([]);
  const [summary, setSummary] = useState<PackageIntakeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const processFiles = async (files: FileList | null) => {
    if (files === null || files.length === 0) return;
    setBusy(true);
    setError(null);
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 250);
      });
      const result = await onProcess(
        [...files],
        nextController.signal,
        setItems,
      );
      setSummary(result);
    } catch {
      setError(
        "Package intake failed safely. Previously preserved artifacts remain unchanged.",
      );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };

  return (
    <section
      className="case-panel package-panel"
      aria-labelledby="package-intake-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Immutable evidence</p>
          <h2 id="package-intake-title">Inventory a case package</h2>
        </div>
        <span className="status-chip">Provisional only</span>
      </div>
      <p>
        Files remain local. Originals are hashed and preserved without executing
        document content. All records stay blocked from downstream use until
        screening in the next governed phase.
      </p>
      <label className="file-picker">
        <span>Select individual files</span>
        <input
          type="file"
          multiple
          disabled={!enabled || busy}
          onChange={(event) => void processFiles(event.currentTarget.files)}
        />
      </label>
      <label className="file-picker">
        <span>Select a folder</span>
        <input
          type="file"
          multiple
          disabled={!enabled || busy}
          onChange={(event) => void processFiles(event.currentTarget.files)}
          {...({
            webkitdirectory: "",
          } as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      </label>
      {!enabled && (
        <p className="form-message form-message-warning">
          Create or resume a controlled case before selecting evidence.
        </p>
      )}
      {busy && (
        <div className="progress-row" role="status">
          <span>Hashing and preserving local evidence…</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => controller.current?.abort()}
          >
            Interrupt safely
          </button>
        </div>
      )}
      {error && (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <div className="package-summary" role="status">
          <strong>
            {summary.packageStatus === "completed"
              ? "Inventory checkpoint complete"
              : `Inventory ${summary.packageStatus}`}
          </strong>
          <span>
            {summary.resumeKind === "unchanged-resume"
              ? "Unchanged snapshot resumed without duplicate records."
              : summary.resumeKind === "linked-divergence"
                ? "Changed package created a linked snapshot."
                : "Initial immutable snapshot created."}
          </span>
          {summary.snapshotId && <code>Snapshot {summary.snapshotId}</code>}
        </div>
      )}
      <ArtifactInventory items={items} />
    </section>
  );
}
