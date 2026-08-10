import type {
  ClassificationProposal,
  DateCandidate,
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
  reviewer: sharedReviewer,
  rationale: sharedRationale,
  onReviewerChange,
  onRationaleChange,
  onDecision,
  onDateSelect,
}: {
  readonly items: readonly ClassificationReviewItem[];
  readonly dateCandidates: readonly DateCandidateReviewItem[];
  readonly reviewer: string;
  readonly rationale: string;
  readonly onReviewerChange: (value: string) => void;
  readonly onRationaleChange: (value: string) => void;
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
        Automated categories and source roles are suggestions only. Approval
        does not itself confer document authority.
      </p>
      <div className="shared-reviewer">
        <label htmlFor="classification-reviewer">
          Reviewer name
          <input
            id="classification-reviewer"
            value={sharedReviewer}
            onChange={(event) => {
              onReviewerChange(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
        <label htmlFor="classification-rationale">
          Rationale
          <textarea
            id="classification-rationale"
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
          <li key={item.proposal.proposalKey}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Category</dt>
                <dd>{item.proposal.dimension}</dd>
              </div>
              <div>
                <dt>Suggested value</dt>
                <dd>{item.proposal.proposedValue}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{classificationScope(item.proposal)}</dd>
              </div>
              <div>
                <dt>Proposal status</dt>
                <dd>{plainStatus(item.proposal.status)}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>{plainStatus(item.effectiveStatus)}</dd>
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
      {dateCandidates.length > 0 && (
        <>
          <h3>Effective-date candidates</h3>
          <p>
            Raw date values and competing candidates are preserved as-is. A
            human selection is recorded separately and does not rewrite source
            text.
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
                    <dt>Source status</dt>
                    <dd>{plainStatus(item.candidate.status)}</dd>
                  </div>
                  <div>
                    <dt>Human selection</dt>
                    <dd>{item.selected ? "Selected" : "Not selected"}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={
                    !sharedReviewer.trim() ||
                    !sharedRationale.trim() ||
                    !item.candidate.valid
                  }
                  onClick={() =>
                    void onDateSelect(
                      item,
                      sharedReviewer.trim(),
                      sharedRationale.trim(),
                    )
                  }
                >
                  Select date candidate
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function classificationScope(
  proposal: ClassificationProposal,
): string {
  const locators = [
    ...new Set(
      proposal.supportingEvidence
        .filter((evidence) => evidence.evidenceType === "text")
        .map((evidence) => evidence.sourceLocator),
    ),
  ];
  if (locators.length === 0 || locators.includes("passive-text")) {
    return "Whole artifact";
  }
  return locators
    .map((locator) => {
      const page = /^pdf:page=(\d+)$/u.exec(locator)?.[1];
      return page === undefined ? locator : `PDF page ${page}`;
    })
    .join(", ");
}
