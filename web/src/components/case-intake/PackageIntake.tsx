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
        "File intake failed safely. Previously preserved files remain unchanged.",
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
          <p className="section-label">Preserve evidence</p>
          <h2 id="package-intake-title">Add files to the case</h2>
        </div>
        <span className="status-chip">Pending review</span>
      </div>
      <p>
        Files stay on your device. Each file is fingerprinted and preserved
        without opening or executing its content. All records are blocked from
        downstream use until screening and human review are complete.
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
          Create or resume a case before adding files.
        </p>
      )}
      {busy && (
        <div className="progress-row" role="status">
          <span>Fingerprinting and preserving files…</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => controller.current?.abort()}
          >
            Stop safely
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
              ? "File inventory complete"
              : `File inventory ${summary.packageStatus}`}
          </strong>
          <span>
            {summary.resumeKind === "unchanged-resume"
              ? "Same files as before — no duplicate records created."
              : summary.resumeKind === "linked-divergence"
                ? "Files changed — new snapshot linked to the previous one."
                : "First snapshot of this file set created."}
          </span>
          {summary.snapshotId && <code>Snapshot {summary.snapshotId}</code>}
        </div>
      )}
      <ArtifactInventory items={items} />
    </section>
  );
}
