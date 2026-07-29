import { normalizeCellAddress } from "../formula-compiler/reference-codec";

export interface ArchitectureSemanticIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

type RecordValue = Readonly<Record<string, unknown>>;

const policyKinds = [
  "scenario-selection",
  "tab-selection",
  "iob-classification",
  "field-name-glossary",
] as const;

export function validateV1ArchitectureSemantics(
  value: unknown,
): readonly ArchitectureSemanticIssue[] {
  const architecture = asRecord(value);
  const lineage = asRecord(architecture?.lineage);
  const sourceTabs = records(architecture?.sourceTabs);
  const runs = records(architecture?.runs);
  const cells = asRecord(architecture?.cells);
  const dependencies = records(architecture?.formulaDependencies);
  const namedRanges = records(architecture?.namedRanges);
  const policies = records(lineage?.policies);
  const population = records(lineage?.population);
  const caseControls = records(lineage?.caseControls);
  const authorityOverrides = records(lineage?.authorityOverrides);
  if (
    architecture === undefined ||
    lineage === undefined ||
    sourceTabs === undefined ||
    runs === undefined ||
    cells === undefined ||
    dependencies === undefined ||
    namedRanges === undefined ||
    policies === undefined ||
    population === undefined ||
    caseControls === undefined ||
    authorityOverrides === undefined
  ) {
    return [];
  }

  const issues: ArchitectureSemanticIssue[] = [];
  const add = (code: string, path: string, message: string) =>
    issues.push({ code, path, message });

  const actualPolicyKinds = policies.map((policy) => policy.policyKind);
  if (
    actualPolicyKinds.length !== policyKinds.length ||
    policyKinds.some(
      (kind) =>
        actualPolicyKinds.filter((value) => value === kind).length !== 1,
    )
  ) {
    add(
      "ARCHITECTURE_POLICY_LINEAGE_INVALID",
      "/lineage/policies",
      "Architecture lineage must contain each governed policy kind exactly once.",
    );
  }

  checkUnique(
    sourceTabs.map((tab) => tab.tabName),
    "/sourceTabs",
    "ARCHITECTURE_SOURCE_TAB_DUPLICATE",
    "Source tab names must be unique.",
    add,
  );
  checkUnique(
    runs.map((run) => run.runId),
    "/runs",
    "ARCHITECTURE_RUN_DUPLICATE",
    "Run IDs must be unique.",
    add,
  );

  const tabNames = stringSet(sourceTabs.map((tab) => tab.tabName));
  const runIds = stringSet(runs.map((run) => run.runId));
  const populationBindings = new Set(
    population.map(
      (item) =>
        `${String(item.candidateKey)}\u0000${String(item.artifactSha256)}`,
    ),
  );
  const profileBindings = new Set(
    population.map((item) => item.workbookProfileContentSha256),
  );
  for (const [index, tab] of sourceTabs.entries()) {
    const populationBinding = populationBindings.has(
      `${String(tab.populationCandidateKey)}\u0000${String(tab.populationArtifactSha256)}`,
    );
    if (!profileBindings.has(tab.workbookProfileContentSha256)) {
      add(
        "ARCHITECTURE_SOURCE_TAB_LINEAGE_MISSING",
        `/sourceTabs/${String(index)}`,
        "Every source tab must resolve to an exact approved workbook-profile lineage binding.",
      );
    }
    if (
      (tab.role === "population" && !populationBinding) ||
      (tab.role === "support" &&
        (tab.populationCandidateKey !== null ||
          tab.populationArtifactSha256 !== null ||
          !["Summary", "Tables", "UD Table"].includes(String(tab.tabName))))
    )
      add(
        "ARCHITECTURE_SOURCE_TAB_ROLE_INVALID",
        `/sourceTabs/${String(index)}`,
        "Population tabs require candidate/artifact lineage; canonical support tabs require null population linkage.",
      );
  }

  const controlBindings = new Set(
    caseControls.map(
      (control) =>
        `${String(control.controlId)}\u0000${String(control.contentSha256)}`,
    ),
  );
  for (const [index, run] of runs.entries()) {
    const applicableTabs = strings(run.applicableTabs);
    if (
      applicableTabs === undefined ||
      applicableTabs.some((tab) => !tabNames.has(tab))
    ) {
      add(
        "ARCHITECTURE_RUN_TAB_MISSING",
        `/runs/${String(index)}/applicableTabs`,
        "Every applicable run tab must identify an existing source tab.",
      );
    }
    const justifications = records(run.justifications) ?? [];
    for (const [
      justificationIndex,
      justification,
    ] of justifications.entries()) {
      if (
        (justification.source === "case-control" &&
          !controlBindings.has(
            `${String(justification.referenceId)}\u0000${String(justification.referenceContentSha256)}`,
          )) ||
        (justification.source === "population" &&
          !populationBindings.has(
            `${String(justification.referenceId)}\u0000${String(justification.referenceContentSha256)}`,
          ))
      )
        add(
          "ARCHITECTURE_RUN_APPROVAL_REFERENCE_INVALID",
          `/runs/${String(index)}/justifications/${String(justificationIndex)}`,
          "Run contributors must bind exact governed lineage IDs and hashes.",
        );
    }
  }

  for (const [key, cellValue] of Object.entries(cells)) {
    const cell = asRecord(cellValue);
    if (cell === undefined) continue;
    const sourceTab = typeof cell.sourceTab === "string" ? cell.sourceTab : "";
    const address =
      typeof cell.cellAddress === "string" ? cell.cellAddress : "";
    const expectedKey = `${sourceTab}::${address}`;
    if (key !== expectedKey || cell.key !== expectedKey) {
      add(
        "ARCHITECTURE_CELL_IDENTITY_INVALID",
        `/cells/${pointer(key)}`,
        "A cell map key, cell.key, sourceTab, and canonical cellAddress must identify the same cell.",
      );
    }
    if (!tabNames.has(sourceTab)) {
      add(
        "ARCHITECTURE_CELL_TAB_MISSING",
        `/cells/${pointer(key)}/sourceTab`,
        "Every cell sourceTab must identify an existing source tab.",
      );
    }
    if (!isCanonicalAddress(address)) {
      add(
        "ARCHITECTURE_CELL_ADDRESS_INVALID",
        `/cells/${pointer(key)}/cellAddress`,
        "Cell addresses must be canonical in-grid A1 addresses.",
      );
    }
    const formulaText = cell.formulaText;
    const hasFormulaText =
      typeof formulaText === "string" && formulaText.trim().length > 0;
    if (cell.hasFormula !== hasFormulaText) {
      add(
        "ARCHITECTURE_FORMULA_FLAG_INVALID",
        `/cells/${pointer(key)}`,
        "hasFormula must be true exactly when formulaText is non-null and nonempty.",
      );
    }

    const classifications = asRecord(cell.perRunClassification);
    if (classifications === undefined) continue;
    const classificationIds = new Set(Object.keys(classifications));
    if (!sameSet(classificationIds, runIds)) {
      add(
        "ARCHITECTURE_CLASSIFICATION_COVERAGE_INVALID",
        `/cells/${pointer(key)}/perRunClassification`,
        "Per-run classifications must exactly cover the architecture run IDs.",
      );
    }
    for (const [runId, classificationValue] of Object.entries(
      classifications,
    )) {
      const classification = asRecord(classificationValue);
      if (classification?.runId !== runId) {
        add(
          "ARCHITECTURE_CLASSIFICATION_IDENTITY_INVALID",
          `/cells/${pointer(key)}/perRunClassification/${pointer(runId)}`,
          "A classification map key must equal its runId.",
        );
      }
      if (
        (cell.genericField === "CALC_INDICATOR" &&
          classification?.iob !== "B") ||
        (cell.genericField === "CALCULATION" && classification?.iob !== "N")
      ) {
        add(
          "ARCHITECTURE_CLASSIFICATION_SEMANTICS_INVALID",
          `/cells/${pointer(key)}/perRunClassification/${pointer(runId)}/iob`,
          "CALC_INDICATOR must remain B and CALCULATION must remain N for every run.",
        );
      }
    }
  }

  for (const [index, dependency] of dependencies.entries()) {
    if (
      typeof dependency.dependentKey !== "string" ||
      !Object.hasOwn(cells, dependency.dependentKey) ||
      typeof dependency.dependencyKey !== "string" ||
      !Object.hasOwn(cells, dependency.dependencyKey) ||
      typeof dependency.runId !== "string" ||
      !runIds.has(dependency.runId) ||
      !["cell", "named-range", "external"].includes(
        String(dependency.referenceType),
      )
    ) {
      add(
        "ARCHITECTURE_DEPENDENCY_REFERENCE_INVALID",
        `/formulaDependencies/${String(index)}`,
        "Dependencies must reference existing cells and runs with a valid reference type.",
      );
    }
  }

  const rangeIdentities = new Set<string>();
  for (const [index, range] of namedRanges.entries()) {
    const sourceTab =
      typeof range.sourceTab === "string" ? range.sourceTab : "";
    const address =
      typeof range.cellAddress === "string" ? range.cellAddress : "";
    if (
      !tabNames.has(sourceTab) ||
      !isCanonicalAddress(address) ||
      !Object.hasOwn(cells, `${sourceTab}::${address}`)
    ) {
      add(
        "ARCHITECTURE_NAMED_RANGE_TARGET_INVALID",
        `/namedRanges/${String(index)}`,
        "Named ranges must target a canonical existing cell on an existing source tab.",
      );
    }
    const identity = `${String(range.scope)}\u0000${range.scope === "sheet" ? sourceTab.toUpperCase() : ""}\u0000${String(range.name).toUpperCase()}`;
    if (rangeIdentities.has(identity)) {
      add(
        "ARCHITECTURE_NAMED_RANGE_DUPLICATE",
        `/namedRanges/${String(index)}`,
        "Named range identities must be unique within workbook or sheet scope.",
      );
    }
    rangeIdentities.add(identity);
  }

  checkLineageIdentities(
    policies,
    population,
    caseControls,
    authorityOverrides,
    add,
  );
  return issues;
}

function checkLineageIdentities(
  policies: readonly RecordValue[],
  population: readonly RecordValue[],
  controls: readonly RecordValue[],
  overrides: readonly RecordValue[],
  add: (code: string, path: string, message: string) => void,
): void {
  const groups: readonly [readonly RecordValue[], string, string, string][] = [
    [
      policies,
      "approvalDecisionId",
      "approvalDecisionContentSha256",
      "/lineage/policies",
    ],
    [
      population,
      "approvalDecisionId",
      "approvalDecisionContentSha256",
      "/lineage/population",
    ],
    [controls, "controlId", "contentSha256", "/lineage/caseControls"],
    [overrides, "overrideId", "contentSha256", "/lineage/authorityOverrides"],
  ];
  const approvalHashes = new Map<string, unknown>();
  for (const [items, idField, hashField, path] of groups) {
    const identities = items.map((item) => item[idField]);
    checkUnique(
      identities,
      path,
      "ARCHITECTURE_LINEAGE_IDENTITY_DUPLICATE",
      "Lineage identities must be unique within their lineage category.",
      add,
    );
    if (
      items.some(
        (item) =>
          typeof item[idField] !== "string" ||
          item[idField] === "" ||
          item[idField] !== item[idField].trim(),
      )
    ) {
      add(
        "ARCHITECTURE_LINEAGE_IDENTITY_INVALID",
        path,
        "Lineage identities must be nonempty and unpadded.",
      );
    }
    if (idField !== "approvalDecisionId") continue;
    for (const item of items) {
      const id = item[idField];
      if (typeof id !== "string") continue;
      const priorHash = approvalHashes.get(id);
      if (priorHash !== undefined && priorHash !== item[hashField]) {
        add(
          "ARCHITECTURE_APPROVAL_BINDING_CONFLICT",
          path,
          "An approval decision ID cannot bind more than one decision content hash.",
        );
      }
      approvalHashes.set(id, item[hashField]);
    }
  }
  checkUnique(
    population.map(
      (item) =>
        `${String(item.candidateKey)}\u0000${String(item.artifactSha256)}`,
    ),
    "/lineage/population",
    "ARCHITECTURE_POPULATION_LINEAGE_DUPLICATE",
    "Population candidate/artifact lineage bindings must be unique.",
    add,
  );
}

function checkUnique(
  values: readonly unknown[],
  path: string,
  code: string,
  message: string,
  add: (code: string, path: string, message: string) => void,
): void {
  const seen = new Set<unknown>();
  for (const value of values) {
    if (seen.has(value)) {
      add(code, path, message);
      return;
    }
    seen.add(value);
  }
}

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function records(value: unknown): readonly RecordValue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map(asRecord);
  return result.every((item) => item !== undefined) ? result : undefined;
}

function strings(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
}

function stringSet(values: readonly unknown[]): ReadonlySet<string> {
  return new Set(
    values.filter((value): value is string => typeof value === "string"),
  );
}

function sameSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function isCanonicalAddress(value: string): boolean {
  return normalizeCellAddress(value) === value && !value.includes("$");
}

function pointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
