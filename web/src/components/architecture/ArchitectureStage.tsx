import { useState } from "react";

// Legacy persisted selections are not an authenticated approval of a generated architecture.
export interface ArchitectureSelection {
  readonly scenarioIds: readonly string[];
  readonly tabNames: readonly string[];
  readonly reviewer: string;
  readonly rationale: string;
}

export interface ArchitectureStageProps {
  readonly enabled: boolean;
  readonly message: string | null;
  readonly onBuild: () => Promise<void>;
  readonly v1Ready: boolean;
  readonly onDownload: () => void;
}

export function ArchitectureStage({
  enabled,
  message,
  onBuild,
  v1Ready,
  onDownload,
}: ArchitectureStageProps) {
  const [busy, setBusy] = useState(false);
  const build = async () => {
    setBusy(true);
    try {
      await onBuild();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="case-panel" aria-labelledby="architecture-stage-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">Governed V1 engine design</p>
          <h2 id="architecture-stage-title">Architecture selection</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human review required
        </span>
      </div>
      <p>
        Build a proposed architecture from the current approved rules,
        population reviews, policies, and case controls. The rules determine
        scenarios and tabs. Building does not record an architecture approval or
        approve a workbook. If generated, the workbook is checked against its
        model. This does not execute formulas or establish correctness.
      </p>
      <button
        type="button"
        className="button button-primary"
        disabled={!enabled || busy}
        onClick={() => void build()}
      >
        Build proposed architecture
      </button>
      {!enabled ? (
        <p className="form-message form-message-warning">
          Create or resume a case before building an architecture.
        </p>
      ) : null}
      {message !== null ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {v1Ready ? (
        <button
          type="button"
          className="button button-primary"
          onClick={onDownload}
        >
          Download V1 Workbook (.xlsx)
        </button>
      ) : null}
    </section>
  );
}
