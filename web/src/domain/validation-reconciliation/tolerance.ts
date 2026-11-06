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

  if (typeof profile.profileId !== "string" || profile.profileId.trim() === "")
    errors.push("Tolerance profile ID must not be empty.");
  const effectiveDate = profile.effectiveDate;
  const date =
    typeof effectiveDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(effectiveDate)
      ? new Date(`${effectiveDate}T00:00:00.000Z`)
      : null;
  if (
    date === null ||
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== effectiveDate
  )
    errors.push("Tolerance effective date must be a real ISO date.");

  if (
    !Number.isFinite(profile.absoluteTolerance) ||
    profile.absoluteTolerance < 0
  ) {
    errors.push("Absolute tolerance must be non-negative.");
  }

  if (
    !Number.isFinite(profile.relativeTolerance) ||
    profile.relativeTolerance < 0
  ) {
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
    if (
      typeof override !== "number" ||
      !Number.isFinite(override) ||
      override < 0
    ) {
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
  if (
    !Number.isFinite(expectedValue) ||
    !Number.isFinite(actualValue) ||
    !Number.isFinite(absoluteDifference) ||
    !Number.isFinite(absoluteTolerance) ||
    absoluteTolerance < 0 ||
    !Number.isFinite(relativeTolerance) ||
    relativeTolerance < 0
  )
    return { withinTolerance: false, difference: absoluteDifference };
  // A relative difference has no denominator when the expected value is zero.
  // Only the absolute threshold can accept that case.
  const withinTolerance =
    absoluteDifference <= absoluteTolerance ||
    (expectedValue !== 0 &&
      absoluteDifference / Math.abs(expectedValue) <= relativeTolerance);

  return {
    withinTolerance,
    difference: absoluteDifference,
  };
}

export function roundValue(
  value: number,
  method: ToleranceProfile["roundingMethod"],
): number {
  if (!Number.isFinite(value))
    throw new Error("Cannot round a non-finite value.");
  if (method === "banker's") {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (fraction < 0.5) return lower;
    if (fraction > 0.5) return lower + 1;
    return lower % 2 === 0 ? lower : lower + 1;
  }
  if (method === "away-from-zero") {
    return value >= 0 ? Math.ceil(value) : Math.floor(value);
  }
  if ((method as string) === "down") return Math.floor(value);
  throw new Error("Unknown rounding method.");
}
