import { useState } from "react";

import type {
  CaseworkMaturityLevel,
  CaseworkOutputArtifactInput,
  CaseworkOutputArtifactType,
  CaseworkOutputStage,
  FinalCaseworkOutputDeterministicPayload,
} from "../../domain/case-output/models";

const linkableArtifactTypes: readonly CaseworkOutputArtifactType[] = [
  "population-profile",
  "v1-architecture",
  "build-spec",
  "compiled-formula-artifact",
  "v1-workbook",
  "validation-result",
  "reconciliation-result",
  "section-436-evaluation",
];

const maturityLevels: readonly CaseworkMaturityLevel[] = [
  "implemented",
  "tested",
  "independently-validated",
  "human-approved",
];

export interface CaseOutputArtifactLinkDraft {
  readonly artifactType: CaseworkOutputArtifactType;
  readonly artifactId: string;
  readonly storagePath: string;
  readonly mediaType: string;
  readonly description: string;
  readonly maturityLevel: CaseworkMaturityLevel;
}

export function CaseOutputPackagePanel({
  payload,
  linkedArtifacts,
  exportMessage,
  linkMessage,
  onLinkArtifact,
  onExport,
}: {
  readonly payload: FinalCaseworkOutputDeterministicPayload | null;
  readonly linkedArtifacts: readonly CaseworkOutputArtifactInput[];
  readonly exportMessage: string | null;
  readonly linkMessage: string | null;
  readonly onLinkArtifact: (
    draft: CaseOutputArtifactLinkDraft,
  ) => Promise<void>;
  readonly onExport: () => Promise<void>;
}) {
  const [artifactType, setArtifactType] =
    useState<CaseworkOutputArtifactType>("v1-architecture");
  const [artifactId, setArtifactId] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [mediaType, setMediaType] = useState("application/json");
  const [description, setDescription] = useState("");
  const [maturityLevel, setMaturityLevel] =
    useState<CaseworkMaturityLevel>("implemented");

  const submitLink = () => {
    void onLinkArtifact({
      artifactType,
      artifactId,
      storagePath,
      mediaType,
      description,
      maturityLevel,
    });
  };

  if (payload === null) {
    return (
      <section className="case-panel" aria-labelledby="case-output-title">
        <div className="panel-heading">
          <div>
            <p className="section-label">Final deliverable</p>
            <h2 id="case-output-title">Case output package</h2>
          </div>
          <span className="status-chip status-chip-warning">
            No active case
          </span>
        </div>
        <p className="notice">
          Select or create a governed case before producing the final casework
          output package.
        </p>
      </section>
    );
  }

  const blockedStages = payload.stages.filter(
    (stage) => stage.required && stage.status === "blocked",
  ).length;

  return (
    <section className="case-panel" aria-labelledby="case-output-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">Final deliverable</p>
          <h2 id="case-output-title">Case output package</h2>
        </div>
        <span
          className={`status-chip ${payload.packageStatus === "blocked" ? "status-chip-warning" : ""}`}
        >
          {payload.packageStatus === "blocked" ? "Blocked" : "Ready"}
        </span>
      </div>
      <dl className="status-grid">
        <div className="status-item">
          <dt>Package status</dt>
          <dd>{payload.packageStatus}</dd>
        </div>
        <div className="status-item">
          <dt>Referenced artifacts</dt>
          <dd>{payload.artifacts.length}</dd>
        </div>
        <div className="status-item">
          <dt>Blocking stages</dt>
          <dd>{blockedStages}</dd>
        </div>
      </dl>
      <p>
        This package is the final casework output boundary. It references
        generated artifacts by hash and records blockers instead of inventing
        missing workbook, validation, or Section 436 results.
      </p>
      <div className="case-output-linker">
        <h3>Link generated artifact</h3>
        <p>
          Link artifacts that already exist in the selected local workspace. The
          app reads the file and computes its SHA-256 before adding it to the
          final package.
        </p>
        <div className="case-output-link-grid">
          <label>
            Artifact type
            <select
              value={artifactType}
              onChange={(event) => {
                setArtifactType(
                  event.currentTarget.value as CaseworkOutputArtifactType,
                );
              }}
            >
              {linkableArtifactTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Artifact ID
            <input
              value={artifactId}
              onChange={(event) => {
                setArtifactId(event.currentTarget.value);
              }}
              placeholder="e.g. build-spec-v2"
            />
          </label>
          <label>
            Workspace path
            <input
              value={storagePath}
              onChange={(event) => {
                setStoragePath(event.currentTarget.value);
              }}
              placeholder="cases/<case-id>/outputs/build-spec.json"
            />
          </label>
          <label>
            Media type
            <input
              value={mediaType}
              onChange={(event) => {
                setMediaType(event.currentTarget.value);
              }}
            />
          </label>
          <label>
            Maturity
            <select
              value={maturityLevel}
              onChange={(event) => {
                setMaturityLevel(
                  event.currentTarget.value as CaseworkMaturityLevel,
                );
              }}
            >
              {maturityLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="case-output-description-field">
            Description
            <input
              value={description}
              onChange={(event) => {
                setDescription(event.currentTarget.value);
              }}
              placeholder="What this artifact represents"
            />
          </label>
        </div>
        {linkMessage !== null ? (
          <p className="notice" role="status">
            {linkMessage}
          </p>
        ) : null}
        <button
          type="button"
          className="button button-secondary"
          onClick={submitLink}
        >
          Hash and link workspace artifact
        </button>
      </div>
      {linkedArtifacts.length > 0 ? (
        <div className="case-output-linked-artifacts">
          <h3>Linked artifacts</h3>
          <ul>
            {linkedArtifacts.map((artifact) => (
              <li key={`${artifact.artifactType}:${artifact.artifactId}`}>
                <strong>{artifact.artifactType}</strong> {artifact.artifactId}{" "}
                <code>{artifact.contentSha256}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="case-output-stage-list">
        {payload.stages.map((stage) => (
          <CaseOutputStageItem key={stage.stageKey} stage={stage} />
        ))}
      </ol>
      {exportMessage !== null ? (
        <p className="notice" role="status">
          {exportMessage}
        </p>
      ) : null}
      <button
        type="button"
        className="button button-primary"
        onClick={() => void onExport()}
      >
        Export final output package
      </button>
    </section>
  );
}

function CaseOutputStageItem({
  stage,
}: {
  readonly stage: CaseworkOutputStage;
}) {
  return (
    <li className={`case-output-stage case-output-stage-${stage.status}`}>
      <div>
        <strong>{stage.label}</strong>
        <span>
          {stage.required ? "Required" : "Optional"} · {stage.status} ·
          maturity: {stage.maturityLevel}
        </span>
      </div>
      {stage.blockers.length > 0 ? (
        <p>{stage.blockers.join(" ")}</p>
      ) : (
        <p>
          {stage.artifactSha256Values.length} artifact hash
          {stage.artifactSha256Values.length === 1 ? "" : "es"} referenced.
        </p>
      )}
    </li>
  );
}
