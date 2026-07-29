import { useState } from "react";

import type { UnresolvedItem } from "../../domain/plan-rules/models";

export type UnresolvedAction = "accept" | "supersede" | "reject" | "branch";

export interface UnresolvedActionOutcome {
  readonly ok: boolean;
  readonly message: string;
}

export function UnresolvedItemQueue({
  items,
  onAction,
}: {
  readonly items: readonly UnresolvedItem[];
  readonly onAction: (
    item: UnresolvedItem,
    action: UnresolvedAction,
    interpretationId: string | null,
    reviewer: string,
    rationale: string,
  ) => Promise<UnresolvedActionOutcome>;
}) {
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [selections, setSelections] = useState<
    Readonly<Record<string, string>>
  >({});
  const [outcome, setOutcome] = useState<UnresolvedActionOutcome | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const ready = reviewer.trim() !== "" && rationale.trim() !== "";

  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="unresolved-queue-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Explicit blocking issues</p>
          <h2 id="unresolved-queue-title">Unresolved item queue</h2>
        </div>
        <span className="status-chip status-chip-warning">
          {items.filter((item) => item.status === "open").length} open
        </span>
      </div>
      <p>
        Competing interpretations remain visible until an authorized reviewer
        records a typed decision. Branch preserves the non-selected
        interpretation as an open successor item.
      </p>
      <div className="shared-reviewer">
        <label htmlFor="unresolved-reviewer">
          Reviewer name
          <input
            id="unresolved-reviewer"
            value={reviewer}
            autoComplete="off"
            onChange={(event) => {
              setReviewer(event.currentTarget.value);
            }}
          />
        </label>
        <label htmlFor="unresolved-rationale">
          Resolution rationale
          <textarea
            id="unresolved-rationale"
            rows={3}
            value={rationale}
            onChange={(event) => {
              setRationale(event.currentTarget.value);
            }}
          />
        </label>
      </div>
      {outcome === null ? null : (
        <p
          className="visually-hidden"
          role={outcome.ok ? "status" : "alert"}
          aria-live="polite"
        >
          {outcome.message}
        </p>
      )}
      <ul className="review-list unresolved-list">
        {items.map((item) => {
          const selected =
            selections[item.itemId] ??
            item.competingInterpretations[0]?.interpretationId ??
            "";
          return (
            <li key={item.itemId}>
              <div className="panel-heading">
                <h3 id={`unresolved-title-${item.itemId}`}>
                  {plainStatus(item.kind)}
                </h3>
                <span className="inventory-status">
                  Status: {plainStatus(item.status)}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Affected scope</dt>
                  <dd>{item.affectedScope}</dd>
                </div>
                <div>
                  <dt>Assigned reviewer</dt>
                  <dd>{item.assignee?.displayName ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Consequence</dt>
                  <dd>{item.consequence}</dd>
                </div>
                <div>
                  <dt>Resolution history</dt>
                  <dd>{item.resolutionHistory.length} event(s)</dd>
                </div>
              </dl>
              <fieldset disabled={item.status !== "open"}>
                <legend>Competing interpretations</legend>
                {item.competingInterpretations.map((interpretation) => (
                  <label
                    key={interpretation.interpretationId}
                    className="choice-row"
                  >
                    <input
                      type="radio"
                      name={`interpretation-${item.itemId}`}
                      value={interpretation.interpretationId}
                      checked={selected === interpretation.interpretationId}
                      onChange={(event) => {
                        setSelections((current) => ({
                          ...current,
                          [item.itemId]: event.currentTarget.value,
                        }));
                      }}
                    />
                    {interpretation.statement}
                  </label>
                ))}
              </fieldset>
              <div className="decision-actions">
                {(["accept", "supersede", "reject", "branch"] as const).map(
                  (action) => (
                    <button
                      key={action}
                      type="button"
                      className="button button-secondary"
                      aria-describedby={`unresolved-title-${item.itemId}`}
                      disabled={
                        !ready ||
                        pendingItemId !== null ||
                        item.status !== "open" ||
                        (action !== "reject" && selected === "")
                      }
                      onClick={() => {
                        setPendingItemId(item.itemId);
                        setOutcome(null);
                        void onAction(
                          item,
                          action,
                          action === "reject" ? null : selected,
                          reviewer.trim(),
                          rationale.trim(),
                        )
                          .then((result) => {
                            setOutcome(result);
                          })
                          .catch(() => {
                            setOutcome({
                              ok: false,
                              message:
                                "Resolution validation could not be completed in this session preview.",
                            });
                          })
                          .finally(() => {
                            setPendingItemId(null);
                          });
                      }}
                    >
                      {pendingItemId === item.itemId
                        ? "Validating..."
                        : plainStatus(action)}
                    </button>
                  ),
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function plainStatus(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
