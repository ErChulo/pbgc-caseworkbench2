import { hashTyped } from "../manifests/canonical-json";
import { parseSha256 } from "../shared/types";
import type { Sha256 } from "../shared/types";
import type {
  CaseworkLineageEdge,
  CaseworkMaturityClaim,
  CaseworkMaturityLevel,
  CaseworkOutputArtifactInput,
  CaseworkOutputArtifactReference,
  CaseworkOutputStage,
  CaseworkOutputStageKey,
  FinalCaseworkOutputDeterministicPayload,
  FinalCaseworkOutputInput,
  FinalCaseworkOutputPackage,
} from "./models";

const stageOrder: readonly {
  readonly stageKey: CaseworkOutputStageKey;
  readonly label: string;
}[] = [
  { stageKey: "evidence", label: "Evidence manifest" },
  { stageKey: "plan-rules", label: "Effective-dated plan rules" },
  { stageKey: "population-profile", label: "Population profile" },
  { stageKey: "v1-architecture", label: "V1 architecture" },
  { stageKey: "build-spec", label: "BuildSpec 2.0.0" },
  { stageKey: "compiled-formulas", label: "Compiled formulas" },
  { stageKey: "workbook", label: "Generated V1 workbook" },
  {
    stageKey: "validation-reconciliation",
    label: "Validation and reconciliation",
  },
  { stageKey: "section-436", label: "Section 436 evaluation" },
];

export function buildFinalCaseworkOutputPayload(
  input: FinalCaseworkOutputInput,
): FinalCaseworkOutputDeterministicPayload {
  const artifacts = artifactReferences(input);
  const stages = buildStages(input, artifacts);
  const packageStatus = stages.some(
    (stage) => stage.required && stage.status === "blocked",
  )
    ? "blocked"
    : "complete";

  return deepFreeze({
    schemaVersion: "1.0.0",
    caseId: input.caseId,
    packagePurpose: "production-v1-casework-output",
    packageStatus,
    section436Required: input.section436Required,
    stages,
    artifacts,
    unresolvedItems: [...input.unresolvedItems].sort((left, right) =>
      left.itemId.localeCompare(right.itemId),
    ),
    maturityClaims: maturityClaims(stages),
    lineage: lineageEdges(artifacts),
  });
}

export async function createFinalCaseworkOutputPackage(
  input: FinalCaseworkOutputInput,
): Promise<FinalCaseworkOutputPackage> {
  const deterministicPayload = buildFinalCaseworkOutputPayload(input);
  const parsedHash = parseSha256(
    await hashTyped(deterministicPayload, {
      typeName: "FinalCaseworkOutputPackage",
    }),
  );
  if (!parsedHash.ok) {
    throw new Error(parsedHash.error.message);
  }

  return deepFreeze({
    schemaVersion: "1.0.0",
    artifactType: "final-casework-output-package",
    deterministicPayload,
    contentSha256: parsedHash.value,
    operationalMetadata: {
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      generatorVersion: "case-output-package-v1.0.0",
    },
  });
}

function artifactReferences(
  input: FinalCaseworkOutputInput,
): readonly CaseworkOutputArtifactReference[] {
  const references: CaseworkOutputArtifactReference[] = [];

  if (input.evidenceManifestSha256 !== null) {
    references.push({
      artifactType: "evidence-manifest",
      artifactId: "evidence-manifest",
      contentSha256: input.evidenceManifestSha256,
      mediaType: "application/json",
      storagePath: null,
      description: "Deterministic evidence manifest exported from intake.",
    });
  }

  references.push(
    ...input.planRules.map((rule) => ({
      artifactType: "plan-rule-record" as const,
      artifactId: rule.ruleId,
      contentSha256: rule.ruleContentSha256,
      mediaType: "application/jsonl",
      storagePath: rule.storagePath ?? null,
      description: "Human-approved effective-dated plan rule record.",
    })),
  );

  if (input.populationProfileContentSha256 !== null) {
    references.push({
      artifactType: "population-profile",
      artifactId: "population-profile",
      contentSha256: input.populationProfileContentSha256,
      mediaType: "application/json",
      storagePath: null,
      description: "Approved population profile content hash.",
    });
  }

  for (const candidate of [
    input.architecture,
    input.buildSpec,
    input.compiledFormulas,
    input.workbook,
    input.validation,
    input.reconciliation,
    input.section436,
  ]) {
    if (candidate !== null) references.push(referenceFromInput(candidate));
  }

  return references.sort(compareArtifactReferences);
}

function referenceFromInput(
  input: CaseworkOutputArtifactInput,
): CaseworkOutputArtifactReference {
  return {
    artifactType: input.artifactType,
    artifactId: input.artifactId,
    contentSha256: input.contentSha256,
    mediaType: input.mediaType,
    storagePath: input.storagePath ?? null,
    description: input.description,
  };
}

function buildStages(
  input: FinalCaseworkOutputInput,
  artifacts: readonly CaseworkOutputArtifactReference[],
): readonly CaseworkOutputStage[] {
  return stageOrder.map(({ stageKey, label }) => {
    const required = stageKey !== "section-436" || input.section436Required;
    if (!required) {
      return stage(stageKey, label, false, "not-required", "specified", [], []);
    }

    const matching = artifacts.filter((artifact) =>
      artifactBelongsToStage(stageKey, artifact.artifactType),
    );
    const blockers = blockersForStage(input, stageKey);
    const status = blockers.length === 0 ? "ready" : "blocked";
    return stage(
      stageKey,
      label,
      true,
      status,
      status === "ready" ? maturityForStage(input, stageKey) : "specified",
      matching.map((artifact) => artifact.contentSha256),
      blockers,
    );
  });
}

function stage(
  stageKey: CaseworkOutputStageKey,
  label: string,
  required: boolean,
  status: CaseworkOutputStage["status"],
  maturityLevel: CaseworkMaturityLevel,
  artifactSha256Values: readonly Sha256[],
  blockers: readonly string[],
): CaseworkOutputStage {
  return {
    stageKey,
    label,
    required,
    status,
    maturityLevel,
    artifactSha256Values: [...new Set(artifactSha256Values)].sort(),
    blockers: [...blockers].sort(),
  };
}

function blockersForStage(
  input: FinalCaseworkOutputInput,
  stageKey: CaseworkOutputStageKey,
): readonly string[] {
  switch (stageKey) {
    case "evidence":
      return input.evidenceManifestSha256 === null
        ? ["Evidence manifest has not been exported."]
        : [];
    case "plan-rules": {
      const blockers: string[] = [];
      if (input.planRules.length === 0) {
        blockers.push("No human-approved plan-rule records are available.");
      }
      if (
        input.planRules.some((rule) => rule.reviewStatus !== "human-approved")
      ) {
        blockers.push("All plan-rule records must be human-approved.");
      }
      return blockers;
    }
    case "population-profile":
      return input.populationProfileContentSha256 === null
        ? ["No approved population profile content hash is available."]
        : [];
    case "v1-architecture":
      return input.architecture === null
        ? ["No governed V1 architecture artifact is available."]
        : [];
    case "build-spec":
      return input.buildSpec === null
        ? ["No BuildSpec 2.0.0 artifact is available."]
        : [];
    case "compiled-formulas":
      return input.compiledFormulas === null
        ? ["No compiled formula artifact is available."]
        : [];
    case "workbook":
      return input.workbook === null
        ? ["No generated V1 workbook artifact is available."]
        : [];
    case "validation-reconciliation":
      return input.validation === null
        ? ["No validation or reconciliation evidence artifact is available."]
        : [];
    case "section-436":
      return input.section436 === null
        ? ["Section 436 is required but no evaluation artifact is available."]
        : [];
  }
}

function maturityForStage(
  input: FinalCaseworkOutputInput,
  stageKey: CaseworkOutputStageKey,
): CaseworkMaturityLevel {
  if (stageKey === "plan-rules") return "human-approved";
  if (stageKey === "validation-reconciliation") return "tested";

  const artifact = artifactInputForStage(input, stageKey);
  return artifact?.maturityLevel ?? "implemented";
}

function artifactInputForStage(
  input: FinalCaseworkOutputInput,
  stageKey: CaseworkOutputStageKey,
): CaseworkOutputArtifactInput | null {
  switch (stageKey) {
    case "v1-architecture":
      return input.architecture;
    case "build-spec":
      return input.buildSpec;
    case "compiled-formulas":
      return input.compiledFormulas;
    case "workbook":
      return input.workbook;
    case "validation-reconciliation":
      return input.validation ?? input.reconciliation;
    case "section-436":
      return input.section436;
    case "evidence":
    case "plan-rules":
    case "population-profile":
      return null;
  }
}

function artifactBelongsToStage(
  stageKey: CaseworkOutputStageKey,
  artifactType: CaseworkOutputArtifactReference["artifactType"],
): boolean {
  switch (stageKey) {
    case "evidence":
      return artifactType === "evidence-manifest";
    case "plan-rules":
      return artifactType === "plan-rule-record";
    case "population-profile":
      return artifactType === "population-profile";
    case "v1-architecture":
      return artifactType === "v1-architecture";
    case "build-spec":
      return artifactType === "build-spec";
    case "compiled-formulas":
      return artifactType === "compiled-formula-artifact";
    case "workbook":
      return artifactType === "v1-workbook";
    case "validation-reconciliation":
      return (
        artifactType === "validation-result" ||
        artifactType === "reconciliation-result"
      );
    case "section-436":
      return artifactType === "section-436-evaluation";
  }
}

function maturityClaims(
  stages: readonly CaseworkOutputStage[],
): readonly CaseworkMaturityClaim[] {
  return stages.map((stage) => ({
    subject: stage.stageKey,
    level: stage.maturityLevel,
    evidence:
      stage.status === "ready"
        ? `${stage.label} has a referenced governed artifact in this package.`
        : stage.status === "not-required"
          ? `${stage.label} is not required for this package.`
          : `${stage.label} is blocked: ${stage.blockers.join(" ")}`,
    externalExecutionClaimed: stage.maturityLevel === "externally-executed",
  }));
}

function lineageEdges(
  artifacts: readonly CaseworkOutputArtifactReference[],
): readonly CaseworkLineageEdge[] {
  const byType = new Map(
    artifacts.map((artifact) => [
      artifact.artifactType,
      artifact.contentSha256,
    ]),
  );
  const edges: CaseworkLineageEdge[] = [];
  addEdge(
    edges,
    byType.get("evidence-manifest"),
    byType.get("plan-rule-record"),
    "supports-rule-authoring",
  );
  addEdge(
    edges,
    byType.get("plan-rule-record"),
    byType.get("v1-architecture"),
    "drives-architecture",
  );
  addEdge(
    edges,
    byType.get("population-profile"),
    byType.get("v1-architecture"),
    "drives-architecture",
  );
  addEdge(
    edges,
    byType.get("v1-architecture"),
    byType.get("build-spec"),
    "builds-specification",
  );
  addEdge(
    edges,
    byType.get("build-spec"),
    byType.get("compiled-formula-artifact"),
    "compiles-formulas",
  );
  addEdge(
    edges,
    byType.get("compiled-formula-artifact"),
    byType.get("v1-workbook"),
    "builds-workbook",
  );
  addEdge(
    edges,
    byType.get("v1-workbook"),
    byType.get("validation-result"),
    "validates-workbook",
  );
  addEdge(
    edges,
    byType.get("validation-result"),
    byType.get("reconciliation-result"),
    "reconciles-results",
  );
  addEdge(
    edges,
    byType.get("plan-rule-record"),
    byType.get("section-436-evaluation"),
    "supports-section-436",
  );
  return edges.sort(
    (left, right) =>
      left.relationship.localeCompare(right.relationship) ||
      left.fromArtifactSha256.localeCompare(right.fromArtifactSha256) ||
      left.toArtifactSha256.localeCompare(right.toArtifactSha256),
  );
}

function addEdge(
  edges: CaseworkLineageEdge[],
  fromArtifactSha256: Sha256 | undefined,
  toArtifactSha256: Sha256 | undefined,
  relationship: string,
): void {
  if (fromArtifactSha256 === undefined || toArtifactSha256 === undefined)
    return;
  edges.push({ fromArtifactSha256, toArtifactSha256, relationship });
}

function compareArtifactReferences(
  left: CaseworkOutputArtifactReference,
  right: CaseworkOutputArtifactReference,
): number {
  return (
    left.artifactType.localeCompare(right.artifactType) ||
    left.artifactId.localeCompare(right.artifactId) ||
    left.contentSha256.localeCompare(right.contentSha256)
  );
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
