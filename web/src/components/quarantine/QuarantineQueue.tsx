import { useState } from "react";

import { GLOSSARY, type GlossaryKey } from "../../domain/shared/glossary";
import { Tooltip } from "../Tooltip";
import { RATIONALE_PLACEHOLDER } from "../review/shared";

export interface QuarantineQueueItem {
  readonly artifactSha256: string;
  readonly displayName: string;
  readonly accountingStatus: "pending-human-disposition";
  readonly provisionalState:
    "provisional-quarantine" | "provisional-safety-block" | "rescreen-required";
  readonly findingIds: readonly string[];
  readonly findingSummary: string;
  readonly evidenceRequired: string;
  readonly nextAction: string;
  readonly effectiveHumanStatus:
    "none" | "released" | "final-quarantine" | "rejected" | "revoked";
  readonly reviewer: string | null;
  readonly rationale: string | null;
  readonly inheritanceAvailable: boolean;
  readonly eligibilityDecisionCount: number;
}

const ACTION_LABELS: Record<
  string,
  { plain: string; glossaryKey: GlossaryKey }
> = {
  release: { plain: "Release safety hold", glossaryKey: "released" },
  "inherit-release": {
    plain: "Inherit safety release",
    glossaryKey: "inheritedRelease",
  },
  "final-quarantine": {
    plain: "Permanently quarantine",
    glossaryKey: "finalQuarantineAction",
  },
  reject: { plain: "Reject", glossaryKey: "rejectAction" },
  revoke: { plain: "Withdraw approval", glossaryKey: "revokeAction" },
};

const ALL_ACTIONS = [
  "release",
  "inherit-release",
  "final-quarantine",
  "reject",
  "revoke",
] as const;

const CONFIRM_ACTIONS = new Set(["final-quarantine", "reject"]);

const CONFIRM_MESSAGES: Record<string, string> = {
  "final-quarantine":
    "This will permanently block this artifact from downstream use. Only a new typed decision can reverse this. Continue?",
  reject: "This will reject the artifact's classification. Continue?",
};

function plainProvisionalState(state: string): string {
  switch (state) {
    case "provisional-quarantine":
      return GLOSSARY.provisionalQuarantine.plain;
    case "provisional-safety-block":
      return GLOSSARY.provisionalSafetyBlock.plain;
    case "rescreen-required":
      return GLOSSARY.rescreenRequired.plain;
    default:
      return state;
  }
}

function plainHumanStatus(status: string): string {
  switch (status) {
    case "none":
      return "No decision yet";
    case "released":
      return GLOSSARY.released.plain;
    case "final-quarantine":
      return GLOSSARY.finalQuarantine.plain;
    case "rejected":
      return GLOSSARY.rejected.plain;
    case "revoked":
      return GLOSSARY.revoked.plain;
    default:
      return status;
  }
}

export function QuarantineQueue({
  items,
  reviewer: sharedReviewer,
  rationale: sharedRationale,
  onReviewerChange,
  onRationaleChange,
  onDecision,
}: {
  readonly items: readonly QuarantineQueueItem[];
  readonly reviewer: string;
  readonly rationale: string;
  readonly onReviewerChange: (value: string) => void;
  readonly onRationaleChange: (value: string) => void;
  readonly onDecision: (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
}) {
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    item: QuarantineQueueItem;
    action: "final-quarantine" | "reject";
  } | null>(null);

  if (items.length === 0) return null;

  const executeDecision = async (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
  ): Promise<void> => {
    setBusyHash(item.artifactSha256);
    try {
      await onDecision(
        item,
        action,
        sharedReviewer.trim(),
        sharedRationale.trim(),
      );
    } finally {
      setBusyHash(null);
    }
  };

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
        Processing status, safety blocks, and human decisions are separate.
        Automated findings never release evidence.
      </p>

      <div className="shared-reviewer">
        <label htmlFor="quarantine-reviewer">
          Reviewer name
          <input
            id="quarantine-reviewer"
            value={sharedReviewer}
            onChange={(event) => {
              onReviewerChange(event.currentTarget.value);
            }}
            autoComplete="off"
          />
        </label>
        <label htmlFor="quarantine-rationale">
          Rationale
          <textarea
            id="quarantine-rationale"
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

      <ul className="quarantine-list">
        {items.map((item) => (
          <li key={item.artifactSha256}>
            <h3>{item.displayName}</h3>
            <dl>
              <div>
                <dt>Processing status</dt>
                <dd>{item.accountingStatus}</dd>
              </div>
              <div>
                <dt>Safety status</dt>
                <dd>{plainProvisionalState(item.provisionalState)}</dd>
              </div>
              <div>
                <dt>Human decision</dt>
                <dd>{plainHumanStatus(item.effectiveHumanStatus)}</dd>
              </div>
              <div>
                <dt>Block reason</dt>
                <dd>{item.findingSummary}</dd>
              </div>
              <div>
                <dt>Review required</dt>
                <dd>{item.evidenceRequired}</dd>
              </div>
              <div>
                <dt>Next step</dt>
                <dd>{item.nextAction}</dd>
              </div>
              <div>
                <dt>Eligibility decisions</dt>
                <dd>{item.eligibilityDecisionCount} event(s)</dd>
              </div>
            </dl>
            {item.rationale && (
              <p>
                <strong>Recorded rationale:</strong> {item.rationale}
              </p>
            )}
            {item.eligibilityDecisionCount > 0 ? (
              <p className="notice">
                Artifact eligibility history cites this safety-decision chain. A
                later withdrawal preserves that history but blocks current
                governed use.
              </p>
            ) : null}
            <div className="decision-actions">
              {ALL_ACTIONS.map((action) => {
                const label = ACTION_LABELS[action];
                if (!label) return null;
                const tooltipText = GLOSSARY[label.glossaryKey].tooltip;
                const isIrreversible = CONFIRM_ACTIONS.has(action);
                return (
                  <Tooltip key={action} content={tooltipText}>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={
                        sharedReviewer.trim() === "" ||
                        sharedRationale.trim() === "" ||
                        busyHash !== null ||
                        (action === "revoke" &&
                          item.effectiveHumanStatus !== "released") ||
                        (action === "inherit-release" &&
                          !item.inheritanceAvailable)
                      }
                      onClick={() => {
                        if (isIrreversible) {
                          setConfirmAction({
                            item,
                            action: action as "final-quarantine" | "reject",
                          });
                        } else {
                          void executeDecision(item, action);
                        }
                      }}
                    >
                      {label.plain}
                      <span className="shortcut-hint">
                        {action === "release" ? "⌘↵" : ""}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {confirmAction && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={() => {
            setConfirmAction(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setConfirmAction(null);
          }}
        >
          <div
            className="confirm-dialog"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <h3 id="confirm-title">Confirm decision</h3>
            <p>{CONFIRM_MESSAGES[confirmAction.action]}</p>
            <p>
              <strong>Artifact:</strong> {confirmAction.item.displayName}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  const { item, action } = confirmAction;
                  setConfirmAction(null);
                  void executeDecision(item, action);
                }}
              >
                Yes, {ACTION_LABELS[confirmAction.action]?.plain}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setConfirmAction(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
