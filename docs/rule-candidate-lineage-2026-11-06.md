# Rule candidate lineage checks

Rule authoring now snapshots its input before asynchronous validation, checks each proposed candidate's content hash and deterministic identity, rejects non-finite confidence, and verifies that the selected primary citation identifies a matching provision. When the extraction locator is a segment rather than a catalog file path, the UI now keeps the original candidate unchanged and pairs the catalog path with the segment in the citation. Previously it replaced the candidate locator without recomputing its hash.

A successor must identify a distinct, internally valid predecessor in the same scope. Reviewer fields must be present, but typed local values do not authenticate identity or authority. The synthetic demo candidate and unresolved-item hashes were recalculated to keep its preview internally consistent. Existing candidate records altered by prior locator substitution must be re-inspected; immutable already-authored rules are not retroactively repaired.

These checks establish content consistency, not proof that a candidate's text was correctly extracted from the source, that the source is authoritative, that the reviewer has authority, or that every conflict or historical predecessor has been resolved. The scope restriction is conservative pending explicit cross-scope supersession semantics. Release gates remain blocked.
