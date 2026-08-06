import {
  CaseCreation,
  type CaseCreationView,
  type ProductionCaseRequest,
} from "../components/case-intake/CaseCreation";
import { FeasibilityStatus } from "../components/FeasibilityStatus";
import { HelpPanel } from "../components/HelpPanel";
import { PackageIntake } from "../components/case-intake/PackageIntake";
import { QuarantineQueue } from "../components/quarantine/QuarantineQueue";
import { ClassificationReview } from "../components/review/ClassificationReview";
import { RelationshipReview } from "../components/review/RelationshipReview";
import { PopulationReview } from "../components/review/PopulationReview";
import { ManifestExport } from "../components/inventory/ManifestExport";
import { EvidenceCatalogReview } from "../components/evidence/EvidenceCatalogReview";
import { ProvisionCandidateReview } from "../components/evidence/ProvisionCandidateReview";
import { PlanRuleAuthor } from "../components/evidence/PlanRuleAuthor";
import { UnresolvedItemQueue } from "../components/evidence/UnresolvedItemQueue";
import { CaseOutputPackagePanel } from "../components/case-output/CaseOutputPackagePanel";
import { DraftV1SummaryPanel } from "../components/draft-v1-summary/DraftV1SummaryPanel";
import { evidenceReviewDemo } from "../components/evidence/demo-evidence";
import { buildFinalCaseworkOutputPayload } from "../domain/case-output/package-builder";
import { useCaseOrchestrator } from "./orchestrator/case-orchestrator";

type EvidenceReviewView = "catalog" | "candidates" | "rules" | "unresolved";

const EVIDENCE_REVIEW_ROUTES: readonly [EvidenceReviewView, string][] = [
  ["catalog", "Catalog"],
  ["candidates", "Candidates"],
  ["rules", "Rule authoring"],
  ["unresolved", "Unresolved items"],
];

const DEMO_PROVISION_CANDIDATES = evidenceReviewDemo.candidates.map(
  (item) => item.candidate,
);

export function App({
  evidenceGovernanceDependencies,
}: {
  readonly evidenceGovernanceDependencies?: Parameters<
    typeof useCaseOrchestrator
  >[0];
} = {}) {
  const orchestrator = useCaseOrchestrator(evidenceGovernanceDependencies);

  const evidenceReviewContent =
    orchestrator.evidenceReviewView === "catalog" ? (
      <EvidenceCatalogReview catalog={evidenceReviewDemo.catalog} />
    ) : orchestrator.evidenceReviewView === "candidates" ? (
      <ProvisionCandidateReview
        candidates={DEMO_PROVISION_CANDIDATES}
        nearDuplicates={evidenceReviewDemo.nearDuplicates}
        supersessions={evidenceReviewDemo.supersessions}
      />
    ) : orchestrator.evidenceReviewView === "rules" ? (
      <>
        {orchestrator.ruleAuthoringOutcome ? (
          <p
            className={`form-message ${orchestrator.ruleAuthoringOutcome.kind === "error" ? "form-message-error" : "notice"}`}
            role={
              orchestrator.ruleAuthoringOutcome.kind === "error"
                ? "alert"
                : "status"
            }
          >
            {orchestrator.ruleAuthoringOutcome.message}
          </p>
        ) : null}
        <PlanRuleAuthor
          candidates={evidenceReviewDemo.candidates}
          unresolvedItems={orchestrator.evidenceUnresolvedItems}
          existingRules={orchestrator.previewRules}
          busy={orchestrator.ruleAuthoringBusy}
          onAuthor={orchestrator.recordRuleAuthoring}
        />
      </>
    ) : (
      <UnresolvedItemQueue
        items={orchestrator.evidenceUnresolvedItems}
        onAction={orchestrator.recordUnresolvedAction}
      />
    );

  const finalOutputPayload = orchestrator.finalOutputInput
    ? buildFinalCaseworkOutputPayload(orchestrator.finalOutputInput)
    : null;

  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <p className="eyebrow">PBGC Case Workbench 2</p>
          <h1>Evidence intake foundation</h1>
        </div>
        <span
          className="phase-badge"
          aria-label="Current implementation maturity: controlled case intake"
        >
          Case intake
        </span>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <section className="intro" aria-labelledby="intro-title">
          <p className="section-label">Local-first workspace</p>
          <h2 id="intro-title">Begin with a governed case identity</h2>
          <p>
            Create or resume a case without transmitting evidence, inventing
            case facts, or silently duplicating a production identifier.
          </p>
          <FeasibilityStatus />
        </section>
        <HelpPanel />
        <CaseCreation
          workspaceReady={orchestrator.workspaceReady}
          workspaceLabel={orchestrator.workspaceLabel}
          workspaceError={orchestrator.workspaceError}
          busy={orchestrator.busy}
          view={orchestrator.view as CaseCreationView}
          error={orchestrator.error}
          onSelectWorkspace={orchestrator.selectWorkspace}
          onCreateProduction={async (input: ProductionCaseRequest) => {
            await orchestrator.createProduction(input);
          }}
          onResolveCollision={async (collision, input) => {
            await orchestrator.resolveCollision(collision, input);
          }}
          onCreateAnother={() => {
            orchestrator.setError(null);
            orchestrator.setView({ kind: "ready" });
          }}
        />
        <PackageIntake
          enabled={
            orchestrator.workspaceReady && orchestrator.activeCase !== null
          }
          onProcess={async () => {
            await Promise.resolve();
            return {
              items: [],
              snapshotId: null,
              resumeKind: "first",
              packageStatus: "interrupted",
            };
          }}
        />
        <DraftV1SummaryPanel
          enabled={
            orchestrator.workspaceReady && orchestrator.activeCase !== null
          }
          draft={orchestrator.draftV1Summary}
          message={orchestrator.draftV1SummaryMessage}
          onGenerate={orchestrator.generateDraftV1Summary}
        />
        <QuarantineQueue
          items={orchestrator.quarantineItems}
          reviewer={orchestrator.sharedReviewer}
          rationale={orchestrator.sharedRationale}
          onReviewerChange={orchestrator.setSharedReviewer}
          onRationaleChange={orchestrator.setSharedRationale}
          onDecision={async (item, action, reviewer, rationale) => {
            await orchestrator.recordQuarantineDecision(
              item,
              action,
              reviewer,
              rationale,
            );
          }}
        />
        <ClassificationReview
          items={orchestrator.classificationItems}
          dateCandidates={orchestrator.dateCandidateItems}
          reviewer={orchestrator.sharedReviewer}
          rationale={orchestrator.sharedRationale}
          onReviewerChange={orchestrator.setSharedReviewer}
          onRationaleChange={orchestrator.setSharedRationale}
          onDecision={async (item, action, reviewer, rationale) => {
            await orchestrator.recordClassificationDecision(
              item,
              action,
              reviewer,
              rationale,
            );
          }}
          onDateSelect={async (item, reviewer, rationale) => {
            await orchestrator.recordDateSelection(item, reviewer, rationale);
          }}
        />
        <div
          className="evidence-review-stage"
          aria-labelledby="evidence-review-stage-title"
        >
          <div className="evidence-stage-heading">
            <div>
              <p className="section-label">Feature 001 reviewer workspace</p>
              <h2 id="evidence-review-stage-title">
                Evidence and plan-rule review
              </h2>
            </div>
            <p>Typed synthetic demo candidates</p>
          </div>
          <div className="notice session-preview-controls">
            <p>
              <strong>
                Synthetic session preview with production persistence.
              </strong>
              Governed operations use typed demo candidates. Plan-rule records
              persist to the active local case workspace when one is selected;
              otherwise they remain preview-only. Reset or browser refresh
              restores the initial synthetic preview state.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={orchestrator.resetEvidenceSessionPreview}
            >
              Reset session preview
            </button>
          </div>
          <nav
            className="evidence-review-nav"
            aria-label="Evidence review stages"
          >
            {EVIDENCE_REVIEW_ROUTES.map(([route, label]) => (
              <button
                key={route}
                type="button"
                className="button button-secondary"
                aria-current={
                  orchestrator.evidenceReviewView === route ? "page" : undefined
                }
                aria-controls="evidence-review-content"
                onClick={() => {
                  orchestrator.setEvidenceReviewView(route);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <p className="visually-hidden" role="status" aria-live="polite">
            Showing{" "}
            {
              EVIDENCE_REVIEW_ROUTES.find(
                ([route]) => route === orchestrator.evidenceReviewView,
              )?.[1]
            }
            .
          </p>
          <div id="evidence-review-content">{evidenceReviewContent}</div>
        </div>
        <RelationshipReview
          items={orchestrator.relationshipItems}
          reviewer={orchestrator.sharedReviewer}
          rationale={orchestrator.sharedRationale}
          onReviewerChange={orchestrator.setSharedReviewer}
          onRationaleChange={orchestrator.setSharedRationale}
          onDecision={async (item, action, reviewer, rationale) => {
            await orchestrator.recordRelationshipDecision(
              item,
              action,
              reviewer,
              rationale,
            );
          }}
        />
        <PopulationReview
          items={orchestrator.populationItems}
          reviewer={orchestrator.sharedReviewer}
          rationale={orchestrator.sharedRationale}
          onReviewerChange={orchestrator.setSharedReviewer}
          onRationaleChange={orchestrator.setSharedRationale}
          onDecision={async (item, action, reviewer, rationale) => {
            await orchestrator.recordPopulationDecision(
              item,
              action,
              reviewer,
              rationale,
            );
          }}
        />
        <ManifestExport
          summary={orchestrator.manifestSummary}
          onExport={async () => {
            await orchestrator.exportCurrentManifest();
          }}
        />
        <CaseOutputPackagePanel
          payload={finalOutputPayload}
          linkedArtifacts={orchestrator.caseOutputArtifacts}
          exportMessage={orchestrator.caseOutputExportMessage}
          linkMessage={orchestrator.caseOutputLinkMessage}
          onLinkArtifact={async (draft) => {
            await orchestrator.linkCaseOutputArtifact(draft);
          }}
          onExport={async () => {
            await Promise.resolve();
            orchestrator.exportFinalCaseworkOutputPackage();
          }}
        />
      </main>
    </div>
  );
}
