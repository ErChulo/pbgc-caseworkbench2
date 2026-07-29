import type { Sha256, Uuid, UtcTimestamp } from "../shared/types";
import type { UnresolvedItem } from "../plan-rules/models";
import type { CreateUnresolvedItemInput } from "../plan-rules/unresolved-items";

export const architectureSchemaVersion = "1.0.0" as const;
export type ArchitectureSchemaVersion = typeof architectureSchemaVersion;

export type IoBValue = "I" | "O" | "B" | "N" | "P" | "";

export interface DateRange {
  readonly startDate: string;
  readonly endDate: string | null;
}

export interface RunJustification {
  readonly source: "plan-rule" | "case-control" | "population";
  readonly referenceId: Uuid | string;
  readonly referenceContentSha256: Sha256;
}

export interface RunDescriptor {
  readonly runId: string;
  readonly runLabel: string;
  readonly effectiveDateRange: DateRange;
  readonly justifications: readonly RunJustification[];
  readonly applicableTabs: readonly string[];
}

export interface SourceTab {
  readonly tabName: string;
  readonly role: "population" | "support";
  readonly workbookProfileContentSha256: Sha256;
  readonly populationCandidateKey: Sha256 | null;
  readonly populationArtifactSha256: Sha256 | null;
  readonly fieldCount: number;
  readonly recordCount: number;
}

export interface IoBClassification {
  readonly runId: string;
  readonly iob: IoBValue;
  readonly justification: string;
  readonly ruleVersion: string;
}

export interface CellDescriptor {
  readonly key: string;
  readonly sourceTab: string;
  readonly cellAddress: string;
  readonly genericField: string;
  readonly description: string;
  readonly hasFormula: boolean;
  readonly formulaText: string | null;
  readonly perRunClassification: ReadonlyMap<string, IoBClassification>;
}

export interface FormulaDependency {
  readonly dependentKey: string;
  readonly dependencyKey: string;
  readonly runId: string;
  readonly referenceType: "cell" | "named-range" | "external";
}

export interface NamedRange {
  readonly name: string;
  readonly cellAddress: string;
  readonly sourceTab: string;
  readonly scope: "workbook" | "sheet";
  readonly genericField: string | null;
}

export type PolicyKind =
  | "scenario-selection"
  | "tab-selection"
  | "iob-classification"
  | "field-name-glossary";

export interface ArchitecturePolicyLineage {
  readonly policyKind: PolicyKind;
  readonly policyVersion: string;
  readonly policyContentSha256: Sha256;
  readonly sourceFileSha256: Sha256;
  readonly approvalDecisionId: Uuid;
  readonly approvalDecisionContentSha256: Sha256;
}

export interface PopulationArchitectureLineage {
  readonly candidateKey: Sha256;
  readonly artifactSha256: Sha256;
  readonly workbookProfileContentSha256: Sha256;
  readonly approvalDecisionId: string;
  readonly approvalDecisionContentSha256: Sha256;
}

export interface V1ArchitectureLineage {
  readonly policies: readonly ArchitecturePolicyLineage[];
  readonly evidenceCatalogId: Uuid;
  readonly evidenceCatalogContentSha256: Sha256;
  readonly population: readonly PopulationArchitectureLineage[];
  readonly caseControls: readonly {
    readonly controlId: Uuid;
    readonly contentSha256: Sha256;
  }[];
  readonly authorityOverrides: readonly {
    readonly overrideId: Uuid;
    readonly contentSha256: Sha256;
  }[];
}

export interface V1Architecture {
  readonly architectureId: Uuid;
  readonly caseId: Uuid;
  readonly builtAt: UtcTimestamp;
  readonly schemaVersion: ArchitectureSchemaVersion;
  readonly ruleSetVersion: string;
  readonly lineage: V1ArchitectureLineage;
  readonly sourceTabs: readonly SourceTab[];
  readonly runs: readonly RunDescriptor[];
  readonly cells: ReadonlyMap<string, CellDescriptor>;
  readonly formulaDependencies: readonly FormulaDependency[];
  readonly namedRanges: readonly NamedRange[];
  readonly architectureContentSha256: Sha256;
}

export type V1ArchitectureContent = Omit<
  V1Architecture,
  "architectureId" | "builtAt" | "architectureContentSha256"
>;

export type ArchitectureUnresolvedItem =
  CreateUnresolvedItemInput | UnresolvedItem;

export interface TriggerCondition {
  readonly dimension: string;
  readonly operator:
    "equals" | "contains" | "greater-than" | "less-than" | "present" | "absent";
  readonly value: string | number | boolean;
  readonly source: "plan-rule" | "population" | "case-control";
}

export interface ScenarioSelectionPolicy {
  readonly scenarioId: string;
  readonly triggerConditions: readonly TriggerCondition[];
  readonly exclusionConditions?: readonly TriggerCondition[];
  readonly defaultEffectiveDateRange: DateRange;
}

export interface TabSelectionPolicy {
  readonly tabPattern: string;
  readonly requiredFields: readonly string[];
  readonly populationRequirement: string | null;
}

export interface IoBClassificationRule {
  readonly fieldPattern: string;
  readonly runPattern: string;
  readonly iob: IoBValue;
  readonly priority: number;
  readonly justification: string;
}

export interface FieldNameGlossaryEntry {
  readonly workbookPattern: string;
  readonly genericField: string;
  readonly description: string;
  readonly tabContext: string | null;
}

export interface PolicyCitation {
  readonly sourceArtifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly effectiveDate: string;
  readonly adoptionDate: string | null;
  readonly supersedesArtifactSha256: Sha256 | null;
}

export interface RuleSetGovernance {
  readonly reviewStatus: "provisional";
}

export type ArchitectureBuildError =
  | { readonly code: "EMPTY_POPULATION"; readonly message: string }
  | {
      readonly code: "SCENARIO_CONFLICT";
      readonly message: string;
      readonly unresolvedItems: readonly ArchitectureUnresolvedItem[];
      readonly partialRuns: readonly RunDescriptor[];
    }
  | { readonly code: "MISSING_FIELD_MAPPING"; readonly message: string }
  | {
      readonly code: "CIRCULAR_DEPENDENCY";
      readonly message: string;
      readonly unresolvedItems?: readonly CreateUnresolvedItemInput[];
      readonly partialDependencies?: readonly FormulaDependency[];
    }
  | {
      readonly code: "DEPENDENCY_UNRESOLVED";
      readonly message: string;
      readonly unresolvedItems: readonly CreateUnresolvedItemInput[];
      readonly partialDependencies: readonly FormulaDependency[];
    }
  | { readonly code: "INVALID_RULE_SET"; readonly message: string }
  | {
      readonly code: "ARCHITECTURE_BLOCKED";
      readonly message: string;
      readonly unresolvedItems: readonly ArchitectureUnresolvedItem[];
    }
  | { readonly code: "HASH_COMPUTATION_FAILED"; readonly message: string };
