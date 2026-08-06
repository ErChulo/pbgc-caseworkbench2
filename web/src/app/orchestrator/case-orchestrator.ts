import { useRef, useState } from "react";

import {
  BrowserDirectoryWorkspace,
  openCaseWorkspace,
  saveCaseWorkspace,
} from "../../adapters/filesystem/case-workspace";
import { canonicalize } from "../../domain/manifests/canonical-json";
import { createPackageSnapshot } from "../../domain/attempts/snapshot";
import { hashChunkReader } from "../../workers/hash.worker";
import type { CaseRecord, WorkspaceCatalog } from "../../domain/case/case";
import { caseIndexEntry } from "../../domain/case/case";
import {
  CaseRegistry,
  type CaseCollision,
  type CollisionResolutionInput,
} from "../../domain/case/case-registry";
import {
  validateCaseIdentifier,
  type CaseIdentifierRule,
} from "../../domain/case/case-identifier";
import {
  parseUtcTimestamp,
  parseUuid,
  parseSha256,
  type Uuid,
} from "../../domain/shared/types";
import type { QuarantineDecision } from "../../domain/quarantine/models";
import type {
  ClassificationApproval,
  RelationshipDecision,
} from "../../domain/classification/models";
import { evidenceReviewDemo } from "../../components/evidence/demo-evidence";
import type { RuleAuthoringDraft } from "../../components/evidence/PlanRuleAuthor";
import type { ManifestExportSummary } from "../../components/inventory/ManifestExport";
import type { QuarantineQueueItem } from "../../components/quarantine/QuarantineQueue";
import type {
  ClassificationReviewItem,
  DateCandidateReviewItem,
} from "../../components/review/ClassificationReview";
import type { RelationshipReviewItem } from "../../components/review/RelationshipReview";
import type { PopulationReviewItem } from "../../components/review/PopulationReview";
import type {
  AuthorityOverride,
  PlanRuleRecord,
  UnresolvedItem,
} from "../../domain/plan-rules/models";
import type { GovernanceDependencies } from "../../domain/plan-rules/rule-authoring";
import { resolveItem } from "../../domain/plan-rules/unresolved-items";
import { authorRule } from "../../domain/plan-rules/rule-authoring";
import type {
  CaseworkOutputArtifactInput,
  FinalCaseworkOutputInput,
} from "../../domain/case-output/models";
import type { DraftV1SummaryArtifact } from "../../domain/draft-v1-summary/models";
import type { CaseOutputArtifactLinkDraft } from "../../components/case-output/CaseOutputPackagePanel";
import { createDraftV1SummaryArtifact } from "../../domain/draft-v1-summary/draft-builder";
import { validateContract } from "../../contracts/schema-validator";

import { quarantineDecisionContentHash } from "../../domain/quarantine/release-service";
import {
  classificationDecisionContentHash,
  replayClassificationApprovals,
} from "../../domain/classification/classification-review";
import {
  relationshipDecisionContentHash,
  replayRelationshipDecisions,
} from "../../domain/classification/relationship-service";
import {
  populationDecisionContentHash,
  replayPopulationCandidateDecisions,
  type PopulationCandidateDecision,
} from "../../domain/population/population-profile";
import { validateDateSelection } from "../../domain/classification/date-candidates";
import { bytesReader, readAllBytes } from "../utilities/file-readers";
import {
  createFinalOutputInput,
  parseCaseOutputArtifactReferences,
  compareCaseOutputArtifacts,
  normalizeWorkspacePath,
} from "../utilities/case-output-helpers";

interface InventoryCheckpointReference {
  readonly attemptId: Uuid;
  readonly snapshot: Awaited<ReturnType<typeof createPackageSnapshot>>;
}

type EvidenceReviewView = "catalog" | "candidates" | "rules" | "unresolved";

const identifierRule: CaseIdentifierRule = {
  ruleId: "pbgc-case-id-basic",
  ruleVersion: "1.0.0",
  minimumLength: 3,
  maximumLength: 64,
  syntax: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
  unicodeNormalization: "NFC",
  letterCase: "preserve",
};

const EMPTY_AUTHORITY_OVERRIDES: readonly AuthorityOverride[] = [];
const SYNTHETIC_RULE_SCOPE = "benefit/accrual-freeze/participant-group";

const dependencies = {
  uuid: {
    generate: () => {
      const parsed = parseUuid(globalThis.crypto.randomUUID());
      if (!parsed.ok) throw new Error("Browser UUID generation failed.");
      return parsed.value;
    },
  },
  clock: {
    now: () => {
      const parsed = parseUtcTimestamp(new Date().toISOString());
      if (!parsed.ok) throw new Error("Browser clock generation failed.");
      return parsed.value;
    },
  },
};

function createSessionGovernanceDependencies(): GovernanceDependencies {
  let sequence = 500;
  return {
    now: () => "2026-07-29T13:00:00.000Z",
    uuid: () => {
      sequence += 1;
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
    },
  };
}

interface SessionPreviewOutcome {
  readonly kind: "success" | "error";
  readonly message: string;
}

export interface CaseOrchestrator {
  readonly workspaceReady: boolean;
  readonly workspaceLabel: string;
  readonly workspaceError: string | null;
  readonly activeCase: CaseRecord | null;
  readonly error: string | null;
  readonly busy: boolean;
  readonly quarantineItems: readonly QuarantineQueueItem[];
  readonly classificationItems: readonly ClassificationReviewItem[];
  readonly dateCandidateItems: readonly DateCandidateReviewItem[];
  readonly relationshipItems: readonly RelationshipReviewItem[];
  readonly populationItems: readonly PopulationReviewItem[];
  readonly manifestSummary: ManifestExportSummary | null;
  readonly sharedReviewer: string;
  readonly sharedRationale: string;
  readonly evidenceReviewView: EvidenceReviewView;
  readonly evidenceUnresolvedItems: readonly UnresolvedItem[];
  readonly previewRules: readonly PlanRuleRecord[];
  readonly ruleAuthoringOutcome: SessionPreviewOutcome | null;
  readonly ruleAuthoringBusy: boolean;
  readonly caseOutputExportMessage: string | null;
  readonly caseOutputLinkMessage: string | null;
  readonly caseOutputArtifacts: readonly CaseworkOutputArtifactInput[];
  readonly draftV1Summary: DraftV1SummaryArtifact | null;
  readonly draftV1SummaryMessage: string | null;
  readonly finalOutputInput: FinalCaseworkOutputInput | null;
  readonly setSharedReviewer: (value: string) => void;
  readonly setSharedRationale: (value: string) => void;
  readonly setEvidenceReviewView: (view: EvidenceReviewView) => void;
  readonly selectWorkspace: () => Promise<void>;
  readonly createProduction: (input: {
    readonly authoritativeCaseId: string;
    readonly actor: {
      readonly actorType: "human";
      readonly actorKey: string;
      readonly displayName: string;
      readonly authorityContext: string;
    };
  }) => Promise<void>;
  readonly resolveCollision: (
    collision: CaseCollision,
    input: CollisionResolutionInput,
  ) => Promise<void>;
  readonly resetEvidenceSessionPreview: () => void;
  readonly recordUnresolvedAction: (
    item: UnresolvedItem,
    action: string,
    interpretationId: string | null,
    reviewer: string,
    rationale: string,
  ) => Promise<{ ok: boolean; message: string }>;
  readonly recordRuleAuthoring: (draft: RuleAuthoringDraft) => Promise<void>;
  readonly recordQuarantineDecision: (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordClassificationDecision: (
    item: ClassificationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordRelationshipDecision: (
    item: RelationshipReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordDateSelection: (
    item: DateCandidateReviewItem,
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly recordPopulationDecision: (
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ) => Promise<void>;
  readonly linkCaseOutputArtifact: (
    draft: CaseOutputArtifactLinkDraft,
  ) => Promise<void>;
  readonly exportFinalCaseworkOutputPackage: () => void;
  readonly exportCurrentManifest: () => Promise<void>;
  readonly generateDraftV1Summary: (file: File) => Promise<void>;
  readonly setError: (error: string | null) => void;
  readonly setView: (view: unknown) => void;
  readonly view: unknown;
}

export function useCaseOrchestrator(
  evidenceGovernanceDependencies?: GovernanceDependencies,
): CaseOrchestrator {
  const workspace = useRef<BrowserDirectoryWorkspace | null>(null);
  const catalog = useRef<WorkspaceCatalog | null>(null);
  const registry = useRef<CaseRegistry | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState(
    "Select an approved local directory. No case data leaves this device.",
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [view, setView] = useState<unknown>({ kind: "ready" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null);
  const priorSnapshot = useRef<ReturnType<typeof createPackageSnapshot> | null>(
    null,
  );
  const inventoryCheckpoints = useRef(
    new Map<string, InventoryCheckpointReference>(),
  );
  const lastCheckpoint = useRef<InventoryCheckpointReference | null>(null);
  const quarantineHistory = useRef(new Map<string, QuarantineDecision[]>());
  const classificationHistory = useRef(
    new Map<string, ClassificationApproval[]>(),
  );
  const relationshipHistory = useRef(new Map<string, RelationshipDecision[]>());
  const populationHistory = useRef(
    new Map<string, PopulationCandidateDecision[]>(),
  );
  const [quarantineItems, setQuarantineItems] = useState<
    readonly QuarantineQueueItem[]
  >([]);
  const [classificationItems, setClassificationItems] = useState<
    readonly ClassificationReviewItem[]
  >([]);
  const [dateCandidateItems, setDateCandidateItems] = useState<
    readonly DateCandidateReviewItem[]
  >([]);
  const [relationshipItems, setRelationshipItems] = useState<
    readonly RelationshipReviewItem[]
  >([]);
  const [populationItems, setPopulationItems] = useState<
    readonly PopulationReviewItem[]
  >([]);
  const [manifestSummary] = useState<ManifestExportSummary | null>(null);
  const [sharedReviewer, setSharedReviewer] = useState("");
  const [sharedRationale, setSharedRationale] = useState("");
  const [evidenceReviewView, setEvidenceReviewView] =
    useState<EvidenceReviewView>("catalog");
  const [evidenceUnresolvedItems, setEvidenceUnresolvedItems] = useState<
    readonly UnresolvedItem[]
  >(() => evidenceReviewDemo.unresolvedItems);
  const [evidenceUnresolvedRecords, setEvidenceUnresolvedRecords] = useState<
    readonly UnresolvedItem[]
  >(() => evidenceReviewDemo.unresolvedItems);
  const [previewRules, setPreviewRules] = useState<readonly PlanRuleRecord[]>(
    [],
  );
  const [ruleAuthoringOutcome, setRuleAuthoringOutcome] =
    useState<SessionPreviewOutcome | null>(null);
  const [ruleAuthoringBusy, setRuleAuthoringBusy] = useState(false);
  const [caseOutputExportMessage, setCaseOutputExportMessage] = useState<
    string | null
  >(null);
  const [caseOutputLinkMessage, setCaseOutputLinkMessage] = useState<
    string | null
  >(null);
  const [caseOutputArtifacts, setCaseOutputArtifacts] = useState<
    readonly CaseworkOutputArtifactInput[]
  >([]);
  const [draftV1Summary, setDraftV1Summary] =
    useState<DraftV1SummaryArtifact | null>(null);
  const [draftV1SummaryMessage, setDraftV1SummaryMessage] = useState<
    string | null
  >(null);
  const [sessionGovernanceDependencies, setSessionGovernanceDependencies] =
    useState<GovernanceDependencies>(createSessionGovernanceDependencies);
  const activeGovernanceDependencies =
    evidenceGovernanceDependencies ?? sessionGovernanceDependencies;

  const activateCase = (caseRecord: CaseRecord) => {
    if (activeCase?.caseId !== caseRecord.caseId) {
      priorSnapshot.current = null;
      inventoryCheckpoints.current.clear();
      lastCheckpoint.current = null;
      setCaseOutputArtifacts([]);
      setCaseOutputLinkMessage(null);
      setCaseOutputExportMessage(null);
      setDraftV1Summary(null);
      setDraftV1SummaryMessage(null);
    }
    setActiveCase(caseRecord);
    void loadCaseOutputArtifactReferences(caseRecord);
    void loadDraftV1SummaryArtifact(caseRecord);
  };

  const selectWorkspace = async (): Promise<void> => {
    setBusy(true);
    setWorkspaceError(null);
    try {
      const picker = (
        globalThis as typeof globalThis & {
          showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker;
      if (typeof picker !== "function") {
        setWorkspaceError(
          "This browser cannot select a production local workspace. Use an approved Chromium or Edge profile.",
        );
        return;
      }
      const handle = await picker();
      const selected = new BrowserDirectoryWorkspace(handle);
      const index = await selected.stat("case-index.json");
      if (index.ok) {
        const opened = await openCaseWorkspace(selected);
        if (!opened.ok) {
          setWorkspaceError(opened.error.safeMessage);
          return;
        }
        catalog.current = opened.value.catalog;
        registry.current = new CaseRegistry(dependencies, opened.value.cases);
      } else if (index.error.code === "NOT_FOUND") {
        catalog.current = {
          schemaVersion: "1.0.0",
          workspaceId: dependencies.uuid.generate(),
          createdAt: dependencies.clock.now(),
          cases: [],
        };
        registry.current = new CaseRegistry(dependencies);
      } else {
        setWorkspaceError(
          "The selected workspace could not be read safely. No workspace files were changed.",
        );
        return;
      }
      workspace.current = selected;
      setWorkspaceReady(true);
      setWorkspaceLabel(`Selected local workspace: ${handle.name}`);
    } catch {
      setWorkspaceError(
        "Workspace selection was cancelled or could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createProduction = async ({
    authoritativeCaseId,
    actor,
  }: {
    readonly authoritativeCaseId: string;
    readonly actor: {
      readonly actorType: "human";
      readonly actorKey: string;
      readonly displayName: string;
      readonly authorityContext: string;
    };
  }): Promise<void> => {
    setError(null);
    const activeRegistry = registry.current;
    if (!workspaceReady || activeRegistry === null) {
      setError("Select an approved local workspace before creating a case.");
      return;
    }
    const validated = validateCaseIdentifier(
      authoritativeCaseId,
      identifierRule,
    );
    if (!validated.ok) {
      setError(validated.error.safeMessage);
      return;
    }
    setBusy(true);
    const before = activeRegistry.cases();
    const result = activeRegistry.create({
      authoritativeCaseId: validated.value.value,
      purpose: "production",
      designationRationale: null,
      createdBy: actor,
    });
    if (result.kind === "rejected") {
      setError(result.error.safeMessage);
    } else if (result.kind === "collision") {
      setView({ kind: "collision", collision: result });
    } else if (!(await persistCreatedCase(result.caseRecord))) {
      registry.current = new CaseRegistry(dependencies, before);
    } else {
      setView({
        kind: "created",
        caseRecord: result.caseRecord,
        message: "Production case created",
        collisionDecisionRecorded: false,
      });
      activateCase(result.caseRecord);
    }
    setBusy(false);
  };

  const resolveCollision = async (
    collision: CaseCollision,
    input: CollisionResolutionInput,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    const activeRegistry = registry.current;
    if (activeRegistry === null) {
      setError("The local case registry is unavailable.");
      setBusy(false);
      return;
    }
    const before = activeRegistry.cases();
    const resolution = activeRegistry.resolveCollision(collision, input);
    if (!resolution.ok) {
      setError(resolution.error.safeMessage);
      setBusy(false);
      return;
    }
    if (!(await persistDecision(resolution.value.decision))) {
      registry.current = new CaseRegistry(dependencies, before);
      setBusy(false);
      return;
    }
    if (resolution.value.kind === "resumed-existing") {
      setView({
        kind: "resumed",
        caseRecord: collision.existingCase,
        message: "Resume decision recorded",
      });
      activateCase(collision.existingCase);
    } else if (await persistCreatedCase(resolution.value.caseRecord)) {
      setView({
        kind: "created",
        caseRecord: resolution.value.caseRecord,
        message: `${resolution.value.caseRecord.purpose} case created`,
        collisionDecisionRecorded: true,
      });
      activateCase(resolution.value.caseRecord);
    } else {
      registry.current = new CaseRegistry(dependencies, before);
    }
    setBusy(false);
  };

  const persistCreatedCase = async (
    caseRecord: CaseRecord,
  ): Promise<boolean> => {
    const activeWorkspace = workspace.current;
    const activeCatalog = catalog.current;
    if (activeWorkspace === null || activeCatalog === null) {
      setError("The selected local workspace is unavailable.");
      return false;
    }
    const nextCatalog: WorkspaceCatalog = {
      ...activeCatalog,
      cases: [...activeCatalog.cases, caseIndexEntry(caseRecord)].sort(
        (left, right) => left.caseId.localeCompare(right.caseId),
      ),
    };
    const saved = await saveCaseWorkspace(
      activeWorkspace,
      nextCatalog,
      caseRecord,
    );
    if (!saved.ok) {
      setError(saved.error.safeMessage);
      return false;
    }
    catalog.current = nextCatalog;
    return true;
  };

  const persistDecision = async (
    decision: ReturnType<CaseRegistry["collisionHistory"]>[number],
  ): Promise<boolean> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) {
      setError("The selected local workspace is unavailable.");
      return false;
    }
    const bytes = new TextEncoder().encode(`${canonicalize(decision)}\n`);
    const saved = await activeWorkspace.append(
      "case-collision-decisions.jsonl",
      bytes,
    );
    if (!saved.ok) {
      setError("The collision decision could not be preserved locally.");
      return false;
    }
    return true;
  };

  const recordUnresolvedAction = async (
    item: UnresolvedItem,
    action: string,
    interpretationId: string | null,
    reviewer: string,
    rationale: string,
  ) => {
    const result = await resolveItem(
      item,
      action as "accept" | "reject" | "supersede" | "branch",
      interpretationId,
      rationale,
      {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "synthetic-session-preview",
      },
      activeGovernanceDependencies,
    );
    if (!result.ok) {
      return {
        ok: false,
        message: `Resolution validation failed: ${result.error}`,
      };
    }
    setEvidenceUnresolvedItems((current) => [
      ...current.map((candidate) =>
        candidate.itemId === item.itemId ? result.value.item : candidate,
      ),
      ...(result.value.branchedItem === null
        ? []
        : [result.value.branchedItem]),
    ]);
    setEvidenceUnresolvedRecords((current) => [
      ...current,
      result.value.item,
      ...(result.value.branchedItem === null
        ? []
        : [result.value.branchedItem]),
    ]);
    setRuleAuthoringOutcome(null);
    return {
      ok: true,
      message: `${action} passed governed validation in this synthetic session preview. The decision was not persisted.`,
    };
  };

  const recordRuleAuthoring = async (draft: RuleAuthoringDraft) => {
    setRuleAuthoringBusy(true);
    setRuleAuthoringOutcome(null);
    const selectedIds = new Set(draft.candidateIds);
    const selectedCandidates = evidenceReviewDemo.candidates
      .filter((entry) => selectedIds.has(entry.candidate.candidateId))
      .map((entry) => entry.candidate);
    const primaryCandidate = selectedCandidates.find(
      (candidate) =>
        candidate.artifactSha256 === draft.primaryCitation.artifactSha256 &&
        candidate.artifactLocator === draft.primaryCitation.artifactLocator,
    );
    const predecessor =
      draft.predecessorRuleId === null
        ? null
        : (previewRules.find(
            (rule) => rule.ruleId === draft.predecessorRuleId,
          ) ?? null);
    const result = await authorRule(
      {
        proposedCandidates: selectedCandidates,
        primaryCitation: draft.primaryCitation,
        catalog: evidenceReviewDemo.catalog,
        unresolvedRecords: evidenceUnresolvedRecords,
        authorityOverrides: EMPTY_AUTHORITY_OVERRIDES,
        governingRestatement: draft.governingRestatement,
        effectiveDate: draft.effectiveDate,
        endDate: null,
        adoptionOrExecutionDate:
          primaryCandidate?.extractedAdoptionDate ?? null,
        applicabilityConditions: [
          {
            dimension: draft.applicabilityDimension,
            value: draft.applicabilityValue,
            evidence: [draft.primaryCitation],
          },
        ],
        requiredApplicabilityDimensions: [draft.applicabilityDimension],
        affectedScope: SYNTHETIC_RULE_SCOPE,
        reviewer: {
          actorType: "human",
          actorKey: draft.reviewer,
          displayName: draft.reviewer,
          authorityContext: `synthetic-session-preview: ${draft.rationale}`,
        },
        approvalRationale: draft.rationale,
        confidence: Math.min(
          ...selectedCandidates.map((candidate) => candidate.confidence),
        ),
        predecessor,
        linkType: predecessor === null ? undefined : "supersession",
        ruleSetVersion: "feature-001-plan-rule-v1",
      },
      activeGovernanceDependencies,
    );
    if (!result.ok) {
      setRuleAuthoringOutcome({
        kind: "error",
        message: `${result.error.code}: ${result.error.message}`,
      });
      setRuleAuthoringBusy(false);
      return;
    }
    const persisted = await persistPlanRuleRecord(result.value);
    setPreviewRules((current) => [...current, result.value]);
    setRuleAuthoringOutcome({
      kind: "success",
      message: persisted
        ? `Governed validation passed and the plan-rule record was persisted locally for this case effective ${result.value.effectiveDate}.`
        : `Governed validation passed for a synthetic session preview effective ${result.value.effectiveDate}. Select a workspace and active case to persist rule records.`,
    });
    setCaseOutputExportMessage(null);
    setRuleAuthoringBusy(false);
  };

  const resetEvidenceSessionPreview = () => {
    if (evidenceGovernanceDependencies === undefined) {
      setSessionGovernanceDependencies(createSessionGovernanceDependencies());
    }
    setEvidenceUnresolvedItems(evidenceReviewDemo.unresolvedItems);
    setEvidenceUnresolvedRecords(evidenceReviewDemo.unresolvedItems);
    setPreviewRules([]);
    setRuleAuthoringOutcome(null);
    setRuleAuthoringBusy(false);
  };

  const recordQuarantineDecision = async (
    item: QuarantineQueueItem,
    action:
      "release" | "inherit-release" | "final-quarantine" | "reject" | "revoke",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    const artifactSha256 = parseSha256(item.artifactSha256);
    if (!artifactSha256.ok) throw new Error("Artifact hash is invalid.");
    const history = quarantineHistory.current.get(item.artifactSha256) ?? [];
    const prior = history.at(-1) ?? null;
    const resultingStatus =
      action === "release" || action === "inherit-release"
        ? ("released" as const)
        : action === "final-quarantine"
          ? ("final-quarantine" as const)
          : action === "reject"
            ? ("rejected" as const)
            : ("revoked" as const);
    const base = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      artifactSha256: artifactSha256.value,
      findingIds: Object.freeze([`ui-finding:${item.artifactSha256}`]),
      action,
      resultingStatus,
      ruleSetVersion: "feature-009-screening-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: QuarantineDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await quarantineDecisionContentHash(base),
      reviewer: {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted authorized reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
    };
    const path = `cases/${activeCase?.caseId ?? "unavailable"}/reviews/events.jsonl`;
    const saved = await activeWorkspace.append(
      path,
      new TextEncoder().encode(`${canonicalize(decision)}\n`),
    );
    if (!saved.ok) throw new Error("Decision could not be preserved.");
    quarantineHistory.current.set(item.artifactSha256, [...history, decision]);
    setQuarantineItems((current) =>
      current.map((candidate) =>
        candidate.artifactSha256 === item.artifactSha256
          ? {
              ...candidate,
              effectiveHumanStatus: resultingStatus,
              reviewer,
              rationale,
              nextAction:
                resultingStatus === "released"
                  ? "Evidence is released for governed processing; revocation remains available."
                  : "Disposition recorded. A later permitted typed decision requires predecessor linkage.",
            }
          : candidate,
      ),
    );
  };

  const recordClassificationDecision = async (
    item: ClassificationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    const history =
      classificationHistory.current.get(item.proposal.proposalKey) ?? [];
    const prior = history.at(-1) ?? null;
    const status =
      action === "approve"
        ? ("approved" as const)
        : action === "reject"
          ? ("rejected" as const)
          : action === "revoke"
            ? ("revoked" as const)
            : ("superseded" as const);
    const base = {
      appendOrdinal: history.length + 1,
      priorApprovalId: prior?.approvalId ?? null,
      priorApprovalContentSha256: prior?.decisionContentSha256 ?? null,
      proposalKey: item.proposal.proposalKey,
      artifactSha256: item.proposal.artifactSha256,
      decisionType: action,
      status,
      ruleSetVersion: "feature-009-classification-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: ClassificationApproval = {
      ...base,
      approvalId: dependencies.uuid.generate(),
      decisionContentSha256: await classificationDecisionContentHash(base),
      actor: {
        actorType: "human",
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted classification reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
    };
    const replay = await replayClassificationApprovals(item.proposal, [
      ...history,
      decision,
    ]);
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    await appendReviewEvent(decision);
    classificationHistory.current.set(item.proposal.proposalKey, [
      ...history,
      decision,
    ]);
    setClassificationItems((current) =>
      current.map((candidate) =>
        candidate.proposal.proposalKey === item.proposal.proposalKey
          ? {
              ...candidate,
              effectiveStatus: replay.value.status,
              reviewer,
              rationale,
              provenanceCount: replay.value.provenance.length,
            }
          : candidate,
      ),
    );
  };

  const recordRelationshipDecision = async (
    item: RelationshipReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    const key = item.relationship.relationshipKey;
    const history = relationshipHistory.current.get(key) ?? [];
    const prior = history.at(-1) ?? null;
    const resultingGovernedStatus =
      action === "approve"
        ? ("approved" as const)
        : action === "reject"
          ? ("rejected" as const)
          : action === "revoke"
            ? ("revoked" as const)
            : ("superseded" as const);
    const base: Omit<
      RelationshipDecision,
      | "decisionId"
      | "decisionContentSha256"
      | "actor"
      | "decidedAt"
      | "rationale"
      | "evidenceConsidered"
    > = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      relationshipKey: key,
      fromSha256: item.relationship.fromSha256,
      toSha256: item.relationship.toSha256,
      decisionType: action,
      resultingGovernedStatus,
      ruleSetVersion: "feature-009-classification-v1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: RelationshipDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await relationshipDecisionContentHash(base),
      actor: {
        actorType: "human" as const,
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted relationship reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
      evidenceConsidered: item.relationship.supportingEvidence,
    };
    const replay = await replayRelationshipDecisions(item.relationship, [
      ...history,
      decision,
    ]);
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    await appendReviewEvent(decision);
    relationshipHistory.current.set(key, [...history, decision]);
    setRelationshipItems((current) =>
      current.map((candidate) =>
        candidate.relationship.relationshipKey === key
          ? {
              ...candidate,
              effectiveStatus: replay.value.status,
              rationale,
              provenanceCount: replay.value.provenance.length,
            }
          : candidate,
      ),
    );
  };

  const recordDateSelection = async (
    item: DateCandidateReviewItem,
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    const decision = {
      decisionId: dependencies.uuid.generate(),
      artifactSha256: item.candidate.artifactSha256,
      selectedCandidateKey: item.candidate.candidateKey,
      actor: {
        actorType: "human" as const,
        actorKey: reviewer,
        displayName: reviewer,
        authorityContext: "Locally asserted date-candidate reviewer",
      },
      decidedAt: dependencies.clock.now(),
      rationale,
      ruleSetVersion: "feature-009-classification-v1",
    };
    const validation = validateDateSelection(
      dateCandidateItems.map((candidate) => candidate.candidate),
      decision,
    );
    if (!validation.ok) throw new Error(validation.error.safeMessage);
    await appendReviewEvent(decision);
    setDateCandidateItems((current) =>
      current.map((candidate) =>
        candidate.candidate.artifactSha256 === item.candidate.artifactSha256 &&
        candidate.candidate.dateKind === item.candidate.dateKind
          ? {
              ...candidate,
              selected:
                candidate.candidate.candidateKey ===
                item.candidate.candidateKey,
              reviewer:
                candidate.candidate.candidateKey === item.candidate.candidateKey
                  ? reviewer
                  : candidate.reviewer,
            }
          : candidate,
      ),
    );
  };

  const recordPopulationDecision = async (
    item: PopulationReviewItem,
    action: "approve" | "reject" | "revoke" | "supersede",
    reviewer: string,
    rationale: string,
  ): Promise<void> => {
    const key = item.candidate.candidateKey;
    const history = populationHistory.current.get(key) ?? [];
    const prior = history.at(-1) ?? null;
    const resultingStatus =
      action === "approve"
        ? ("approved" as const)
        : action === "reject"
          ? ("rejected" as const)
          : action === "revoke"
            ? ("revoked" as const)
            : ("superseded" as const);
    const base = {
      appendOrdinal: history.length + 1,
      priorDecisionId: prior?.decisionId ?? null,
      priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
      candidateKey: item.candidate.candidateKey,
      artifactSha256: item.candidate.artifactSha256,
      workbookProfileContentSha256: item.workbookProfileContentSha256,
      decisionType: action,
      resultingStatus,
      ruleSetVersion: "feature-009-population-v1",
      schemaVersion: "1.0.0",
    } as const;
    const decision: PopulationCandidateDecision = {
      ...base,
      decisionId: dependencies.uuid.generate(),
      decisionContentSha256: await populationDecisionContentHash(base),
      humanActor: {
        actorType: "human",
        actorId: reviewer,
        displayName: reviewer,
      },
      rationale,
      decisionTimestamp: dependencies.clock.now(),
    };
    const replay = await replayPopulationCandidateDecisions(
      item.candidate,
      item.workbookProfileContentSha256,
      [...history, decision],
    );
    if (!replay.ok) throw new Error(replay.error.safeMessage);
    await appendReviewEvent(decision);
    populationHistory.current.set(key, [...history, decision]);
    setPopulationItems((current) =>
      current.map((candidate) =>
        candidate.candidate.candidateKey === key
          ? { ...candidate, projection: replay.value }
          : candidate,
      ),
    );
  };

  const persistPlanRuleRecord = async (
    rule: PlanRuleRecord,
  ): Promise<boolean> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) return false;
    await activeWorkspace.createDirectory(
      `cases/${activeCase.caseId}/evidence`,
    );
    const saved = await activeWorkspace.append(
      `cases/${activeCase.caseId}/evidence/rule-records.jsonl`,
      new TextEncoder().encode(`${canonicalize(rule)}\n`),
    );
    if (!saved.ok) throw new Error("Plan-rule record could not be preserved.");
    await appendReviewEvent({
      eventType: "plan-rule-recorded",
      ruleId: rule.ruleId,
      ruleContentSha256: rule.ruleContentSha256,
      effectiveDate: rule.effectiveDate,
      recordedAt: dependencies.clock.now(),
      schemaVersion: "1.0.0",
    });
    return true;
  };

  const appendReviewEvent = async (event: object): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (!activeWorkspace) throw new Error("Workspace unavailable.");
    const saved = await activeWorkspace.append(
      `cases/${activeCase?.caseId ?? "unavailable"}/reviews/events.jsonl`,
      new TextEncoder().encode(`${canonicalize(event)}\n`),
    );
    if (!saved.ok) throw new Error("Review event could not be preserved.");
  };

  const loadCaseOutputArtifactReferences = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const opened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/outputs/artifact-references.json`,
    );
    if (!opened.ok) {
      if (opened.error.code !== "NOT_FOUND") {
        setCaseOutputLinkMessage(
          "Existing final-output artifact references could not be read.",
        );
      }
      return;
    }
    try {
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(opened.value),
        ),
      ) as unknown;
      setCaseOutputArtifacts(parseCaseOutputArtifactReferences(value));
    } catch {
      setCaseOutputLinkMessage(
        "Existing final-output artifact references are not valid JSON and were ignored.",
      );
    }
  };

  const loadDraftV1SummaryArtifact = async (
    caseRecord: CaseRecord,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) return;
    const opened = await activeWorkspace.openChunkReader(
      `cases/${caseRecord.caseId}/outputs/draft-v1-summary.json`,
    );
    if (!opened.ok) {
      if (opened.error.code !== "NOT_FOUND") {
        setDraftV1SummaryMessage(
          "Existing draft V1 summary artifact could not be read.",
        );
      }
      return;
    }
    try {
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readAllBytes(opened.value),
        ),
      ) as unknown;
      const validation = validateContract("draftV1Summary", value);
      if (!validation.valid) {
        setDraftV1SummaryMessage(
          "Existing draft V1 summary artifact failed runtime validation and was ignored.",
        );
        return;
      }
      setDraftV1Summary(value as DraftV1SummaryArtifact);
    } catch {
      setDraftV1SummaryMessage(
        "Existing draft V1 summary artifact is not valid UTF-8 JSON and was ignored.",
      );
    }
  };

  const generateDraftV1Summary = async (file: File): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) {
      setDraftV1SummaryMessage(
        "Select an active local case before generating a draft V1 summary.",
      );
      return;
    }
    setDraftV1SummaryMessage(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let r5Summary: unknown;
    try {
      r5Summary = JSON.parse(
        new TextDecoder("utf-8", { fatal: true })
          .decode(bytes)
          .replace(/^\uFEFF/u, ""),
      );
    } catch {
      setDraftV1SummaryMessage(
        "The selected R5 summary must be valid UTF-8 JSON.",
      );
      return;
    }
    const hashed = await hashChunkReader(bytesReader(bytes));
    if (!hashed.ok) {
      setDraftV1SummaryMessage(hashed.error.safeMessage);
      return;
    }
    const artifact = await createDraftV1SummaryArtifact({
      caseId: activeCase.caseId,
      r5Summary,
      r5SummaryContentSha256: hashed.value.sha256,
      r5SummaryFileName: file.name,
      generatedAt: dependencies.clock.now(),
      generatedBy: sharedReviewer.trim() === "" ? null : sharedReviewer.trim(),
    });
    const validation = validateContract("draftV1Summary", artifact);
    if (!validation.valid) {
      setDraftV1SummaryMessage(
        `Draft V1 summary failed runtime validation: ${validation.issues[0]?.message ?? "unknown issue"}`,
      );
      return;
    }
    await activeWorkspace.createDirectory(`cases/${activeCase.caseId}/outputs`);
    const storagePath = `cases/${activeCase.caseId}/outputs/draft-v1-summary.json`;
    const saved = await activeWorkspace.writeAtomic(
      storagePath,
      new TextEncoder().encode(`${canonicalize(artifact)}\n`),
    );
    if (!saved.ok) {
      setDraftV1SummaryMessage("Draft V1 summary artifact could not be saved.");
      return;
    }
    await appendReviewEvent({
      eventType: "draft-v1-summary-generated",
      artifactType: artifact.artifactType,
      draftContentSha256: artifact.contentSha256,
      r5SourceSha256: artifact.deterministicPayload.r5Source.contentSha256,
      selectedReferenceSha256:
        artifact.deterministicPayload.selectedScaffold.referenceContentSha256,
      generatedAt: artifact.operationalMetadata.generatedAt,
      schemaVersion: "1.0.0",
    });
    setDraftV1Summary(artifact);
    setDraftV1SummaryMessage(
      `Draft V1 summary saved to ${storagePath} with scaffold ${artifact.deterministicPayload.selectedScaffold.workbookName} and hash ${artifact.contentSha256}.`,
    );
  };

  const persistCaseOutputArtifactReferences = async (
    caseId: Uuid,
    references: readonly CaseworkOutputArtifactInput[],
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null) throw new Error("Workspace unavailable.");
    await activeWorkspace.createDirectory(`cases/${caseId}/outputs`);
    const saved = await activeWorkspace.writeAtomic(
      `cases/${caseId}/outputs/artifact-references.json`,
      new TextEncoder().encode(`${canonicalize(references)}\n`),
    );
    if (!saved.ok) {
      throw new Error("Final-output artifact references could not be saved.");
    }
  };

  const linkCaseOutputArtifact = async (
    draft: CaseOutputArtifactLinkDraft,
  ): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (activeWorkspace === null || activeCase === null) {
      setCaseOutputLinkMessage(
        "Select an active local case before linking output artifacts.",
      );
      return;
    }
    const artifactId = draft.artifactId.trim();
    const storagePath = normalizeWorkspacePath(draft.storagePath);
    const mediaType = draft.mediaType.trim();
    const description = draft.description.trim();
    if (
      artifactId === "" ||
      storagePath === null ||
      mediaType === "" ||
      description === ""
    ) {
      setCaseOutputLinkMessage(
        "Artifact type, ID, workspace path, media type, and description are required. Paths must be relative workspace paths without '..'.",
      );
      return;
    }
    const opened = await activeWorkspace.openChunkReader(storagePath);
    if (!opened.ok) {
      setCaseOutputLinkMessage(
        `Workspace artifact could not be opened at ${storagePath}.`,
      );
      return;
    }
    const hashed = await hashChunkReader(opened.value);
    if (!hashed.ok) {
      setCaseOutputLinkMessage(hashed.error.safeMessage);
      return;
    }
    const linked: CaseworkOutputArtifactInput = {
      artifactType: draft.artifactType,
      artifactId,
      contentSha256: hashed.value.sha256,
      mediaType,
      storagePath,
      description,
      maturityLevel: draft.maturityLevel,
    };
    const next = [
      ...caseOutputArtifacts.filter(
        (artifact) => artifact.artifactType !== linked.artifactType,
      ),
      linked,
    ].sort(compareCaseOutputArtifacts);
    await persistCaseOutputArtifactReferences(activeCase.caseId, next);
    setCaseOutputArtifacts(next);
    setCaseOutputExportMessage(null);
    setCaseOutputLinkMessage(
      `Linked ${linked.artifactType} from ${storagePath} with SHA-256 ${linked.contentSha256}.`,
    );
  };

  const exportCurrentManifest = async (): Promise<void> => {
    const activeWorkspace = workspace.current;
    if (!activeWorkspace || !activeCase || !manifestSummary)
      throw new Error("No local manifest is available for export.");
    await activeWorkspace.createDirectory(`cases/${activeCase.caseId}/exports`);
    const bytes = new TextEncoder().encode(
      `${canonicalize({
        deterministicManifestHash: manifestSummary.deterministicManifestHash,
        artifactCount: manifestSummary.artifactCount,
        validationCount: manifestSummary.validationCount,
        unresolvedCount: manifestSummary.unresolvedCount,
        accountingStatus: manifestSummary.accountingStatus,
        lineage: manifestSummary.lineage,
      })}\n`,
    );
    const saved = await activeWorkspace.writeAtomic(
      `cases/${activeCase.caseId}/exports/evidence-manifest.json`,
      bytes,
    );
    if (!saved.ok) throw new Error("Local manifest export failed.");
  };

  const exportFinalCaseworkOutputPackage = () => {
    setCaseOutputExportMessage("Export not yet implemented in this phase.");
  };

  const finalOutputInput: FinalCaseworkOutputInput | null = activeCase
    ? createFinalOutputInput({
        caseRecord: activeCase,
        manifestSummary,
        previewRules,
        populationItems,
        caseOutputArtifacts,
        unresolvedItems: evidenceUnresolvedItems,
        createdAt: dependencies.clock.now(),
        createdBy: sharedReviewer.trim() === "" ? null : sharedReviewer.trim(),
      })
    : null;

  return {
    workspaceReady,
    workspaceLabel,
    workspaceError,
    activeCase,
    error,
    busy,
    quarantineItems,
    classificationItems,
    dateCandidateItems,
    relationshipItems,
    populationItems,
    manifestSummary,
    sharedReviewer,
    sharedRationale,
    evidenceReviewView,
    evidenceUnresolvedItems,
    previewRules,
    ruleAuthoringOutcome,
    ruleAuthoringBusy,
    caseOutputExportMessage,
    caseOutputLinkMessage,
    caseOutputArtifacts,
    draftV1Summary,
    draftV1SummaryMessage,
    finalOutputInput,
    setSharedReviewer,
    setSharedRationale,
    setEvidenceReviewView,
    selectWorkspace,
    createProduction,
    resolveCollision,
    resetEvidenceSessionPreview,
    recordUnresolvedAction,
    recordRuleAuthoring,
    recordQuarantineDecision,
    recordClassificationDecision,
    recordRelationshipDecision,
    recordDateSelection,
    recordPopulationDecision,
    linkCaseOutputArtifact,
    exportFinalCaseworkOutputPackage,
    exportCurrentManifest,
    generateDraftV1Summary,
    setError,
    setView,
    view,
  };
}
