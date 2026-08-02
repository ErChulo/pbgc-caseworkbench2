import { useState } from "react";

import type { DraftV1SummaryArtifact } from "../../domain/draft-v1-summary/models";

export function DraftV1SummaryPanel({
  enabled,
  draft,
  message,
  onGenerate,
}: {
  readonly enabled: boolean;
  readonly draft: DraftV1SummaryArtifact | null;
  readonly message: string | null;
  readonly onGenerate: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await onGenerate(file);
    } catch {
      setError(
        "Draft V1 summary generation failed safely. No final-package artifact was created.",
      );
    } finally {
      setBusy(false);
    }
  };

  const payload = draft?.deterministicPayload ?? null;
  const bestMatch = payload?.candidateMatches[0] ?? null;

  return (
    <section className="case-panel" aria-labelledby="draft-v1-summary-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">Pre-package scaffold</p>
          <h2 id="draft-v1-summary-title">Draft V1 summary from R5</h2>
        </div>
        <span className="status-chip status-chip-warning">Draft only</span>
      </div>
      <p>
        Upload an R5 summary JSON to match it against approved V1 summary
        reference metadata and preserve a blocked draft scaffold artifact in the
        active local case workspace.
      </p>
      <label className="file-picker">
        <span>Select R5 summary JSON</span>
        <input
          type="file"
          accept="application/json,.json"
          disabled={!enabled || busy}
          onChange={(event) => void processFile(event.currentTarget.files)}
        />
      </label>
      {!enabled ? (
        <p className="form-message form-message-warning">
          Create or resume a case before generating a draft V1 summary.
        </p>
      ) : null}
      {busy ? (
        <p className="notice" role="status">
          Normalizing R5 JSON and scoring approved reference scaffolds.
        </p>
      ) : null}
      {error !== null ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
      {message !== null ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {payload !== null ? (
        <>
          <dl className="status-grid">
            <div className="status-item">
              <dt>Selected scaffold</dt>
              <dd>{payload.selectedScaffold.workbookName}</dd>
            </div>
            <div className="status-item">
              <dt>Score</dt>
              <dd>{bestMatch?.scoreBasisPoints ?? 0} / 10000</dd>
            </div>
            <div className="status-item">
              <dt>Draft hash</dt>
              <dd>
                <code>{draft?.contentSha256}</code>
              </dd>
            </div>
          </dl>
          <div className="case-output-linked-artifacts">
            <h3>Top reference matches</h3>
            <ul>
              {payload.candidateMatches.map((match) => (
                <li key={match.referenceContentSha256}>
                  <strong>{match.workbookName}</strong> {match.scoreBasisPoints}
                  /10000, fields {match.matchedFieldCount}, runs{" "}
                  {match.matchedRunCount}, tabs {match.matchedSourceTabCount}
                </li>
              ))}
            </ul>
          </div>
          <div className="case-output-linked-artifacts">
            <h3>Blockers preserved in draft</h3>
            <ul>
              {payload.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}
