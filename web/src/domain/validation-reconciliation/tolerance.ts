import type { ToleranceProfile } from "./models";

export function createDefaultToleranceProfile(): ToleranceProfile {
  return {
    profileId: "default-tolerance",
    absoluteTolerance: 0.01,
    relativeTolerance: 0.001,
    roundingMethod: "banker's",
    effectiveDate: "2026-01-01",
    cellLevelOverrides: {},
  };
}

export function validateToleranceProfile(profile: ToleranceProfile): string[] {
  const errors: string[] = [];

  if (profile.absoluteTolerance < 0) {
    errors.push("Absolute tolerance must be non-negative.");
  }

  if (profile.relativeTolerance < 0) {
    errors.push("Relative tolerance must be non-negative.");
  }

  if (
    !["banker's", "away-from-zero", "down"].includes(profile.roundingMethod)
  ) {
    errors.push(`Invalid rounding method: ${profile.roundingMethod}`);
  }

  for (const [cellAddress, override] of Object.entries(
    profile.cellLevelOverrides,
  )) {
    if (typeof override !== "number" || override < 0) {
      errors.push(
        `Cell ${cellAddress} override must be a non-negative number, got ${String(override)}`,
      );
    }
  }

  return errors;
}

export function applyToleranceOverride(
  cellAddress: string,
  baseAbsoluteTolerance: number,
  overrides: Readonly<Record<string, number>>,
): number {
  return overrides[cellAddress] ?? baseAbsoluteTolerance;
}

export function evaluateNumericTolerance(
  expectedValue: number,
  actualValue: number,
  absoluteTolerance: number,
  relativeTolerance: number,
): { readonly withinTolerance: boolean; readonly difference: number } {
  const absoluteDifference = Math.abs(expectedValue - actualValue);
  const relativeDifference =
    Math.abs(expectedValue) > 0
      ? absoluteDifference / Math.abs(expectedValue)
      : absoluteDifference;

  const withinTolerance =
    absoluteDifference <= absoluteTolerance ||
    relativeDifference <= relativeTolerance;

  return {
    withinTolerance,
    difference: absoluteDifference,
  };
}

export function roundValue(
  value: number,
  method: ToleranceProfile["roundingMethod"],
): number {
  if (method === "banker's") {
    return Math.round(value);
  }
  if (method === "away-from-zero") {
    return value >= 0 ? Math.ceil(value) : Math.floor(value);
  }
  return Math.floor(value);
}
