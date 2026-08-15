import React, { useState } from "react";
import type {
  PlanSummaryRecord,
  PlanSummaryAttribute,
  PlanSummarySectionId,
} from "../../domain/plan-summary/models";
import { PLAN_SUMMARY_SECTIONS } from "../../domain/plan-summary/models";

interface PlanSummaryPanelProps {
  readonly enabled: boolean;
  readonly record: PlanSummaryRecord | null;
  readonly message: string | null;
  readonly onInitialize: () => Promise<void>;
  readonly onApproveAttribute: (
    attributeId: string,
    selectedValue: string | null,
    rationale: string,
  ) => Promise<void>;
}

export function PlanSummaryPanel({
  enabled,
  record,
  message,
  onInitialize,
  onApproveAttribute,
}: PlanSummaryPanelProps): React.ReactElement {
  const [selectedSection, setSelectedSection] =
    useState<PlanSummarySectionId>("A");
  const [expandedAttributes, setExpandedAttributes] = useState<Set<string>>(
    new Set(),
  );
  const [approvalRationale, setApprovalRationale] = useState<string>("");

  const handleToggleAttribute = (attributeId: string): void => {
    setExpandedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(attributeId)) {
        next.delete(attributeId);
      } else {
        next.add(attributeId);
      }
      return next;
    });
  };

  const handleApprove = async (
    attribute: PlanSummaryAttribute,
  ): Promise<void> => {
    await onApproveAttribute(
      attribute.attributeId,
      attribute.fieldValue,
      approvalRationale,
    );
    setApprovalRationale("");
  };

  const currentSection = record?.sections.find(
    (s) => s.sectionId === selectedSection,
  );

  const overallProgress = record
    ? {
        total: record.sections.reduce((sum, s) => sum + s.attributes.length, 0),
        approved: record.sections.reduce(
          (sum, s) =>
            sum + s.attributes.filter((a) => a.status === "approved").length,
          0,
        ),
      }
    : { total: 0, approved: 0 };

  return (
    <div className="plan-summary-panel" role="region" aria-label="Plan Summary">
      <div className="plan-summary-header">
        <h3>Plan Summary</h3>
        {record && (
          <div className="plan-summary-progress">
            <span className="progress-label">
              {overallProgress.approved}/{overallProgress.total} attributes
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
            Complete evidence intake and classification before starting the Plan
            Summary.
          </p>
        </div>
      )}

      {enabled && !record && (
        <div className="plan-summary-init">
          <p>
            Initialize the Plan Summary to begin documenting plan attributes
            from approved evidence.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              void onInitialize();
            }}
          >
            Initialize Plan Summary
          </button>
        </div>
      )}

      {message && (
        <div className="plan-summary-message" role="status">
          <p>{message}</p>
        </div>
      )}

      {record && (
        <>
          <div className="plan-summary-status">
            <span className="status-chip">
              {record.overallStatus.toUpperCase()}
            </span>
            {record.lastApprovedAt && (
              <span className="last-approved">
                Last approved: {record.lastApprovedAt}
              </span>
            )}
          </div>

          <nav
            className="plan-summary-sections"
            aria-label="Plan Summary sections"
          >
            {PLAN_SUMMARY_SECTIONS.map((section) => {
              const sectionData = record.sections.find(
                (s) => s.sectionId === section.sectionId,
              );
              const approvedCount =
                sectionData?.attributes.filter((a) => a.status === "approved")
                  .length ?? 0;
              const totalCount = sectionData?.attributes.length ?? 0;

              return (
                <button
                  key={section.sectionId}
                  type="button"
                  className={`section-tab ${selectedSection === section.sectionId ? "active" : ""}`}
                  aria-current={
                    selectedSection === section.sectionId ? "page" : undefined
                  }
                  onClick={() => {
                    setSelectedSection(section.sectionId);
                  }}
                >
                  <span className="section-id">{section.sectionId}</span>
                  <span className="section-title">{section.sectionTitle}</span>
                  {totalCount > 0 && (
                    <span className="section-count">
                      {approvedCount}/{totalCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {currentSection && (
            <div className="plan-summary-section-content">
              <h4>
                Section {currentSection.sectionId}:{" "}
                {currentSection.sectionTitle}
              </h4>

              {currentSection.attributes.length === 0 ? (
                <div className="empty-section">
                  <p>
                    No attributes extracted for this section. Attributes will be
                    added as plan evidence is reviewed.
                  </p>
                </div>
              ) : (
                <div className="attributes-list">
                  {currentSection.attributes.map((attribute) => (
                    <div
                      key={attribute.attributeId}
                      className={`attribute-card status-${attribute.status}`}
                    >
                      <div className="attribute-header">
                        <span className="attribute-field">
                          {attribute.fieldPath}
                        </span>
                        <span
                          className={`attribute-status status-${attribute.status}`}
                        >
                          {attribute.status}
                        </span>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => {
                            handleToggleAttribute(attribute.attributeId);
                          }}
                        >
                          {expandedAttributes.has(attribute.attributeId)
                            ? "Collapse"
                            : "Expand"}
                        </button>
                      </div>

                      {expandedAttributes.has(attribute.attributeId) && (
                        <div className="attribute-details">
                          <div className="attribute-value">
                            <label>Value:</label>
                            <span>{attribute.fieldValue ?? "N/A"}</span>
                          </div>
                          <div className="attribute-source">
                            <label>Source:</label>
                            <span>{attribute.source}</span>
                          </div>
                          {attribute.effectiveDate && (
                            <div className="attribute-effective-date">
                              <label>Effective Date:</label>
                              <span>{attribute.effectiveDate}</span>
                            </div>
                          )}
                          {attribute.citations.length > 0 && (
                            <div className="attribute-citations">
                              <label>Citations:</label>
                              <ul>
                                {attribute.citations.map((citation, idx) => (
                                  <li key={idx}>
                                    {citation.artifactLocator} -{" "}
                                    {citation.sectionReference ?? "No section"}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {attribute.status === "proposed" && (
                            <div className="attribute-approval">
                              <textarea
                                value={approvalRationale}
                                onChange={(e) => {
                                  setApprovalRationale(e.target.value);
                                }}
                                placeholder="Enter approval rationale..."
                                rows={2}
                              />
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => {
                                  void handleApprove(attribute);
                                }}
                                disabled={!approvalRationale.trim()}
                              >
                                Approve
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
