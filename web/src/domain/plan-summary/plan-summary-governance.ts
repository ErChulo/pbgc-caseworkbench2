import type { Sha256, UtcTimestamp, Uuid } from "../shared/types";
import type { HumanActor } from "../quarantine/models";
import { hashTyped } from "../manifests/canonical-json";
import type {
  PlanSummaryRecord,
  PlanSummarySection,
  PlanSummaryAttribute,
  PlanSummaryDecision,
  PlanSummaryCitation,
  PlanSummarySectionId,
} from "./models";
import { PLAN_SUMMARY_SECTIONS } from "./models";

interface PlanSummaryGovernanceDependencies {
  readonly uuid: { generate: () => Uuid };
  readonly clock: { now: () => UtcTimestamp };
}

export async function createEmptyPlanSummaryRecord(
  caseId: Uuid,
  deps: PlanSummaryGovernanceDependencies,
): Promise<PlanSummaryRecord> {
  const sections: PlanSummarySection[] = [];
  for (const definition of PLAN_SUMMARY_SECTIONS) {
    const sectionHash = await computeSectionHash([]);
    const section: PlanSummarySection = {
      sectionId: definition.sectionId,
      sectionTitle: definition.sectionTitle,
      attributes: [],
      sectionContentSha256: sectionHash,
    };
    sections.push(section);
  }

  const record: Omit<PlanSummaryRecord, "recordContentSha256"> = {
    recordId: deps.uuid.generate(),
    caseId,
    schemaVersion: "1.0.0",
    sections,
    overallStatus: "draft",
    lastApprovedAt: null,
    lastApprovedBy: null,
  };

  const contentSha256 = await computeRecordHash(record);
  return { ...record, recordContentSha256: contentSha256 };
}

export async function addPlanSummaryAttribute(
  record: PlanSummaryRecord,
  sectionId: PlanSummarySectionId,
  fieldPath: string,
  fieldValue: string | null,
  source: PlanSummaryAttribute["source"],
  citations: readonly PlanSummaryCitation[],
  effectiveDate: string | null,
  adoptionDate: string | null,
  phaseInPercentage: number | null,
  humanActor: HumanActor,
  deps: PlanSummaryGovernanceDependencies,
): Promise<PlanSummaryRecord> {
  const sectionIndex = record.sections.findIndex(
    (s) => s.sectionId === sectionId,
  );
  if (sectionIndex === -1) {
    throw new Error(`Invalid section ID: ${sectionId}`);
  }

  const section = record.sections[sectionIndex];
  if (!section) {
    throw new Error(`Section ${sectionId} not found.`);
  }

  const existingAttribute = section.attributes.find(
    (a) => a.fieldPath === fieldPath,
  );

  const attribute: PlanSummaryAttribute = {
    attributeId: existingAttribute?.attributeId ?? deps.uuid.generate(),
    sectionId,
    fieldPath,
    fieldValue,
    status: "proposed",
    source,
    citations,
    conflictingValues: [],
    derivedFormula: null,
    derivedInputAttributes: [],
    blockedReason: null,
    effectiveDate,
    adoptionDate,
    phaseInPercentage,
    humanActor,
    authoredAt: deps.clock.now(),
    reviewStatus: "provisional",
    approvalRationale: "",
    attributeContentSha256: await computeAttributeHash({
      attributeId: existingAttribute?.attributeId ?? deps.uuid.generate(),
      sectionId,
      fieldPath,
      fieldValue,
      source,
      citations,
      effectiveDate,
      adoptionDate,
      phaseInPercentage,
    }),
  };

  const updatedSections: PlanSummarySection[] = [];
  for (let i = 0; i < record.sections.length; i++) {
    const currentSection = record.sections[i];
    if (!currentSection || i !== sectionIndex) {
      if (currentSection) updatedSections.push(currentSection);
      continue;
    }

    const updatedAttributes = existingAttribute
      ? currentSection.attributes.map((a) =>
          a.attributeId === existingAttribute.attributeId ? attribute : a,
        )
      : [...currentSection.attributes, attribute];

    const sectionHash = await computeSectionHash(updatedAttributes);
    updatedSections.push({
      sectionId: currentSection.sectionId,
      sectionTitle: currentSection.sectionTitle,
      attributes: updatedAttributes,
      sectionContentSha256: sectionHash,
    });
  }

  const updatedRecord: Omit<PlanSummaryRecord, "recordContentSha256"> = {
    ...record,
    sections: updatedSections,
  };

  const contentSha256 = await computeRecordHash(updatedRecord);
  return { ...updatedRecord, recordContentSha256: contentSha256 };
}

export async function approvePlanSummaryAttribute(
  record: PlanSummaryRecord,
  attributeId: Uuid,
  selectedValue: string | null,
  selectedCitation: PlanSummaryCitation | null,
  rationale: string,
  humanActor: HumanActor,
  deps: PlanSummaryGovernanceDependencies,
): Promise<{ record: PlanSummaryRecord; decision: PlanSummaryDecision }> {
  let found = false;
  const updatedSections: PlanSummarySection[] = [];

  for (const section of record.sections) {
    const attributeIndex = section.attributes.findIndex(
      (a) => a.attributeId === attributeId,
    );
    if (attributeIndex === -1) {
      updatedSections.push(section);
      continue;
    }

    found = true;
    const attribute = section.attributes[attributeIndex];
    if (!attribute) {
      updatedSections.push(section);
      continue;
    }

    const approvedAttribute: PlanSummaryAttribute = {
      ...attribute,
      status: "approved",
      fieldValue: selectedValue,
      reviewStatus: "human-approved",
      approvalRationale: rationale,
      attributeContentSha256: await computeAttributeHash({
        attributeId: attribute.attributeId,
        sectionId: attribute.sectionId,
        fieldPath: attribute.fieldPath,
        fieldValue: selectedValue,
        source: attribute.source,
        citations: selectedCitation ? [selectedCitation] : attribute.citations,
        effectiveDate: attribute.effectiveDate,
        adoptionDate: attribute.adoptionDate,
        phaseInPercentage: attribute.phaseInPercentage,
      }),
    };

    const updatedAttributes = [...section.attributes];
    updatedAttributes[attributeIndex] = approvedAttribute;

    const sectionHash = await computeSectionHash(updatedAttributes);
    updatedSections.push({
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      attributes: updatedAttributes,
      sectionContentSha256: sectionHash,
    });
  }

  if (!found) {
    throw new Error(`Attribute ${attributeId} not found.`);
  }

  const updatedRecord: Omit<PlanSummaryRecord, "recordContentSha256"> = {
    ...record,
    sections: updatedSections,
  };

  const contentSha256 = await computeRecordHash(updatedRecord);
  const finalRecord = { ...updatedRecord, recordContentSha256: contentSha256 };

  const decision: Omit<PlanSummaryDecision, "decisionContentSha256"> = {
    decisionId: deps.uuid.generate(),
    attributeId,
    caseId: record.caseId,
    selectedValue,
    selectedCitation,
    rationale,
    humanActor,
    decidedAt: deps.clock.now(),
  };

  const decisionHash = await computeDecisionHash(decision);
  const finalDecision = { ...decision, decisionContentSha256: decisionHash };

  return { record: finalRecord, decision: finalDecision };
}

export async function detectConflicts(
  record: PlanSummaryRecord,
): Promise<PlanSummaryRecord> {
  const updatedSections: PlanSummarySection[] = [];

  for (const section of record.sections) {
    const updatedAttributes: PlanSummaryAttribute[] = [];

    for (const attribute of section.attributes) {
      if (
        attribute.conflictingValues.length > 1 &&
        attribute.status !== "approved"
      ) {
        updatedAttributes.push({
          ...attribute,
          status: "conflict",
        });
      } else {
        updatedAttributes.push(attribute);
      }
    }

    updatedSections.push({
      ...section,
      attributes: updatedAttributes,
      sectionContentSha256: await computeSectionHash(updatedAttributes),
    });
  }

  const updatedRecord: Omit<PlanSummaryRecord, "recordContentSha256"> = {
    ...record,
    sections: updatedSections,
  };

  const contentSha256 = await computeRecordHash(updatedRecord);
  return { ...updatedRecord, recordContentSha256: contentSha256 };
}

export async function promotePlanSummaryToPreliminary(
  record: PlanSummaryRecord,
  humanActor: HumanActor,
  deps: PlanSummaryGovernanceDependencies,
): Promise<PlanSummaryRecord> {
  const allApproved = record.sections.every((section) =>
    section.attributes.every(
      (attr) => attr.status === "approved" || attr.status === "blocked",
    ),
  );

  if (!allApproved) {
    throw new Error(
      "Cannot promote to preliminary: all attributes must be approved or blocked.",
    );
  }

  const updatedRecord: Omit<PlanSummaryRecord, "recordContentSha256"> = {
    ...record,
    overallStatus: "preliminary",
    lastApprovedAt: deps.clock.now(),
    lastApprovedBy: humanActor,
  };

  const contentSha256 = await computeRecordHash(updatedRecord);
  return { ...updatedRecord, recordContentSha256: contentSha256 };
}

async function computeAttributeHash(
  attribute: Omit<
    PlanSummaryAttribute,
    | "attributeContentSha256"
    | "status"
    | "conflictingValues"
    | "derivedFormula"
    | "derivedInputAttributes"
    | "blockedReason"
    | "humanActor"
    | "authoredAt"
    | "reviewStatus"
    | "approvalRationale"
  >,
): Promise<Sha256> {
  const hash = await hashTyped(attribute, { typeName: "PlanSummaryAttribute" });
  return hash as Sha256;
}

async function computeSectionHash(
  attributes: readonly PlanSummaryAttribute[],
): Promise<Sha256> {
  const hash = await hashTyped(attributes, { typeName: "PlanSummarySection" });
  return hash as Sha256;
}

async function computeRecordHash(
  record: Omit<PlanSummaryRecord, "recordContentSha256">,
): Promise<Sha256> {
  const hash = await hashTyped(record, { typeName: "PlanSummaryRecord" });
  return hash as Sha256;
}

async function computeDecisionHash(
  decision: Omit<PlanSummaryDecision, "decisionContentSha256">,
): Promise<Sha256> {
  const hash = await hashTyped(decision, { typeName: "PlanSummaryDecision" });
  return hash as Sha256;
}
