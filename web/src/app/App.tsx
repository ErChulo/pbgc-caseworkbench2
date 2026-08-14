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
import { ArtifactEligibilityReview } from "../components/review/ArtifactEligibilityReview";
import { ManifestExport } from "../components/inventory/ManifestExport";
import { EvidenceCatalogReview } from "../components/evidence/EvidenceCatalogReview";
import { ProvisionCandidateReview } from "../components/evidence/ProvisionCandidateReview";
import { PlanRuleAuthor } from "../components/evidence/PlanRuleAuthor";
import { UnresolvedItemQueue } from "../components/evidence/UnresolvedItemQueue";
import { EvidenceViewer } from "../components/evidence/EvidenceViewer";
import { CaseOutputPackagePanel } from "../components/case-output/CaseOutputPackagePanel";
import { DraftV1SummaryPanel } from "../components/draft-v1-summary/DraftV1SummaryPanel";
import { ArchitectureStage } from "../components/architecture/ArchitectureStage";
import { ArchitecturePolicyReview } from "../components/architecture/ArchitecturePolicyReview";
import { CaseControlsReview } from "../components/architecture/CaseControlsReview";
import {
  StageNavigation,
  type StageDefinition,
} from "../components/shell/StageNavigation";
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

const CASWORK_STAGES: readonly StageDefinition[] = [
  {
    stageKey: "intake",
    label: "Case intake",
    description: "Create or resume a governed case",
    status: "active",
  },
  {
    stageKey: "evidence",
    label: "Evidence review",
    description: "Catalog, candidates, and plan rules",
    status: "locked",
  },
  {
    stageKey: "population",
    label: "Population",
    description: "Approve population profile",
    status: "locked",
  },
  {
    stageKey: "architecture",
    label: "Architecture",
    description: "Select scenarios and tabs",
    status: "locked",
  },
  {
    stageKey: "output",
    label: "Output",
    description: "Export final package",
    status: "locked",
  },
];

export function App({
  evidenceGovernanceDependencies,
}: {
  readonly evidenceGovernanceDependencies?: Parameters<
    typeof useCaseOrchestrator
  >[0];
} = {}) {
  const orchestrator = useCaseOrchestrator(evidenceGovernanceDependencies);

  const evidenceReviewContent =
    orchestrator.activeCase === null &&
    orchestrator.evidenceReviewView === "catalog" ? (
      <EvidenceCatalogReview catalog={evidenceReviewDemo.catalog} />
    ) : orchestrator.activeCase === null &&
      orchestrator.evidenceReviewView === "candidates" ? (
      <ProvisionCandidateReview
        candidates={DEMO_PROVISION_CANDIDATES}
        nearDuplicates={evidenceReviewDemo.nearDuplicates}
        supersessions={evidenceReviewDemo.supersessions}
      />
    ) : orchestrator.activeCase === null &&
      orchestrator.evidenceReviewView === "rules" ? (
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
    ) : orchestrator.activeCase === null &&
      orchestrator.evidenceReviewView === "unresolved" ? (
      <UnresolvedItemQueue
        items={orchestrator.evidenceUnresolvedItems}
        onAction={orchestrator.recordUnresolvedAction}
      />
    ) : orchestrator.evidenceReviewView === "catalog" &&
      orchestrator.evidenceCatalog !== null ? (
      <EvidenceCatalogReview
        catalog={orchestrator.evidenceCatalog}
        syntheticDemo={false}
      />
    ) : orchestrator.evidenceReviewView === "candidates" &&
      orchestrator.provisionCandidates.length > 0 ? (
      <ProvisionCandidateReview
        candidates={orchestrator.provisionCandidates}
        nearDuplicates={orchestrator.candidateNearDuplicates}
        supersessions={orchestrator.candidateSupersessions}
      />
    ) : orchestrator.evidenceReviewView === "unresolved" &&
      orchestrator.evidenceUnresolvedItems.length > 0 ? (
      <UnresolvedItemQueue
        items={orchestrator.evidenceUnresolvedItems}
        onAction={orchestrator.recordUnresolvedAction}
      />
    ) : (
      <p role="status" aria-live="polite">
        {orchestrator.evidenceReviewMessage ??
          "No case-derived evidence review records are available yet."}
      </p>
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
      {orchestrator.activeCase !== null ? (
        <div
          className="active-case-banner"
          role="status"
          aria-label="Active case"
        >
          <div>
            <span className="eyebrow">Active case</span>
            <strong
              data-testid="active-case-authoritative-id"
              className="case-number-display"
            >
              {orchestrator.activeCase.authoritativeCaseId ??
                orchestrator.activeCase.caseId}
            </strong>
            <small>
              Internal ID:{" "}
              <span data-testid="current-case-id">
                {orchestrator.activeCase.caseId}
              </span>
            </small>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={orchestrator.returnToWorkspaceHome}
          >
            Return to workspace home
          </button>
        </div>
      ) : null}
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
        {orchestrator.activeCase === null ? <HelpPanel /> : null}
        <StageNavigation
          stages={CASWORK_STAGES}
          activeStage="intake"
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          onStageSelect={() => {}}
        />
        {orchestrator.activeCase === null ? (
          <CaseCreation
            workspaceReady={orchestrator.workspaceReady}
            workspaceLabel={orchestrator.workspaceLabel}
            workspaceError={orchestrator.workspaceError}
            busy={orchestrator.busy}
            view={orchestrator.view as CaseCreationView}
            cases={orchestrator.cases}
            reviewerIdentity={orchestrator.reviewerIdentity}
            error={orchestrator.error}
            onSelectWorkspace={orchestrator.selectWorkspace}
            onCreateProduction={async (input: ProductionCaseRequest) => {
              await orchestrator.createProduction(input);
            }}
            onResolveCollision={async (collision, input) => {
              await orchestrator.resolveCollision(collision, input);
            }}
            onEstablishReviewerIdentity={(reviewerId, reviewerName) => {
              orchestrator.establishReviewerIdentity(reviewerId, reviewerName);
            }}
            onOpenCase={orchestrator.openCase}
            onCreateAnother={() => {
              orchestrator.setError(null);
              orchestrator.setView({ kind: "ready" });
            }}
          />
        ) : null}
        <PackageIntake
          enabled={
            orchestrator.workspaceReady && orchestrator.activeCase !== null
          }
          items={orchestrator.evidenceItems}
          summary={orchestrator.evidencePackageSummary}
          restoreMessage={orchestrator.evidenceRestoreMessage}
          onOpenEvidence={orchestrator.openEvidence}
          onProcess={(files, signal, update) =>
            orchestrator.processPackage(files, signal, update)
          }
        />
        <EvidenceViewer
          artifact={orchestrator.evidenceViewerArtifact}
          loading={orchestrator.evidenceViewerLoading}
          error={orchestrator.evidenceViewerError}
          onSaveCorrection={orchestrator.saveEvidenceCorrection}
          onClose={orchestrator.closeEvidence}
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
        <ArtifactEligibilityReview
          items={orchestrator.eligibilityItems}
          reviewer={orchestrator.sharedReviewer}
          rationale={orchestrator.sharedRationale}
          onReviewerChange={orchestrator.setSharedReviewer}
          onRationaleChange={orchestrator.setSharedRationale}
          onDecision={async (item, action, reviewer, rationale) => {
            await orchestrator.recordArtifactEligibilityDecision(
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
            <p>
              {orchestrator.activeCase === null
                ? "Typed synthetic demo candidates"
                : "Case-derived evidence review"}
            </p>
          </div>
          {orchestrator.activeCase === null ? (
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
          ) : null}
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
        <ArchitecturePolicyReview
          items={orchestrator.architecturePolicyItems}
          reviewer={orchestrator.sharedReviewer}
          rationale={orchestrator.sharedRationale}
          onReviewerChange={orchestrator.setSharedReviewer}
          onRationaleChange={orchestrator.setSharedRationale}
          onApprove={async (item) => {
            await orchestrator.recordArchitecturePolicyApproval(
              item,
              orchestrator.sharedReviewer,
              orchestrator.sharedRationale,
            );
          }}
        />
        <CaseControlsReview
          enabled={
            orchestrator.workspaceReady && orchestrator.activeCase !== null
          }
          message={orchestrator.caseControlsMessage}
          approved={orchestrator.caseControls}
          onApprove={orchestrator.recordCaseControls}
        />
        <ArchitectureStage
          enabled={
            orchestrator.workspaceReady && orchestrator.activeCase !== null
          }
          scenarioOptions={orchestrator.previewRules.map(
            (rule) => rule.affectedScope,
          )}
          tabOptions={orchestrator.populationItems.map(
            (item) => item.displayName,
          )}
          message={orchestrator.architectureBuildMessage}
          selection={orchestrator.architectureSelection}
          onApprove={orchestrator.recordArchitectureSelection}
          v1Ready={orchestrator.v1XlsxBytes !== null}
          onDownload={orchestrator.downloadV1Workbook}
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
            void orchestrator.exportFinalCaseworkOutputPackage();
          }}
        />
      </main>
    </div>
  );
}
