import { describe, expect, it } from "vitest";
import { compileBuildSpec } from "../../../../src/domain/formula-compiler/compiler";
import { computeContentHash } from "../../../../src/domain/build-spec/serialization";
import type { ClockPort, UuidPort } from "../../../../src/domain/ports";
import type { UtcTimestamp, Uuid } from "../../../../src/domain/shared/types";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../../../fixtures/formula-compiler";

describe("compiled formula serialization", () => {
  it("excludes operational metadata from deterministic identity", async () => {
    const spec = await buildSpecV2();
    const first = await compileBuildSpec({
      buildSpec: spec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    const secondClock: ClockPort = {
      now: () => "2026-07-29T12:00:00Z" as UtcTimestamp,
    };
    const secondUuid: UuidPort = {
      generate: () => "00000000-0000-1000-8000-000000000998" as Uuid,
    };
    const second = await compileBuildSpec({
      buildSpec: spec,
      compilerVersion: "1.0.0",
      clock: secondClock,
      uuid: secondUuid,
    });
    if (!first.artifact || !second.artifact)
      throw new Error("Expected compiled artifacts.");
    expect(first.artifact.contentSha256).toBe(second.artifact.contentSha256);
    expect(first.artifact.operationalMetadata).not.toEqual(
      second.artifact.operationalMetadata,
    );
  });

  it("produces the same identity for input formula permutations", async () => {
    const original = await buildSpecV2();
    const permuted = {
      ...original,
      formulas: [...original.formulas].reverse(),
      cellMappings: [...original.cellMappings].reverse(),
    };
    const first = await compileBuildSpec({
      buildSpec: original,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    const second = await compileBuildSpec({
      buildSpec: permuted,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!first.artifact || !second.artifact)
      throw new Error("Expected compiled artifacts.");
    expect(first.artifact.contentSha256).toBe(second.artifact.contentSha256);
  });

  it("produces the same identity for provenance set permutations", async () => {
    const original = await buildSpecV2();
    const formulas = original.formulas.map((formula) => ({
      ...formula,
      provenance: {
        ...formula.provenance,
        affectedTestIds: ["Z", ...formula.provenance.affectedTestIds],
        validationOracleIds: ["Z", ...formula.provenance.validationOracleIds],
      },
    }));
    const reversed = formulas.map((formula) => ({
      ...formula,
      provenance: {
        ...formula.provenance,
        affectedTestIds: [...formula.provenance.affectedTestIds].reverse(),
        validationOracleIds: [
          ...formula.provenance.validationOracleIds,
        ].reverse(),
      },
    }));
    const firstBase = { ...original, formulas };
    const secondBase = { ...original, formulas: reversed };
    const firstInput = {
      ...firstBase,
      buildSpecContentSha256: await computeContentHash(firstBase),
    };
    const secondInput = {
      ...secondBase,
      buildSpecContentSha256: await computeContentHash(secondBase),
    };
    const first = await compileBuildSpec({
      buildSpec: firstInput,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    const second = await compileBuildSpec({
      buildSpec: secondInput,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!first.artifact || !second.artifact)
      throw new Error("Expected compiled artifacts.");
    expect(first.artifact.contentSha256).toBe(second.artifact.contentSha256);
  });
});
