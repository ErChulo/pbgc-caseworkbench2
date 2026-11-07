import { hashTyped } from "../manifests/canonical-json";
import { parseSha256 } from "../shared/types";
import type { Sha256 } from "../shared/types";
import type {
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
    // A bare false flag is not a reviewed non-applicability determination.
    section436Required: true,
    stages,
    artifacts,
    unresolvedItems: input.unresolvedItems
      .map((item) => ({ ...item }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
    maturityClaims: maturityClaims(stages),
    // References alone do not establish derivation. Do not invent lineage.
    lineage: [],
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
      description: "Referenced effective-dated plan rule record.",
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
    // No verified case-bound non-applicability determination exists in this input.

    const matching = artifacts.filter((artifact) =>
      artifactBelongsToStage(stageKey, artifact.artifactType),
    );
    const blockers = [...blockersForStage(input, stageKey)];
    // Inputs provide only hashes, references, and asserted labels. They do not
    // establish the content, authority, review, or derivation of a stage.
    if (blockers.length === 0) {
      blockers.push("Stage readiness is not verified by references alone.");
    }
    const status = "blocked" as const;
    return stage(
      stageKey,
      label,
      true,
      status,
      "specified",
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
      if (
        input.unresolvedItems.some(
          (item) => item.status !== "resolved" && item.status !== "superseded",
        )
      ) {
        blockers.push(
          "Resolve or supersede all unresolved items before completing the package.",
        );
      }
      return blockers;
    }
    case "population-profile":
      return input.populationProfileContentSha256 === null
        ? [
            "No single approved population profile with a matching content hash is available.",
          ]
        : [];
    case "v1-architecture":
      return input.architecture === null
        ? ["No unambiguous governed V1 architecture artifact is available."]
        : [];
    case "build-spec":
      return input.buildSpec === null
        ? ["No unambiguous BuildSpec 2.0.0 artifact is available."]
        : [];
    case "compiled-formulas":
      return input.compiledFormulas === null
        ? ["No unambiguous compiled formula artifact is available."]
        : [];
    case "workbook":
      return input.workbook === null
        ? ["No unambiguous generated V1 workbook artifact is available."]
        : [];
    case "validation-reconciliation": {
      const blockers: string[] = [];
      if (input.validation === null)
        blockers.push(
          "No unambiguous validation evidence artifact is available.",
        );
      if (input.reconciliation === null)
        blockers.push(
          "No unambiguous reconciliation evidence artifact is available.",
        );
      // The current input contains references, not validated results, review decisions,
      // or authenticated derivation links. Presence cannot prove readiness.
      blockers.push(
        "Referenced artifacts and their lineage have not been verified for final output.",
      );
      return blockers;
    }
    case "section-436": {
      const blockers: string[] = [];
      if (!input.section436Required) {
        blockers.push(
          "Section 436 non-applicability has not been verified; the stage remains required.",
        );
      }
      if (input.section436 === null) {
        blockers.push(
          "Section 436 is required but no unambiguous evaluation artifact is available.",
        );
      } else {
        blockers.push(
          "The Section 436 evaluation reference has not been verified as a completed, approved case evaluation.",
        );
      }
      return blockers;
    }
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
        ? `${stage.label} has a referenced artifact; verification is pending.`
        : stage.status === "not-required"
          ? `${stage.label} is not required for this package.`
          : `${stage.label} is blocked: ${stage.blockers.join(" ")}`,
    externalExecutionClaimed: stage.maturityLevel === "externally-executed",
  }));
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
