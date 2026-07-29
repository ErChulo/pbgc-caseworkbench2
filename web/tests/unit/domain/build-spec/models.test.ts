import { describe, expect, it } from "vitest";
import { buildSpecSchemaVersion } from "../../../../src/domain/build-spec/models";

describe("BuildSpec models", () => {
  it("exposes only the compiler contract version", () => {
    expect(buildSpecSchemaVersion).toBe("2.0.0");
  });
});
