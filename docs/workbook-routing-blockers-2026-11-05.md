# Workbook routing blockers — 2026-11-05

Further inspection found two material hazards in the previously documented compiled workbook path:

1. Different runs can compile formulas to the same physical sheet and cell. The builder's cell merge retained only the first formula while listing both in the model. The synthetic Def_Act integration fixture exercises this collision.
2. The wizard converted workbook observations to arrays by column without preserving row addresses; it included headers, used column letters where the BuildSpec expects generic fields, selected the first approved population, and assigned values based on mapping order. This did not establish participant-level identity or row linkage. Population source metadata also contains a placeholder record hash and zero-based range.

The compiled-workbook path now rejects all duplicate physical formula targets, including targets from different scenarios, and blocks I/B input mappings until approved participant-level routing and source verification are implemented. The wizard no longer constructs the unsafe column arrays. This **supersedes the earlier milestone's assertion that the governed synthetic pipeline can produce a workbook**: that fixture now proves the collision blocks output. Constant-formula synthetic tests continue to exercise compiler-to-model-to-XLSX materialization. The preliminary `buildWorkbook` API remains for existing foundation tests and is not a production or release path.

These are deliberate restrictions, not completed population routing or a scenario-layout solution. Future work must preserve exact source row identity and sparse blanks, bind the approved profile and source bytes to the selected participant, resolve generic-field provenance and B-cell semantics, calculate actual record hashes and one-based ranges, and give distinct scenario outputs approved physical targets. Never infer a participant or reuse values based on map iteration order.

Verification: typecheck, lint, formatting, schema and contract checks and separate single-file build passed; the browser externalization warning persists. Full suite: 121 files passed, one failed; 1,027 tests passed and four skipped. The sole failure remains the unavailable approved Git LFS Data Dictionary workbook. No Excel/BCV/runtime execution, browser-offline verification, or actuarial approval is asserted.
