import type { ArchitecturePolicyProjection } from "../../domain/architecture/architecture-policy-approval";
import type { RuleSet } from "../../domain/architecture/rule-loader";

export interface ArchitecturePolicyReviewItem {
  readonly policy: RuleSet;
  readonly sourcePath: string;
  readonly eligibility: boolean;
  readonly approval: ArchitecturePolicyProjection;
}

export function ArchitecturePolicyReview({
  items,
  reviewer,
  rationale,
  onReviewerChange,
  onRationaleChange,
  onApprove,
}: {
  readonly items: readonly ArchitecturePolicyReviewItem[];
  readonly reviewer: string;
  readonly rationale: string;
  readonly onReviewerChange: (value: string) => void;
  readonly onRationaleChange: (value: string) => void;
  readonly onApprove: (item: ArchitecturePolicyReviewItem) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="architecture-policy-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Policy governance</p>
          <h2 id="architecture-policy-title">Architecture policy approval</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human approval required
        </span>
      </div>
      <p>
        Eligibility authorizes exact YAML bytes; this separate decision approves
        the parsed policy semantics for architecture use.
      </p>
      <label>
        Policy approving actor
        <input
          value={reviewer}
          onChange={(event) => {
            onReviewerChange(event.currentTarget.value);
          }}
        />
      </label>
      <label>
        Policy approval rationale
        <textarea
          value={rationale}
          onChange={(event) => {
            onRationaleChange(event.currentTarget.value);
          }}
          rows={3}
        />
      </label>
      <ul className="review-list">
        {items.map((item) => (
          <li key={item.policy.kind}>
            <h3>{item.policy.kind}</h3>
            <dl>
              <div>
                <dt>Version</dt>
                <dd>{item.policy.version}</dd>
              </div>
              <div>
                <dt>Source path</dt>
                <dd>{item.sourcePath}</dd>
              </div>
              <div>
                <dt>Source-file SHA-256</dt>
                <dd>
                  <code>{item.policy.sourceFileSha256}</code>
                </dd>
              </div>
              <div>
                <dt>Policy-content SHA-256</dt>
                <dd>
                  <code>{item.policy.policyContentSha256}</code>
                </dd>
              </div>
              <div>
                <dt>Artifact eligibility</dt>
                <dd>{item.eligibility ? "Eligible" : "Blocked"}</dd>
              </div>
              <div>
                <dt>Policy approval</dt>
                <dd>{item.approval.status}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="button button-secondary"
              disabled={
                !item.eligibility ||
                item.approval.status === "approved" ||
                reviewer.trim() === "" ||
                rationale.trim() === ""
              }
              onClick={() => void onApprove(item)}
            >
              Approve parsed policy
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
