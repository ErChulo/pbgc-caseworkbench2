import { afterEach, describe, expect, it } from "vitest";

import { screenSensitiveText } from "../../../../src/adapters/screening/sensitive-data";
import { screenBinaryRisk } from "../../../../src/adapters/screening/binary-risk";
import { parseSha256 } from "../../../../src/domain/shared/types";
import {
  syntheticSensitiveFixture,
  type EphemeralSensitiveFixture,
} from "../../../fixtures/generators/sensitive-data";
import { dosExecutableFixture } from "../../../fixtures/generators/unsafe-binaries";

const parsed = parseSha256("a".repeat(64));
if (!parsed.ok) throw new Error("fixture hash");
const hash = parsed.value;
const fixtures: EphemeralSensitiveFixture[] = [];
const fixture = (kind: Parameters<typeof syntheticSensitiveFixture>[0]) => {
  const value = syntheticSensitiveFixture(kind);
  fixtures.push(value);
  return value;
};

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    value.dispose();
    expect(value.isDisposed()).toBe(true);
    expect([...value.bytes].every((byte) => byte === 0)).toBe(true);
  }
});

describe("T060 deterministic sensitive-data screening", () => {
  it("labels expected authorized PII locally without final release", async () => {
    const source = fixture("authorized-pii");
    const result = await screenSensitiveText(
      new TextDecoder().decode(source.bytes),
      hash,
      {
        authorizedRealPii: true,
        expectedFields: ["email"],
        maximumSensitiveMatches: 4,
      },
    );
    expect(result.findings[0]).toMatchObject({
      category: "authorized-pii",
      blocksDownstream: false,
    });
    expect(result).toMatchObject({
      provisionalState: "screening-pending",
      downstreamBlocked: true,
    });
  });

  it.each(["unauthorized-pii", "excessive-pii", "secret"] as const)(
    "fails closed for %s",
    async (kind) => {
      const source = fixture(kind);
      const result = await screenSensitiveText(
        new TextDecoder().decode(source.bytes),
        hash,
        {
          authorizedRealPii: kind === "excessive-pii",
          expectedFields: [],
          maximumSensitiveMatches: 2,
        },
      );
      expect(result.provisionalState).toBe("provisional-quarantine");
      expect(result.findings.some((finding) => finding.blocksDownstream)).toBe(
        true,
      );
    },
  );

  it("fails closed when PII authorization cannot be verified", async () => {
    const source = fixture("authorized-pii");
    const result = await screenSensitiveText(
      new TextDecoder().decode(source.bytes),
      hash,
      {
        authorizedRealPii: true,
        authorizationVerified: false,
        expectedFields: ["email"],
        maximumSensitiveMatches: 4,
      },
    );
    expect(result.provisionalState).toBe("provisional-quarantine");
    expect(result.findings[0]?.evidence).toContain(
      "authorization:unverifiable",
    );
  });

  it("blocks executable signatures without executing bytes", async () => {
    const result = await screenBinaryRisk(
      dosExecutableFixture(),
      hash,
      "application/octet-stream",
    );
    expect(result.findings).toEqual([
      expect.objectContaining({ category: "executable", outcome: "blocked" }),
    ]);
  });

  it("blocks script-capable extensions without loading or executing content", async () => {
    const result = await screenBinaryRisk(
      new TextEncoder().encode("synthetic inert script text"),
      hash,
      "text/plain",
      "synthetic.ps1",
    );
    expect(result.findings[0]).toMatchObject({
      ruleId: "script-capable-extension",
      outcome: "blocked",
    });
  });
});
