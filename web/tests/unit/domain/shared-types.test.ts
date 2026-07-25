import { describe, expect, it } from "vitest";

import {
  assertNever,
  mapResult,
  matchResult,
  parseBrandedId,
  parseCanonicalDecimalString,
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
} from "../../../src/domain/shared/types";

describe("T020 shared deterministic types", () => {
  it("accepts valid branded primitive values without modifying their bytes", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const sha256 = "a".repeat(64);
    const timestamp = "2026-07-25T12:00:00.000Z";
    const decimal = "-0.125";

    expect(parseBrandedId<"artifact">("artifact-1")).toEqual({
      ok: true,
      value: "artifact-1",
    });
    expect(parseUuid(uuid)).toEqual({ ok: true, value: uuid });
    expect(parseSha256(sha256)).toEqual({ ok: true, value: sha256 });
    expect(parseUtcTimestamp(timestamp)).toEqual({
      ok: true,
      value: timestamp,
    });
    expect(parseCanonicalDecimalString(decimal)).toEqual({
      ok: true,
      value: decimal,
    });
  });

  it.each([
    ["empty ID", () => parseBrandedId<"artifact">("")],
    ["padded ID", () => parseBrandedId<"artifact">(" artifact-1")],
    ["malformed UUID", () => parseUuid("not-a-uuid")],
    ["uppercase SHA-256", () => parseSha256("A".repeat(64))],
    ["short SHA-256", () => parseSha256("a".repeat(63))],
    ["offset timestamp", () => parseUtcTimestamp("2026-07-25T08:00:00-04:00")],
    ["invalid UTC date", () => parseUtcTimestamp("2026-02-30T12:00:00Z")],
    ["decimal exponent", () => parseCanonicalDecimalString("1e2")],
    ["decimal trailing zero", () => parseCanonicalDecimalString("1.20")],
    ["negative zero", () => parseCanonicalDecimalString("-0")],
  ])("rejects %s without coercion or defaulting", (_name, parse) => {
    expect(parse().ok).toBe(false);
  });

  it("maps and exhaustively matches discriminated results", () => {
    const valid = mapResult(parseSha256("b".repeat(64)), (value) =>
      value.slice(0, 4),
    );
    expect(
      matchResult(valid, {
        ok: (value) => value,
        error: ({ code }) => code,
      }),
    ).toBe("bbbb");

    const invalid: Result<string, "synthetic-error"> = {
      ok: false,
      error: "synthetic-error",
    };
    expect(
      matchResult(invalid, {
        ok: (value) => value,
        error: (error) => error,
      }),
    ).toBe("synthetic-error");
  });

  it("throws when an impossible exhaustive state reaches the guard", () => {
    expect(() =>
      assertNever("unexpected" as never, "Synthetic exhaustive-state failure."),
    ).toThrow("Synthetic exhaustive-state failure.");
  });
});
