import type { CompilerPolicy, FunctionPolicy } from "./models";

const exact = (name: string, count: number): FunctionPolicy => ({
  name,
  minimumArguments: count,
  maximumArguments: count,
});
const variable = (
  name: string,
  minimum: number,
  maximum: number,
): FunctionPolicy => ({
  name,
  minimumArguments: minimum,
  maximumArguments: maximum,
});

export const excelScalarV1Policy: CompilerPolicy = {
  policyId: "excel-scalar-v1",
  policyVersion: "1.0.0",
  functions: [
    ...[
      "ABS",
      "DAY",
      "INT",
      "ISBLANK",
      "ISLOGICAL",
      "ISNUMBER",
      "ISTEXT",
      "MONTH",
      "NOT",
      "SIGN",
      "YEAR",
    ].map((name) => exact(name, 1)),
    ...["DAYS", "MOD", "ROUND", "ROUNDDOWN", "ROUNDUP"].map((name) =>
      exact(name, 2),
    ),
    exact("DATE", 3),
    exact("IF", 3),
    variable("TRUNC", 1, 2),
    ...["AND", "MAX", "MIN", "OR", "PRODUCT", "SUM"].map((name) =>
      variable(name, 1, 255),
    ),
  ].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  ),
  volatileFunctions: [
    "CELL",
    "INDIRECT",
    "INFO",
    "NOW",
    "OFFSET",
    "RAND",
    "RANDARRAY",
    "RANDBETWEEN",
    "TODAY",
  ],
  activeFunctions: ["FILTERXML", "HYPERLINK", "RTD", "WEBSERVICE"],
  limits: {
    maximumFormulaLength: 8_192,
    maximumNesting: 64,
    maximumTokens: 4_096,
    maximumArguments: 255,
  },
};

export function findFunction(
  policy: CompilerPolicy,
  name: string,
): FunctionPolicy | undefined {
  const normalized = name.toUpperCase();
  return policy.functions.find((entry) => entry.name === normalized);
}
