# Data Model: Population Profile

**Feature**: 003
**Authority**: Constitution 2.0.0, Feature 001 evidence ingestion

## PopulationCandidateProfile

| Field | Rule |
|---|---|
| `candidateKey` | Deterministic SHA-256 hash of candidate content |
| `artifactSha256` | Hash of source population evidence artifact |
| `candidateStatus` | "proposed" \| "unresolved" |
| `detectorIdentity` | Population detector algorithm identifier |
| `detectorVersion` | Semantic version of detector |
| `confidence` | 0–1; confidence in detection |
| `evidence` | One or more `PopulationEvidenceReference[]` |
| `observedFields` | Field names present in population (never invented) |
| `recordCounts` | Cardinality per observed dimension |
| `sensitivity` | "authorized-real" \| "de-identified" \| "synthetic-mock" \| "unknown" |
| `correctionsOrImputationsApplied` | Always false; no invented values |

## PopulationEvidenceObservation

| Field | Rule |
|---|---|
| `evidenceKey` | Deterministic SHA-256 hash |
| `citationId` | Unique identifier within manifest |
| `artifactSha256` | Hash of evidence artifact |
| `sourceLocator` | Precise locator (page, sheet, cell) |
| `evidenceKind` | Classification of evidence type |
| `observedTextOrValue` | Optional observed value (never computed) |

## PopulationEvidenceReference

| Field | Rule |
|---|---|
| (same as PopulationEvidenceObservation) | Reference to an observation in manifest |

## PopulationCandidateDecision

| Field | Rule |
|---|---|
| `decisionId` | Unique identifier per decision |
| `decisionContentSha256` | Deterministic hash of decision content |
| `appendOrdinal` | Sequence in chain (0, 1, 2, ...) |
| `priorDecisionId` | ID of predecessor or null for initial |
| `priorDecisionContentSha256` | Hash of predecessor or null for initial |
| `candidateKey` | Must match the exact candidate |
| `artifactSha256` | Must match the exact artifact |
| `workbookProfileContentSha256` | Binds decision to workbook profile |
| `decisionType` | "approve" \| "reject" \| "revoke" \| "supersede" |
| `humanActor` | Human actor with actorType, actorId, displayName |
| `rationale` | Non-empty string justifying decision |
| `decisionTimestamp` | UTC timestamp of decision |
| `resultingStatus` | "approved" \| "rejected" \| "revoked" \| "superseded" |
| `ruleSetVersion` | Case-specific policy version |
| `schemaVersion` | "1.0.0" (fixed) |

## PopulationDecisionProjection

| Field | Rule |
|---|---|
| `status` | Current effective status or "provisional" if no decisions |
| `effectiveDecisionId` | ID of last decision in chain or null |
| `effectiveWorkbookProfileContentSha256` | Hash binding from last decision or null |
| `provenance` | Codepoint-sorted list of all decision IDs |

## WorkbookPopulationProfile

| Field | Rule |
|---|---|
| `status` | "profiled" \| "blocked" |
| `sheets` | `PopulationWorkbookSheet[]`; never invented |
| `formulaExecutionCount` | Always 0; no formula execution |
| `limitations` | Array of issues preventing profiling |

## PopulationWorkbookSheet

| Field | Rule |
|---|---|
| `name` | Sheet name from workbook |
| `hidden` | Boolean; true if hidden |
| `cells` | `PopulationWorkbookCell[]` from passive extraction |

## PopulationWorkbookCell

| Field | Rule |
|---|---|
| `sheet` | Sheet name |
| `address` | Cell address (A1 notation) |
| `formulaText` | Formula text or null if value cell |
| `storedValue` | Raw stored value |
| `cellType` | Cell type classification or null |
| `kind` | "formula-text" \| "number" \| "text" \| "date" \| "boolean" \| "error" \| "blank" |

## WorkbookNamedRangeObservation

| Field | Rule |
|---|---|
| `name` | Named range name |
| `sourceTab` | Tab containing the range |
| `cellAddress` | Cell address or range |
| `definitionSheet` | Sheet where defined or null |

## Decision Transition State Machine

```
Initial (null) ──approve──> approved
Initial (null) ──reject───> rejected

approved ──revoke────> revoked
approved ──supersede─> superseded

rejected ──supersede─> superseded
revoked ──supersede─> superseded
```

Invalid transitions are rejected.
