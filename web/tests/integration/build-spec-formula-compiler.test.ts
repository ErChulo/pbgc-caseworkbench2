import { describe, expect, it } from "vitest";
import { computeContentHash } from "../../src/domain/build-spec/serialization";
import { compileBuildSpec } from "../../src/domain/formula-compiler/compiler";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../fixtures/formula-compiler";

describe("BuildSpec 2.0.0 compiler handoff", () => {
  it("generates a nullable-range BuildSpec and compiles it without handoff repair", async () => {
    const source = await buildSpecV2();
    const withNullableRange = {
      ...source,
      namedRanges: [
        {
          rangeName: "ARCHITECTURE_ONLY",
          cellAddress: "A1",
          tabName: "Tables",
          scope: "workbook" as const,
          genericField: null,
          scenarioId: null,
          provenance: {
            source: "architecture" as const,
            architectureNamedRange: "ARCHITECTURE_ONLY",
          },
        },
      ],
    };
    const buildSpec = {
      ...withNullableRange,
      buildSpecContentSha256: await computeContentHash(withNullableRange),
    };
    const compiled = await compileBuildSpec({
      buildSpec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    expect(compiled.status).toBe("complete");
  });
});
