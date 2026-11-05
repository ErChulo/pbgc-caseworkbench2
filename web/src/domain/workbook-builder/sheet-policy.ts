import type { ValidationError } from "../shared/validation-result";

/** Calculation sheets are serialized after these reserved support sheets. */
export function validateCalculationSheetNames(
  names: readonly string[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set(["SUMMARY", "TABLES", "UD TABLE"]);
  for (const name of names) {
    const key = name.toUpperCase();
    if (key === "MYSORT") {
      errors.push(
        sheetError(
          "PROHIBITED_SHEET",
          "The workbook contains a prohibited mySort sheet.",
          name,
        ),
      );
    }
    if (seen.has(key)) {
      errors.push(
        sheetError(
          "DUPLICATE_SHEET",
          `Sheet name ${name} conflicts with another sheet.`,
          name,
        ),
      );
    }
    seen.add(key);
  }
  return errors;
}
function sheetError(
  code: string,
  message: string,
  name: string,
): ValidationError {
  return {
    code,
    severity: "error",
    affectedCells: [],
    affectedNames: [name],
    message,
    detail: message,
    remediation: "Correct the sheet names in the BuildSpec and regenerate.",
  };
}
