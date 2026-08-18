import React, { useState } from "react";
import type { FormulaApprovalRecord } from "../../domain/build-spec/models";
import type {
  V1Architecture,
  CellDescriptor,
} from "../../domain/architecture/models";
import type { PlanRuleRecord } from "../../domain/plan-rules/models";

interface FormulaGovernancePanelProps {
  readonly enabled: boolean;
  readonly architecture: V1Architecture | null;
  readonly formulaApprovalRecords: readonly FormulaApprovalRecord[];
  readonly planRules: readonly PlanRuleRecord[];
  readonly message: string | null;
  readonly onApproveFormula: (
    cellKey: string,
    scenarioId: string,
    formulaText: string,
    sourcePlanRuleIds: readonly string[],
    rationale: string,
  ) => Promise<void>;
}

export function FormulaGovernancePanel({
  enabled,
  architecture,
  formulaApprovalRecords,
  planRules,
  message,
  onApproveFormula,
}: FormulaGovernancePanelProps): React.ReactElement {
  const [selectedTarget, setSelectedTarget] = useState<{
    readonly cellKey: string;
    readonly scenarioId: string;
  } | null>(null);
  const [approvalRationale, setApprovalRationale] = useState<string>("");
  const [selectedPlanRules, setSelectedPlanRules] = useState<Set<string>>(
    new Set(),
  );

  const allCells = architecture ? Array.from(architecture.cells.values()) : [];
  const formulaCells = allCells.filter((c) => c.hasFormula);

  const groupedByScenario = new Map<string, typeof formulaCells>();
  for (const cell of formulaCells) {
    const runIds: string[] = [];
    cell.perRunClassification.forEach((_, key) => {
      runIds.push(key);
    });
    for (const runId of runIds) {
      const existing = groupedByScenario.get(runId) ?? [];
      existing.push(cell);
      groupedByScenario.set(runId, existing);
    }
  }

  const getApprovalStatus = (
    cellKey: string,
    scenarioId: string,
  ): FormulaApprovalRecord | null => {
    const matching = formulaApprovalRecords.find(
      (r) =>
        `${r.target.tabName}::${r.target.cellAddress}` === cellKey &&
        r.scenarioId === scenarioId &&
        r.resultingStatus === "approved",
    );
    return matching ?? null;
  };

  const handleApprove = async (
    cellKey: string,
    scenarioId: string,
    formulaText: string,
  ): Promise<void> => {
    if (!approvalRationale.trim()) return;
    await onApproveFormula(
      cellKey,
      scenarioId,
      formulaText,
      Array.from(selectedPlanRules),
      approvalRationale,
    );
    setApprovalRationale("");
    setSelectedPlanRules(new Set());
  };

  const togglePlanRule = (ruleId: string): void => {
    setSelectedPlanRules((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  // Progress counts (cell, scenario) pairs: every formula cell appears once
  // per scenario run it participates in, and approval records are scoped to a
  // single scenario, so totals and approvals stay comparable.
  const overallProgress = {
    total: [...groupedByScenario.values()].reduce(
      (total, cells) => total + cells.length,
      0,
    ),
    approved: formulaApprovalRecords.filter(
      (r) => r.resultingStatus === "approved",
    ).length,
  };
  const groupProgress = (
    cells: readonly CellDescriptor[],
    scenarioId: string,
  ) => ({
    total: cells.length,
    approved: cells.filter(
      (cell) => getApprovalStatus(cell.key, scenarioId) !== null,
    ).length,
  });

  return (
    <div
      className="formula-governance-panel"
      role="region"
      aria-label="Formula Governance"
    >
      <div className="formula-governance-header">
        <h3>Formula Governance</h3>
        {formulaCells.length > 0 && (
          <div className="formula-governance-progress">
            <span className="progress-label">
              {overallProgress.approved}/{overallProgress.total} formulas
              approved
            </span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${String(overallProgress.total > 0 ? (overallProgress.approved / overallProgress.total) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {!enabled && (
        <div className="notice">
          <p>
            Complete architecture selection before reviewing formula governance.
          </p>
        </div>
      )}

      {enabled && !architecture && (
        <div className="notice">
          <p>Select an architecture to review formula governance.</p>
        </div>
      )}

      {message && (
        <div className="formula-governance-message" role="status">
          <p>{message}</p>
        </div>
      )}

      {enabled && architecture && (
        <>
          {formulaCells.length === 0 ? (
            <div className="empty-formulas">
              <p>No formula cells identified in the architecture.</p>
            </div>
          ) : (
            <div className="formula-cells-list">
              {Array.from(groupedByScenario.entries()).map(
                ([scenarioId, cells]: [string, CellDescriptor[]]) => (
                  <div key={scenarioId} className="formula-scenario-group">
                    <h4>Scenario: {scenarioId}</h4>
                    {(() => {
                      const progress = groupProgress(cells, scenarioId);
                      return (
                        <div className="formula-group-progress">
                          <span className="progress-label">
                            {progress.approved}/{progress.total} formulas
                            approved
                          </span>
                        </div>
                      );
                    })()}
                    <div className="formula-cells-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Cell</th>
                            <th>Field</th>
                            <th>Formula</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cells.map((cell) => {
                            const approval = getApprovalStatus(
                              cell.key,
                              scenarioId,
                            );
                            const isSelected =
                              selectedTarget?.cellKey === cell.key &&
                              selectedTarget.scenarioId === scenarioId;

                            return (
                              <React.Fragment key={cell.key}>
                                <tr
                                  className={`formula-row ${approval ? "approved" : "pending"}`}
                                >
                                  <td className="cell-address">
                                    {cell.cellAddress}
                                  </td>
                                  <td className="cell-field">
                                    {cell.genericField}
                                  </td>
                                  <td className="cell-formula">
                                    <code>
                                      {cell.formulaText?.slice(0, 50) ?? "N/A"}
                                      {(cell.formulaText?.length ?? 0) > 50
                                        ? "..."
                                        : ""}
                                    </code>
                                  </td>
                                  <td className="cell-status">
                                    <span
                                      className={`status-chip ${approval ? "approved" : "pending"}`}
                                    >
                                      {approval ? "Approved" : "Pending"}
                                    </span>
                                  </td>
                                  <td className="cell-action">
                                    {!approval && (
                                      <button
                                        type="button"
                                        className="button button-secondary button-small"
                                        onClick={() => {
                                          setSelectedTarget(
                                            isSelected
                                              ? null
                                              : {
                                                  cellKey: cell.key,
                                                  scenarioId,
                                                },
                                          );
                                        }}
                                      >
                                        {isSelected ? "Cancel" : "Approve"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                                {isSelected && (
                                  <tr className="formula-approval-form">
                                    <td colSpan={5}>
                                      <div className="approval-form">
                                        <div className="plan-rule-selection">
                                          <label>Governing Plan Rules:</label>
                                          <div className="plan-rule-list">
                                            {planRules.map((rule) => (
                                              <label
                                                key={rule.ruleId}
                                                className="plan-rule-checkbox"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={selectedPlanRules.has(
                                                    rule.ruleId,
                                                  )}
                                                  onChange={() => {
                                                    togglePlanRule(rule.ruleId);
                                                  }}
                                                />
                                                <span className="rule-id">
                                                  {rule.ruleId.slice(0, 8)}
                                                </span>
                                                <span className="rule-statement">
                                                  {rule.governingRestatement.slice(
                                                    0,
                                                    80,
                                                  )}
                                                  ...
                                                </span>
                                              </label>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="rationale-input">
                                          <label>Approval Rationale:</label>
                                          <textarea
                                            value={approvalRationale}
                                            onChange={(e) => {
                                              setApprovalRationale(
                                                e.target.value,
                                              );
                                            }}
                                            placeholder="Enter approval rationale..."
                                            rows={3}
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          className="button button-primary"
                                          onClick={() =>
                                            void handleApprove(
                                              cell.key,
                                              scenarioId,
                                              cell.formulaText ?? "",
                                            )
                                          }
                                          disabled={
                                            !approvalRationale.trim() ||
                                            selectedPlanRules.size === 0
                                          }
                                        >
                                          Confirm Approval
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
