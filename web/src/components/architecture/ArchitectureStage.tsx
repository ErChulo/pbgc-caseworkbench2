import { useState } from "react";
import type { V1Architecture } from "../../domain/architecture/models";
import { findArchitectureFormulaTargetConflicts } from "../../domain/architecture/target-conflicts";

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
  readonly diagnosticReady: boolean;
  readonly onDownloadDiagnostic: () => void;
  readonly architecture?: V1Architecture | null;
}

export function ArchitectureStage({
  enabled,
  message,
  onBuild,
  v1Ready,
  onDownload,
  diagnosticReady,
  onDownloadDiagnostic,
  architecture = null,
}: ArchitectureStageProps) {
  const [busy, setBusy] = useState(false);
  const conflicts =
    architecture === null
      ? null
      : findArchitectureFormulaTargetConflicts(architecture);
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
      {conflicts !== null && (
        <div aria-label="Proposed formula target conflicts">
          <h3>Proposed formula target conflicts</h3>
          <p>
            {conflicts.length} shared formula targets found. This check does not
            approve the architecture or check all workbook requirements.
          </p>
          {conflicts.length > 0 && (
            <ul>
              {conflicts.slice(0, 20).map((conflict) => (
                <li key={`${conflict.tabName}!${conflict.cellAddress}`}>
                  {conflict.tabName}!{conflict.cellAddress}:{" "}
                  {conflict.formulas.length} formula placements. Scenarios:{" "}
                  {conflict.formulas
                    .slice(0, 10)
                    .map((formula) => formula.scenarioId)
                    .join(", ")}
                  {conflict.formulas.length > 10 ? ", …" : ""}.
                </li>
              ))}
            </ul>
          )}
          {conflicts.length > 20 && <p>Showing the first 20 targets.</p>}
        </div>
      )}
      {diagnosticReady ? (
        <div>
          <p>
            The local diagnostic can include case details. It is not execution,
            reconciliation, or approval evidence.
          </p>
          <button type="button" onClick={onDownloadDiagnostic}>
            Download provisional workbook diagnostic (.json)
          </button>
        </div>
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
