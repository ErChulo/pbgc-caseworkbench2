# Feature Specification: Evidence Ingestion

**Feature Branch**: `010-evidence-ingestion`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Build the evidence-ingestion feature for PBGC Case Workbench: turn preserved case-package artifacts into a structured, effective-dated, source-cited plan-rule model with supersession tracking and unresolved-item reporting."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish the Evidence Catalog (Priority: P1)

An authorized caseworker opens a preserved case package and the system presents a single evidence catalog covering every approved-plan-eligible artifact: typed source (executed plan document, amendment, collective bargaining agreement, notice, actuarial report, certified case report, supporting administrative report, approved historical calculation artifact, regulation, training/reference), immutable content hash, byte size, locator, and receipt provenance inherited from Feature 009 inventory. Every catalog entry traces to exactly one preserved original.

**Why this priority**: Every downstream assertion about a plan rule must reduce to a single, traceable source artifact. Without a typed, hash-anchored catalog, no extraction can be trusted.

**Independent Test**: Open a preserved case package with mixed plan-doc, amendment, CBA, notice, report, workpaper, and unrelated artifacts; verify that every eligible artifact appears exactly once in the catalog with the correct type, hash, size, locator, and inherited receipt provenance, and that quarantined artifacts are explicitly excluded from the evidence catalog.

**Acceptance Scenarios**:

1. **Given** a preserved case package from Feature 009 intake, **When** the caseworker opens the evidence catalog, **Then** every screened-and-released artifact appears once, typed by source role, with hash/size/locator inherited unchanged from the immutable inventory.
2. **Given** mixed eligible and quarantined artifacts, **When** the catalog is built, **Then** only released artifacts appear and quarantined-artifact omission is recorded as an explicit unresolved item rather than silently dropped.
3. **Given** two byte-identical artifacts inherited as exact duplicates from inventory, **When** the catalog forms, **Then** both receipt records are preserved, exactly one canonical evidence entry is authored for the shared hash, and the second receipt links to the same evidence without inventing a duplicate source.
4. **Given** a container with extracted members, **When** the catalog forms, **Then** the container and each member are individually eligible for typing as separate evidence entries linked by containment lineage.
5. **Given** a reference-library artifact (regulation, training, PBGC policy) imported separately from the case-evidence package, **When** the catalog forms, **Then** reference artifacts appear in a distinct reference-only section and never as case evidence without an explicit approval record designating them canonical for a stated purpose.

---

### User Story 2 - Extract Plan-Rule Candidates from Evidence (Priority: P1)

An authorized caseworker selects a screened text-bearing artifact (plan document, amendment, CBA, notice, report) and the system extracts structured plan-rule candidates: provision identifier, verbatim text, normalized restatement, locator (file + JSON Pointer or page/offset), effective date, adoption/execution date, and confidence. Every candidate is proposed-only and traces to the single source artifact and locator; no candidate is authored as a final rule without human approval.

**Why this priority**: Provision candidates are the atoms of the plan-rule model; if extraction is untraceable, proposed-only, or final-without-approval, the entire downstream calculation is un-auditable.

**Independent Test**: Extract thesame provision text from two near-duplicate amendments; verify both candidates are recorded with distinct locators, identical normalized restatement, an explicit near-duplicate relationship, and neither is marked final until an authorized human approves.

**Acceptance Scenarios**:

1. **Given** a screened plan-document artifact with extractable text, **When** extraction runs, **Then** every emitted candidate references the source artifact hash and an exact locator and is marked proposed.
2. **Given** two artifacts containing the same provision text, **When** both are extracted, **Then** the candidates are linked by a near-duplicate relationship and the system never discards one as redundant.
3. **Given** an amendment that supersedes a prior provision, **When** both are extracted, **Then** an explicit supersession proposal is recorded with predecessor, successor, effective date, and confidence; the system does not silently apply the successor to the prior period or collapse both into one candidate.
4. **Given** ambiguous plan language ("may," "at the discretion of," undefined term), **When** extraction runs, **Then** the candidate is flagged as an unresolved item with competing interpretations preserved, not silently resolved.
5. **Given** a regulatory or training reference imported into the reference section, **When** extraction runs, **Then** reference candidates are recorded as non-authoritative context and may never be promoted to a final plan rule without a case-specific approval record overriding the default authority order.
6. **Given** a document containing both formula text and a worked numeric example, **When** extraction runs, **Then** the formula candidate and the example candidate are recorded separately with the example marked as illustrative, not as the governing rule.

---

### User Story 3 - Author an Effective-Dated Plan-Rule Record (Priority: P1)

An authorized reviewer promotes one or more approved candidates into a single effective-dated plan-rule record: rule identifier, governing normalized restatement, source citations (artifact hash + locator, one primary citation per rule), effective date, adoption/execution date, supersession chain, applicability conditions (participant group, benefit purpose, service definition, actuarial-equivalence purpose, freeze/restriction, amendment period), confidence, and review status. A rule never silently covers a period outside its effective dates.

**Why this priority**: Constitution section 5 requires effective-dated history; collapsing provisions into a single current rule is the canonical bug this feature must prevent.

**Independent Test**: Author one plan-rule record for a benefit-formula amendment whose effective date is 2020-07-31; verify the rule explicitly stops at that date for affected participant groups, preserves the predecessor rule unchanged, and rejects any attempt to apply the new rule to a prior period.

**Acceptance Scenarios**:

1. **Given** an approved candidate, **When** the reviewer authors the plan-rule record, **Then** the record has exactly one primary source citation (artifact hash + locator), an effective date, optional adoption/execution date, applicability conditions, confidence, and review status `human-approved`.
2. **Given** a new amendment superseding an existing rule, **When** the reviewer authors the successor rule, **Then** the predecessor remains immutable, a supersession chain links predecessor and successor with effective dates on every link, and the system rejects applying the successor to any period before its effective date.
3. **Given** competing provisions from conflicting sources, **When** the reviewer authors the rule, **Then** the conflict and the non-selected competing interpretation are preserved as part of the rule's conflict record and not silently resolved.
4. **Given** applicability conditions that distinguish benefit purpose (e.g., early-retirement supplement vs. basic benefit), **When** the rule is authored, **Then** the conditions are recorded explicitly and the rule will not silently apply to an unintended purpose.
5. **Given** an attempt to author a rule whose only citation is a reference/training artifact, **When** the rule is authored, **Then** the system rejects the rule unless a case-specific approval record explicitly overrides the default authority order.

---

### User Story 4 - Track Unresolved Evidence Issues (Priority: P2)

Throughout ingestion the system surfaces unresolved items as first-class records, not hidden defaults: ambiguous text, evidence conflicts, missing sequencing, undefined terms, hidden content flagged in Feature 009 screening, and any place where the caseworker required an assumption to proceed. Each item records affected scope, competing interpretations, evidence, calculation or liability consequence, responsible reviewer, and resolution status. Unresolved items never become silent defaults or hidden formulas.

**Why this priority**: Constitution section 8 mandates that ambiguous plan language and competing interpretations become explicit unresolved items; concealing them in defaults is a high-risk prohibition.

**Independent Test**: Open a case where an amendment effective date is ambiguous from the document but the caseworker must proceed; verify the system records an unresolved item with the competing interpretations and that any downstream rule explicitly carries the unresolved-item reference until it is resolved by an authorized human.

**Acceptance Scenarios**:

1. **Given** an extraction candidate with ambiguous language, **When** the candidate is recorded, **Then** an unresolved item is created and linked to the candidate with competing interpretations preserved.
2. **Given** two conflicting provisions addressing the same scope, **When** a reviewer must select one, **Then** the non-selected interpretation is preserved as part of the unresolved-item record until the conflict is formally resolved or superseded.
3. **Given** an unresolved item, **When** an authorized reviewer resolves it (accepts, supersedes, or rejects), **Then** a typed decision record is appended, the decision is replayable, and downstream rules previously blocked by the item become eligible for promotion.
4. **Given** an attempt to proceed with a hidden assumption in place of a required value, **When** the caseworker tries to author a rule that depends on the unresolved item, **Then** the system blocks silent authoring and requires explicit unresolved-item linkage or resolution first.
5. **Given** hidden content flagged by Feature 009 screening, **When** the relevant artifact is considered for ingestion, **Then** an unresolved item records the hidden content's affect on evidence completeness, and the affected candidate is not silently authored.

---

### User Story 5 - Maintain Source-Authority and Supersession Lineage (Priority: P2)

An authorized reviewer can query the authority and currency of any plan-rule record: which source artifact backs it, where in that artifact, what source type and confidence, whether a higher-authority source supersedes it, and whether the source's review status is current. The default authority order (executed plan document > formal legal/PBGC/actuarial determination > approved summary > certified case report > supporting administrative report > approved historical artifact > inference) is enforced unless an explicit case-specific approval record overrides it.

**Why this priority**: Constitution sections 4 and 10 require source authority and regulatory currency to be visible and verifiable; without it, a stale or superseded source could silently govern a benefit.

**Independent Test**: Author a rule from a plan summary, then import the executed plan document covering the same scope; verify the system proposes a re-authoring with the higher-authority source, preserves the prior summary-based record immutable, and does not silently overwrite it.

**Acceptance Scenarios**:

1. **Given** two rules covering the same scope with different source authority levels, **When** the reviewer queries authority, **Then** the system reports the default authority order, identifies the higher-authority source, and proposes a re-authoring rather than silently overwriting.
2. **Given** a source artifact whose review status is stale or whose regulatory supersession date has passed, **When** the reviewer queries currency, **Then** the affected rules are flagged and an unresolved item is opened for re-review.
3. **Given** a case-specific approval record overriding the default authority order, **When** a rule is authored against a non-default source, **Then** the override is recorded on the rule and the system reports the override alongside the default order.
4. **Given** a supersession chain across multiple amendments, **When** the reviewer queries the current rule for a given effective date, **Then** the system surfaces exactly the rule effective on that date with the full chain visible, predecessor and successor immutable, and no collapsed single-current rule.

---

### Edge Cases

- **Container-only evidence**: a member is unreadable but the container is preserved; the system records the contained-by relationship and the unreadable member as an unresolved item, and never invents a member.
- **Multiple-source restatement**: a single provision is restated in the plan document, an amendment, and a summary; all three are recorded as separate citations and the rule records the chosen primary plus the supporting citations.
- **Effective-date boundary**: a participant crosses an effective date mid-period (e.g., freeze at 2020-07-31); the system splits treatment at the boundary and never applies a later rule to an earlier period.
- **Confidential source**: a source artifact is marked confidential or restricted; the rule records the confidentiality on the citation and downstream handling preserves the restriction.
- **Reference artifact misused as case evidence**: a training/regulatory reference is mistakenly cited as a primary case-evidence rule; the system rejects authoring without an explicit case-specific approval record.
- **Cryptographically mismatched source**: a citation references an artifact hash that no longer exists in the catalog because the artifact was re-imported under a new hash; the system blocks the rule from being authored or used and opens an unresolved item.
- **Out-of-scope evidence**: an artifact is preserved but is not a plan document, amendment, CBA, notice, report, or reference; it remains cataloged with type `other` and is ineligible to back a plan rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Feature MUST build the evidence catalog from Feature 009's screened-and-released artifacts, inheriting their immutable content hash, byte size, locator, and receipt provenance without re-hashing or re-copying originals.
- **FR-002**: Feature MUST type every catalog entry by source role (executed plan document, amendment, collective bargaining agreement, notice, actuarial report, certified case report, supporting administrative report, approved historical calculation artifact, regulation, training/reference, other).
- **FR-003**: Feature MUST exclude quarantined artifacts from the evidence catalog and record each excluded artifact as an explicit unresolved item citing the quarantine decision.
- **FR-004**: Feature MUST preserve exact-duplicate and containment relationships inherited from inventory when forming evidence entries, without inventing duplicate sources.
- **FR-005**: Feature MUST classify imported reference-library artifacts (regulations, training, PBGC policy) into a distinct reference-only section; they MUST NOT appear as case evidence without an explicit approval record designating them canonical for a stated purpose.
- **FR-006**: Feature MUST extract plan-rule candidates from screened text-bearing artifacts, emitting provision identifier, verbatim text, normalized restatement, source artifact hash, exact locator (including JSON Pointer or page/offset), extracted effective date, adoption/execution date when available, and a confidence score.
- **FR-007**: Every extracted candidate MUST be marked proposed and MUST NOT attain final status without an authorized human approval record.
- **FR-008**: Feature MUST detect near-duplicate provisions across artifacts and record a near-duplicate relationship linking the candidates without discarding either.
- **FR-009**: Feature MUST detect supersession relationships between amendments and prior provisions and record an explicit supersession proposal with predecessor, successor, effective date, and confidence, without collapsing both into one candidate or silently applying the successor to a prior period.
- **FR-010**: Feature MUST flag ambiguous plan language and unresolved extraction conflicts as first-class unresolved items with competing interpretations preserved, never silently resolved.
- **FR-011**: Feature MUST distinguish governing formula text from illustrative worked examples and mark examples as non-authoritative.
- **FR-012**: Feature MUST allow an authorized reviewer to promote approved candidates into a single effective-dated plan-rule record with exactly one primary source citation (artifact hash + locator), optional supporting citations, effective date, adoption/execution date when relevant, applicability conditions, supersession chain, confidence, and review status.
- **FR-013**: A plan-rule record MUST NOT silently cover any period outside its effective dates; applicability conditions MUST distinguish participant group, benefit purpose, service definition, actuarial-equivalence purpose, freeze/restriction, and amendment period whenever those distinctions affect results.
- **FR-014**: Feature MUST keep predecessor and successor rules immutable across supersession; supersession links MUST carry effective dates on every link.
- **FR-015**: Feature MUST preserve the default source-authority order (executed plan document > formal legal/PBGC/actuarial determination > approved summary > certified case report > supporting administrative report > approved historical artifact > inference) and MUST NOT author a rule whose only citation is a reference/training artifact unless an explicit case-specific approval record overrides the order.
- **FR-016**: Feature MUST preserve competing provisions and the non-selected interpretation when a conflict resolution is recorded, never silently discarding the alternative.
- **FR-017**: Feature MUST surface unresolved items throughout ingestion with affected scope, competing interpretations, evidence, calculation/liability consequence, responsible reviewer, and resolution status.
- **FR-018**: Feature MUST block rule authoring that would silently consume an unresolved item as a hidden assumption; the authoring MUST explicitly link or resolve the unresolved item first.
- **FR-019**: Feature MUST allow an authorized reviewer to resolve an unresolved item with a typed decision record (accept, supersede, reject); the resolution MUST be replayable and MUST enable eligible downstream rules previously blocked by the item.
- **FR-020**: Feature MUST surface hidden-content flags inherited from Feature 009 screening as unresolved items affecting the affected candidates' inclusiveness, and MUST NOT silently author the candidate.
- **FR-021**: Feature MUST permit querying the authority and currency of any plan-rule record: source hash, locator, source type, confidence, supersession status, and review-status currency.
- **FR-022**: When a higher-authority source becomes available for a previously authored rule, Feature MUST propose a re-authoring rather than silently overwriting the prior record; the prior record MUST remain immutable and part of the supersession chain.
- **FR-023**: When a source artifact's review status is stale or its regulatory supersession date has passed, Feature MUST flag affected rules and open unresolved items for re-review.
- **FR-024**: Feature MUST treat every artifact as a reference candidate unless an explicit human approval record designates a specific hash and version as canonical for a stated purpose; directory names, filenames, historical use, or similarity MUST NOT establish canonical status.
- **FR-025**: Feature MUST NOT use narrative LLM output as the final benefit-calculation engine; an LLM MAY assist with evidence extraction, classification, and issue identification for human review, but every plan-rule record MUST be produced by deterministic code or approved by an authorized human.
- **FR-026**: Feature MUST NOT invent, impute, or replace missing required participant facts with zero; missing required numeric, date, or categorical inputs MUST produce explicit validation exceptions (this feature ingests plan evidence, not participant data, but MUST NOT silently fabricate plan-rule values where a source is missing or ambiguous).
- **FR-027**: Feature MUST keep `CALC_INDICATOR`, `CALCULATION`, and I/O/B metadata concepts distinct; none of these appear in evidence ingestion directly, but the plan-rule model MUST NOT collapse them or treat `B` as a `CALC_INDICATOR`.
- **FR-028**: Feature MUST NOT reproduce `mySort` or any other prohibited legacy structure when importing rules from a reference workbook or approved historical artifact.
- **FR-029**: Feature MUST run entirely within the local-first, zero-network boundary established by Feature 009; no participant PII, raw case evidence, secrets, or work-in-progress rules may leave the user's device via network, external LLM, or service-worker path.
- **FR-030**: Feature MUST NOT claim Excel, ValTool, Runtime, ATPBGC, BCV, or any external execution occurred unless that execution was actually performed and recorded — this feature produces Specified-to-Implemented maturity at most.

### Key Entities *(include if feature involves data)*

- **EvidenceArtifact**: a preserved, screened-and-released artifact from Feature 009 inventory, typed by source role, with inherited hash/size/locator/receipt; the unit a rule can cite.
- **EvidenceCatalog**: the typed collection of EvidenceArtifact entries (case-evidence section + reference-only section) backing a single case.
- **ProvisionCandidate**: a proposed-only, locator-anchored extraction (verbatim text + normalized restatement + effective date + confidence) traced to exactly one EvidenceArtifact; never final without human approval.
- **NearDuplicateRelationship**: a deterministic relationship linking two ProvisionCandidates with near-identical restatements but distinct locators; never discards either candidate.
- **SupersessionProposal**: a deterministic proposal linking a predecessor ProvisionCandidate to a successor with effective date and confidence; never silently applies the successor to the predecessor's period.
- **PlanRuleRecord**: an authorized, effective-dated rule with one primary source citation (artifact hash + locator), optional supporting citations, applicability conditions, supersession chain, confidence, and review status; immutable once authored, with re-authoring producing a new linked record rather than in-place mutation.
- **UnresolvedItem**: a first-class record of ambiguous language, evidence conflict, missing sequencing, hidden-content flag, or stale/superseded source; carries affected scope, competing interpretations, evidence, consequence, responsible reviewer, and resolution status; never a hidden default.
- **AuthorityOverride**: a case-specific approval record overriding the default source-authority order for a nominated rule; recorded on the rule and reported alongside the default order.
- **ConflictRecord**: the preserved non-selected interpretation and the rationale for non-selection when conflicting sources affect the same scope.
- **ReferenceArtifact**: a regulation, training, PBGC policy, or imported reference-library artifact; lives in a distinct reference-only catalog section; never backs a plan rule without an explicit AuthorityOverride.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every preserved case-evidence artifact that passes Feature 009 screening appears in the evidence catalog exactly once with correct type, hash, size, and locator; 100% of quarantined artifacts are excluded and recorded as unresolved items.
- **SC-002**: Every extracted plan-rule candidate traces to a single source artifact and exact locator with 100% locator resolution (no orphan or ambiguous citations).
- **SC-003**: 100% of authored plan-rule records have exactly one primary source citation, an effective date, applicability conditions, and review status; zero rules silently cover a period outside their effective dates.
- **SC-004**: Across a synthetic amendment chain covering >=5 successive provisions, every predecessor remains immutable, every supersession link carries an effective date, and querying the rule effective on any sampled date returns exactly the correct rule.
- **SC-005**: 100% of ambiguous language, conflicting sources, missing sequencing, hidden-content flags, and stale sources become first-class unresolved items; zero cases of hidden assumptions silently authored into a rule.
- **SC-006**: When a higher-authority source is introduced for an existing rule, the system proposes re-authoring with 100% preservation of the prior record and zero silent overwrites.
- **SC-007**: 100% of reference-library artifacts remain in the reference-only section; zero reference artifacts back a plan rule without an explicit AuthorityOverride.
- **SC-008**: 100% of the feature runs within the local-first, zero-network boundary; zero outbound network, external-LLM, or service-worker transmissions containing participant PII, raw case evidence, or work-in-progress rules.
- **SC-009**: End-to-end ingestion of a preserved College of Saint Rose pilot case package produces an evidence catalog, candidate set, authored rule records, and unresolved items with no manual correction required.
- **SC-010**: 100% of claimed maturity uses evidence-based levels (Specified, Implemented, Tested, Independently validated, Externally executed, Human approved); the feature claims no higher than Implemented prior to test authoring and no Excel/ValTool/Runtime/ATPBGC/BCV execution unless actually performed and recorded.

## Assumptions

- The active pilot case is the College of Saint Rose Non-Contract Employees Pension Plan (PBGC case 24884900, DOPT 2024-06-30, benefit/participation freeze 2020-07-31); the feature is exercised against a de-identified or synthetic reduction of this case's evidence package, not against real participant PII.
- Feature 009 is merged and provides the preserved, hashed, screened, quarantine-confirmed inventory this feature consumes; this feature does not re-implement intake, hashing, or quarantine mechanics.
- "Screened-and-released" is the only Artifact state eligible to back an EvidenceArtifact; quarantined, provisional, and unscreened artifacts are excluded by contract.
- The default source-authority order from constitution section 4 applies unless an explicit case-specific AuthorityOverride is recorded; the pilot's caseworker is authorized to issue such overrides.
- The Pilot plan document set includes amendments and a benefit/participation freeze at 2020-07-31; effective dates will be drawn from the case evidence, not inferred.
- The reference library (`reference/regulations/`, `reference/training/`, `reference/approved-v1-summaries/`, `reference/approved-v1-workbooks/`, `reference/canonical-v1/`) is available locally and is treated as reference-only unless an AuthorityOverride designates an entry canonical.
- An LLM may assist with extraction, classification, and unresolved-item drafting but never produces the final plan-rule record; an authorized human approves every rule.
- Real participant PII remains prohibited from being committed to the repository; only approved de-identified or synthetic fixtures are used in tests, examples, and documentation.
- Maturity at end of this feature is at most Implemented; Tested, Independently validated, and Externally executed are reached in later phases (Features 006-008).
- The local-first, single-HTML, zero-network runtime established by Feature 009 is reused unchanged; this feature adds domain logic on top, not a new application shell or storage boundary.
