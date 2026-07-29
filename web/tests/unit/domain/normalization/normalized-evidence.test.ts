import { describe, expect, it } from "vitest";

import {
  CANONICALIZATION_PROFILE,
  canonicalDeterministicBytes,
  deterministicSha256,
  requireCanonicalExactDecimal,
} from "../../../../src/domain/normalization/normalizer";

describe("T102 normalization", () => {
  it("uses the named profile and RFC 8785-compatible number serialization", async () => {
    expect(CANONICALIZATION_PROFILE).toContain("v1");
    expect(
      new TextDecoder().decode(canonicalDeterministicBytes({ n: -0 })),
    ).toBe('{"n":0}');
    expect(await deterministicSha256({ n: 1 })).toBe(
      await deterministicSha256({ n: 1.0 }),
    );
    expect(() => canonicalDeterministicBytes({ n: Number.NaN })).toThrow();
  });
  it("enforces exact decimal strings and excludes operational envelope metadata", async () => {
    expect(requireCanonicalExactDecimal("12.5")).toBe("12.5");
    expect(() => requireCanonicalExactDecimal("01.0")).toThrow();
    const first = { deterministicPayload: { value: [1, 2] }, runId: "one" };
    const second = { deterministicPayload: { value: [1, 2] }, runId: "two" };
    expect(await deterministicSha256(first)).toBe(
      await deterministicSha256(second),
    );
  });
});
