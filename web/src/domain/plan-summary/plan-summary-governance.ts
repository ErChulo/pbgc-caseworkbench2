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
  await requireValidRecord(record);
  if (record.overallStatus !== "draft")
    throw new Error("Only draft Plan Summaries can be changed.");
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

  if (existingAttribute)
    throw new Error(
      "Existing attributes require an explicit supersession workflow.",
    );
  const attributeId = deps.uuid.generate();
  const attribute: PlanSummaryAttribute = {
    attributeId,
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
      attributeId,
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

    const updatedAttributes = [...currentSection.attributes, attribute];

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
  await requireValidRecord(record);
  if (record.overallStatus !== "draft")
    throw new Error("Only draft Plan Summaries can be changed.");
  if (
    (humanActor as { actorType: string }).actorType !== "human" ||
    !humanActor.actorKey.trim() ||
    !humanActor.displayName.trim() ||
    !humanActor.authorityContext.trim() ||
    !rationale.trim()
  )
    throw new Error(
      "A reviewer, authority context and rationale are required.",
    );
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

    if (
      attribute.status !== "proposed" ||
      attribute.blockedReason !== null ||
      attribute.conflictingValues.length > 0
    )
      throw new Error(
        "Only unblocked, non-conflicting proposed attributes can be approved.",
      );
    if (
      selectedValue === null ||
      selectedValue.trim() === "" ||
      selectedValue !== attribute.fieldValue
    )
      throw new Error("Approval must select the exact proposed value.");
    if (
      attribute.citations.length === 0 ||
      (selectedCitation !== null &&
        !attribute.citations.some(
          (citation) =>
            JSON.stringify(citation) === JSON.stringify(selectedCitation),
        ))
    )
      throw new Error(
        "Approval requires a citation from the proposed evidence.",
      );
    const approvedAttribute: PlanSummaryAttribute = {
      ...attribute,
      status: "approved",
      fieldValue: selectedValue,
      citations: selectedCitation ? [selectedCitation] : attribute.citations,
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
  await requireValidRecord(record);
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
  await requireValidRecord(record);
  if (record.overallStatus !== "draft")
    throw new Error("Only draft Plan Summaries can be changed.");
  if (
    (humanActor as { actorType: string }).actorType !== "human" ||
    !humanActor.actorKey.trim() ||
    !humanActor.displayName.trim() ||
    !humanActor.authorityContext.trim()
  )
    throw new Error("A reviewer and authority context are required.");
  const attributes = record.sections.flatMap((section) => section.attributes);
  const allApproved =
    attributes.length > 0 &&
    attributes.every(
      (attr) =>
        attr.status === "approved" && attr.reviewStatus === "human-approved",
    );

  if (!allApproved) {
    throw new Error(
      "Cannot promote to preliminary: all attributes must be approved and at least one is required.",
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

async function requireValidRecord(record: PlanSummaryRecord): Promise<void> {
  if (
    record.sections.length !== PLAN_SUMMARY_SECTIONS.length ||
    PLAN_SUMMARY_SECTIONS.some(
      (definition) =>
        record.sections.filter(
          (section) =>
            section.sectionId === definition.sectionId &&
            section.sectionTitle === definition.sectionTitle,
        ).length !== 1,
    )
  )
    throw new Error("Plan Summary section inventory is invalid.");
  const ids = new Set<string>();
  for (const section of record.sections) {
    const fields = new Set<string>();
    for (const attribute of section.attributes) {
      if (
        ids.has(attribute.attributeId) ||
        fields.has(attribute.fieldPath) ||
        !attribute.fieldPath.trim()
      )
        throw new Error("Plan Summary attribute inventory is invalid.");
      ids.add(attribute.attributeId);
      fields.add(attribute.fieldPath);
      if (
        attribute.sectionId !== section.sectionId ||
        (await computeAttributeHash({
          attributeId: attribute.attributeId,
          sectionId: attribute.sectionId,
          fieldPath: attribute.fieldPath,
          fieldValue: attribute.fieldValue,
          source: attribute.source,
          citations: attribute.citations,
          effectiveDate: attribute.effectiveDate,
          adoptionDate: attribute.adoptionDate,
          phaseInPercentage: attribute.phaseInPercentage,
        })) !== attribute.attributeContentSha256
      )
        throw new Error("Plan Summary attribute integrity check failed.");
    }
    if (
      (await computeSectionHash(section.attributes)) !==
      section.sectionContentSha256
    )
      throw new Error("Plan Summary section integrity check failed.");
  }
  if ((await computeRecordHash(record)) !== record.recordContentSha256)
    throw new Error("Plan Summary record integrity check failed.");
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
  const { recordContentSha256: ignored, ...content } =
    record as PlanSummaryRecord;
  void ignored;
  const hash = await hashTyped(content, { typeName: "PlanSummaryRecord" });
  return hash as Sha256;
}

async function computeDecisionHash(
  decision: Omit<PlanSummaryDecision, "decisionContentSha256">,
): Promise<Sha256> {
  const hash = await hashTyped(decision, { typeName: "PlanSummaryDecision" });
  return hash as Sha256;
}
