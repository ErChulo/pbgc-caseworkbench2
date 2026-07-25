# Synthetic fixture rules

Fixtures in this repository must be synthetic or independently verified as de-identified.

- Never add real participant PII, case identifiers, credentials, tokens, or source-case excerpts.
- Never copy values from production populations into a fixture, screenshot, log, or example.
- Generate sensitive-pattern fixtures ephemerally during a test and remove the temporary workspace afterward.
- Use conspicuously synthetic identifiers such as `SYNTH-CASE-001` and document the generator seed.
- Preserve missing, blank, malformed, formula-like, and literal-zero states without correction or imputation.
- Fixtures must not execute formulas, macros, scripts, links, embedded code, or untrusted binaries.
- Before committing a fixture, run the repository secret/PII checks and record its generator and purpose.

`DD.csv`, the 204(h) Notice, and other real or case-specific evidence are outside the Phase 1 fixture scope and must not be read or copied.
