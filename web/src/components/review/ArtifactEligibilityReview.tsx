import type { ArtifactEligibilityProjection } from "../../domain/quarantine/models";
import type { Sha256 } from "../../domain/shared/types";
import { RATIONALE_PLACEHOLDER, plainStatus } from "./shared";

export interface ArtifactEligibilityReviewItem {
  readonly artifactSha256: Sha256;
  readonly displayName: string;
  readonly requiresQuarantineRelease: boolean;
  readonly quarantineReleased: boolean;
  readonly projection: ArtifactEligibilityProjection;
}

const actions = ["approve", "block", "revoke", "supersede"] as const;

const labels: Readonly<Record<(typeof actions)[number], string>> = {
  approve: "Approve governed use",
  block: "Block governed use",
  revoke: "Revoke eligibility",
  supersede: "Supersede decision",
};

export function ArtifactEligibilityReview({
  items,
  reviewer,
  rationale,
  onReviewerChange,
  onRationaleChange,
  onDecision,
}: {
  readonly items: readonly ArtifactEligibilityReviewItem[];
  readonly reviewer: string;
  readonly rationale: string;
  readonly onReviewerChange: (value: string) => void;
  readonly onRationaleChange: (value: string) => void;
  readonly onDecision: (
    item: ArtifactEligibilityReviewItem,
    action: (typeof actions)[number],
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="artifact-eligibility-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Governed downstream gate</p>
          <h2 id="artifact-eligibility-title">Artifact eligibility review</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human decision required
        </span>
      </div>
      <p>
        Screening and quarantine do not approve downstream use. Eligibility is a
        separate exact-hash decision; risky evidence also requires an effective
        release covering its findings.
      </p>
      <div className="shared-reviewer">
        <label htmlFor="eligibility-reviewer">
          Reviewer name
          <input
            id="eligibility-reviewer"
            value={reviewer}
            autoComplete="off"
            onChange={(event) => {
              onReviewerChange(event.currentTarget.value);
            }}
          />
        </label>
        <label htmlFor="eligibility-rationale">
          Rationale
          <textarea
            id="eligibility-rationale"
            value={rationale}
            rows={3}
            autoComplete="off"
            placeholder={RATIONALE_PLACEHOLDER}
            onChange={(event) => {
              onRationaleChange(event.currentTarget.value);
            }}
          />
        </label>
      </div>
      <ul className="review-list">
        {items.map((item) => (
          <li key={item.artifactSha256}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Artifact SHA-256</dt>
                <dd>
                  <code title={item.artifactSha256}>
                    {item.artifactSha256.slice(0, 12)}...
                  </code>
                </dd>
              </div>
              <div>
                <dt>Quarantine prerequisite</dt>
                <dd>
                  {item.requiresQuarantineRelease
                    ? item.quarantineReleased
                      ? "Safety hold released"
                      : "Release required"
                    : "Not required"}
                </dd>
              </div>
              <div>
                <dt>Current eligibility</dt>
                <dd>
                  {item.projection.eligible
                    ? "Eligible"
                    : plainStatus(item.projection.effectiveStatus)}
                </dd>
              </div>
              <div>
                <dt>Decision history</dt>
                <dd>{item.projection.provenance.length} event(s)</dd>
              </div>
            </dl>
            {item.requiresQuarantineRelease && !item.quarantineReleased ? (
              <p className="notice">
                Approve governed use remains disabled until an authorized
                reviewer releases the exact artifact and reviewed findings.
              </p>
            ) : null}
            <div className="decision-actions">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="button button-secondary"
                  disabled={
                    reviewer.trim() === "" ||
                    rationale.trim() === "" ||
                    !actionAllowed(item, action)
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
                  {item.displayName.startsWith("rules/")
                    ? action === "approve"
                      ? `Approve rule source ${item.displayName}`
                      : action === "block"
                        ? `Block rule source ${item.displayName}`
                        : action === "revoke"
                          ? `Revoke rule-source eligibility ${item.displayName}`
                          : `Supersede rule-source decision ${item.displayName}`
                    : labels[action]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function actionAllowed(
  item: ArtifactEligibilityReviewItem,
  action: (typeof actions)[number],
): boolean {
  if (action === "approve") {
    return (
      item.projection.effectiveStatus === "provisional" &&
      (!item.requiresQuarantineRelease || item.quarantineReleased)
    );
  }
  if (action === "block") {
    return item.projection.effectiveStatus === "provisional";
  }
  if (action === "revoke") return item.projection.eligible;
  return (
    item.projection.effectiveStatus !== "provisional" &&
    item.projection.effectiveStatus !== "superseded"
  );
}
