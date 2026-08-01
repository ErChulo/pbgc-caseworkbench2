/**
 * Population Detector
 *
 * Structural population detection from tabular and workbook profiles.
 * Uses dependency injection for testability — factory functions can be
 * mocked in tests to verify orchestration logic without cryptographic overhead.
 */

import type { Sha256 } from "../shared/types";
import { primitiveDisplay } from "../shared/value-classification";
import { isHeaderCell, rowNumber } from "../shared/cell-address";
import type { TabularPopulationProfile } from "./tabular-adapter";
import type { WorkbookPopulationProfile } from "./workbook-adapter";
import type {
  PopulationCandidateProfile,
  PopulationEvidenceObservation,
} from "./population-types";

export interface PopulationDetection {
  readonly candidate: PopulationCandidateProfile;
  readonly observations: readonly PopulationEvidenceObservation[];
}

/**
 * Dependencies for population detection.
 * Allows injection of factory functions for testing.
 */
export interface PopulationDetectionDependencies {
  readonly createEvidenceObservation: (input: {
    readonly citationId: string;
    readonly artifactSha256: Sha256;
    readonly sourceLocator: string;
    readonly evidenceKind: string;
    readonly observedTextOrValue?: unknown;
  }) => Promise<PopulationEvidenceObservation>;
  readonly createCandidate: (
    input: Omit<PopulationCandidateProfile, "candidateKey">,
  ) => Promise<PopulationCandidateProfile>;
}

/**
 * Default dependencies using the real factory functions.
 */
export async function getDefaultDependencies(): Promise<PopulationDetectionDependencies> {
  const { createPopulationEvidenceObservation, createPopulationCandidate } =
    await import("./population-factories");
  return {
    createEvidenceObservation: createPopulationEvidenceObservation,
    createCandidate: createPopulationCandidate,
  };
}

/**
 * Detects a population candidate from a tabular profile.
 * Extracts headers as observed fields and computes confidence scores.
 */
export async function detectTabularPopulation(
  artifactSha256: Sha256,
  profile: TabularPopulationProfile,
  sensitivity: PopulationCandidateProfile["sensitivity"] = "unknown",
  deps?: PopulationDetectionDependencies,
): Promise<PopulationDetection> {
  const { createEvidenceObservation, createCandidate } =
    deps ?? (await getDefaultDependencies());

  const observations = await Promise.all(
    profile.headers.map((header, index) =>
      createEvidenceObservation({
        citationId: `population-header-${String(index + 1)}`,
        artifactSha256,
        sourceLocator: `row:1/column:${String(index + 1)}`,
        evidenceKind: "observed-field-header",
        observedTextOrValue: header,
      }),
    ),
  );
  const likely = profile.status === "profiled" && profile.headers.length >= 2;
  const candidate = await createCandidate({
    artifactSha256,
    candidateStatus:
      likely && profile.structurallyValid ? "proposed" : "unresolved",
    detectorIdentity: "feature-009-structural-population-detector",
    detectorVersion: "1.0.0",
    confidence: likely ? (profile.structurallyValid ? 0.8 : 0.5) : 0,
    evidence: observations,
    observedFields: profile.headers,
    recordCounts: [
      Math.max(
        0,
        profile.rowWidths.length - (profile.headers.length > 0 ? 1 : 0),
      ),
    ],
    sensitivity,
    correctionsOrImputationsApplied: false,
  });
  return Object.freeze({
    candidate,
    observations: Object.freeze(observations),
  });
}

/**
 * Detects a population candidate from a workbook profile.
 * Extracts header cells from row 1 as observed fields.
 */
export async function detectWorkbookPopulation(
  artifactSha256: Sha256,
  profile: WorkbookPopulationProfile,
  sensitivity: PopulationCandidateProfile["sensitivity"] = "unknown",
  deps?: PopulationDetectionDependencies,
): Promise<PopulationDetection> {
  const { createEvidenceObservation, createCandidate } =
    deps ?? (await getDefaultDependencies());

  const observations = await Promise.all(
    profile.sheets.map((sheet, index) =>
      createEvidenceObservation({
        citationId: `population-sheet-${String(index + 1)}`,
        artifactSha256,
        sourceLocator: `sheet:${sheet.name}`,
        evidenceKind: "workbook-sheet",
        observedTextOrValue: {
          name: sheet.name,
          cellCount: sheet.cells.length,
          hidden: sheet.hidden,
        },
      }),
    ),
  );
  const fields = profile.sheets.flatMap((sheet) =>
    sheet.cells
      .filter((cell) => isHeaderCell(cell.address))
      .map((cell) => primitiveDisplay(cell.storedValue)),
  );
  const candidate = await createCandidate({
    artifactSha256,
    candidateStatus:
      profile.status === "profiled" && fields.length >= 2
        ? "proposed"
        : "unresolved",
    detectorIdentity: "feature-009-structural-population-detector",
    detectorVersion: "1.0.0",
    confidence: profile.status === "profiled" && fields.length >= 2 ? 0.8 : 0,
    evidence: observations,
    observedFields: fields,
    recordCounts: profile.sheets.map((sheet) =>
      Math.max(
        0,
        new Set(
          sheet.cells.map((cell) => rowNumber(cell.address)),
        ).size - 1,
      ),
    ),
    sensitivity,
    correctionsOrImputationsApplied: false,
  });
  return Object.freeze({
    candidate,
    observations: Object.freeze(observations),
  });
}
