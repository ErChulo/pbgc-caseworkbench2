import type {
  EvidenceRelationship,
  GovernedStatus,
} from "../../domain/classification/models";
import { Tooltip } from "../Tooltip";
import {
  ACTION_LABELS,
  ACTION_TOOLTIPS,
  RATIONALE_PLACEHOLDER,
  REVIEW_ACTIONS,
  plainStatus,
} from "./shared";

export interface RelationshipReviewItem {
  readonly relationship: EvidenceRelationship;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly effectiveStatus: GovernedStatus | "provisional";
  readonly rationale: string | null;
  readonly provenanceCount: number;
}

export function RelationshipReview({
  items,
  reviewer: sharedReviewer,
  rationale: sharedRationale,
  onReviewerChange,
  onRationaleChange,
  onDecision,
}: {
  readonly items: readonly RelationshipReviewItem[];
  readonly reviewer: string;
  readonly rationale: string;
  readonly onReviewerChange: (value: string) => void;
  readonly onRationaleChange: (value: string) => void;
  readonly onDecision: (
    item: RelationshipReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="relationship-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Relationship evidence</p>
          <h2 id="relationship-title">Relationship review</h2>
        </div>
        <span className="status-chip status-chip-warning">Suggestion only</span>
      </div>
      <p>
        Similarity and documentary signals are suggestions. Only a typed human
        decision chain produces a governed status.
      </p>
      <div className="shared-reviewer">
        <label htmlFor="relationship-reviewer">
          Reviewer name
          <input
            id="relationship-reviewer"
            value={sharedReviewer}
            onChange={(event) => {
              onReviewerChange(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
        <label htmlFor="relationship-rationale">
          Rationale
          <textarea
            id="relationship-rationale"
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
          <li key={item.relationship.relationshipKey}>
            <h3>{item.relationship.relationshipType}</h3>
            <p>
              {item.fromLabel} → {item.toLabel}
            </p>
            <dl>
              <div>
                <dt>Proposal status</dt>
                <dd>{plainStatus(item.relationship.status)}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>{plainStatus(item.effectiveStatus)}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {item.relationship.confidence?.toFixed(2) ?? "Not scored"}
                </dd>
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
              {REVIEW_ACTIONS.map((action) => (
                <Tooltip key={action} content={ACTION_TOOLTIPS[action]}>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={
                      !sharedReviewer.trim() ||
                      !sharedRationale.trim() ||
                      (action === "revoke" &&
                        item.effectiveStatus !== "approved") ||
                      (action === "supersede" &&
                        item.effectiveStatus === "provisional")
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
