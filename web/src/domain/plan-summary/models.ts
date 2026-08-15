import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";
import type { HumanActor } from "../quarantine/models";
import type { SourceRole } from "../evidence/models";

export const planSummarySchemaVersion = "1.0.0" as const;
export type PlanSummarySchemaVersion = typeof planSummarySchemaVersion;

export type PlanSummarySectionId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S";

export type PlanSummaryAttributeStatus =
  "proposed" | "approved" | "blocked" | "conflict" | "superseded";

export type PlanSummaryAttributeSource =
  "direct" | "derived" | "manual" | "imported";

export interface PlanSummaryCitation {
  readonly artifactSha256: Sha256;
  readonly artifactLocator: string;
  readonly sourceRole: SourceRole;
  readonly sectionReference: string | null;
  readonly pageReference: string | null;
}

export interface PlanSummaryAttribute {
  readonly attributeId: Uuid;
  readonly sectionId: PlanSummarySectionId;
  readonly fieldPath: string;
  readonly fieldValue: string | null;
  readonly status: PlanSummaryAttributeStatus;
  readonly source: PlanSummaryAttributeSource;
  readonly citations: readonly PlanSummaryCitation[];
  readonly conflictingValues: readonly PlanSummaryConflictingValue[];
  readonly derivedFormula: string | null;
  readonly derivedInputAttributes: readonly Uuid[];
  readonly blockedReason: string | null;
  readonly effectiveDate: string | null;
  readonly adoptionDate: string | null;
  readonly phaseInPercentage: number | null;
  readonly humanActor: HumanActor;
  readonly authoredAt: UtcTimestamp;
  readonly reviewStatus: "human-approved" | "provisional";
  readonly approvalRationale: string;
  readonly attributeContentSha256: Sha256;
}

export interface PlanSummaryConflictingValue {
  readonly value: string;
  readonly citation: PlanSummaryCitation;
  readonly confidence: number;
}

export interface PlanSummarySection {
  readonly sectionId: PlanSummarySectionId;
  readonly sectionTitle: string;
  readonly attributes: readonly PlanSummaryAttribute[];
  readonly sectionContentSha256: Sha256;
}

export interface PlanSummaryRecord {
  readonly recordId: Uuid;
  readonly caseId: Uuid;
  readonly schemaVersion: PlanSummarySchemaVersion;
  readonly sections: readonly PlanSummarySection[];
  readonly overallStatus: "draft" | "preliminary" | "final";
  readonly lastApprovedAt: UtcTimestamp | null;
  readonly lastApprovedBy: HumanActor | null;
  readonly recordContentSha256: Sha256;
}

export interface PlanSummaryDecision {
  readonly decisionId: Uuid;
  readonly attributeId: Uuid;
  readonly caseId: Uuid;
  readonly selectedValue: string | null;
  readonly selectedCitation: PlanSummaryCitation | null;
  readonly rationale: string;
  readonly humanActor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly decisionContentSha256: Sha256;
}

export interface PlanSummaryGovernanceInput {
  readonly caseId: Uuid;
  readonly planRules: readonly unknown[];
  readonly evidenceCatalog: readonly unknown[];
}

export interface PlanSummaryGovernanceResult {
  readonly ok: true;
  readonly record: PlanSummaryRecord;
  readonly warnings: readonly string[];
}

export interface PlanSummaryGovernanceError {
  readonly ok: false;
  readonly code:
    | "PLAN_SUMMARY_BLOCKED"
    | "PLAN_SUMMARY_INVALID"
    | "PLAN_SUMMARY_PERSISTENCE_FAILED";
  readonly message: string;
}

export interface PlanSummarySectionDefinition {
  readonly sectionId: PlanSummarySectionId;
  readonly sectionTitle: string;
  readonly fieldPaths: readonly string[];
}

export const PLAN_SUMMARY_SECTIONS: readonly PlanSummarySectionDefinition[] = [
  {
    sectionId: "A",
    sectionTitle: "Participant Requirements",
    fieldPaths: [
      "eligibilityRequirements",
      "dateOfParticipation",
      "eligibilityServiceRequirements",
      "eligibilityAgeRequirements",
    ],
  },
  {
    sectionId: "B",
    sectionTitle: "Retirement Eligibility",
    fieldPaths: [
      "normalRetirementAge",
      "earlyRetirementAge",
      "normalRetirementBenefits",
      "earlyRetirementBenefits",
      "deferredVestedBenefits",
    ],
  },
  {
    sectionId: "C",
    sectionTitle: "Service",
    fieldPaths: [
      "vestingServiceDefinition",
      "creditedServiceDefinition",
      "serviceComputationMethod",
      "breakInServiceRules",
    ],
  },
  {
    sectionId: "D",
    sectionTitle: "Retirement Benefit",
    fieldPaths: [
      "benefitFormula",
      "shortServiceFactor",
      "accrualFactor",
      "compensationDefinition",
      "averageCompensationPeriod",
      "integrationMethod",
      "socialSecurityOffset",
    ],
  },
  {
    sectionId: "E",
    sectionTitle: "Supplemental Benefits",
    fieldPaths: [
      "supplementalBenefitProvisions",
      "supplementalBenefitDuration",
      "supplementalBenefitEligibility",
    ],
  },
  {
    sectionId: "F",
    sectionTitle: "Form of Benefit",
    fieldPaths: [
      "normalFormOfBenefit",
      "optionalFormsOfBenefit",
      "jointAndSurvivorOptions",
      "formOfBenefitForDifferentGroups",
    ],
  },
  {
    sectionId: "G",
    sectionTitle: "Early Retirement Adjustment",
    fieldPaths: [
      "earlyRetirementAdjustmentFactors",
      "subsidizedEarlyRetirementProvisions",
      "earlyRetirementAdjustmentForDifferentGroups",
    ],
  },
  {
    sectionId: "H",
    sectionTitle: "Late Retirement Adjustment",
    fieldPaths: [
      "lateRetirementAdjustmentFactors",
      "suspensionOfBenefitProvision",
      "postNRDAdjustment",
    ],
  },
  {
    sectionId: "I",
    sectionTitle: "Disability Benefit",
    fieldPaths: [
      "disabilityBenefitProvisions",
      "disabilityBenefitCommencement",
      "disabilityBenefitConversion",
    ],
  },
  {
    sectionId: "J",
    sectionTitle: "Death Benefits",
    fieldPaths: [
      "qualifiedPreRetirementSurvivorAnnuity",
      "preRetirementLumpSumDeathBenefit",
      "postRetirementDeathBenefit",
    ],
  },
  {
    sectionId: "K",
    sectionTitle: "Provisions for Deferred Participants",
    fieldPaths: [
      "deferredVestedBenefitProvisions",
      "automaticCashOutProvisions",
      "deMinimisCashOutThreshold",
    ],
  },
  {
    sectionId: "L",
    sectionTitle: "Transfer Provisions",
    fieldPaths: [
      "transferProvisions",
      "transferLimitations",
      "multiEmployerTransferRules",
    ],
  },
  {
    sectionId: "M",
    sectionTitle: "Mandatory Employee Contributions",
    fieldPaths: [
      "mandatoryContributionProvisions",
      "mandatoryContributionRates",
      "mandatoryContributionDiscontinuance",
    ],
  },
  {
    sectionId: "N",
    sectionTitle: "Voluntary Employee Contributions",
    fieldPaths: [
      "voluntaryContributionProvisions",
      "voluntaryContributionRates",
      "voluntaryContributionDiscontinuance",
    ],
  },
  {
    sectionId: "O",
    sectionTitle: "Top Heavy",
    fieldPaths: [
      "topHeavyStatus",
      "topHeavyMinimumBenefit",
      "topHeavyTestingMethod",
    ],
  },
  {
    sectionId: "P",
    sectionTitle: "Default Actuarial Equivalence",
    fieldPaths: [
      "actuarialEquivalenceMethod",
      "mortalityTable",
      "interestRate",
      "lookbackPeriod",
      "stabilityPeriod",
      "preRetirementMortality",
    ],
  },
  {
    sectionId: "Q",
    sectionTitle: "Consensual Lump Sum Provisions",
    fieldPaths: [
      "consensualLumpSumEligibility",
      "consensualLumpSumCalculation",
    ],
  },
  {
    sectionId: "R",
    sectionTitle: "Additional Provisions of Note",
    fieldPaths: [
      "section415Limits",
      "costOfLivingAdjustments",
      "spinOffProvisions",
      "section436Limits",
      "otherProvisions",
    ],
  },
  {
    sectionId: "S",
    sectionTitle: "Names of Majority Owners",
    fieldPaths: ["majorityOwnerNames"],
  },
] as const;
