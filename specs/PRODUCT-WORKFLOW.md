# PBGC Case Workbench 2 --- Product Workflow Specification

**Status:** Ratified\
**Approval date:** 2026-08-07\
**Approving authority:** Repository owner\
**Purpose:** Consolidate the human-approved operating model for
implementation\
**Primary objective:** Construct an auditable, deterministic,
case-specific V1 calculation engine\
**Implementation status:** No code changes authorized by this document
alone

## 1. Governing product model

Case Workbench shall use this hierarchy:

``` text
One permanent local Workbench workspace
    └── Many PBGC cases
            └── Case evidence
                    └── Governed plan attributes / Plan Summary
                            └── V1 calculation-engine specification
```

The workspace is not a case. A PBGC case is a governed unit inside the
selected workspace.

The normal opening workflow is:

1.  User selects or reopens the permanent local Workbench workspace.
2.  The application simultaneously shows existing cases and a control to
    create a new case.
3.  Creating a case requires only the PBGC case number.
4.  A newly created case opens automatically.
5.  A new case proceeds directly to evidence intake.

## 2. Workspace and case behavior

### 2.1 Workspace

-   One persistent local workspace may contain many PBGC cases.
-   The workspace is the controlled storage boundary for the
    application.
-   The UI must clearly distinguish the Workbench workspace from
    source-evidence locations.
-   The user must not need to understand implementation concepts such as
    OPFS, IndexedDB, handles, catalogs, or internal manifests to operate
    the application.

### 2.2 Case creation and opening

The workspace home screen shall provide both:

-   a list/control for opening existing cases; and
-   a **Create New Case** control.

A new case requires only its PBGC case number. After creation, it opens
automatically.

## 3. Evidence intake

### 3.1 Source selection

For an open case, evidence intake shall expose both controls:

-   **Add individual files**
-   **Add folder**

The user may use either or both.

Source evidence may originate anywhere locally that the browser is
authorized to access. The source location is distinct from the
controlled Workbench workspace.

### 3.2 Controlled preservation

On intake:

-   Case Workbench preserves a controlled copy within the case/workspace
    boundary.
-   The original filename is preserved.
-   Original bytes are preserved exactly as received.
-   Preserved originals are immutable.
-   Lowercase SHA-256 byte identity is used for duplicate detection.

If identical bytes are imported again:

-   no second physical evidence copy is required;
-   the additional intake event/provenance is retained.

If changed bytes are imported:

-   they constitute a new artifact;
-   the earlier artifact remains preserved.

### 3.3 Evidence lifecycle

Preserved evidence is never silently rewritten or erased.

A user may:

-   withdraw an artifact from active use;
-   import a corrected or replacement artifact;
-   designate an artifact as superseding another.

Historical originals remain preserved.

### 3.4 Evidence inventory and viewing

After intake, the application shall show an **Evidence Inventory**.

The user shall be able to open evidence from within Case Workbench.

PDFs and images shall be viewable inside the application alongside
casework functionality.

Where text extraction is available, the viewer shall support comparison
of:

-   original document; and
-   extracted text.

## 4. OCR, extracted text, and PII screening

### 4.1 OCR reference implementation

`o-bulk-ocr-studio` from the `bulk-ocr-studio` repository is approved as
a **reference implementation/source of reusable functionality** for Case
Workbench's local OCR and PII subsystem.

It shall not be embedded wholesale as a second application.

Reusable capabilities may include:

-   local PDF rendering;
-   local OCR;
-   spreadsheet/text extraction;
-   low-confidence review;
-   PII-candidate detection.

Case Workbench remains authoritative for evidence storage, immutable
originals, provenance, governed state, corrected text, classifications,
and case data.

### 4.2 Extracted text

Case Workbench shall preserve separately:

1.  the original machine-extracted text; and
2.  human-corrected text.

Human correction shall never modify the preserved evidence artifact or
overwrite the original extraction.

When corrected text exists, it becomes the text used for subsequent
analysis.

A detailed user/time/change audit trail for text corrections is not
required by the decisions consolidated here.

### 4.3 PII and zero-network boundary

Real participant PII may be processed only locally on the user's device.

During production case processing:

``` text
outbound participant-data transmission = 0
```

No real participant evidence or PII may be transmitted to external LLMs,
cloud APIs, telemetry services, or other external servers.

The production application shall enforce a technical zero-network
boundary rather than relying solely on developer discipline.

Automated PII detection is screening, not proof of absence. A layered
local approach is preferred:

``` text
deterministic patterns/validators
    + local NLP/NER/custom-entity rules
    + PBGC-specific contextual rules
    + human review where required
```

`winkNLP` and `compromise` are candidates for a later controlled
comparison. Neither is approved for production merely by this
specification.

## 5. Evidence classification

Case Workbench shall automatically propose evidence classifications.

Examples may include:

-   Plan Document
-   Amendment
-   SPD
-   Participant Data
-   Actuarial Report
-   Correspondence
-   Other/Unknown

Rules:

-   automated classification remains provisional until human approval;
-   approved classifications may later be corrected;
-   one artifact may have multiple classifications;
-   classification may occur at artifact level and page/range level;
-   automated proposals shall never silently become governed final
    states.

## 6. Plan attributes and Plan Summary

### 6.1 Extraction

From approved plan-related evidence, Case Workbench shall attempt to
extract plan attributes automatically.

Each proposed attribute must retain an exact source citation sufficient
to locate the supporting evidence, such as artifact plus
page/section/range.

### 6.2 Conflicts

If sources support conflicting values:

-   preserve all competing values;
-   preserve the supporting citation for each;
-   do not automatically resolve the conflict;
-   require a human determination of the governed value.

Approved attributes may later be changed when additional evidence
supports a different determination.

### 6.3 Direct versus derived attributes

Case Workbench shall distinguish:

-   **Direct attribute:** stated directly in evidence.
-   **Derived attribute:** produced by a deterministic formula or rule.

For a derived attribute, preserve:

-   deterministic formula/rule;
-   required input attributes;
-   citations supporting those inputs.

If a required input is missing or unresolved:

-   mark the derived attribute **Blocked**;
-   identify the missing/unresolved inputs;
-   do not estimate, infer, or impute them.

## 7. Data Dictionary Complete --- universe of discourse

The current `data_dictionary_complete.xlsm` (**Data Dictionary
Complete**) is the governing field universe of discourse for Case
Workbench.

Every Case Workbench field shall be represented as either:

``` text
A. an official Data Dictionary Complete field
or
B. an explicitly identified user-defined field
```

Rules:

-   map to an official field when a valid semantic match exists;
-   never force a field onto an inappropriate dictionary field merely
    because the names look similar;
-   if no semantic match exists, create/allow an explicit user-defined
    field;
-   user-defined fields must remain distinguishable from official
    dictionary fields.

The approved Data Dictionary Complete artifact and field identity are governed
by ADR 011. Official identities use the exact pair `(TABLE_NAME, FIELD_NAME)`
and bind to artifact SHA-256
`d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96`.
The workbook is approved for passive field-metadata parsing only; macros,
formulas, links, and external content are never executed.

## 8. Population data --- bounded role

### 8.1 Purpose

The primary product objective is construction of the V1 calculation engine.

Construction of the V1 engine is population-driven. The actual approved population helps determine what must be programmed:

"Population characteristics" includes, at minimum:

-   the actual census schema and fields available to the case;
-   mappings of those fields to Data Dictionary Complete;
-   locally derived summaries useful for determining applicable scenarios, such as counts by RETSTAT/ID combinations; and
-   actual participant-level values when useful for deterministic local validation, scenario determination, testing, or execution.

Real participant-level values may be processed inside Case Workbench because production processing is local and zero-network. Real participant-level PII must never be transmitted to an external LLM, cloud API, telemetry service, or other external system. Construction of the V1 engine must not require external transmission of participant-level values.

The V1 engine remains definable from:

-   governed Plan Summary / plan attributes;
-   deterministic plan rules;
-   Data Dictionary Complete field definitions; and
-   the actual approved population schema, fields, and locally derived characteristics available to the case.

Data Dictionary Complete remains the governing field universe of discourse.

Population-driven design distinguishes:

  actual approved population
      -> schema / available fields
      -> locally derived population characteristics and summaries
      -> applicable V1 scenarios, fields, formulas, tabs, and validations

while:

  real participant PII
      -> may be processed locally
      -> must not leave the zero-network trust boundary

Conceptually:

``` text
V1 rule: Benefit(p) = F(DOB(p), DOH(p), COMP(p), ...)
```

The engine needs the field semantics, plan rules, and the population schema and characteristics available to the case, including real participant-level values processed locally.

### 8.2 Population import

A case has one active population dataset.

If a revised population is imported:

-   it becomes the active population dataset;
-   the prior dataset remains preserved in case history;
-   automatic old-versus-new population comparison is not required.

### 8.3 Field mapping

On population import, Case Workbench shall propose mappings from source
columns to Data Dictionary Complete fields.

If mapping confidence is insufficient:

-   mark the column **Unmapped**;
-   do not guess;
-   require the user to select the appropriate official field or create
    a user-defined field.

A manually approved mapping may be remembered for additional population
files **within that same case only**. It shall not automatically become
a Workbench-wide mapping.

### 8.4 Population assumptions and validation

For actuarial casework, supplied population values are treated as
working values already audited/established through processes outside
Case Workbench.

Case Workbench shall not attempt to establish participant facts by
requiring birth certificates or similar underlying documentary evidence.

It may perform deterministic consistency/plausibility checks, such as:

-   impossible date ordering;
-   missing required fields;
-   invalid enumerated codes;
-   duplicate participant identifiers;
-   negative or otherwise impossible deterministic values.

Validation failures are review flags. Case Workbench shall not silently
correct participant data.

The product shall not expand into a participant-evidence adjudication
system.

## 9. V1 calculation-engine objective

The product's central transformation is:

``` text
Case evidence
    → governed Plan Summary / plan-rule model
    → Data Dictionary Complete field bindings
    → deterministic V1 calculation-engine specification
    → V1 calculation engine / workbook artifacts
```

Actuarial calculations must be deterministic code or formulas, never
narrative LLM output.

Missing required inputs remain explicit and may block affected formulas
or processing.

The V1 engine must remain traceable to:

-   governed plan provisions;
-   effective dates;
-   source citations;
-   deterministic formulas/rules;
-   field definitions.

## 10. UX invariants

The application must make these concepts obvious without architectural
knowledge:

``` text
WORKSPACE → CASE → EVIDENCE → PLAN SUMMARY → V1 ENGINE
```

At minimum:

-   workspace selection must not look like case-folder selection;
-   the workspace home must expose existing cases and new-case creation
    together;
-   evidence intake must state that source files/folders may be selected
    from outside the workspace;
-   evidence intake must clearly label both individual-file and folder
    import;
-   the active PBGC case number must remain visually obvious;
-   technical storage terminology must not be required for ordinary
    casework.

## 11. Security and governance invariants

The following remain non-negotiable:

-   no real participant PII in repository fixtures, examples, logs,
    screenshots, or documentation;
-   authorized real PII is local-device-only;
-   zero-network production case processing;
-   immutable original evidence;
-   lowercase SHA-256 artifact identity;
-   changed bytes create a new artifact lifecycle;
-   automated extraction/classification remains provisional until
    governed as required;
-   matching hashes establish byte identity, not approval;
-   no silent inference or imputation of missing participant data;
-   no execution of Office macros, embedded scripts, links, or untrusted
    binaries;
-   deterministic actuarial calculations;
-   unresolved material conflicts remain explicit.

## 12. Relationship to the existing constitution

This specification is subordinate to the ratified repository
constitution.

PRODUCT-WORKFLOW.md is consistent with Constitution §6 (Population-driven
design and missing data):

-   plan evidence defines what benefits may exist;
-   the actual approved population determines what must be programmed for
    the case;
-   population characteristics may be derived locally from the schema and
    actual population (see §8.1);
-   participant-level PII remains local to the user's device under the
    zero-network trust boundary (see §4.3 and §8.1);
-   no constitution amendment is required for this clarification.

This specification does not override any constitutional provision.

## 13. Explicitly deferred / not decided here

This specification does not yet decide:

-   the final local NLP library (`winkNLP` versus `compromise`);
-   detailed V1 workbook screen/layout design;
-   every plan-attribute field;
-   every deterministic population validation rule;
-   final internal filesystem layout;
-   detailed OPFS versus workspace implementation mechanics;
-   downstream PBGC reports beyond the V1-engine objective;
-   external LLM integration for production case evidence (real PII
    remains prohibited from external transmission).

## 14. Acceptance statement

This document is intended to answer the operational question:

> What is Case Workbench 2 supposed to do for the case actuary?

Implementation should not resume merely because this draft exists. The
product workflow must first be reviewed and ratified through the project's
governance process, with any remaining legitimate architecture/governance
gates identified in this document satisfied before implementation
proceeds.
