import { useState, type SyntheticEvent } from "react";

import type {
  CaseCollision,
  CollisionResolutionInput,
} from "../../domain/case/case-registry";
import type {
  CaseRecord,
  HumanActor,
  NonProductionCasePurpose,
} from "../../domain/case/case";

export type CaseCreationView =
  | { readonly kind: "ready" }
  | { readonly kind: "collision"; readonly collision: CaseCollision }
  | {
      readonly kind: "created";
      readonly caseRecord: CaseRecord;
      readonly message: string;
      readonly collisionDecisionRecorded: boolean;
    }
  | {
      readonly kind: "resumed";
      readonly caseRecord: CaseRecord;
      readonly message: string;
    };

export interface ProductionCaseRequest {
  readonly authoritativeCaseId: string;
  readonly actor: HumanActor;
}

interface CaseCreationProps {
  readonly workspaceReady: boolean;
  readonly workspaceLabel: string;
  readonly workspaceError: string | null;
  readonly busy: boolean;
  readonly view: CaseCreationView;
  readonly error: string | null;
  readonly onSelectWorkspace: () => Promise<void>;
  readonly onCreateProduction: (
    request: ProductionCaseRequest,
  ) => Promise<void>;
  readonly onResolveCollision: (
    collision: CaseCollision,
    input: CollisionResolutionInput,
  ) => Promise<void>;
  readonly onCreateAnother: () => void;
}

export function CaseCreation({
  workspaceReady,
  workspaceLabel,
  workspaceError,
  busy,
  view,
  error,
  onSelectWorkspace,
  onCreateProduction,
  onResolveCollision,
  onCreateAnother,
}: CaseCreationProps) {
  const [authoritativeCaseId, setAuthoritativeCaseId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [rationale, setRationale] = useState("");
  const [nonProductionPurpose, setNonProductionPurpose] =
    useState<NonProductionCasePurpose>("training");

  const actor = (): HumanActor => ({
    actorType: "human",
    actorKey: reviewerId,
    displayName: reviewerName,
    authorityContext: "case-intake-and-collision-review",
  });

  const submitProduction = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreateProduction({ authoritativeCaseId, actor: actor() });
  };

  const resolve = async (
    action: CollisionResolutionInput["action"],
  ): Promise<void> => {
    if (view.kind !== "collision") return;
    await onResolveCollision(view.collision, {
      action,
      actor: actor(),
      rationale,
      nonProductionPurpose:
        action === "create-non-production" ? nonProductionPurpose : null,
    });
  };

  return (
    <section className="case-panel" aria-labelledby="case-creation-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">Controlled identity</p>
          <h2 id="case-creation-title">Create a controlled case</h2>
        </div>
        <span className="status-chip">
          {workspaceReady ? "Workspace ready" : "Workspace required"}
        </span>
      </div>

      <div className="workspace-gate">
        <div>
          <strong>Local workspace</strong>
          <p>{workspaceLabel}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void onSelectWorkspace()}
        >
          Select local workspace
        </button>
      </div>
      {workspaceError ? (
        <p className="form-message form-message-error" role="alert">
          {workspaceError}
        </p>
      ) : null}

      {view.kind === "ready" ? (
        <form
          className="case-form"
          onSubmit={(event) => {
            void submitProduction(event);
          }}
        >
          <div className="form-grid">
            <label>
              <span>Reviewer identifier</span>
              <input
                name="reviewerId"
                value={reviewerId}
                onChange={(event) => {
                  setReviewerId(event.target.value);
                }}
                autoComplete="off"
                required
              />
              <small>Use your stable asserted local reviewer identifier.</small>
            </label>
            <label>
              <span>Reviewer display name</span>
              <input
                name="reviewerName"
                value={reviewerName}
                onChange={(event) => {
                  setReviewerName(event.target.value);
                }}
                autoComplete="name"
                required
              />
            </label>
          </div>
          <label>
            <span>Case number</span>
            <input
              name="authoritativeCaseId"
              value={authoritativeCaseId}
              onChange={(event) => {
                setAuthoritativeCaseId(event.target.value);
              }}
              onBlur={(event) => {
                setAuthoritativeCaseId(event.target.value);
              }}
              autoComplete="off"
              required
              aria-describedby="case-identifier-help"
            />
            <small id="case-identifier-help">
              The official PBGC case number. No plan, employer, or participant
              facts are inferred from this number.
            </small>
          </label>
          {error ? (
            <p className="form-message form-message-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button button-primary"
            type="submit"
            disabled={!workspaceReady || busy}
          >
            {busy ? "Creating case…" : "Create production case"}
          </button>
        </form>
      ) : null}

      {view.kind === "collision" ? (
        <div className="collision-review">
          <div className="collision-heading">
            <p className="section-label">Human decision required</p>
            <h3>Existing case found</h3>
          </div>
          <dl className="case-summary">
            <div>
              <dt>Internal ID</dt>
              <dd data-testid="existing-case-id">
                {view.collision.existingCase.caseId}
              </dd>
            </div>
            <div>
              <dt>Case status</dt>
              <dd>{view.collision.existingCase.status}</dd>
            </div>
          </dl>
          <p className="form-message form-message-warning" role="status">
            No second production case was created. Choose an explicit, traceable
            action.
          </p>
          <label>
            <span>Decision rationale</span>
            <textarea
              value={rationale}
              onChange={(event) => {
                setRationale(event.target.value);
              }}
              rows={3}
              required
            />
          </label>
          <div className="collision-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={busy || view.collision.existingCase.status !== "active"}
              onClick={() => void resolve("resume-existing")}
            >
              Resume existing case
            </button>
            <div className="non-production-action">
              <label>
                <span>Non-production purpose</span>
                <select
                  value={nonProductionPurpose}
                  onChange={(event) => {
                    setNonProductionPurpose(
                      event.target.value as NonProductionCasePurpose,
                    );
                  }}
                >
                  <option value="test">Test</option>
                  <option value="training">Training</option>
                  <option value="duplicate-investigation">
                    Duplicate investigation
                  </option>
                </select>
              </label>
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void resolve("create-non-production")}
              >
                Create approved non-production case
              </button>
            </div>
          </div>
          {error ? (
            <p className="form-message form-message-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {view.kind === "created" || view.kind === "resumed" ? (
        <div className="case-created" role="status">
          <p className="section-label">Controlled case ready</p>
          <h3>{view.message}</h3>
          <dl className="case-summary">
            <div>
              <dt>Internal ID</dt>
              <dd data-testid="current-case-id">{view.caseRecord.caseId}</dd>
            </div>
            <div>
              <dt>Purpose</dt>
              <dd>{purposeLabel(view.caseRecord.purpose)}</dd>
            </div>
          </dl>
          {"collisionDecisionRecorded" in view &&
          view.collisionDecisionRecorded ? (
            <p>Human collision decision recorded</p>
          ) : null}
          <button
            className="button button-secondary"
            type="button"
            onClick={onCreateAnother}
          >
            Create another case
          </button>
        </div>
      ) : null}
    </section>
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
