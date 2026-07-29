import type {
  PopulationCandidateProfile,
  PopulationDecisionProjection,
} from "../../domain/population/population-profile";
import { Tooltip } from "../Tooltip";
import {
  ACTION_LABELS,
  ACTION_TOOLTIPS,
  RATIONALE_PLACEHOLDER,
  REVIEW_ACTIONS,
  plainStatus,
} from "./shared";

export interface PopulationReviewItem {
  readonly displayName: string;
  readonly candidate: PopulationCandidateProfile;
  readonly projection: PopulationDecisionProjection;
  readonly structuralFinding: string;
}

export function PopulationReview({
  items,
  reviewer: sharedReviewer,
  rationale: sharedRationale,
  onReviewerChange,
  onRationaleChange,
  onDecision,
}: {
  readonly items: readonly PopulationReviewItem[];
  readonly reviewer: string;
  readonly rationale: string;
  readonly onReviewerChange: (value: string) => void;
  readonly onRationaleChange: (value: string) => void;
  readonly onDecision: (
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
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
        Detection is suggestion-only. Values remain exactly as observed;
        missing, blank, malformed, formula text, leading-zero text, and literal
        zero are not corrected or imputed.
      </p>
      <div className="shared-reviewer">
        <label htmlFor="population-reviewer">
          Reviewer name
          <input
            id="population-reviewer"
            value={sharedReviewer}
            onChange={(event) => {
              onReviewerChange(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
        <label htmlFor="population-rationale">
          Rationale
          <textarea
            id="population-rationale"
            value={sharedRationale}
            rows={3}
            placeholder={RATIONALE_PLACEHOLDER}
            onChange={(event) => {
              onRationaleChange(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
      </div>
      <ul className="review-list">
        {items.map((item) => (
          <li key={item.candidate.candidateKey}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Source status</dt>
                <dd>{plainStatus(item.candidate.candidateStatus)}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>{plainStatus(item.projection.status)}</dd>
              </div>
              <div>
                <dt>Observed fields</dt>
                <dd>{item.candidate.observedFields.join(", ") || "None"}</dd>
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
                Needs investigation: review the original local artifact and its
                structural findings before governed downstream use.
              </p>
            )}
            <div className="decision-actions">
              {REVIEW_ACTIONS.map((action) => (
                <Tooltip key={action} content={ACTION_TOOLTIPS[action]}>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={
                      sharedReviewer.trim().length === 0 ||
                      sharedRationale.trim().length === 0 ||
                      (action === "revoke" &&
                        item.projection.status !== "approved") ||
                      (action === "supersede" &&
                        item.projection.status === "provisional")
                    }
                    onClick={() =>
                      void onDecision(
                        item,
                        action,
                        sharedReviewer.trim(),
                        sharedRationale.trim(),
                      )
                    }
                  >
                    {ACTION_LABELS[action]}
                  </button>
                </Tooltip>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
