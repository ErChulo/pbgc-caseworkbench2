import type { Sha256 } from "../shared/types";
import type { TabularPopulationProfile } from "./tabular-adapter";
import type { WorkbookPopulationProfile } from "./workbook-adapter";
import {
  createPopulationCandidate,
  createPopulationEvidenceObservation,
  type PopulationCandidateProfile,
  type PopulationEvidenceObservation,
} from "./population-profile";

export interface PopulationDetection {
  readonly candidate: PopulationCandidateProfile;
  readonly observations: readonly PopulationEvidenceObservation[];
}

export async function detectTabularPopulation(
  artifactSha256: Sha256,
  profile: TabularPopulationProfile,
  sensitivity: PopulationCandidateProfile["sensitivity"] = "unknown",
): Promise<PopulationDetection> {
  const observations = await Promise.all(
    profile.headers.map((header, index) =>
      createPopulationEvidenceObservation({
        citationId: `population-header-${String(index + 1)}`,
        artifactSha256,
        sourceLocator: `row:1/column:${String(index + 1)}`,
        evidenceKind: "observed-field-header",
        observedTextOrValue: header,
      }),
    ),
  );
  const likely = profile.status === "profiled" && profile.headers.length >= 2;
  const candidate = await createPopulationCandidate({
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

export async function detectWorkbookPopulation(
  artifactSha256: Sha256,
  profile: WorkbookPopulationProfile,
  sensitivity: PopulationCandidateProfile["sensitivity"] = "unknown",
): Promise<PopulationDetection> {
  const observations = await Promise.all(
    profile.sheets.map((sheet, index) =>
      createPopulationEvidenceObservation({
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
      .filter((cell) => /^[A-Z]+1$/u.test(cell.address))
      .map((cell) => displayPrimitive(cell.storedValue)),
  );
  const candidate = await createPopulationCandidate({
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
          sheet.cells.map((cell) => /\d+$/u.exec(cell.address)?.[0] ?? ""),
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

function displayPrimitive(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  return "";
}
