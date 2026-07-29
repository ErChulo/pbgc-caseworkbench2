/**
 * Plain-language glossary for user-facing labels.
 *
 * Technical terms appear in tooltips, expandable details, and developer-only
 * views. Caseworkers see only the plain-language equivalent.
 */

export const GLOSSARY = {
  deterministicManifestHash: {
    plain: "Manifest fingerprint",
    technical: "Deterministic manifest SHA-256",
    tooltip:
      "A unique fingerprint computed from the exact content of this evidence manifest. If any artifact, classification, or decision changes, the fingerprint changes.",
  },
  provisionalSafetyBlock: {
    plain: "Safety review needed",
    technical: "provisional-safety-block",
    tooltip:
      "Automated screening found something that needs a human reviewer before this evidence can be used downstream.",
  },
  provisionalQuarantine: {
    plain: "Quarantined pending review",
    technical: "provisional-quarantine",
    tooltip:
      "This artifact has been isolated until an authorized reviewer decides whether it is safe to release.",
  },
  rescreenRequired: {
    plain: "Re-review needed",
    technical: "rescreen-required",
    tooltip:
      "The artifact's bytes changed since the last screening, so a fresh review is required.",
  },
  screeningPending: {
    plain: "Awaiting screening",
    technical: "screening-pending",
    tooltip:
      "This artifact has not yet been checked for safety issues.",
  },
  finalQuarantine: {
    plain: "Permanently quarantined",
    technical: "final-quarantine",
    tooltip:
      "A human reviewer has decided this artifact must remain quarantined. Only a new typed decision can change this.",
  },
  released: {
    plain: "Released",
    technical: "released",
    tooltip:
      "An authorized reviewer has approved this artifact for governed downstream use.",
  },
  revoked: {
    plain: "Revoked",
    technical: "revoked",
    tooltip:
      "A prior release decision has been withdrawn by an authorized reviewer.",
  },
  superseded: {
    plain: "Replaced by newer decision",
    technical: "superseded",
    tooltip:
      "A newer decision has replaced this one in the review chain.",
  },
  approved: {
    plain: "Approved",
    technical: "approved",
    tooltip:
      "An authorized human has approved this classification or relationship.",
  },
  rejected: {
    plain: "Rejected",
    technical: "rejected",
    tooltip:
      "An authorized human has rejected this classification or relationship.",
  },
  proposed: {
    plain: "Awaiting review",
    technical: "proposed",
    tooltip:
      "This is an automated suggestion. It has no governed status until a human reviews it.",
  },
  unresolved: {
    plain: "Needs investigation",
    technical: "unresolved",
    tooltip:
      "The system could not determine the status. A human reviewer must investigate.",
  },
  inheritedRelease: {
    plain: "Inherit approved status",
    technical: "inherit-release",
    tooltip:
      "Apply the same release decision from a previously approved artifact with identical content.",
  },
  finalQuarantineAction: {
    plain: "Permanently quarantine",
    technical: "final-quarantine",
    tooltip:
      "Permanently block this artifact from downstream use. Only a new typed decision can change this.",
  },
  rejectAction: {
    plain: "Reject",
    technical: "reject",
    tooltip:
      "Reject this artifact's classification or relationship proposal.",
  },
  revokeAction: {
    plain: "Withdraw approval",
    technical: "revoke",
    tooltip:
      "Withdraw a prior approval decision. The artifact returns to a prior governed state.",
  },
  supersedeAction: {
    plain: "Replace with new decision",
    technical: "supersede",
    tooltip:
      "Replace the current effective decision with a new one in the review chain.",
  },
  sha256: {
    plain: "Content fingerprint",
    technical: "SHA-256",
    tooltip:
      "A mathematical fingerprint computed from the exact bytes of a file. Two files with the same fingerprint are byte-for-byte identical.",
  },
  snapshotId: {
    plain: "Snapshot ID",
    technical: "Snapshot ID (deterministic)",
    tooltip:
      "A unique identifier for this exact set of files at this moment in time.",
  },
  authorityCaseId: {
    plain: "Case number",
    technical: "Authoritative PBGC case identifier",
    tooltip:
      "The official PBGC case number used to track this terminated-plan matter.",
  },
  caseId: {
    plain: "Internal ID",
    technical: "Internal immutable UUID",
    tooltip:
      "A system-generated unique identifier that never changes, used to track this case internally.",
  },
  evidenceKey: {
    plain: "Evidence reference",
    technical: "evidenceKey",
    tooltip:
      "A unique key linking this observation to its exact source artifact, location, and type.",
  },
  candidateKey: {
    plain: "Candidate reference",
    technical: "candidateKey",
    tooltip:
      "A unique key computed from the content of this population file candidate.",
  },
  artifactSha256: {
    plain: "File fingerprint",
    technical: "artifact SHA-256",
    tooltip:
      "The SHA-256 hash of the original artifact bytes.",
  },
  snapshotRecordId: {
    plain: "Snapshot record",
    technical: "Snapshot record ID",
    tooltip:
      "An operational identifier for the snapshot record, separate from the snapshot's content identity.",
  },
  deterministicPayload: {
    plain: "Payload fingerprint",
    technical: "Deterministic payload SHA-256",
    tooltip:
      "A fingerprint computed from the exact content of this export package, excluding operational metadata.",
  },
  computedEffectiveStatus: {
    plain: "Current status",
    technical: "Computed effective status",
    tooltip:
      "The current governed status, calculated by replaying all typed human decisions in order.",
  },
  decisionContentHash: {
    plain: "Decision fingerprint",
    technical: "Decision content SHA-256",
    tooltip:
      "A fingerprint of the decision content, excluding UUIDs, timestamps, and actor details.",
  },
  accountingStatus: {
    plain: "Processing status",
    technical: "Accounting classification",
    tooltip:
      "An internal tracking label for where this artifact is in the processing pipeline. This does not confer approval or release.",
  },
  downstreamEligibility: {
    plain: "Can be used downstream",
    technical: "Downstream eligibility",
    tooltip:
      "Whether this artifact can be included in governed downstream processing.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

/**
 * Returns the plain-language label for a glossary key.
 */
export function plainLabel(key: GlossaryKey): string {
  return GLOSSARY[key].plain;
}

/**
 * Returns the technical term for a glossary key.
 */
export function technicalTerm(key: GlossaryKey): string {
  return GLOSSARY[key].technical;
}

/**
 * Returns the tooltip for a glossary key.
 */
export function tooltip(key: GlossaryKey): string {
  return GLOSSARY[key].tooltip;
}

/**
 * Renders a plain-language label with a technical tooltip.
 * Use this in JSX: <Term key="sha256" />
 */
export function Term({ glossaryKey }: { readonly glossaryKey: GlossaryKey }): string {
  return GLOSSARY[glossaryKey].plain;
}
