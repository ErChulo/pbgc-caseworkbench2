# PBGC CaseworkBench Constitution

**Version:** 2.0.0  
**Status:** Ratified governing artifact  
**Ratified:** 2026-07-18  
**Approving authority:** Repository owner  
**Last amended:** 2026-07-18  

## 1. Purpose and scope

PBGC CaseworkBench shall produce auditable, reproducible, case-specific V1 calculation engines for terminated defined-benefit pension plans.

The system shall transform authoritative plan evidence, case controls, approved assumptions, and redacted or synthetic population data into effective-dated plan rules, population-driven calculation architecture, generated workbooks, and validation and reconciliation evidence.

This constitution defines durable project principles and invariants. Mutable case controls, filenames, implementation sequences, scenario catalogs, field inventories, workbook mechanics, and detailed test procedures belong in approved specifications, contracts, schemas, rules, or architectural decision records.

## 2. Governance, amendment, and precedence

This constitution is the highest repository-local authority for project design and implementation. In case of conflict, authority descends in this order:

1. this constitution;
2. controlling law and an approved case-specific legal, PBGC, or actuarial determination;
3. approved architectural decision records and case specifications;
4. approved contracts, schemas, and rule definitions;
5. implementation plans, tasks, code, tests, and documentation.

Conflicts shall be recorded and escalated; a lower-ranked artifact shall not silently override a higher-ranked authority.

Constitutional amendments require:

- an explicit rationale;
- review of affected specifications, rules, code, tests, and generated artifacts;
- an approving human authority recorded in the amendment history or associated review record;
- an updated semantic version and amendment date.

Major versions change or remove governing principles. Minor versions add or materially expand principles without invalidating existing ones. Patch versions clarify language without changing obligations. A missing historical ratification fact shall remain recorded as unknown rather than be invented.

## 3. Deterministic actuarial computation

All benefit, service, actuarial-adjustment, PBGC-limitation, present-value, allocation, and workbook-formula results shall be produced by deterministic code or formulas.

An LLM may assist with evidence extraction, classification, issue identification, and drafting for human review. Narrative LLM output shall never be the sole or final benefit-calculation engine.

Calculation rules shall explicitly govern:

- numeric types and retained intermediate precision;
- the stage, method, and unit of every material rounding operation;
- date, age, service, commencement, and calendar conventions;
- monthly, annual, and fractional-period treatment;
- boundary and effective-date behavior.

Binary floating-point shall not be used where an authoritative rule requires exact decimal behavior. Unauthorized rounding, unit conversion, or date inference is prohibited.

## 4. Evidence traceability and source authority

Every material plan rule shall retain its source document, source type, precise locator, effective date, adoption or execution date when relevant, supersession relationship, confidence, and review status.

No material formula or rule may be approved unless its legal and documentary basis is traceable. When sources conflict, the conflict and competing interpretations shall be preserved. The default authority order is:

1. executed plan document or amendment;
2. formal legal, PBGC, or actuarial determination;
3. approved plan summary or equivalent reviewed interpretation;
4. certified case report;
5. supporting administrative report;
6. approved historical calculation artifact used as reference;
7. inference.

Case-specific determinations may alter this order only through an explicit approval record.

## 5. Effective-dated plan history

The application shall model plan provisions as effective-dated history. It shall not collapse historical provisions into a single current rule or silently apply a later rule to an earlier period.

Applicability conditions shall distinguish participant groups, events, benefit purposes, service definitions, actuarial-equivalence purposes, freezes, restrictions, and amendment periods whenever those distinctions affect results.

Credited service, compensation, accruals, and other plan measures shall stop or change at the governing effective date. Any exception requires traceable authority.

## 6. Population-driven design and missing data

Plan evidence defines what benefits may exist; the actual approved population determines what must be programmed for a case. Tabs, scenarios, fields, formulas, and validations shall be justified by explicit population characteristics and documented rules.

Participant classification shall be deterministic, auditable, and supported by explicit input fields. Applicable scenarios, excluded scenarios, and validation exceptions shall be reproducible.

The system shall not invent, impute, silently infer, or replace missing required participant facts with zero. Missing required numeric, date, or categorical inputs shall produce explicit validation exceptions. Missing data may block an affected participant result from completion; it shall not justify fabricating data or avoiding formula implementation.

## 7. Separation of V1 concepts

The system shall keep these concepts distinct:

- `CALC_INDICATOR`, which identifies valuation or recalculation context;
- `CALCULATION`, which identifies a documented calculation run or scenario;
- I/O/B metadata, which identifies data-flow behavior for a field.

I/O/B values shall retain their approved meanings. In particular, `B` is an I/O/B value and is not a `CALC_INDICATOR`. Additional codes or changed meanings require an approved contract or decision record.

## 8. Human review and unresolved issues

Ambiguous plan language, evidence conflicts, missing sequencing, and competing actuarial interpretations shall become explicit unresolved items. Each item shall record the affected scope, competing interpretations, evidence, calculation or liability consequence, responsible reviewer, and resolution status.

Unresolved issues shall not be hidden in formulas, defaults, assumptions, or generated workbooks. Material actuarial rules and changes require human review, evidence citations, affected-test analysis, regeneration impact, and an approval record.

## 9. Reference-library and canonical-artifact governance

Every imported reference artifact shall preserve, where available:

- original source and retrieval provenance;
- immutable content hash and byte size;
- document or artifact type;
- effective, issue, and supersession dates;
- approval status and intended use;
- confidentiality and public-release status;
- licensing or redistribution constraints;
- review status and reviewer.

Imported artifacts are reference candidates unless a human approval record explicitly designates a specific hash and version as canonical for a stated purpose. Directory names, filenames, historical use, or similarity to prior work do not establish approval or canonical status.

Historical workbooks may preserve legacy or prohibited structures, including `mySort`, for analysis and regression evidence. Production generators shall not reproduce prohibited structures or silently inherit assumptions from reference artifacts.

Reference artifacts shall remain immutable. They shall not become production inputs unless an approval record defines their authority, permitted purpose, validation, and deterministic transformation rules. Corrections or normalization shall create traceable derived artifacts rather than overwrite source evidence.

## 10. Regulatory and policy currency

Before law, regulation, internal policy, or training material drives a rule, the project shall verify its authority, applicability, effective date, currency, and supersession status.

Binding law, regulation, formal determination, internal policy, training material, and explanatory examples shall remain distinguishable. A title such as “current,” a recent file date, or inclusion in the repository shall not establish controlling status.

Superseded materials shall be preserved when needed for historical applicability, with their supersession relationships recorded.

## 11. Privacy, confidentiality, and artifact security

No real participant PII shall be committed to the repository. Prohibited content includes direct identifiers, unredacted case identifiers when restricted, quasi-identifiers capable of re-identification, credentials, secrets, tokens, and sensitive combinations of otherwise ordinary data.

Only approved redacted, synthetic, aggregate, or otherwise authorized data may be stored. Redaction and synthesis shall be documented and shall not silently alter calculation semantics.

Office documents, PDFs, archives, images, workbooks, and other binary artifacts shall be reviewed as appropriate for:

- hidden sheets, names, comments, metadata, and embedded objects;
- macros or executable content;
- external links and data connections;
- malware;
- residual participant or case data;
- confidentiality, copyright, trademark, licensing, and redistribution restrictions.

Temporary extractions and working copies containing sensitive material shall be access-controlled and disposed of according to the applicable handling record.

## 12. Reproducibility and artifact lineage

Every material generated specification, workbook, validation result, and reconciliation report shall be reproducible from recorded inputs and versioned rules.

Artifact lineage shall identify, as applicable:

- input artifact hashes and versions;
- evidence and case-control versions;
- plan-rule and population-profile versions;
- build specification and generator versions;
- approved assumptions and unresolved items;
- validation results and tolerances;
- external execution records.

Generated workbooks and reports shall be fixed by changing and rerunning their generator. Manual patching shall not substitute for correcting the source rule, compiler, or generator.

## 13. Validation and implementation evidence

Every material workbook formula shall have an independent deterministic calculation or test oracle. Validation shall cover rule behavior, effective-date boundaries, representative participant conditions, population classification, scenario selection, formula dependencies, workbook structure, and reconciliation in proportion to risk.

Claims about maturity shall use evidence-based levels:

1. **Specified** — requirements and acceptance criteria exist.
2. **Implemented** — deterministic code or formulas exist.
3. **Tested** — automated tests have run and results are recorded.
4. **Independently validated** — a separate oracle or reconciliation has passed.
5. **Externally executed** — the named external system was actually run and evidence recorded.
6. **Human approved** — the responsible reviewer approved the artifact for its stated purpose.

A higher level shall not be claimed unless all required evidence for that level exists. Successful Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution shall not be claimed unless that execution was actually performed and recorded.

## 14. Workbook and generated-artifact invariants

Generated V1 workbooks shall follow an approved structural contract. They shall preserve required field and scenario semantics, formula dependencies, support-sheet identities, named-range integrity, and data-flow metadata.

Generated workbooks shall contain no broken references, undefined required names, unexplained inherited assumptions, or prohibited production structures. Required support-sheet names and other durable structural invariants may be specified by contract without declaring an unapproved source workbook canonical.

## 15. Architectural decisions

Material long-term decisions affecting system boundaries, calculation architecture, data models, external dependencies, security posture, workbook contracts, or irreversible migration cost shall be recorded in architectural decision records.

Each decision record shall state its context, decision, alternatives considered, consequences, status, approving authority, and supersession relationship. An architectural decision record may refine implementation within this constitution but may not override it.

## 16. High-risk prohibitions

The following remain prohibited regardless of implementation stage:

- inventing participant data or treating missing required numeric values as zero without authority;
- using narrative LLM output as the final benefit-calculation engine;
- silently resolving or concealing unresolved evidence or actuarial issues;
- silently overriding a higher-authority source;
- treating `B` as a `CALC_INDICATOR`;
- committing real participant PII, secrets, or unauthorized sensitive material;
- treating an imported artifact as approved or canonical without a human approval record;
- reproducing `mySort` or another prohibited legacy structure in a production-generated workbook;
- manually patching generated workbooks instead of correcting the generator;
- claiming tests, validation, review, or external execution that was not actually performed and recorded.

## Amendment history

| Version | Date | Approving authority | Summary |
|---|---|---|---|
| 2.0.0 | 2026-07-18 | Repository owner | Ratified after constitutional restructuring and governance review. |
| 1.0.0 | Not recorded | Not recorded | Initial PBGC CaseworkBench governing artifact. |
