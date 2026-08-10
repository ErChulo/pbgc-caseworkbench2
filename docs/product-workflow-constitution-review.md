# Product Workflow constitution review

- **Status:** Ratified
- **Approval date:** 2026-08-07
- **Approving authority:** Repository owner
- **Supersedes:** Nothing
- **Superseded by:** Nothing

## Scope

Governance and constitution review of `specs/PRODUCT-WORKFLOW.md` to confirm its
consistency with the ratified repository constitution (Constitution v2.0.0,
ratified 2026-07-18) and to record the repository owner's ratification of the
product workflow specification as an authoritative implementation input.

## Subordination to the constitution

`PRODUCT-WORKFLOW.md` remains subordinate to the ratified repository
constitution. It does not override, amend, or supersede any constitutional
provision. In the event of any future conflict, the constitution prevails per
Constitution §2 (precedence hierarchy: constitution > law/determination >
approved ADRs and case specifications > approved contracts/schemas >
implementation).

## Constitution-consistency review

| Constitution section | Relevance to PRODUCT-WORKFLOW.md | Status |
---|---|---|
| §2 Governance and precedence | The product workflow defines the product-level operating model (workspace → cases → evidence → plan summary → V1 engine). It is subordinate to the constitution and is ratified at the level-3 ("approved ... case specifications") tier of the authority hierarchy. | Consistent |
| §4 Evidence traceability and source authority | §3.2 preserves originals immutably; §3.3 retains provenance for duplicate and replacement events; §6.1 requires exact source citations (artifact plus page/section/range); §6.2 preserves competing values with supporting citations and default authority order; §6.3 distinguishes direct vs. derived attributes with formula/input citations. | Consistent |
| §6 Population-driven design and missing data | §8.1 confirms that the actual approved population helps determine what must be programmed (scenarios, fields, formulas, tabs, validations). Population characteristics are derived locally from the schema and actual population. §8.2 preserves prior datasets on revision. §8.3 routes unmapped columns to human review without guessing. §8.4 treats supplied values as audited working values and performs deterministic consistency checks. The document does not invent participant data and does not replace missing required values with zero (consistent with Constitution §6 and AGENTS.md Rule 3). | Consistent |
| §11 Privacy, confidentiality, and artifact security | §4.3 establishes a zero-network trust boundary (outbound participant-data transmission = 0). Real participant PII may be processed locally only. §3 preserves originals in a user-controlled local workspace. §5 requires provisional classification until human approval. | Consistent |
| §13 Validation and implementation evidence | §3.2 uses lowercase SHA-256 byte identity for duplicate detection. §3.4 enables evidence viewing alongside casework functionality. §6.2 marks derived attributes Blocked when inputs are missing. §8.4 performs deterministic plausibility checks. All validation is deterministic; no narrative LLM output serves as the calculation engine (§9). | Consistent |

## Explicit confirmations

- The actual approved population may determine applicable V1 scenarios,
  fields, formulas, tabs, and validations, consistent with Constitution §6.
- Real participant-level PII may be processed locally but must not leave the
  zero-network trust boundary. Construction of the V1 engine does not require
  external transmission of participant-level values.
- Data Dictionary Complete remains the governing field universe of discourse
  (§7).
- No constitution amendment is required for the clarified population rule;
  the product workflow is already consistent with the ratified constitution.
- `PRODUCT-WORKFLOW.md` is subordinate to the constitution and does not
  override any constitutional provision.

## Remaining architectural and governance gates

The following gates remain unclosed. This ratification does not satisfy them;
they are recorded separately and must be addressed through their respective
governance channels:

- **PRODUCT-WORKFLOW.md §13 deferred items**: the final local NLP library,
  detailed V1 workbook screen/layout design, every plan-attribute field,
  every deterministic population validation rule, final internal filesystem
  layout, detailed OPFS versus workspace implementation mechanics, downstream
  PBGC reports beyond the V1-engine objective, and external LLM integration
  for production case evidence — all remain explicitly deferred.
- **T124 usability protocol**: `docs/feature-009-constitution-review.md`
  records an existing remaining blocker — a usability protocol with at least
  20 authorized caseworkers has not been completed inside this repository
  session. This is a Feature-009-specific gate.
- **Per-feature constitution reviews**: Features 001 through 010 each require
  their own constitution compliance review before their implementation can be
  claimed as governed. This product-workflow ratification does not substitute
  for per-feature reviews.
- **ADR acceptance**: individual architectural decisions (e.g., compiler
  design, workbook contract) require their own ADR acceptance records, which
  are tracked separately under `docs/adr/`.

## Disposition

`specs/PRODUCT-WORKFLOW.md` is ratified by the Repository owner as the
authoritative product workflow baseline for implementation. The document is
subordinate to the ratified constitution and does not require a constitutional
amendment.
