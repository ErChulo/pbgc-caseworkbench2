# Research: Governed V1 Build Specification

**Feature**: 005
**Updated**: 2026-07-29

## Decisions

### 1. Compiler Contract

**Decision**: Generate only BuildSpec `2.0.0`. Historical v1 acceptance in the prior scaffold is removed from generation/export/import.  
**Reason**: `compileBuildSpec` requires schema-valid, provenance-complete v2 input.

### 2. Architecture Trust

**Decision**: Validate the registered Feature004 schema and semantic rules, inspect governed lineage, and recompute `architectureContentSha256`.  
**Rejected**: Treating TypeScript shape or a supplied hash as proof of validity.

### 3. Formula Selection

**Decision**: Emit only observed nonempty formula cells classified `O` or `B`. Empty formulas and formula-bearing non-O/B cells block.  
**Rejected**: Emitting blank formulas for every O/B classification or synthesizing formulas from descriptions.

### 4. Dependencies

**Decision**: Use exact same-run `architecture.formulaDependencies`; retain only dependency targets that are observed formulas. Input references remain satisfied through cell mappings. External or missing dependency identities block.  
**Rejected**: Formula-text substring matching, which confuses overlapping field names and ignores parser semantics.

### 5. Formula Governance

**Decision**: Require a separate explicit governance input. Resolve every source rule to a supplied approved `PlanRuleRecord`, require exactly one architecture-justified governing rule, and preserve all compiler-required provenance.  
**Rejected**: Invented citations, approval IDs, dates, test IDs, regeneration text, or oracle IDs.

### 6. Identities

**Decision**: Formula IDs injectively encode exact scenario/cell identities. Mapping and BuildSpec IDs are deterministic UUIDs derived from SHA-256.  
**Rejected**: random UUIDs, counters, and sanitized human labels with collision suffixes.

### 7. Named Ranges

**Decision**: Copy architecture named ranges exactly, including case, scope, target, and nullable generic field. Uniqueness is validated by Excel-style case-insensitive scope identity.  
**Rejected**: one name per cell, scenario prefixes, sanitization, and fallback names.

### 8. I/O/B Mappings

**Decision**: Preserve all I/O/B values. Population source-tab identity is the only basis for an input data source; missing I/B sources block. `B` retains both formula and input.  
**Rejected**: treating B as a CALC indicator or dropping one side of its mapping.

### 9. Ordering

**Decision**: Kahn ordering with codepoint-sorted queues/edges, deterministic depth, and SCC-based cycle reporting that excludes downstream blocked nodes. Supplied execution metadata is accepted only when it exactly matches recomputation.  
**Rejected**: map-insertion-dependent ordering and arbitrary cycle breaking.

### 10. Deterministic/Operational Separation

**Decision**: BuildSpec lineage time is stable from the authenticated architecture. Identity and content bind the architecture record ID and content hash. Set-like governance collections are codepoint-sorted while ordered governance chains retain order. Export/import event clock and actor metadata are injected outside deterministic identity. Hashing excludes self-hash and validation event time.  
**Rejected**: `new Date()` and `randomUUID()` inside generation or serialization.

### 11. Validation Strategy

**Decision**: Aggregate errors during authentication, mapping, provenance resolution, ordering, and validation. Validate schema at generation, export, and import. Export/import independently recompute semantics rather than trusting embedded validation and verify both envelope and embedded content hashes. Canonical in-grid A1 targets use the Feature006 reference codec.  
**Rejected**: first-error success paths, partial trusted specs, and hash-only import.

### 12. Compiler Handoff Evidence

**Decision**: An integration test passes a provenance-complete BuildSpec v2 containing a nullable architecture named-range generic field directly to `compileBuildSpec` and requires status `complete`. No external workbook execution is claimed.
