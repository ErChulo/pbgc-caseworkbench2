import { useState } from "react";

import type {
  EvidenceRelationship,
  GovernedStatus,
} from "../../domain/classification/models";

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
  onDecision,
}: {
  readonly items: readonly RelationshipReviewItem[];
  readonly onDecision: (
    item: RelationshipReviewItem,
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
      aria-labelledby="relationship-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Relationship evidence</p>
          <h2 id="relationship-title">Relationship review</h2>
        </div>
        <span className="status-chip status-chip-warning">Proposal only</span>
      </div>
      <p>
        Similarity and documentary signals are directional proposals. Only a
        typed human decision chain computes governed status.
      </p>
      <div className="form-grid">
        <label>
          Relationship reviewer
          <input
            value={reviewer}
            onChange={(event) => {
              setReviewer(event.currentTarget.value);
            }}
          />
        </label>
        <label>
          Relationship rationale
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
          <li key={item.relationship.relationshipKey}>
            <h3>{item.relationship.relationshipType}</h3>
            <p>
              {item.fromLabel} → {item.toLabel}
            </p>
            <dl>
              <div>
                <dt>Proposal state</dt>
                <dd>{item.relationship.status}</dd>
              </div>
              <div>
                <dt>Computed human status</dt>
                <dd>{item.effectiveStatus}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {item.relationship.confidence?.toFixed(2) ?? "not scored"}
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
    </section>
  );
}
