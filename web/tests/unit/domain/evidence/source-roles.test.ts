import { describe, it, expect } from "vitest";
import {
  sourceRoleLabel,
  isValidSourceRole,
  defaultAuthorityOrder,
  authorityRankOf,
  hasHigherAuthority,
  requiresAuthorityOverride,
  SOURCE_ROLES,
} from "../../../../src/domain/evidence/source-roles";

describe("SourceRoles", () => {
  it("should return correct labels for source roles", () => {
    expect(sourceRoleLabel("executed-plan-document")).toBe(
      "Executed Plan Document",
    );
    expect(sourceRoleLabel("amendment")).toBe("Amendment");
    expect(sourceRoleLabel("collective-bargaining-agreement")).toBe(
      "Collective Bargaining Agreement",
    );
  });

  it("should validate source roles correctly", () => {
    expect(isValidSourceRole("executed-plan-document")).toBe(true);
    expect(isValidSourceRole("formal-determination")).toBe(true);
    expect(isValidSourceRole("approved-plan-summary")).toBe(true);
    expect(isValidSourceRole("inference")).toBe(true);
    expect(isValidSourceRole("invalid-role")).toBe(false);
  });

  it("should return default authority order", () => {
    const order = defaultAuthorityOrder();
    expect(order).toEqual([
      "executed-plan-document",
      "amendment",
      "collective-bargaining-agreement",
      "formal-determination",
      "approved-plan-summary",
      "certified-case-report",
      "supporting-administrative-report",
      "actuarial-report",
      "notice",
      "approved-historical-calculation-artifact",
      "inference",
      "regulation",
      "training-reference",
      "other",
    ]);
    expect(SOURCE_ROLES).toHaveLength(14);
    expect(order[0]).toBe("executed-plan-document");
  });

  it("should calculate authority rank correctly", () => {
    expect(authorityRankOf("executed-plan-document")).toBe(0);
    expect(authorityRankOf("amendment")).toBe(0);
    expect(authorityRankOf("formal-determination")).toBe(1);
    expect(authorityRankOf("approved-plan-summary")).toBe(2);
    expect(authorityRankOf("actuarial-report")).toBe(4);
    expect(authorityRankOf("inference")).toBe(6);
    expect(authorityRankOf("other")).toBe(7);
  });

  it("should determine higher authority correctly", () => {
    // Lower index = higher authority
    expect(hasHigherAuthority("amendment", "executed-plan-document")).toBe(
      false,
    );
    expect(hasHigherAuthority("executed-plan-document", "amendment")).toBe(
      false,
    );
    expect(hasHigherAuthority("notice", "actuarial-report")).toBe(false);
    expect(
      hasHigherAuthority("approved-plan-summary", "formal-determination"),
    ).toBe(true);
  });

  it("should determine when authority override is required", () => {
    expect(requiresAuthorityOverride("regulation")).toBe(true);
    expect(requiresAuthorityOverride("training-reference")).toBe(true);
    expect(requiresAuthorityOverride("other")).toBe(true);
    expect(requiresAuthorityOverride("executed-plan-document")).toBe(false);
  });
});
