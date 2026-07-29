# Data Model: Plan Rule Model

**Feature**: 002
**Authority**: Constitution 2.0.0, Feature 001 evidence ingestion

## PlanRuleRecord

| Field | Rule |
|---|---|
| `ruleId` | Deterministic UUID |
| `governingRestatement` | Non-empty string; concise rule statement |
| `affectedScope` | Non-empty string; identifies affected participant groups, benefits, or service definitions |
| `primaryCitation` | Exactly one; must reference a released `ProvisionCandidate` |
| `supportingCitations` | Zero or more; codepoint-sorted; cannot duplicate primary |
| `effectiveDate` | ISO date string; controls when rule applies |
| `endDate` | ISO date string or null; if present, must be >= effectiveDate |
| `adoptionOrExecutionDate` | ISO date string or null; when the rule was formally adopted |
| `applicabilityConditions` | One or more per required dimension; each dimension may appear multiple times |
| `supersessionChain` | Zero or more links; tracks history through amendments and repeals |
| `confidence` | 0-1; expert confidence in rule interpretation |
| `authorityOverrideId` | UUID or null; identifies override if evidence requires one |
| `authorHuman` | Human actor who approved the rule |
| `authoredAt` | UTC timestamp of approval |
| `reviewStatus` | "human-approved" or "provisional" |
| `approvalRationale` | Non-empty string; human justification for approval |
| `linkedUnresolvedItemIds` | Empty array; unresolved items block authoring |
| `ruleSetVersion` | Case-specific policy version |
| `schemaVersion` | "1.0.0" (fixed) |
| `ruleContentSha256` | Deterministic SHA-256 excluding human/timestamp fields |

## RuleCitation

| Field | Rule |
|---|---|
| `artifactSha256` | Hash of evidence artifact |
| `artifactLocator` | Locator within artifact (page, section, cell reference) |
| `sourceRole` | Source authority category (plan document, PBGC determination, etc.) |
| `provisionIdentifier` | Unique identifier within artifact (optional) |
| `citationLocator` | Precise text or formula reference |

## SupersessionLink

| Field | Rule |
|---|---|
| `ordinal` | Sequence number in chain (0 for initial, 1+ for amendments) |
| `predecessorRuleId` | UUID of prior rule or null for initial |
| `predecessorRuleContentSha256` | Hash of prior rule or null for initial |
| `effectiveDate` | ISO date when this link becomes effective |
| `linkType` | "initial" \| "supersession" \| "amendment" \| "re-authoring" \| "repeal" \| "reinstate" \| "branch" |

## ApplicabilityCondition

| Field | Rule |
|---|---|
| `dimension` | "participant-group" \| "benefit-purpose" \| "service-definition" \| "actuarial-equivalence-purpose" \| "freeze-or-restriction" \| "amendment-period" |
| `value` | Non-empty string; specific value for this dimension |
| `evidence` | One or more citations supporting this condition |

## GovernedRuleAuthoringInput

| Field | Rule |
|---|---|
| `proposedCandidates` | One or more released `ProvisionCandidate[]` |
| `primaryCitation` | Must match one proposed candidate exactly |
| `catalog` | Evidence catalog for citation validation |
| `unresolvedRecords` | Linked unresolved items; all must be resolved |
| `authorityOverrides` | Case-specific authority policies |
| `supportingCitations` | Zero or more; optional |
| `governingRestatement` | Non-empty; authoring input |
| `effectiveDate` | ISO date string |
| `endDate` | ISO date string or null |
| `adoptionOrExecutionDate` | ISO date string or null |
| `applicabilityConditions` | One or more per required dimension |
| `requiredApplicabilityDimensions` | Which dimensions must be present |
| `affectedScope` | Non-empty; human-readable scope |
| `reviewer` | Human actor approving the rule |
| `approvalRationale` | Non-empty; why rule was approved |
| `confidence` | 0-1 |
| `predecessor` | Prior rule for supersession chains (optional) |
| `linkType` | How predecessor is superseded (optional) |
| `ruleSetVersion` | Policy version |

## AuthorityOverride

| Field | Rule |
|---|---|
| `overrideId` | Deterministic UUID |
| `caseId` | Case identifier |
| `affectedRuleScope` | Rule scope this override applies to |
| `authorizedSourceRole` | Which source role is authorized despite default policy |
| `authorizedArtifactSha256` | Which artifact hash is authorized |
| `scopeRationale` | Why this scope requires override |
| `defaultAuthorityOrder` | Case-specific authority precedence |
| `issuer` | Human actor who issued override |
| `issuedAt` | UTC timestamp of issue |
| `overrideContentSha256` | Deterministic hash |
| `supersessionChain` | History of override amendments/repeals |
| `schemaVersion` | "1.0.0" (fixed) |

## UnresolvedItem

| Field | Rule |
|---|---|
| `itemId` | Deterministic UUID |
| `kind` | Ambiguity category (ambiguous-text, conflicting-provisions, etc.) |
| `affectedScope` | Scope this item blocks |
| `competingInterpretations` | Multiple candidate interpretations |
| `consequence` | Impact if unresolved |
| `linkedUnresolvedItemIds` | Related issues |
| `reviewerHuman` | Assigned reviewer (optional) |
| `assignee` | Responsible actor (optional) |
| `openAt` | UTC timestamp of opening |
| `resolutionHistory` | Chain of decision events |
| `status` | "open" \| "resolved" \| "superseded" |
| `revisionOrdinal` | Sequence number for this item |
| `itemContentSha256` | Deterministic hash |
| `revisionContentSha256` | Hash of current revision |
