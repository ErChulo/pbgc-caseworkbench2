import { useState } from "react";
import type { AuthenticatedCaseControls } from "../../domain/architecture/scenario-selector";

export interface CaseControlsDraft {
  readonly singleCalculation: boolean;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly reviewer: string;
  readonly rationale: string;
}

export function CaseControlsReview({
  enabled,
  disabled = false,
  message,
  approved,
  onApprove,
}: {
  readonly enabled: boolean;
  readonly disabled?: boolean;
  readonly message: string | null;
  readonly approved: AuthenticatedCaseControls | null;
  readonly onApprove: (draft: CaseControlsDraft) => Promise<void>;
}) {
  const [singleCalculation, setSingleCalculation] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);

  if (!enabled) return null;

  const handleApprove = async (): Promise<void> => {
    setBusy(true);
    try {
      await onApprove({
        singleCalculation,
        startDate,
        endDate,
        reviewer,
        rationale,
      });
    } finally {
      setBusy(false);
    }
  };

  const isComplete =
    reviewer.trim() !== "" &&
    rationale.trim() !== "" &&
    startDate !== "" &&
    !busy &&
    !disabled;

  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="case-controls-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Case control governance</p>
          <h2 id="case-controls-title">Case controls</h2>
        </div>
        {approved ? (
          <span className="status-chip status-chip-success">
            Approval recorded
          </span>
        ) : (
          <span className="status-chip status-chip-warning">
            Approval required
          </span>
        )}
      </div>
      {message ? (
        <p role="alert" className="form-message form-message-error">
          {message}
        </p>
      ) : null}
      <p>
        Record the effective date range, purpose, reviewer, and rationale. The
        application does not authenticate the reviewer or verify their
        authority. Independent verification is required before release.
      </p>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={singleCalculation}
            onChange={(event) => {
              setSingleCalculation(event.currentTarget.checked);
            }}
            disabled={approved !== null}
          />
          Single calculation purpose
        </label>
      </div>
      <label>
        Effective date (start)
        <input
          type="date"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.currentTarget.value);
          }}
          disabled={approved !== null}
          required
        />
      </label>
      <label>
        Effective date (end, optional)
        <input
          type="date"
          value={endDate ?? ""}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setEndDate(value === "" ? null : value);
          }}
          disabled={approved !== null}
        />
      </label>
      <label>
        Case-controls approving actor
        <input
          value={reviewer}
          onChange={(event) => {
            setReviewer(event.currentTarget.value);
          }}
          disabled={approved !== null}
        />
      </label>
      <label>
        Case-controls approval rationale
        <textarea
          value={rationale}
          onChange={(event) => {
            setRationale(event.currentTarget.value);
          }}
          disabled={approved !== null}
          rows={3}
        />
      </label>
      {approved ? (
        <div className="notice">
          <p>
            <strong>Recorded reviewer:</strong> {approved.approvedBy}. Effective
            dates: {approved.effectiveDateRange.startDate}
            {approved.effectiveDateRange.endDate
              ? ` – ${approved.effectiveDateRange.endDate}`
              : " (open-ended)"}
          </p>
          <p>Rationale: {approved.approvalRationale}</p>
        </div>
      ) : (
        <button
          type="button"
          className="button button-primary"
          disabled={!isComplete}
          onClick={() => void handleApprove()}
        >
          Approve case controls
        </button>
      )}
    </section>
  );
}
