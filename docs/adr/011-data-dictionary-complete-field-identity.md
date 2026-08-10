# ADR 011: Data Dictionary Complete field identity

- **Status:** Accepted
- **Approving authority:** Repository owner
- **Approval date:** 2026-08-09
- **Supersedes:** Nothing
- **Superseded by:** Nothing

## Context

The ratified product workflow identifies `data_dictionary_complete.xlsm` as the governing field universe, but the constitution requires authority to bind to an exact artifact hash and reviewed purpose. Passive inspection found no VBA project, external relationship, external-link part, ActiveX object, OLE object, embedded object, connection, query table, hyperlink, or external formula reference. The package is nevertheless macro-enabled and contains four hidden XLM-flagged `_xlpm.*` defined names, one hidden metadata sheet, populated author metadata, and origin metadata.

The workbook contains 1,172 field records. `FIELD_NAME` is not globally unique: `CUSTOMER_DELETE_FLAG` and `DATABASE_ID` each occur in eleven table contexts. The workbook contains no separate official-field identifier.

## Decision

Approve this exact artifact for passive field-metadata use:

- **Path:** `reference/field-catalogs/atpbgc/data_dictionary_complete.xlsm`
- **SHA-256:** `d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96`
- **Byte size:** `104966`
- **Permitted purpose:** passive, local parsing of field metadata and deterministic field-identity lookup
- **Prohibited behavior:** execution of macros, XLM names, formulas, links, embedded content, external programs, or network access

Use the exact pair `(TABLE_NAME, FIELD_NAME)` as the official field identity. Preserve case, punctuation, source row, description, raw data type, raw field size, raw category text, formula text, and cached formula text separately.

Additional controls:

- An exact `FIELD_NAME` lookup returns `unique`, `ambiguous`, or `not-found`; it never selects an arbitrary table context.
- The `ALL` table value remains a literal table context. No expansion semantics are inferred.
- The 25 `UD` range rows remain 25 official metadata records. They are not expanded into 1,425 individual semantic fields without a separately approved rule.
- Formula cells in column G are observations only. The parser records formula text and cached text with `evaluatedByParser: false`; neither is represented as a newly calculated value.
- Every Case Workbench field target is a discriminated union: an official reference bound to this catalog hash and table-qualified key, or an explicitly case-scoped user-defined field with its own immutable identity and approval lineage.
- Fuzzy names, the provisional field-name glossary, and the adjacent `DD.csv` may produce suggestions only. They do not establish an official mapping.
- Data type, field size, names, or descriptions do not authorize inference of units, nullability, decimal precision, date conventions, enumerations, or actuarial semantics.
- Any byte change creates an unapproved catalog candidate requiring a new security and authority review.

## Alternatives considered

1. **Use `FIELD_NAME` alone:** Rejected because it is globally ambiguous.
2. **Normalize identifiers to uppercase:** Rejected because five official names intentionally preserve mixed case and other names preserve spaces and range punctuation.
3. **Expand `UD` ranges automatically:** Rejected because the workbook does not encode individual semantic records.
4. **Evaluate or recalculate column G:** Rejected because formula execution is prohibited and cached values are not proof of current calculation.
5. **Treat `DD.csv` as equivalent:** Rejected because it has different coverage, descriptions, types, and no lossless table context.
6. **Permit free-form field strings downstream:** Rejected because official, user-defined, and unmapped identities would remain indistinguishable.

## Consequences

- The approved parser must preflight the OOXML package before invoking a workbook library and must fail closed on a hash mismatch or newly observed active/external content.
- Architecture, BuildSpec, population mapping, workbook generation, and validation contracts must eventually carry typed field identity rather than an unqualified string.
- Contract versioning is required before typed field identity replaces existing string fields in governed downstream artifacts.
- The original workbook remains immutable; sanitized or normalized outputs are traceable derived artifacts.
