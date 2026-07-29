import { useState, type SyntheticEvent } from "react";

import type {
  ApplicabilityDimension,
  PlanRuleRecord,
  ProvisionCandidate,
  RuleCitation,
  UnresolvedItem,
} from "../../domain/plan-rules/models";

export interface RuleAuthoringDraft {
  readonly candidateIds: readonly string[];
  readonly primaryCitation: RuleCitation;
  readonly governingRestatement: string;
  readonly effectiveDate: string;
  readonly applicabilityDimension: ApplicabilityDimension;
  readonly applicabilityValue: string;
  readonly predecessorRuleId: string | null;
  readonly reviewer: string;
  readonly rationale: string;
}

export interface RuleAuthorCandidate {
  readonly candidate: ProvisionCandidate;
  readonly citation: RuleCitation;
}

const dimensions: readonly ApplicabilityDimension[] = [
  "participant-group",
  "benefit-purpose",
  "service-definition",
  "actuarial-equivalence-purpose",
  "freeze-or-restriction",
  "amendment-period",
];

export function PlanRuleAuthor({
  candidates,
  unresolvedItems,
  existingRules,
  busy = false,
  onAuthor,
}: {
  readonly candidates: readonly RuleAuthorCandidate[];
  readonly unresolvedItems: readonly UnresolvedItem[];
  readonly existingRules: readonly PlanRuleRecord[];
  readonly busy?: boolean;
  readonly onAuthor: (draft: RuleAuthoringDraft) => Promise<void>;
}) {
  const first = candidates[0];
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(
    first ? [first.candidate.candidateId] : [],
  );
  const [primaryId, setPrimaryId] = useState(
    first?.candidate.candidateId ?? "",
  );
  const [restatement, setRestatement] = useState(
    first?.candidate.normalizedRestatement ?? "",
  );
  const [effectiveDate, setEffectiveDate] = useState(
    first?.candidate.extractedEffectiveDate ?? "",
  );
  const [dimension, setDimension] =
    useState<ApplicabilityDimension>("participant-group");
  const [conditionValue, setConditionValue] = useState("");
  const [predecessorRuleId, setPredecessorRuleId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const blockingItems = unresolvedItems.filter(
    (item) => item.status === "open",
  );
  const selectedCandidates = candidates.filter((item) =>
    selectedIds.includes(item.candidate.candidateId),
  );
  const primary = selectedCandidates.find(
    (item) => item.candidate.candidateId === primaryId,
  );
  const ready =
    blockingItems.length === 0 &&
    selectedIds.length > 0 &&
    primary !== undefined &&
    restatement.trim() !== "" &&
    effectiveDate !== "" &&
    conditionValue.trim() !== "" &&
    reviewer.trim() !== "" &&
    rationale.trim() !== "";

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    void onAuthor({
      candidateIds: selectedIds,
      primaryCitation: primary.citation,
      governingRestatement: restatement.trim(),
      effectiveDate,
      applicabilityDimension: dimension,
      applicabilityValue: conditionValue.trim(),
      predecessorRuleId: predecessorRuleId || null,
      reviewer: reviewer.trim(),
      rationale: rationale.trim(),
    });
  }

  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="rule-author-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Governed rule validation</p>
          <h2 id="rule-author-title">Plan rule author</h2>
        </div>
        <span className="status-chip">Session preview only</span>
      </div>
      {blockingItems.length > 0 ? (
        <div
          id="rule-author-status"
          className="form-message form-message-error"
          role="alert"
        >
          <strong>BLOCKED_BY_UNRESOLVED_ITEM</strong>
          <p>
            Rule validation is blocked by {blockingItems.length} open item(s).
            Resolve or explicitly branch them in the unresolved queue before
            validation.
          </p>
        </div>
      ) : (
        <p id="rule-author-status" className="notice" role="status">
          No open unresolved item blocks this synthetic preview rule scope.
        </p>
      )}
      <form
        className="rule-author-form"
        aria-describedby="rule-author-status rule-author-guidance"
        onSubmit={submit}
      >
        <fieldset>
          <legend>Select provision candidates</legend>
          {candidates.map(({ candidate }) => (
            <label key={candidate.candidateId} className="choice-row">
              <input
                type="checkbox"
                checked={selectedIds.includes(candidate.candidateId)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelectedIds((current) =>
                    checked
                      ? [...current, candidate.candidateId]
                      : current.filter((id) => id !== candidate.candidateId),
                  );
                  if (!checked && primaryId === candidate.candidateId) {
                    setPrimaryId("");
                  } else if (checked && primaryId === "") {
                    setPrimaryId(candidate.candidateId);
                  }
                }}
              />
              Provision {candidate.provisionIdentifier}, effective{" "}
              {candidate.extractedEffectiveDate ?? "unknown"}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label htmlFor="primary-citation">
            Primary citation
            <select
              id="primary-citation"
              value={primaryId}
              required
              onChange={(event) => {
                setPrimaryId(event.currentTarget.value);
              }}
            >
              {selectedCandidates.length === 0 ? (
                <option value="">Select at least one candidate first</option>
              ) : primary === undefined ? (
                <option value="">Select primary citation</option>
              ) : null}
              {selectedCandidates.map(({ candidate }) => (
                <option
                  key={candidate.candidateId}
                  value={candidate.candidateId}
                >
                  {candidate.provisionIdentifier} - {candidate.artifactLocator}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="rule-effective-date">
            Effective date
            <input
              id="rule-effective-date"
              type="date"
              value={effectiveDate}
              required
              onChange={(event) => {
                setEffectiveDate(event.currentTarget.value);
              }}
            />
          </label>
        </div>
        <label htmlFor="governing-restatement">
          Governing restatement
          <textarea
            id="governing-restatement"
            value={restatement}
            required
            onChange={(event) => {
              setRestatement(event.currentTarget.value);
            }}
          />
        </label>
        <fieldset>
          <legend>Applicability condition</legend>
          <div className="form-grid">
            <label htmlFor="applicability-dimension">
              Dimension
              <select
                id="applicability-dimension"
                value={dimension}
                onChange={(event) => {
                  setDimension(
                    event.currentTarget.value as ApplicabilityDimension,
                  );
                }}
              >
                {dimensions.map((value) => (
                  <option key={value} value={value}>
                    {plainStatus(value)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="applicability-value">
              Condition value
              <input
                id="applicability-value"
                value={conditionValue}
                required
                onChange={(event) => {
                  setConditionValue(event.currentTarget.value);
                }}
              />
            </label>
          </div>
        </fieldset>
        <label htmlFor="predecessor-rule">
          Supersession predecessor
          <select
            id="predecessor-rule"
            value={predecessorRuleId}
            onChange={(event) => {
              setPredecessorRuleId(event.currentTarget.value);
            }}
          >
            <option value="">Initial rule, no predecessor</option>
            {existingRules.map((rule) => (
              <option key={rule.ruleId} value={rule.ruleId}>
                Rule {rule.ruleId.slice(0, 8)}, effective {rule.effectiveDate}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label htmlFor="rule-reviewer">
            Authorized reviewer
            <input
              id="rule-reviewer"
              value={reviewer}
              required
              autoComplete="off"
              onChange={(event) => {
                setReviewer(event.currentTarget.value);
              }}
            />
          </label>
          <label htmlFor="rule-rationale">
            Approval rationale
            <textarea
              id="rule-rationale"
              rows={3}
              value={rationale}
              required
              onChange={(event) => {
                setRationale(event.currentTarget.value);
              }}
            />
          </label>
        </div>
        <p id="rule-author-guidance" className="form-guidance">
          Select at least one candidate and complete every required field before
          validation.
        </p>
        <button
          className="button button-primary"
          type="submit"
          disabled={!ready || busy}
          aria-describedby="rule-author-guidance"
        >
          {busy ? "Validating rule preview..." : "Validate rule preview"}
        </button>
      </form>
    </section>
  );
}

function plainStatus(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
