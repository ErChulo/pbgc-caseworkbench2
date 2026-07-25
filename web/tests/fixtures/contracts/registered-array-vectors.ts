import { SHA_A, SHA_B } from "./schema-cases";

export interface RegisteredArrayVector {
  readonly schemaId: string;
  readonly path: string;
  readonly semantics: "set-like" | "order-significant" | "intrinsic";
  readonly original: unknown;
  readonly permuted: unknown;
  readonly reorderedIsInvalid?: boolean;
  readonly typeName?: string;
}

function itemsFor(path: string): readonly [unknown, unknown] {
  if (
    path.endsWith(".evidence") &&
    (path.includes("populationCandidate") ||
      path === "PopulationCandidate.evidence")
  ) {
    return [
      {
        evidenceKey: SHA_A,
        artifactSha256: SHA_A,
        citationId: "citation-a",
        sourceLocator: "synthetic/a",
        evidenceKind: "header-match",
      },
      {
        evidenceKey: SHA_B,
        artifactSha256: SHA_B,
        citationId: "citation-b",
        sourceLocator: "synthetic/b",
        evidenceKind: "row-count",
      },
    ];
  }
  if (path.endsWith("artifactSha256Values")) return [SHA_A, SHA_B];
  if (path.includes("transformedOrGeneralizedFields")) {
    return [
      {
        outputField: "ageBand",
        sourceField: "age",
        method: "band",
        ruleVersion: "1",
      },
      {
        outputField: "serviceBand",
        sourceField: "service",
        method: "band",
        ruleVersion: "1",
      },
    ];
  }
  if (path.includes("retainedGeneralizedQuasiFields")) {
    return [
      {
        fieldName: "ageBand",
        transformation: "five-year band",
        justification: "Synthetic",
        residualRiskResult: "low",
        validationStatus: "passed",
      },
      {
        fieldName: "serviceBand",
        transformation: "five-year band",
        justification: "Synthetic",
        residualRiskResult: "low",
        validationStatus: "passed",
      },
    ];
  }
  if (path.includes("missingFacts")) {
    return [
      { factKey: "fact-a", description: "Synthetic A" },
      { factKey: "fact-b", description: "Synthetic B" },
    ];
  }
  if (path.includes("sourcePriorityRecommendations")) {
    return [
      {
        priority: 1,
        documentOrReportType: "primary",
        rationale: "Synthetic",
        recommendationOnly: true,
      },
      {
        priority: 2,
        documentOrReportType: "secondary",
        rationale: "Synthetic",
        recommendationOnly: true,
      },
    ];
  }
  if (path.includes("sourceCitations")) {
    return [
      {
        citationId: "citation-a",
        artifactSha256: SHA_A,
        sourceLocator: "synthetic/a",
      },
      {
        citationId: "citation-b",
        artifactSha256: SHA_B,
        sourceLocator: "synthetic/b",
      },
    ];
  }
  if (path.includes("snapshot.entries")) {
    return [
      { submittedPath: "synthetic/a.txt", sha256: SHA_A, sizeBytes: 1 },
      { submittedPath: "synthetic/b.txt", sha256: SHA_B, sizeBytes: 2 },
    ];
  }
  if (path.endsWith(".artifacts")) {
    return [
      { artifactKey: "artifact-a", sha256: SHA_A },
      { artifactKey: "artifact-b", sha256: SHA_B },
    ];
  }
  if (path.includes("extractionResults")) {
    return [
      {
        sourceArtifactSha256: SHA_A,
        sourceLocator: "synthetic/a",
        ruleVersion: "1",
      },
      {
        sourceArtifactSha256: SHA_B,
        sourceLocator: "synthetic/b",
        ruleVersion: "1",
      },
    ];
  }
  if (path.includes("screeningFindings")) {
    return [
      { findingKey: "finding-a", artifactSha256: SHA_A },
      { findingKey: "finding-b", artifactSha256: SHA_B },
    ];
  }
  if (path.includes("screeningOutcomes")) {
    return [
      { outcomeKey: "outcome-a", artifactSha256: SHA_A },
      { outcomeKey: "outcome-b", artifactSha256: SHA_B },
    ];
  }
  if (path.includes("classificationProposals")) {
    return [
      { proposalKey: "proposal-a", artifactSha256: SHA_A },
      { proposalKey: "proposal-b", artifactSha256: SHA_B },
    ];
  }
  if (path.includes("evidenceRelationships")) {
    return [
      { relationshipKey: "relationship-a" },
      { relationshipKey: "relationship-b" },
    ];
  }
  if (path.includes("populationEvidenceObservations")) {
    return [
      {
        evidenceKey: SHA_A,
        citationId: "citation-a",
        artifactSha256: SHA_A,
        sourceLocator: "synthetic/a",
      },
      {
        evidenceKey: SHA_B,
        citationId: "citation-b",
        artifactSha256: SHA_B,
        sourceLocator: "synthetic/b",
      },
    ];
  }
  if (path.includes("populationCandidates")) {
    return [
      { candidateKey: SHA_A, artifactSha256: SHA_A, evidence: [] },
      { candidateKey: SHA_B, artifactSha256: SHA_B, evidence: [] },
    ];
  }
  if (path.includes("unresolvedItems")) {
    return [{ itemKey: "item-a" }, { itemKey: "item-b" }];
  }
  if (
    path.includes("validationFindings") ||
    path.includes("validationResults")
  ) {
    return [
      { validationKey: "validation-a" },
      { validationKey: "validation-b" },
    ];
  }
  if (path.includes("acquisitionPayloadReferences")) {
    return [
      {
        requestPayloadSha256: SHA_A,
        packagePayloadSha256: SHA_A,
        proposalPayloadSha256: null,
      },
      {
        requestPayloadSha256: SHA_B,
        packagePayloadSha256: SHA_B,
        proposalPayloadSha256: null,
      },
    ];
  }
  if (
    path.includes("originLedger") ||
    path.includes("terminalDispositionLedger")
  ) {
    return [{ recordId: "record-a" }, { recordId: "record-b" }];
  }
  if (path.includes("findingKeys") || path.includes("subjectKeys")) {
    return ["key-a", "key-b"];
  }
  if (path.toLowerCase().includes("sha256")) return [SHA_A, SHA_B];
  return ["Alpha", "Bravo"];
}

function embed(path: string, items: readonly unknown[]): unknown {
  const tokens = path.split(".");
  let value: unknown = [...items];
  for (const token of tokens.reverse()) {
    if (token.endsWith("[]")) {
      value = { [token.slice(0, -2)]: [value] };
    } else {
      value = { [token]: value };
    }
  }
  return value;
}

export function makeRegisteredArrayVector(
  schemaId: string,
  path: string,
  semanticsText: string,
): RegisteredArrayVector {
  const semantics = /intrinsic/iu.test(semanticsText)
    ? "intrinsic"
    : /set-like/iu.test(semanticsText)
      ? "set-like"
      : "order-significant";
  const items = itemsFor(path);
  if (path === "PopulationCandidate.evidence") {
    const candidate = { typeName: "PopulationCandidate", evidence: items };
    return {
      schemaId,
      path,
      semantics,
      original: candidate,
      permuted: { ...candidate, evidence: [...items].reverse() },
      typeName: "PopulationCandidate",
    };
  }
  return {
    schemaId,
    path,
    semantics,
    original: embed(path, items),
    permuted: embed(path, [...items].reverse()),
    reorderedIsInvalid: path.includes("sourcePriorityRecommendations"),
  };
}
