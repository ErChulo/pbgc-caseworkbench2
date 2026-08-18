import { describe, expect, it } from "vitest";

import { parseDelimited } from "../../../../src/adapters/parsers/delimited-parser";
import { hashTyped } from "../../../../src/domain/manifests/canonical-json";
import {
  detectTabularPopulation,
  detectWorkbookPopulation,
} from "../../../../src/domain/population/population-detector";
import {
  canonicalPopulationCandidate,
  createPopulationCandidate,
  populationDecisionContentHash,
  populationManifestHash,
  replayPopulationCandidateDecisions,
  validatePopulationEvidence,
  type PopulationCandidateDecision,
} from "../../../../src/domain/population/population-profile";
import type { RawValueKind } from "../../../../src/domain/population/tabular-adapter";
import { adaptTabularExtraction } from "../../../../src/domain/population/tabular-adapter";
import { parseSha256, type Sha256 } from "../../../../src/domain/shared/types";
import { syntheticPopulationCsv } from "../../../fixtures/generators/populations";

const artifact = sha("a".repeat(64));

describe("T093 population candidate identity and governance", () => {
  it("canonicalizes typed evidence as a path-independent set and propagates genuine changes", async () => {
    const detected = await detection();
    const reversed = await createPopulationCandidate({
      ...withoutKey(detected.candidate),
      evidence: [...detected.candidate.evidence].reverse(),
    });
    expect(reversed.candidateKey).toBe(detected.candidate.candidateKey);
    expect(canonicalPopulationCandidate(reversed)).toBe(
      canonicalPopulationCandidate(detected.candidate),
    );
    const manifest = {
      artifacts: [{ artifactKey: "artifact-1", sha256: artifact }],
      populationEvidenceObservations: detected.observations,
      populationCandidates: [detected.candidate],
    };
    expect(
      await populationManifestHash({
        ...manifest,
        populationCandidates: [reversed],
      }),
    ).toBe(await populationManifestHash(manifest));

    const changedObservation = {
      ...first(detected.observations),
      observedTextOrValue: "changed",
    };
    const changedEvidenceKey = sha(
      await hashTyped(
        {
          citationId: changedObservation.citationId,
          artifactSha256: changedObservation.artifactSha256,
          sourceLocator: changedObservation.sourceLocator,
          evidenceKind: changedObservation.evidenceKind,
          observedTextOrValue: changedObservation.observedTextOrValue,
        },
        {},
      ),
    );
    expect(changedEvidenceKey).not.toBe(
      first(detected.observations).evidenceKey,
    );
  });

  it("resolves every evidenceKey exactly once with exact artifact, citation, locator, kind, and value", async () => {
    const detected = await detection();
    expect(
      await validatePopulationEvidence(
        detected.candidate,
        detected.observations,
        [artifact],
      ),
    ).toEqual({ ok: true, value: true });
    for (const invalid of [
      [],
      [...detected.observations, first(detected.observations)],
      [{ ...first(detected.observations), sourceLocator: "changed" }],
      [{ ...first(detected.observations), citationId: "changed" }],
      [{ ...first(detected.observations), evidenceKind: "changed" }],
      [{ ...first(detected.observations), observedTextOrValue: "changed" }],
    ]) {
      expect(
        (
          await validatePopulationEvidence(detected.candidate, invalid, [
            artifact,
          ])
        ).ok,
      ).toBe(false);
    }
    expect(
      (
        await validatePopulationEvidence(
          detected.candidate,
          detected.observations,
          [],
        )
      ).ok,
    ).toBe(false);
  });

  it("rejects malformed or stale candidate keys and incomplete manifests", async () => {
    const detected = await detection();
    const stale = {
      ...detected.candidate,
      candidateKey: sha("b".repeat(64)),
    };
    expect(
      (
        await validatePopulationEvidence(stale, detected.observations, [
          artifact,
        ])
      ).ok,
    ).toBe(false);
    expect(parseSha256("A".repeat(64)).ok).toBe(false);
    expect(parseSha256("short").ok).toBe(false);
  });

  it("derives final state only from a gapless human decision chain without mutating the proposal", async () => {
    const detected = await detection();
    const initial = await decision(
      detected.candidate,
      null,
      "approve",
      "approved",
    );
    const revoked = await decision(
      detected.candidate,
      initial,
      "revoke",
      "revoked",
    );
    const before = structuredClone(detected.candidate);
    const replay = await replayPopulationCandidateDecisions(
      detected.candidate,
      detected.candidate.candidateKey,
      [initial, revoked],
    );
    expect(replay).toMatchObject({
      ok: true,
      value: { status: "revoked", effectiveDecisionId: revoked.decisionId },
    });
    expect(detected.candidate).toEqual(before);
    expect(
      (
        await replayPopulationCandidateDecisions(
          detected.candidate,
          detected.candidate.candidateKey,
          [
            {
              ...initial,
              humanActor: {
                ...initial.humanActor,
                actorType: "system" as "human",
              },
            },
          ],
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await replayPopulationCandidateDecisions(
          detected.candidate,
          detected.candidate.candidateKey,
          [{ ...initial, appendOrdinal: 2 }],
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await replayPopulationCandidateDecisions(
          detected.candidate,
          detected.candidate.candidateKey,
          [{ ...initial, candidateKey: sha("c".repeat(64)) }],
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await replayPopulationCandidateDecisions(
          detected.candidate,
          detected.candidate.candidateKey,
          [
            initial,
            { ...revoked, priorDecisionContentSha256: sha("d".repeat(64)) },
          ],
        )
      ).ok,
    ).toBe(false);
  });

  it("emits participant-group characteristics from recognizable workbook sheet names", async () => {
    const detected = await workbookDetection([
      {
        name: "Retirees",
        hidden: false,
        cells: [workbookCell("A1", "DOB"), workbookCell("B1", "BSEX")],
      },
      {
        name: "Tables",
        hidden: false,
        cells: [workbookCell("A1", "Freeze Date")],
      },
    ]);
    const characteristic = detected.observations.find(
      (observation) => observation.evidenceKind === "population-characteristic",
    );
    expect(characteristic).toBeDefined();
    expect(characteristic?.observedTextOrValue).toEqual({
      dimension: "participant-group",
      value: "retired-participants",
    });
    expect(
      detected.observations.filter(
        (observation) =>
          observation.evidenceKind === "population-characteristic",
      ),
    ).toHaveLength(1);
    expect(
      (
        await validatePopulationEvidence(
          detected.candidate,
          detected.observations,
          [artifact],
        )
      ).ok,
    ).toBe(true);
  });

  it("emits no participant-group characteristic for unrecognized sheet names", async () => {
    const detected = await workbookDetection([
      {
        name: "Population",
        hidden: false,
        cells: [workbookCell("A1", "generalKey")],
      },
    ]);
    expect(
      detected.observations.some(
        (observation) =>
          observation.evidenceKind === "population-characteristic",
      ),
    ).toBe(false);
  });
});

async function workbookDetection(
  sheets: readonly WorkbookPopulationSheetInput[],
) {
  return detectWorkbookPopulation(
    artifact,
    {
      status: "profiled",
      sheets,
      formulaExecutionCount: 0,
      limitations: [],
    },
    "synthetic-mock",
  );
}

interface WorkbookPopulationSheetInput {
  readonly name: string;
  readonly hidden: boolean;
  readonly cells: readonly {
    readonly sheet: string;
    readonly address: string;
    readonly storedValue: string;
    readonly formulaText: null;
    readonly cellType: string;
    readonly kind: RawValueKind;
  }[];
}

function workbookCell(
  address: string,
  storedValue: string,
): {
  readonly sheet: string;
  readonly address: string;
  readonly storedValue: string;
  readonly formulaText: null;
  readonly cellType: string;
  readonly kind: RawValueKind;
} {
  return {
    sheet: "",
    address,
    storedValue,
    formulaText: null,
    cellType: "s",
    kind: "text",
  };
}

async function detection() {
  const profile = adaptTabularExtraction(
    parseDelimited(syntheticPopulationCsv(), ","),
  );
  return detectTabularPopulation(artifact, profile, "synthetic-mock");
}

function withoutKey<T extends { readonly candidateKey: Sha256 }>(
  value: T,
): Omit<T, "candidateKey"> {
  const { candidateKey, ...rest } = value;
  void candidateKey;
  return rest;
}

async function decision(
  candidate: Awaited<ReturnType<typeof detection>>["candidate"],
  prior: PopulationCandidateDecision | null,
  decisionType: PopulationCandidateDecision["decisionType"],
  resultingStatus: PopulationCandidateDecision["resultingStatus"],
): Promise<PopulationCandidateDecision> {
  const content = {
    appendOrdinal: (prior?.appendOrdinal ?? 0) + 1,
    priorDecisionId: prior?.decisionId ?? null,
    priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
    candidateKey: candidate.candidateKey,
    artifactSha256: candidate.artifactSha256,
    workbookProfileContentSha256: candidate.candidateKey,
    decisionType,
    resultingStatus,
    ruleSetVersion: "feature-009-population-v1",
    schemaVersion: "1.0.0",
  } as const;
  return {
    decisionId: `decision-${String(content.appendOrdinal)}`,
    decisionContentSha256: await populationDecisionContentHash(content),
    ...content,
    humanActor: {
      actorType: "human",
      actorId: "reviewer-1",
      displayName: "Synthetic Reviewer",
    },
    rationale: "Synthetic candidate reviewed.",
    decisionTimestamp: `2026-01-0${String(content.appendOrdinal)}T00:00:00Z`,
  };
}

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Fixture SHA invalid.");
  return parsed.value;
}

function first<Value>(values: readonly Value[]): Value {
  const value = values[0];
  if (value === undefined) throw new Error("Fixture must not be empty.");
  return value;
}
