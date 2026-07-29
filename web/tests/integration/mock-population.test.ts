import { describe, expect, it } from "vitest";

import { generateMockPopulation } from "../../tools/mock-population/generate";

const sourceHash = "a".repeat(64);

describe("T095 development-only mock population", () => {
  it("uses structure only and produces deterministic synthetic values and provenance", async () => {
    const request = {
      fields: ["generalKey", "service", "status"],
      recordCount: 3,
      seed: 42,
      structureSourceSha256: sourceHash,
    };
    const first = await generateMockPopulation(request);
    const second = await generateMockPopulation(request);
    expect(first).toEqual(second);
    expect(first.provenance).toMatchObject({
      structureSourceSha256: sourceHash,
      sourceValuesCopied: false,
    });
    expect(first.provenance.deterministicPayloadSha256).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(first.records).toHaveLength(3);
    expect(Object.keys(first.records[0] ?? {})).toEqual(request.fields);
    expect(JSON.stringify(first)).not.toContain("participant");
  });

  it("changes deterministic output when the seed changes", async () => {
    const base = {
      fields: ["generalKey", "service"],
      recordCount: 2,
      structureSourceSha256: sourceHash,
    };
    expect(await generateMockPopulation({ ...base, seed: 1 })).not.toEqual(
      await generateMockPopulation({ ...base, seed: 2 }),
    );
  });
});
