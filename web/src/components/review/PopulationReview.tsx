import { useState } from "react";

import type {
  PopulationCandidateProfile,
  PopulationDecisionProjection,
} from "../../domain/population/population-profile";

export interface PopulationReviewItem {
  readonly displayName: string;
  readonly candidate: PopulationCandidateProfile;
  readonly projection: PopulationDecisionProjection;
  readonly structuralFinding: string;
}

export function PopulationReview({
  items,
  onDecision,
}: {
  readonly items: readonly PopulationReviewItem[];
  readonly onDecision: (
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  if (items.length === 0) return null;
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="population-review-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Structural profiling</p>
          <h2 id="population-review-title">Population candidate review</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human approval required
        </span>
      </div>
      <p>
        Detection is proposal-only. Values remain exactly as observed; missing,
        blank, malformed, formula text, leading-zero text, and literal zero are
        not corrected or imputed.
      </p>
      <div className="form-grid">
        <label>
          Population reviewer
          <input
            value={reviewer}
            onChange={(event) => {
              setReviewer(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
        <label>
          Population rationale
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
          <li key={item.candidate.candidateKey}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Source state</dt>
                <dd>{item.candidate.candidateStatus}</dd>
              </div>
              <div>
                <dt>Computed human status</dt>
                <dd>{item.projection.status}</dd>
              </div>
              <div>
                <dt>Observed fields</dt>
                <dd>{item.candidate.observedFields.join(", ") || "none"}</dd>
              </div>
              <div>
                <dt>Observed records</dt>
                <dd>{item.candidate.recordCounts.join(", ") || "0"}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{item.candidate.confidence.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Decision history</dt>
                <dd>{item.projection.provenance.length} event(s)</dd>
              </div>
            </dl>
            <p>
              <strong>Structural finding:</strong> {item.structuralFinding}
            </p>
            {item.candidate.candidateStatus === "unresolved" && (
              <p className="notice">
                Unresolved: review the original local artifact and its
                structural findings before governed downstream use.
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
                      reviewer.trim().length === 0 ||
                      rationale.trim().length === 0 ||
                      (action === "revoke" &&
                        item.projection.status !== "approved") ||
                      (action === "supersede" &&
                        item.projection.status === "provisional")
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
    </section>
  );
}
