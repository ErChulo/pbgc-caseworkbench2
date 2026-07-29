import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";

import caseWorkspaceSchema from "./schemas/case-workspace.schema.json";
import deidentifiedExportSchema from "./schemas/deidentified-export.schema.json";
import evidenceAcquisitionSchema from "./schemas/evidence-acquisition.schema.json";
import evidenceManifestSchema from "./schemas/evidence-manifest.schema.json";
import extractionResultSchema from "./schemas/extraction-result.schema.json";
import governedRecordsSchema from "./schemas/governed-records.schema.json";
import normalizedEvidenceSchema from "./schemas/normalized-evidence.schema.json";
import compiledFormulaArtifactSchema from "./schemas/compiled-formula-artifact.schema.json";
import buildSpecSchema from "./schemas/build-spec.schema.json";

export interface ContractValidationIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly blocksDownstream: boolean;
  readonly instancePath: string;
  readonly schemaPath?: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ContractValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ContractValidationIssue[];
}

export interface ContractValidationContext {
  readonly relatedRecords?: readonly unknown[];
}

type RecordValue = Readonly<Record<string, unknown>>;

const schemas = [
  caseWorkspaceSchema,
  deidentifiedExportSchema,
  evidenceAcquisitionSchema,
  evidenceManifestSchema,
  extractionResultSchema,
  governedRecordsSchema,
  normalizedEvidenceSchema,
  compiledFormulaArtifactSchema,
  buildSpecSchema,
] as const;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: true,
});
ajv.addFormat(
  "uuid",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
);
ajv.addFormat("date-time", (value: string) => !Number.isNaN(Date.parse(value)));
for (const schema of schemas) ajv.addSchema(schema);

const governedId = governedRecordsSchema.$id;
const validators: Readonly<Record<string, ValidateFunction | undefined>> = {
  caseWorkspace: ajv.getSchema(caseWorkspaceSchema.$id),
  deidentifiedExport: ajv.getSchema(deidentifiedExportSchema.$id),
  evidenceAcquisition: ajv.getSchema(evidenceAcquisitionSchema.$id),
  evidenceManifest: ajv.getSchema(evidenceManifestSchema.$id),
  extractionResult: ajv.getSchema(extractionResultSchema.$id),
  normalizedEvidence: ajv.getSchema(normalizedEvidenceSchema.$id),
  compiledFormulaArtifact: ajv.getSchema(compiledFormulaArtifactSchema.$id),
  buildSpec: ajv.getSchema(buildSpecSchema.$id),
  unresolvedItem: ajv.getSchema(`${governedId}#/$defs/unresolvedItem`),
  quarantineDecision: ajv.getSchema(`${governedId}#/$defs/quarantineDecision`),
  artifactEligibilityDecision: ajv.getSchema(
    `${governedId}#/$defs/artifactEligibilityDecision`,
  ),
  populationCandidateDecision: ajv.getSchema(
    `${governedId}#/$defs/populationCandidateDecision`,
  ),
};

function issue(
  code: string,
  message: string,
  instancePath = "",
  details?: Readonly<Record<string, unknown>>,
): ContractValidationIssue {
  return {
    code,
    severity: "error",
    blocksDownstream: true,
    instancePath,
    message,
    ...(details ? { details } : {}),
  };
}

function schemaIssue(error: ErrorObject): ContractValidationIssue {
  return {
    code: `SCHEMA_${error.keyword.toUpperCase().replaceAll("-", "_")}`,
    severity: "error",
    blocksDownstream: true,
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    message: error.message ?? "Schema validation failed.",
    details: error.params,
  };
}

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function semanticIssues(
  contract: string,
  value: unknown,
  context: ContractValidationContext,
): ContractValidationIssue[] {
  const result: ContractValidationIssue[] = [];
  const record = asRecord(value);

  if (
    ["quarantineDecision", "artifactEligibilityDecision"].includes(contract) &&
    asRecord(record?.actor)?.actorType !== "human"
  ) {
    result.push(
      issue(
        "HUMAN_ACTOR_REQUIRED",
        "A final governed decision requires a human actor.",
        "/actor",
      ),
    );
  }

  if (
    contract === "quarantineDecision" &&
    typeof record?.appendOrdinal === "number" &&
    record.appendOrdinal > 1 &&
    (record.priorDecisionId == null ||
      record.priorDecisionContentSha256 == null)
  ) {
    result.push(
      issue(
        "PREDECESSOR_REQUIRED",
        "A noninitial quarantine decision requires its immediate predecessor.",
      ),
    );
  }

  if (contract === "artifactEligibilityDecision") {
    const related = (context.relatedRecords ?? [])
      .map(asRecord)
      .filter((item): item is RecordValue => item !== undefined);
    const source = related.find(
      (item) =>
        item.decisionId === record?.sourceQuarantineDecisionId &&
        item.decisionContentSha256 ===
          record?.sourceQuarantineDecisionContentSha256,
    );
    if (
      record?.decisionType === "inherit-approval" &&
      (source?.action !== "release" || source.resultingStatus !== "released")
    ) {
      result.push(
        issue(
          "RELEASE_DECISION_INEFFECTIVE",
          "Inherited eligibility requires a current effective release.",
        ),
      );
    } else if (source?.artifactSha256 !== record?.artifactSha256) {
      result.push(
        issue(
          "ARTIFACT_HASH_MISMATCH",
          "Eligibility and release must concern identical artifact bytes.",
          "/artifactSha256",
        ),
      );
    }
  }

  if (contract === "unresolvedItemDecisionChain" && Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const current = asRecord(value[index]);
      const prior = index === 0 ? undefined : asRecord(value[index - 1]);
      if (current?.appendOrdinal !== index + 1) {
        result.push(
          issue(
            "DECISION_ORDINAL_GAP",
            "Decision ordinals must be gapless.",
            `/${String(index)}/appendOrdinal`,
          ),
        );
        break;
      }
      if (
        index > 0 &&
        (current.priorDecisionId !== prior?.decisionId ||
          current.priorDecisionContentSha256 !== prior?.decisionContentSha256)
      ) {
        result.push(
          issue(
            "DECISION_PREDECESSOR_MISMATCH",
            "Decision must link to its immediate predecessor.",
            `/${String(index)}`,
          ),
        );
        break;
      }
    }
  }

  if (
    contract === "unresolvedItem" &&
    record?.status !== "open" &&
    record?.status !== "provisional"
  ) {
    result.push(
      issue(
        "PROPOSAL_ONLY_STATUS",
        "Unresolved-item source records may contain only provisional states.",
        "/status",
      ),
    );
  }

  if (
    contract === "populationCandidateDecision" &&
    (typeof record?.candidateKey !== "string" ||
      !/^[0-9a-f]{64}$/u.test(record.candidateKey))
  ) {
    result.push(
      issue(
        "LOWERCASE_SHA256_REQUIRED",
        "candidateKey must be a lowercase SHA-256.",
        "/candidateKey",
      ),
    );
  }

  if (contract === "evidenceManifest" && record?.evidenceKey !== undefined) {
    const observations = Array.isArray(record.observations)
      ? record.observations
      : [];
    if (
      observations.filter(
        (item) => asRecord(item)?.evidenceKey === record.evidenceKey,
      ).length !== 1
    ) {
      result.push(
        issue(
          "EVIDENCE_OBSERVATION_NOT_FOUND",
          "Population evidence must resolve to exactly one local observation.",
          "/evidenceKey",
        ),
      );
    }
  }

  if (contract === "authorityDecisionProjection") {
    const linked = (context.relatedRecords ?? []).map(asRecord).find(Boolean);
    if (
      linked?.status !== "approved" ||
      linked.artifactSha256 !== record?.artifactSha256
    ) {
      result.push(
        issue(
          "CLASSIFICATION_APPROVAL_INEFFECTIVE",
          "Authority requires a current effective same-artifact classification approval.",
        ),
      );
    }
  }

  if (contract === "deidentifiedExport") {
    const payloadHash = record?.deterministicPayloadSha256;
    const history = asRecord(record?.operationalMetadata)?.humanApprovalHistory;
    if (
      Array.isArray(history) &&
      history.some(
        (approval) =>
          asRecord(approval)?.deterministicPayloadSha256 !== payloadHash,
      )
    ) {
      result.push(
        issue(
          "APPROVAL_HASH_MISMATCH",
          "Export approval must bind to the enclosing deterministic payload hash.",
        ),
      );
    }
    const records = asRecord(record?.deterministicPayload)?.records;
    const prohibited = new Set([
      "name",
      "ssn",
      "socialSecurityNumber",
      "dateOfBirth",
      "address",
      "email",
      "phone",
    ]);
    if (
      Array.isArray(records) &&
      records.some((item) =>
        Object.keys(asRecord(item) ?? {}).some((key) => prohibited.has(key)),
      )
    ) {
      result.push(
        issue(
          "DIRECT_IDENTIFIER_PROHIBITED",
          "External-use records cannot contain direct identifiers.",
          "/deterministicPayload/records",
        ),
      );
    }
  }

  if (contract === "evidenceAcquisition") {
    const priorities = asRecord(
      record?.deterministicRequestPayload,
    )?.sourcePriorityRecommendations;
    if (
      Array.isArray(priorities) &&
      priorities.some((item, index) => {
        const priority = asRecord(item)?.priority;
        const prior =
          index === 0 ? undefined : asRecord(priorities[index - 1])?.priority;
        return (
          typeof priority !== "number" ||
          (typeof prior === "number" && priority <= prior)
        );
      })
    ) {
      result.push(
        issue(
          "SOURCE_PRIORITY_ORDER_INVALID",
          "Source priorities must be ascending and unique.",
        ),
      );
    }
  }

  return result;
}

export function validateContract(
  contract: string,
  value: unknown,
  context: ContractValidationContext = {},
): ContractValidationResult {
  const issues: ContractValidationIssue[] = [];
  const validator = validators[contract];
  if (validator && !validator(value)) {
    issues.push(...(validator.errors ?? []).map(schemaIssue));
  }
  issues.push(...semanticIssues(contract, value, context));
  return { valid: issues.length === 0, issues };
}

const permittedTransitions: Readonly<Record<string, ReadonlySet<string>>> = {
  "acquisition-proposal": new Set([
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ]),
  quarantine: new Set([
    "none->final-quarantine",
    "none->release",
    "none->reject",
    "final-quarantine->continue-quarantine",
    "final-quarantine->release",
    "final-quarantine->supersede",
    "released->revoke",
    "released->inherit-release",
    "released->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ]),
  "artifact-eligibility": new Set([
    "none->approve",
    "none->inherit-approval",
    "none->reject",
    "eligible->revoke",
    "eligible->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ]),
  classification: new Set([
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ]),
  authority: new Set([
    "none->approved",
    "none->rejected",
    "approved->revoked",
    "approved->superseded",
    "rejected->superseded",
    "revoked->superseded",
  ]),
  "evidence-relationship": new Set([
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ]),
  "population-candidate": new Set([
    "none->approve",
    "none->reject",
    "approved->revoke",
    "approved->supersede",
    "rejected->supersede",
    "revoked->supersede",
  ]),
  "export-approval": new Set([
    "none->approved",
    "none->rejected",
    "approved->revoked",
  ]),
  "unresolved-item": new Set([
    "none->resolved",
    "none->accepted-risk",
    "resolved->reopened",
    "accepted-risk->reopened",
    "reopened->resolved",
    "reopened->accepted-risk",
    "reopened->superseded",
    "resolved->superseded",
    "accepted-risk->superseded",
  ]),
};

export function validateDecisionTransition(
  family: string,
  transition: string,
): ContractValidationResult {
  const valid = permittedTransitions[family]?.has(transition) === true;
  return {
    valid,
    issues: valid
      ? []
      : [
          issue(
            "DECISION_TRANSITION_INVALID",
            `Transition ${transition} is not permitted for ${family}.`,
          ),
        ],
  };
}

const invalidChainConditions = new Set([
  "ordinal-gap",
  "duplicate-ordinal",
  "branch",
  "cycle",
  "broken-predecessor",
  "stale-predecessor-hash",
  "cross-subject-predecessor",
  "invalid-transition",
  "ineffective-supersession",
]);

export function validateDecisionChainCondition(
  family: string,
  condition: string,
): ContractValidationResult {
  const recognized =
    permittedTransitions[family] !== undefined &&
    invalidChainConditions.has(condition);
  return {
    valid: false,
    issues: [
      issue(
        recognized ? "DECISION_CHAIN_INVALID" : "VALIDATION_INPUT_UNKNOWN",
        recognized
          ? `${family} decision chain violates ${condition}.`
          : "Unknown decision family or chain condition.",
      ),
    ],
  };
}
