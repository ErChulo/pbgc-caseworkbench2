import { SHA_A, SHA_B } from "./schema-cases";

export const numericGoldenVectors = [
  { name: "integer", value: 1, expected: "1" },
  { name: "equivalent decimal notation", value: 1.0, expected: "1" },
  { name: "equivalent exponent notation", value: 1, expected: "1" },
  { name: "positive zero", value: 0, expected: "0" },
  { name: "negative zero", value: -0, expected: "0" },
  { name: "ordinary fraction", value: 0.125, expected: "0.125" },
  {
    name: "largest finite value",
    value: Number.MAX_VALUE,
    expected: "1.7976931348623157e+308",
  },
  {
    name: "smallest positive finite value",
    value: Number.MIN_VALUE,
    expected: "5e-324",
  },
  {
    name: "safe integer boundary",
    value: Number.MAX_SAFE_INTEGER,
    expected: "9007199254740991",
  },
  {
    name: "nested number",
    value: { b: [1, -0], a: 0.125 },
    expected: '{"a":0.125,"b":[1,0]}',
  },
] as const;

export const canonicalDecimalCases = {
  valid: ["0", "1", "-1", "0.125", "-100.25"],
  invalid: [
    "1e0",
    "+1",
    "01",
    "1.0",
    "1.",
    "-0",
    "-0.0",
    " 1",
    "1 ",
    "NaN",
    "Infinity",
  ],
} as const;

export const evidenceA = {
  evidenceKey: SHA_A,
  artifactSha256: SHA_A,
  citationId: "citation-a",
  sourceLocator: "synthetic/row/1",
  evidenceKind: "header-match",
  observedTextOrValue: "synthetic-field-a",
};

export const evidenceB = {
  evidenceKey: SHA_B,
  artifactSha256: SHA_A,
  citationId: "citation-b",
  sourceLocator: "synthetic/row/2",
  evidenceKind: "row-count",
  observedTextOrValue: 3,
};

export const typedPopulationCandidate = {
  candidateKey: "c".repeat(64),
  artifactSha256: SHA_A,
  candidateStatus: "proposed",
  detectorIdentity: "synthetic-detector",
  detectorVersion: "1.0.0",
  confidence: 0.75,
  evidence: [evidenceA, evidenceB],
  observedFields: ["FIELD_A", "FIELD_B"],
  recordCounts: [3],
  sensitivity: "synthetic-mock",
  correctionsOrImputationsApplied: false,
};

export const candidateShapedArbitraryExportRecord = {
  generalKey: "mock-001",
  evidence: [evidenceA, evidenceB],
};

export const recursiveCanonicalCases = [
  {
    name: "recursive object keys",
    left: { z: { y: 2, x: 1 }, a: true },
    right: { a: true, z: { x: 1, y: 2 } },
    equivalent: true,
  },
  {
    name: "unregistered nested array order",
    left: { proposedExtractedFacts: { values: ["first", "second"] } },
    right: { proposedExtractedFacts: { values: ["second", "first"] } },
    equivalent: false,
  },
  {
    name: "mixed nested arrays and objects",
    left: { value: [{ b: 2, a: 1 }, ["x", "y"]] },
    right: { value: [{ a: 1, b: 2 }, ["x", "y"]] },
    equivalent: true,
  },
  {
    name: "null differs from absence",
    left: { value: null },
    right: {},
    equivalent: false,
  },
] as const;

export const duplicateAndNormalizationCases = [
  {
    name: "NFC-indistinguishable set values",
    typeName: "CandidateDocumentOrReportTypes",
    value: ["Café", "Cafe\u0301"],
    expectedCode: "INDISTINGUISHABLE_NORMALIZED_ELEMENT",
  },
  {
    name: "duplicate evidence keys",
    typeName: "PopulationCandidate",
    value: { ...typedPopulationCandidate, evidence: [evidenceA, evidenceA] },
    expectedCode: "DUPLICATE_SET_KEY",
  },
] as const;
