import type { CaseRecord } from "../../domain/case/case";

export interface CaseListProps {
  readonly cases: readonly CaseRecord[];
  readonly onOpenCase: (caseId: string) => void;
}

export function CaseList({ cases, onOpenCase }: CaseListProps) {
  return (
    <div className="case-list" aria-label="Existing cases">
      <p className="section-label">Existing cases</p>
      <table className="case-table">
        <thead>
          <tr>
            <th scope="col">PBGC case number</th>
            <th scope="col">Purpose</th>
            <th scope="col">Status</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.caseId}>
              <td data-testid="case-row-authoritative-id">
                {c.authoritativeCaseId ?? c.caseId}
              </td>
              <td data-testid="case-row-purpose">{purposeLabel(c.purpose)}</td>
              <td data-testid="case-row-status">{c.status}</td>
              <td>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  data-testid="open-case-button"
                  aria-label={`Open ${c.authoritativeCaseId ?? c.caseId}`}
                  onClick={() => {
                    onOpenCase(c.caseId);
                  }}
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function purposeLabel(purpose: CaseRecord["purpose"]): string {
  switch (purpose) {
    case "production":
      return "Production";
    case "test":
      return "Test";
    case "training":
      return "Training";
    case "duplicate-investigation":
      return "Duplicate investigation";
  }
}
