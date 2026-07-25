import { useState } from "react";

export interface QuarantineQueueItem {
  readonly artifactSha256: string;
  readonly displayName: string;
  readonly accountingStatus: "pending-human-disposition";
  readonly provisionalState:
    "provisional-quarantine" | "provisional-safety-block" | "rescreen-required";
  readonly findingSummary: string;
  readonly evidenceRequired: string;
  readonly nextAction: string;
  readonly effectiveHumanStatus:
    "none" | "released" | "final-quarantine" | "rejected" | "revoked";
  readonly reviewer: string | null;
  readonly rationale: string | null;
  readonly inheritanceAvailable: boolean;
}

export function QuarantineQueue({
  items,
  onDecision,
}: {
  readonly items: readonly QuarantineQueueItem[];
  readonly onDecision: (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [busyHash, setBusyHash] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <section
      className="case-panel quarantine-panel"
      aria-labelledby="quarantine-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Human review required</p>
          <h2 id="quarantine-title">Quarantine queue</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Governed decision
        </span>
      </div>
      <p>
        Accounting status, provisional security blocks, and human-final
        dispositions are separate. Automated findings never release evidence.
      </p>
      <label>
        Reviewer identity
        <input
          value={reviewer}
          onChange={(event) => {
            setReviewer(event.currentTarget.value);
          }}
          autoComplete="off"
        />
      </label>
      <label>
        Decision rationale
        <textarea
          value={rationale}
          onChange={(event) => {
            setRationale(event.currentTarget.value);
          }}
        />
      </label>
      <ul className="quarantine-list">
        {items.map((item) => (
          <li key={item.artifactSha256}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Accounting classification</dt>
                <dd>{item.accountingStatus}</dd>
              </div>
              <div>
                <dt>Provisional security state</dt>
                <dd>{item.provisionalState}</dd>
              </div>
              <div>
                <dt>Human-final disposition</dt>
                <dd>{item.effectiveHumanStatus}</dd>
              </div>
              <div>
                <dt>Block cause</dt>
                <dd>{item.findingSummary}</dd>
              </div>
              <div>
                <dt>Evidence or review required</dt>
                <dd>{item.evidenceRequired}</dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>{item.nextAction}</dd>
              </div>
            </dl>
            {item.rationale && (
              <p>
                <strong>Recorded rationale:</strong> {item.rationale}
              </p>
            )}
            <div className="decision-actions">
              {(
                [
                  "release",
                  "inherit-release",
                  "final-quarantine",
                  "reject",
                  "revoke",
                ] as const
              ).map((action) => (
                <button
                  key={action}
                  type="button"
                  className="button button-secondary"
                  disabled={
                    reviewer.trim() === "" ||
                    rationale.trim() === "" ||
                    busyHash !== null ||
                    (action === "revoke" &&
                      item.effectiveHumanStatus !== "released") ||
                    (action === "inherit-release" && !item.inheritanceAvailable)
                  }
                  onClick={() => {
                    void (async () => {
                      setBusyHash(item.artifactSha256);
                      try {
                        await onDecision(
                          item,
                          action,
                          reviewer.trim(),
                          rationale.trim(),
                        );
                      } finally {
                        setBusyHash(null);
                      }
                    })();
                  }}
                >
                  {action.replace("-", " ")}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
