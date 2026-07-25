import { useState } from "react";

import type {
  ClassificationProposal,
  DateCandidate,
  GovernedStatus,
} from "../../domain/classification/models";

export interface ClassificationReviewItem {
  readonly displayName: string;
  readonly proposal: ClassificationProposal;
  readonly effectiveStatus: GovernedStatus | "provisional";
  readonly reviewer: string | null;
  readonly rationale: string | null;
  readonly provenanceCount: number;
}

export interface DateCandidateReviewItem {
  readonly displayName: string;
  readonly candidate: DateCandidate;
  readonly selected: boolean;
  readonly reviewer: string | null;
}

export function ClassificationReview({
  items,
  dateCandidates,
  onDecision,
  onDateSelect,
}: {
  readonly items: readonly ClassificationReviewItem[];
  readonly dateCandidates: readonly DateCandidateReviewItem[];
  readonly onDecision: (
    item: ClassificationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly onDateSelect: (
    item: DateCandidateReviewItem,
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  if (items.length === 0 && dateCandidates.length === 0) return null;
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="classification-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Proposal triage</p>
          <h2 id="classification-title">Classification review</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human approval required
        </span>
      </div>
      <p>
        Automated categories and source roles remain proposals. Approval does
        not itself confer document authority.
      </p>
      <div className="form-grid">
        <label>
          Classification reviewer
          <input
            value={reviewer}
            onChange={(event) => {
              setReviewer(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
        <label>
          Classification rationale
          <textarea
            value={rationale}
            onChange={(event) => {
              setRationale(event.currentTarget.value);
            }}
          />
        </label>
      </div>
      <ul className="review-list">
        {items.map((item) => (
          <li key={item.proposal.proposalKey}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Dimension</dt>
                <dd>{item.proposal.dimension}</dd>
              </div>
              <div>
                <dt>Proposed value</dt>
                <dd>{item.proposal.proposedValue}</dd>
              </div>
              <div>
                <dt>Proposal state</dt>
                <dd>{item.proposal.status}</dd>
              </div>
              <div>
                <dt>Computed human status</dt>
                <dd>{item.effectiveStatus}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{item.proposal.confidence.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Decision history</dt>
                <dd>{item.provenanceCount} event(s)</dd>
              </div>
            </dl>
            {item.rationale && (
              <p>
                <strong>Recorded rationale:</strong> {item.rationale}
              </p>
            )}
            <div className="decision-actions">
              {(["approve", "reject", "revoke", "supersede"] as const).map(
                (action) => (
                  <button
                    key={action}
                    type="button"
                    className="button button-secondary"
                    disabled={
                      !reviewer.trim() ||
                      !rationale.trim() ||
                      (action === "revoke" &&
                        item.effectiveStatus !== "approved") ||
                      (action === "supersede" &&
                        item.effectiveStatus === "provisional")
                    }
                    onClick={() =>
                      void onDecision(
                        item,
                        action,
                        reviewer.trim(),
                        rationale.trim(),
                      )
                    }
                  >
                    {action}
                  </button>
                ),
              )}
            </div>
          </li>
        ))}
      </ul>
      {dateCandidates.length > 0 && (
        <>
          <h3>Effective-date candidates</h3>
          <p>
            Raw date values and competing candidates remain preserved. A human
            selection is recorded separately and does not rewrite source text.
          </p>
          <ul className="review-list">
            {dateCandidates.map((item) => (
              <li key={item.candidate.candidateKey}>
                <h3>{item.displayName}</h3>
                <dl>
                  <div>
                    <dt>Date kind</dt>
                    <dd>{item.candidate.dateKind}</dd>
                  </div>
                  <div>
                    <dt>Raw value</dt>
                    <dd>{item.candidate.rawValue}</dd>
                  </div>
                  <div>
                    <dt>Normalized candidate</dt>
                    <dd>{item.candidate.normalizedValue ?? "unresolved"}</dd>
                  </div>
                  <div>
                    <dt>Source locator</dt>
                    <dd>{item.candidate.sourceLocator}</dd>
                  </div>
                  <div>
                    <dt>Source state</dt>
                    <dd>{item.candidate.status}</dd>
                  </div>
                  <div>
                    <dt>Human selection</dt>
                    <dd>{item.selected ? "selected" : "not selected"}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={
                    !reviewer.trim() ||
                    !rationale.trim() ||
                    !item.candidate.valid
                  }
                  onClick={() =>
                    void onDateSelect(item, reviewer.trim(), rationale.trim())
                  }
                >
                  select date candidate
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
