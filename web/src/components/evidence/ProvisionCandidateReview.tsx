import type {
  NearDuplicateRelationship,
  ProvisionCandidate,
  SupersessionProposal,
} from "../../domain/plan-rules/models";

export function ProvisionCandidateReview({
  candidates,
  nearDuplicates,
  supersessions,
}: {
  readonly candidates: readonly ProvisionCandidate[];
  readonly nearDuplicates: readonly NearDuplicateRelationship[];
  readonly supersessions: readonly SupersessionProposal[];
}) {
  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="candidate-review-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Proposal-only extraction</p>
          <h2 id="candidate-review-title">Provision candidate review</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human review required
        </span>
      </div>
      <p>
        Verbatim source text remains separate from normalized restatements.
        Candidate status and documentary relationships are visible text, not
        final plan rules.
      </p>
      <ul className="review-list candidate-list">
        {candidates.map((candidate) => {
          const duplicate = nearDuplicates.find(
            (item) =>
              item.predecessorCandidateId === candidate.candidateId ||
              item.successorCandidateId === candidate.candidateId,
          );
          const supersession = supersessions.find(
            (item) =>
              item.predecessorCandidateId === candidate.candidateId ||
              item.successorCandidateId === candidate.candidateId,
          );
          return (
            <li key={candidate.candidateId}>
              <div className="panel-heading">
                <h3>Provision {candidate.provisionIdentifier}</h3>
                <span className="inventory-status">
                  Status: {plainStatus(candidate.status)}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Source artifact</dt>
                  <dd>
                    <code title={candidate.artifactSha256}>
                      {truncateHash(candidate.artifactSha256)}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>Locator</dt>
                  <dd>{candidate.artifactLocator}</dd>
                </div>
                <div>
                  <dt>Effective date</dt>
                  <dd>{candidate.extractedEffectiveDate ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{Math.round(candidate.confidence * 100)}%</dd>
                </div>
              </dl>
              <div className="candidate-text-grid">
                <div>
                  <h4>Verbatim source text</h4>
                  <blockquote>{candidate.verbatimText}</blockquote>
                </div>
                <div>
                  <h4>Normalized restatement</h4>
                  <p>{candidate.normalizedRestatement}</p>
                </div>
              </div>
              {duplicate ? (
                <p className="relationship-note">
                  Near-duplicate relationship:{" "}
                  {Math.round(duplicate.similarity * 100)}% similar; both
                  candidates are preserved.
                </p>
              ) : null}
              {supersession ? (
                <p className="relationship-note">
                  Proposed {supersession.relationshipType} link effective{" "}
                  {supersession.effectiveDate}; confidence{" "}
                  {Math.round(supersession.confidence * 100)}%.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function truncateHash(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function plainStatus(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
