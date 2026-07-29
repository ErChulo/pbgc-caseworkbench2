import { describe, it, expect } from "vitest";
import {
  createIoBClassifier,
  type IoBClassificationRule,
} from "../../../../src/domain/architecture/iob-classifier";

describe("iob-classifier", () => {
  const mockRules: IoBClassificationRule[] = [
    {
      fieldPattern: "CALC_INDICATOR",
      runPattern: "*",
      iob: "B",
      priority: 100,
      justification: "Constitution §7",
    },
    {
      fieldPattern: "CALCULATION",
      runPattern: "*",
      iob: "N",
      priority: 100,
      justification: "Constitution §7",
    },
    {
      fieldPattern: "DOB",
      runPattern: "*",
      iob: "I",
      priority: 50,
      justification: "Date of birth",
    },
    {
      fieldPattern: "BENEFIT",
      runPattern: "*",
      iob: "O",
      priority: 50,
      justification: "Benefit amount",
    },
  ];

  it("classifies CALC_INDICATOR as B", () => {
    const classifier = createIoBClassifier(mockRules);
    const result = classifier.classify("CALC_INDICATOR", "DOR");
    expect(result.iob).toBe("B");
    expect(result.justification).toContain("valuation/recalculation context");
  });

  it("classifies CALCULATION as N", () => {
    const classifier = createIoBClassifier(mockRules);
    const result = classifier.classify("CALCULATION", "DOR");
    expect(result.iob).toBe("N");
  });

  it("classifies DOB as I", () => {
    const classifier = createIoBClassifier(mockRules);
    const result = classifier.classify("DOB", "DOR");
    expect(result.iob).toBe("I");
  });

  it("classifies BENEFIT as O", () => {
    const classifier = createIoBClassifier(mockRules);
    const result = classifier.classify("BENEFIT", "DOR");
    expect(result.iob).toBe("O");
  });

  it("fails closed for unmatched fields", () => {
    const classifier = createIoBClassifier(mockRules);
    const result = classifier.classify("UNKNOWN_FIELD", "DOR");
    expect(result.iob).toBe("");
    expect(result.matchedRule).toBeNull();
  });

  it("enforces CALC semantics even when policy attempts to override them", () => {
    const classifier = createIoBClassifier([
      {
        fieldPattern: "CALC_INDICATOR",
        runPattern: "*",
        iob: "O",
        priority: 999,
        justification: "Invalid override",
      },
      {
        fieldPattern: "CALCULATION",
        runPattern: "*",
        iob: "B",
        priority: 999,
        justification: "Invalid override",
      },
    ]);
    expect(classifier.classify("CALC_INDICATOR", "DOR").iob).toBe("B");
    const calculation = classifier.classify("CALCULATION", "NRD");
    expect(calculation.iob).toBe("N");
    expect(calculation.justification).toContain("NRD");
  });

  it("respects priority ordering", () => {
    const rules: IoBClassificationRule[] = [
      {
        fieldPattern: "TEST",
        runPattern: "*",
        iob: "I",
        priority: 10,
        justification: "Low priority",
      },
      {
        fieldPattern: "TEST",
        runPattern: "*",
        iob: "O",
        priority: 100,
        justification: "High priority",
      },
    ];
    const classifier = createIoBClassifier(rules);
    const result = classifier.classify("TEST", "DOR");
    expect(result.iob).toBe("O");
    expect(result.justification).toBe("High priority");
  });

  it("returns all rules sorted by priority", () => {
    const classifier = createIoBClassifier(mockRules);
    const allRules = classifier.getAllRules();
    expect(allRules.length).toBe(4);
    const first = allRules[0];
    const second = allRules[1];
    expect(first?.priority).toBeGreaterThanOrEqual(second?.priority ?? 0);
  });
});
