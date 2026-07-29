import {
  LineageExplorer,
  type LineageDisplayNode,
} from "../lineage/LineageExplorer";

export interface ManifestExportSummary {
  readonly artifactCount: number;
  readonly validationCount: number;
  readonly unresolvedCount: number;
  readonly accountingStatus: string;
  readonly provisionalBlockReason: string | null;
  readonly requiredReview: string | null;
  readonly nextAction: string;
  readonly deterministicManifestHash: string;
  readonly lineage: readonly LineageDisplayNode[];
}

export function ManifestExport({
  summary,
  onExport,
}: {
  readonly summary: ManifestExportSummary | null;
  readonly onExport: () => Promise<void>;
}) {
  if (summary === null) return null;
  return (
    <section className="case-panel" aria-labelledby="manifest-export-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">Auditable output</p>
          <h2 id="manifest-export-title">Evidence manifest</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Governed review state
        </span>
      </div>
      <dl className="status-grid">
        <div className="status-item">
          <dt>Artifacts</dt>
          <dd>{summary.artifactCount}</dd>
        </div>
        <div className="status-item">
          <dt>Validation results</dt>
          <dd>{summary.validationCount}</dd>
        </div>
        <div className="status-item">
          <dt>Unresolved items</dt>
          <dd>{summary.unresolvedCount}</dd>
        </div>
      </dl>
      <p>
        <strong>Processing status:</strong> {summary.accountingStatus}. This
        label does not confer approval or release.
      </p>
      {summary.provisionalBlockReason !== null && (
        <p className="notice">
          <strong>Safety review needed:</strong>{" "}
          {summary.provisionalBlockReason} <strong>Review required:</strong>{" "}
          {summary.requiredReview}. <strong>Next step:</strong>{" "}
          {summary.nextAction}
        </p>
      )}
      <p>
        <strong>Manifest fingerprint:</strong>{" "}
        <code>{summary.deterministicManifestHash}</code>
      </p>
      <button
        type="button"
        className="button button-primary"
        onClick={() => void onExport()}
      >
        Export local manifest
      </button>
      <LineageExplorer nodes={summary.lineage} />
    </section>
  );
}
