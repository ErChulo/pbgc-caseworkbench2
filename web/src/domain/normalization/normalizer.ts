import {
  canonicalizeTyped,
  hashTyped,
  validateCanonicalDecimalString,
  type CanonicalContext,
} from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";

export const CANONICALIZATION_PROFILE =
  "PBGC Case Workbench Canonicalization Profile v1";

export function canonicalDeterministicBytes(
  value: unknown,
  context: CanonicalContext = {},
): Uint8Array {
  return new TextEncoder().encode(canonicalizeTyped(value, context));
}

export async function deterministicSha256(
  value: unknown,
  context: CanonicalContext = {},
): Promise<Sha256> {
  const parsed = parseSha256(await hashTyped(value, context));
  if (!parsed.ok) throw new Error("Canonical SHA-256 generation failed.");
  return parsed.value;
}

export function requireCanonicalExactDecimal(value: string): string {
  if (!validateCanonicalDecimalString(value))
    throw new TypeError(
      "Exact decimal is not in canonical decimal-string form.",
    );
  return value;
}

export function assertAscendingUniquePriorities(
  priorities: readonly { readonly priority: number }[],
): void {
  let prior = -Infinity;
  for (const item of priorities) {
    if (!Number.isInteger(item.priority) || item.priority <= prior)
      throw new TypeError(
        "Source priorities must be ascending unique integers.",
      );
    prior = item.priority;
  }
}
