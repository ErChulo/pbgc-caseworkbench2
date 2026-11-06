import { describe, expect, it } from "vitest";
import { projectVerifiedPopulationRecord } from "../../../../src/adapters/parsers/verified-population-record";
import { parseWorkbookPassive } from "../../../../src/adapters/parsers/workbook-parser";
import { sha256Bytes } from "../../../../src/domain/shared/digest";
import {
  adaptWorkbookExtraction,
  adaptWorkbookNamedRanges,
  workbookProfileContentHash,
} from "../../../../src/domain/population/workbook-adapter";
import { detectWorkbookPopulation } from "../../../../src/domain/population/population-detector";
import { populationDecisionContentHash } from "../../../../src/domain/population/population-governance";
import type { PopulationCandidateDecision } from "../../../../src/domain/population/population-types";
import { syntheticPopulationWorkbook } from "../../../fixtures/generators/populations";

async function fixture() {
  const bytes = syntheticPopulationWorkbook();
  const hash = await sha256Bytes(new Uint8Array(bytes));
  const extraction = parseWorkbookPassive(bytes);
  const workbook = adaptWorkbookExtraction(extraction);
  const names = adaptWorkbookNamedRanges(extraction);
  if (!names.ok) throw new Error("Fixture names unavailable");
  const profileHash = await workbookProfileContentHash(workbook, names.ranges);
  const detected = await detectWorkbookPopulation(
    hash,
    workbook,
    "synthetic-mock",
  );
  const content = {
    appendOrdinal: 1,
    priorDecisionId: null,
    priorDecisionContentSha256: null,
    candidateKey: detected.candidate.candidateKey,
    artifactSha256: hash,
    workbookProfileContentSha256: profileHash,
    decisionType: "approve" as const,
    resultingStatus: "approved" as const,
    ruleSetVersion: "test",
    schemaVersion: "1.0.0",
  };
  const approval: PopulationCandidateDecision = {
    ...content,
    decisionId: "00000000-0000-4000-8000-000000000001",
    decisionContentSha256: await populationDecisionContentHash(content),
    humanActor: {
      actorType: "human",
      actorId: "synthetic-reviewer",
      displayName: "Synthetic Reviewer",
    },
    rationale: "Synthetic review.",
    decisionTimestamp: "2026-01-01T00:00:00Z",
  };
  return {
    bytes,
    candidate: detected.candidate,
    observations: detected.observations,
    decisions: [approval],
    sheetName: "Population",
    sourceRow: 2,
    bindings: [
      { field: "KEY", column: "A", expectedHeader: "generalKey" },
      { field: "SERVICE", column: "C", expectedHeader: "service" },
    ],
  };
}

describe("byte-bound population record review", () => {
  it("reconstructs the selected synthetic row from the approved exact source bytes", async () => {
    const input = await fixture();
    const result = await projectVerifiedPopulationRecord(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.sourceRow).toBe(2);
    expect(result.record.fields).toEqual([
      {
        field: "KEY",
        sourceAddress: "A2",
        state: "value",
        value: "SYN-001",
        formulaText: null,
      },
      {
        field: "SERVICE",
        sourceAddress: "C2",
        state: "value",
        value: 0,
        formulaText: null,
      },
    ]);
    expect(result.sourceArtifactSha256).toBe(input.candidate.artifactSha256);
    expect(result.populationDecisionContentSha256).toBe(
      input.decisions[0]?.decisionContentSha256,
    );
    expect(await projectVerifiedPopulationRecord(input)).toEqual(result);
  });

  it("fails for changed bytes, altered evidence, missing or revoked decisions, or wrong headers", async () => {
    const input = await fixture();
    const changed = new Uint8Array(input.bytes);
    changed[0] = (changed[0] ?? 0) ^ 1;
    expect(
      await projectVerifiedPopulationRecord({ ...input, bytes: changed }),
    ).toMatchObject({ ok: false, code: "SOURCE_BYTES_MISMATCH" });
    expect(
      await projectVerifiedPopulationRecord({ ...input, observations: [] }),
    ).toMatchObject({ ok: false, code: "POPULATION_EVIDENCE_INVALID" });
    expect(
      await projectVerifiedPopulationRecord({ ...input, decisions: [] }),
    ).toMatchObject({ ok: false, code: "POPULATION_DECISION_INVALID" });
    const approval = input.decisions[0];
    if (!approval) throw new Error("Missing approval");
    const content = {
      ...approval,
      appendOrdinal: 2,
      priorDecisionId: approval.decisionId,
      priorDecisionContentSha256: approval.decisionContentSha256,
      decisionType: "revoke" as const,
      resultingStatus: "revoked" as const,
    };
    const revoked = {
      ...content,
      decisionId: "00000000-0000-4000-8000-000000000002",
      decisionContentSha256: await populationDecisionContentHash(content),
      decisionTimestamp: "2026-01-02T00:00:00Z",
    };
    expect(
      await projectVerifiedPopulationRecord({
        ...input,
        decisions: [approval, revoked],
      }),
    ).toMatchObject({ ok: false, code: "POPULATION_DECISION_INVALID" });
    expect(
      await projectVerifiedPopulationRecord({
        ...input,
        bindings: [{ field: "KEY", column: "A", expectedHeader: "wrong" }],
      }),
    ).toMatchObject({ ok: false, code: "HEADER_MISMATCH" });
  });

  it("does not treat a formula cached result as a participant value", async () => {
    const input = await fixture();
    const result = await projectVerifiedPopulationRecord({
      ...input,
      bindings: [
        { field: "FORMULA", column: "E", expectedHeader: "formulaText" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.hasOnlyValues).toBe(false);
    expect(result.record.fields[0]).toMatchObject({
      state: "formula",
      formulaText: "1+1",
      value: null,
    });
  });
});
