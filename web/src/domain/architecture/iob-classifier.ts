import type {
  CellDescriptor,
  IoBClassification,
  IoBValue,
  RunDescriptor,
} from "./models";

export interface IoBClassificationRule {
  readonly fieldPattern: string;
  readonly runPattern: string;
  readonly iob: IoBValue;
  readonly priority: number;
  readonly justification: string;
}

export interface IoBClassifier {
  readonly classify: (
    fieldDescription: string,
    runId: string,
  ) => IoBClassificationResult;
  readonly getAllRules: () => readonly IoBClassificationRule[];
}

export interface IoBClassificationResult {
  readonly iob: IoBValue;
  readonly justification: string;
  readonly ruleVersion: string;
  readonly matchedRule: IoBClassificationRule | null;
}

function matchesPattern(pattern: string, value: string): boolean {
  const lowerValue = value.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  if (lowerPattern.includes("*")) {
    const escaped = lowerPattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".*");
    const regex = new RegExp(`^${escaped}$`, "iu");
    return regex.test(lowerValue);
  }

  return lowerValue.includes(lowerPattern) || lowerPattern.includes(lowerValue);
}

export function createIoBClassifier(
  rules: readonly IoBClassificationRule[],
  ruleVersion = "1.0.0",
): IoBClassifier {
  const sortedRules = [...rules].sort(
    (a, b) =>
      b.priority - a.priority ||
      a.fieldPattern.localeCompare(b.fieldPattern) ||
      a.runPattern.localeCompare(b.runPattern) ||
      a.iob.localeCompare(b.iob),
  );

  return {
    classify(fieldDescription: string, runId: string): IoBClassificationResult {
      if (fieldDescription === "CALC_INDICATOR")
        return {
          iob: "B",
          justification:
            "CALC_INDICATOR identifies valuation/recalculation context and is Both; B remains only its I/O/B value.",
          ruleVersion,
          matchedRule: null,
        };
      if (fieldDescription === "CALCULATION")
        return {
          iob: "N",
          justification: `CALCULATION documents calculation run ${runId} and is Neither direct input nor output.`,
          ruleVersion,
          matchedRule: null,
        };
      for (const rule of sortedRules) {
        const fieldMatches = matchesPattern(
          rule.fieldPattern,
          fieldDescription,
        );
        const runMatches =
          rule.runPattern === "*" || matchesPattern(rule.runPattern, runId);

        if (fieldMatches && runMatches) {
          return {
            iob: rule.iob,
            justification: rule.justification,
            ruleVersion,
            matchedRule: rule,
          };
        }
      }

      return {
        iob: "",
        justification: "No approved I/O/B rule matched this field and run.",
        ruleVersion,
        matchedRule: null,
      };
    },

    getAllRules(): readonly IoBClassificationRule[] {
      return sortedRules;
    },
  };
}

export function classifyIoB(input: {
  readonly cells: ReadonlyMap<string, CellDescriptor>;
  readonly scenarios: readonly RunDescriptor[];
  readonly iobPolicy: readonly IoBClassificationRule[];
  readonly ruleVersion: string;
}): ReadonlyMap<string, CellDescriptor> {
  const classifier = createIoBClassifier(input.iobPolicy, input.ruleVersion);
  return new Map(
    [...input.cells.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, cell]) => {
        const perRunClassification = new Map<string, IoBClassification>();
        for (const scenario of [...input.scenarios].sort((left, right) =>
          left.runId.localeCompare(right.runId),
        )) {
          const classified = classifier.classify(
            cell.genericField,
            scenario.runId,
          );
          perRunClassification.set(scenario.runId, {
            runId: scenario.runId,
            iob: classified.iob,
            justification: classified.justification,
            ruleVersion: classified.ruleVersion,
          });
        }
        return [key, { ...cell, perRunClassification }] as const;
      }),
  );
}
