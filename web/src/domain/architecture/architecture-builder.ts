import type { EvidenceCatalog } from "../evidence/models";
import type {
  PopulationCandidateDecision,
  PopulationEvidenceObservation,
} from "../population/population-profile";
import {
  replayPopulationCandidateDecisions,
  validatePopulationEvidence,
} from "../population/population-profile";
import { workbookProfileContentHash } from "../population/workbook-adapter";
import type {
  AuthorityOverride,
  Interpretation,
  PlanRuleRecord,
} from "../plan-rules/models";
import type { CreateUnresolvedItemInput } from "../plan-rules/unresolved-items";
import { unresolvedItemEmitters } from "../plan-rules/unresolved-items";
import {
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Uuid,
} from "../shared/types";
import { computeArchitectureContentSha256 } from "./workspace-adapter";
import { computeDependencies } from "./dependency-graph";
import { createFieldNameGlossary } from "./field-name-glossary";
import { buildFieldInventory, extractNamedRanges } from "./field-inventory";
import { classifyIoB } from "./iob-classifier";
import {
  architectureSchemaVersion,
  type ArchitectureBuildError,
  type ArchitectureUnresolvedItem,
  type V1Architecture,
  type V1ArchitectureContent,
} from "./models";
import {
  effectivePolicyApproval,
  policyContentHash,
  type LoadedRuleSets,
  type PolicyApprovalContext,
  type RuleSet,
} from "./rule-loader";
import {
  selectScenarios,
  type AuthenticatedCaseControls,
  type ScenarioSelectionDependencies,
} from "./scenario-selector";
import { selectTabs, type ArchitecturePopulation } from "./tab-selector";
import type { ArchitecturePopulationCandidate } from "./tab-selector";
import type { ArchitecturePolicyProjection } from "./architecture-policy-approval";

export type ArchitectureBuilderDependencies = ScenarioSelectionDependencies;

export interface ArchitectureBuilderInput {
  readonly caseId: Uuid;
  readonly planRules: readonly PlanRuleRecord[];
  readonly evidenceCatalog: EvidenceCatalog;
  readonly authorityOverrides: readonly AuthorityOverride[];
  readonly population: {
    readonly candidates: readonly (Omit<
      ArchitecturePopulationCandidate,
      "governance" | "workbookProfileContentSha256"
    > & {
      readonly evidenceObservations: readonly PopulationEvidenceObservation[];
      readonly decisions: readonly PopulationCandidateDecision[];
    })[];
  };
  readonly caseControls: AuthenticatedCaseControls;
  readonly policies: LoadedRuleSets;
  readonly policyApprovals: Pick<PolicyApprovalContext, "decisions">;
  readonly dependencies: ArchitectureBuilderDependencies;
}

export interface ArchitectureBuilderResult {
  readonly architecture: V1Architecture;
  readonly unresolvedItems: readonly [];
}

export async function buildArchitecture(
  input: ArchitectureBuilderInput,
): Promise<Result<ArchitectureBuilderResult, ArchitectureBuildError>> {
  const policyValidation = await validatePolicies(input.policies, {
    evidenceCatalog: input.evidenceCatalog,
    decisions: input.policyApprovals.decisions,
  });
  if (!policyValidation.ok)
    return failure("INVALID_RULE_SET", policyValidation.error);
  const populationValidation = await validatePopulation(input);
  if (!populationValidation.ok)
    return failure("INVALID_RULE_SET", populationValidation.error);
  const population = populationValidation.value.population;

  const selectedScenarios = await selectScenarios({
    planRules: input.planRules,
    evidenceCatalog: input.evidenceCatalog,
    authorityOverrides: input.authorityOverrides,
    caseControls: input.caseControls,
    population,
    scenarioPolicy: input.policies.scenarioSelection,
    dependencies: input.dependencies,
  });
  const scenarioBlockers: ArchitectureUnresolvedItem[] = [];
  let selectedRuns;
  if (selectedScenarios.ok) selectedRuns = selectedScenarios.value;
  else {
    if (selectedScenarios.error.code !== "SCENARIO_CONFLICT")
      return selectedScenarios;
    selectedRuns = selectedScenarios.error.partialRuns;
    scenarioBlockers.push(...selectedScenarios.error.unresolvedItems);
  }

  const tabOutcome = selectTabs({
    population,
    tabPolicy: input.policies.tabSelection.rules,
  });
  const tabNames = tabOutcome.tabs
    .filter((tab) => tab.role === "population")
    .map((tab) => tab.tabName);
  const runs = selectedRuns.map((run) => ({
    ...run,
    applicableTabs: tabNames,
  }));
  const glossary = createFieldNameGlossary(
    input.policies.fieldNameGlossary.entries,
  );
  const inventory = buildFieldInventory({
    tabs: tabOutcome.tabs,
    scenarios: runs,
    population,
    glossary,
  });
  const cells = classifyIoB({
    cells: inventory.cells,
    scenarios: runs,
    iobPolicy: input.policies.iobClassification.rules,
    ruleVersion: input.policies.iobClassification.version,
  });
  const namedRanges = extractNamedRanges(tabOutcome.tabs, population, glossary);
  const dependencyResult = computeDependencies({
    cells,
    scenarios: runs,
    namedRanges,
  });

  const unresolvedItems: ArchitectureUnresolvedItem[] = [
    ...scenarioBlockers,
    ...tabOutcome.unresolvedItems,
    ...inventory.unresolvedItems,
    ...unclassifiedItems(cells),
    ...(dependencyResult.ok
      ? []
      : "unresolvedItems" in dependencyResult.error
        ? (dependencyResult.error.unresolvedItems ?? [])
        : []),
  ];
  if (runs.length === 0)
    unresolvedItems.push(
      missingValue(
        "architecture/runs",
        "No governed scenario applies to the authenticated inputs.",
      ),
    );
  if (cells.size === 0)
    unresolvedItems.push(
      missingValue(
        "architecture/cells",
        "No observed and mapped workbook fields are available for the selected tabs.",
      ),
    );
  if (unresolvedItems.length > 0) return blocked(unresolvedItems);
  if (!dependencyResult.ok) return dependencyResult;

  const identity = parseUuid(input.dependencies.uuid());
  const builtAt = parseUtcTimestamp(input.dependencies.now());
  if (!identity.ok || !builtAt.ok)
    return failure(
      "HASH_COMPUTATION_FAILED",
      "Injected architecture identity or build timestamp is invalid.",
    );

  const content: V1ArchitectureContent = {
    caseId: input.caseId,
    schemaVersion: architectureSchemaVersion,
    ruleSetVersion: input.policies.scenarioSelection.version,
    lineage: {
      policies: policyValidation.value.map(({ policy, approval }) => ({
        policyKind: policy.kind,
        policyVersion: policy.version,
        policyContentSha256: policy.policyContentSha256,
        sourceFileSha256: policy.sourceFileSha256,
        approvalDecisionId: requireValue(approval.effectiveDecisionId),
        approvalDecisionContentSha256: requireValue(
          approval.effectiveDecisionContentSha256,
        ),
      })),
      evidenceCatalogId: input.evidenceCatalog.catalogId,
      evidenceCatalogContentSha256: input.evidenceCatalog.catalogContentSha256,
      population: populationValidation.value.lineage,
      caseControls: [
        {
          controlId: input.caseControls.controlId,
          contentSha256: input.caseControls.caseControlContentSha256,
        },
      ],
      authorityOverrides: input.authorityOverrides
        .filter((override) =>
          input.planRules.some(
            (rule) => rule.authorityOverrideId === override.overrideId,
          ),
        )
        .map((override) => ({
          overrideId: override.overrideId,
          contentSha256: override.overrideContentSha256,
        })),
    },
    sourceTabs: tabOutcome.tabs,
    runs,
    cells,
    formulaDependencies: dependencyResult.value,
    namedRanges,
  };
  const architecture: V1Architecture = {
    architectureId: identity.value,
    builtAt: builtAt.value,
    ...content,
    architectureContentSha256: computeArchitectureContentSha256(content),
  };
  return { ok: true, value: { architecture, unresolvedItems: [] } };
}

async function validatePolicies(
  policies: LoadedRuleSets,
  approvals: PolicyApprovalContext,
) {
  const ruleSets: readonly RuleSet[] = [
    policies.scenarioSelection,
    policies.tabSelection,
    policies.iobClassification,
    policies.fieldNameGlossary,
  ];
  const projections: {
    readonly policy: RuleSet;
    readonly approval: ArchitecturePolicyProjection;
  }[] = [];
  for (const policy of ruleSets) {
    if (policyContentHash(policy) !== policy.policyContentSha256)
      return {
        ok: false as const,
        error: `${policy.kind} policy content hash is invalid.`,
      };
    const approval = await effectivePolicyApproval(policy, approvals);
    if (!approval.ok)
      return { ok: false as const, error: `${policy.kind} ${approval.error}.` };
    projections.push({ policy, approval: approval.value });
  }
  if (new Set(ruleSets.map((policy) => policy.version)).size !== 1)
    return {
      ok: false as const,
      error: "Architecture policies do not share one rule-set version.",
    };
  return { ok: true as const, value: projections };
}

async function validatePopulation(input: ArchitectureBuilderInput) {
  const artifactHashes = [
    ...input.evidenceCatalog.caseEvidence,
    ...input.evidenceCatalog.referenceOnly,
  ]
    .filter((artifact) => artifact.reviewStatus === "released")
    .map((artifact) => artifact.sha256);
  const candidates: ArchitecturePopulation["candidates"][number][] = [];
  const lineage: V1ArchitectureContent["lineage"]["population"][number][] = [];
  for (const binding of input.population.candidates) {
    const evidence = await validatePopulationEvidence(
      binding.candidate,
      binding.evidenceObservations,
      artifactHashes,
    );
    if (!evidence.ok)
      return { ok: false as const, error: evidence.error.safeMessage };
    const replay = await replayPopulationCandidateDecisions(
      binding.candidate,
      await workbookProfileContentHash(
        binding.workbook,
        binding.namedRanges ?? [],
      ),
      binding.decisions,
    );
    if (!replay.ok)
      return { ok: false as const, error: replay.error.safeMessage };
    const effective = binding.decisions.at(-1);
    if (
      replay.value.status !== "approved" ||
      effective?.decisionId !== replay.value.effectiveDecisionId
    )
      return {
        ok: false as const,
        error: "Population candidate has no effective non-revoked approval.",
      };
    candidates.push({
      candidate: binding.candidate,
      governance: replay.value,
      workbook: binding.workbook,
      workbookProfileContentSha256: effective.workbookProfileContentSha256,
      ...(binding.namedRanges === undefined
        ? {}
        : { namedRanges: binding.namedRanges }),
    });
    lineage.push({
      candidateKey: binding.candidate.candidateKey,
      artifactSha256: binding.candidate.artifactSha256,
      workbookProfileContentSha256: effective.workbookProfileContentSha256,
      approvalDecisionId: effective.decisionId,
      approvalDecisionContentSha256: effective.decisionContentSha256,
    });
  }
  return {
    ok: true as const,
    value: { population: { candidates }, lineage },
  };
}

function requireValue<Value>(value: Value | null): Value {
  if (value === null) throw new Error("Validated approval is missing lineage.");
  return value;
}

function unclassifiedItems(
  cells: V1ArchitectureContent["cells"],
): readonly CreateUnresolvedItemInput[] {
  return [...cells.values()].flatMap((cell) =>
    [...cell.perRunClassification.values()].flatMap((classification) =>
      classification.iob === ""
        ? [
            unresolvedItemEmitters["ambiguous-source-role"]({
              affectedScope: `architecture/cell/${cell.key}/run/${classification.runId}`,
              competingInterpretations: reviewAlternatives(),
              consequence:
                "The field cannot enter the architecture without an approved I/O/B classification.",
              reviewer: null,
            }),
          ]
        : [],
    ),
  );
}

function missingValue(
  affectedScope: string,
  consequence: string,
): CreateUnresolvedItemInput {
  return unresolvedItemEmitters["missing-required-value"]({
    affectedScope,
    competingInterpretations: reviewAlternatives(),
    consequence,
    reviewer: null,
  });
}

function reviewAlternatives(): readonly Interpretation[] {
  return [
    {
      interpretationId: "00000000-0000-4000-8000-000000000421" as Uuid,
      statement:
        "Exclude the affected scope until approved source data is available.",
      evidence: [],
      sourceCandidateId: null,
    },
    {
      interpretationId: "00000000-0000-4000-8000-000000000422" as Uuid,
      statement:
        "A human reviewer supplies the required governed input before replay.",
      evidence: [],
      sourceCandidateId: null,
    },
  ];
}

function blocked(
  unresolvedItems: readonly ArchitectureUnresolvedItem[],
): Result<never, ArchitectureBuildError> {
  return {
    ok: false,
    error: {
      code: "ARCHITECTURE_BLOCKED",
      message: "Material unresolved items block architecture selection.",
      unresolvedItems: [...unresolvedItems].sort((left, right) =>
        `${left.affectedScope}\u0000${left.consequence}`.localeCompare(
          `${right.affectedScope}\u0000${right.consequence}`,
        ),
      ),
    },
  };
}

function failure(
  code: "INVALID_RULE_SET" | "HASH_COMPUTATION_FAILED",
  message: string,
): Result<never, ArchitectureBuildError> {
  return { ok: false, error: { code, message } };
}
