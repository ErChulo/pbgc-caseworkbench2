import { useState } from "react";

import type { EvidenceCatalog, SourceRole } from "../../domain/evidence/models";
import {
  SOURCE_ROLES,
  sourceRoleLabel,
} from "../../domain/evidence/source-roles";

export function EvidenceCatalogReview({
  catalog,
  syntheticDemo = true,
}: {
  readonly catalog: EvidenceCatalog;
  readonly syntheticDemo?: boolean;
}) {
  const [sourceRole, setSourceRole] = useState<SourceRole | "all">("all");
  const artifacts = [...catalog.caseEvidence, ...catalog.referenceOnly].filter(
    (artifact) => sourceRole === "all" || artifact.sourceRole === sourceRole,
  );

  return (
    <section
      className="case-panel review-panel"
      aria-labelledby="evidence-catalog-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Governed evidence</p>
          <h2 id="evidence-catalog-title">Evidence catalog review</h2>
        </div>
        <span className="status-chip">
          {syntheticDemo
            ? "Synthetic demo catalog"
            : "Current governed catalog"}
        </span>
      </div>
      <p>
        Review hash-anchored case and reference evidence. Quarantined artifacts
        remain excluded and are listed separately below.
      </p>
      <label className="review-filter" htmlFor="catalog-source-role">
        Filter by source role
        <select
          id="catalog-source-role"
          value={sourceRole}
          onChange={(event) => {
            setSourceRole(event.currentTarget.value as SourceRole | "all");
          }}
        >
          <option value="all">All source roles</option>
          {SOURCE_ROLES.map((role) => (
            <option key={role} value={role}>
              {sourceRoleLabel(role)}
            </option>
          ))}
        </select>
      </label>
      <div className="inventory-table-wrap">
        <table className="inventory-table evidence-table">
          <caption aria-live="polite">
            {artifacts.length} catalog artifact(s) match this filter
          </caption>
          <thead>
            <tr>
              <th scope="col">Artifact hash</th>
              <th scope="col">Source role</th>
              <th scope="col">Size</th>
              <th scope="col">Locator</th>
              <th scope="col">Receipt provenance</th>
              <th scope="col">Review status</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.map((artifact) => (
              <tr key={artifact.artifactId}>
                <td data-label="Artifact hash">
                  <code title={artifact.sha256}>
                    {truncateHash(artifact.sha256)}
                  </code>
                </td>
                <td data-label="Source role">
                  {sourceRoleLabel(artifact.sourceRole)}
                </td>
                <td data-label="Size">{formatBytes(artifact.sizeBytes)}</td>
                <td data-label="Locator">{artifact.locator}</td>
                <td data-label="Receipt provenance">
                  Receipt {shortId(artifact.receiptId)}
                  {artifact.containedBySha256 === null
                    ? "; direct intake"
                    : `; contained by ${truncateHash(artifact.containedBySha256)}`}
                </td>
                <td data-label="Review status">
                  <span className="inventory-status">
                    {plainStatus(artifact.reviewStatus)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {catalog.excludedQuarantined.length > 0 ? (
        <aside
          className="evidence-exclusions"
          aria-labelledby="catalog-exclusions-title"
        >
          <h3 id="catalog-exclusions-title">Quarantined exclusions</h3>
          <p>
            Excluded from governed evidence:{" "}
            {catalog.excludedQuarantined.length} artifact(s). Each exclusion
            links to an unresolved item and requires human disposition.
          </p>
          <ul>
            {catalog.excludedQuarantined.map((item) => (
              <li key={item.artifactId}>
                <code title={item.sha256}>{truncateHash(item.sha256)}</code>{" "}
                <span>
                  Excluded, unresolved item{" "}
                  {shortId(item.linkedUnresolvedItemId)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      ) : (
        <p className="notice">
          No quarantined exclusions are recorded in this catalog.
        </p>
      )}
    </section>
  );
}

function truncateHash(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat("en-US").format(value) + " bytes";
}

function plainStatus(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
