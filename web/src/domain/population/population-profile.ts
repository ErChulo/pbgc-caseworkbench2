/**
 * Population Profile
 *
 * Re-exports from the decomposed modules for backward compatibility.
 * New code should import directly from the specific modules:
 * - population-types.ts: Type definitions
 * - population-factories.ts: Factory functions
 * - population-governance.ts: Validation and governance
 */

export type {
  PopulationCandidateStatus,
  PopulationGovernedStatus,
  PopulationEvidenceObservation,
  PopulationEvidenceReference,
  PopulationCandidateProfile,
  HumanActor,
  PopulationCandidateDecision,
  PopulationDecisionProjection,
  PopulationProfileError,
} from "./population-types";

export {
  createPopulationEvidenceObservation,
  createPopulationCandidate,
  canonicalPopulationCandidate,
  populationManifestHash,
} from "./population-factories";

export {
  validatePopulationEvidence,
  populationDecisionContentHash,
  replayPopulationCandidateDecisions,
} from "./population-governance";
