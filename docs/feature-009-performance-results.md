# Feature 009 acceptance benchmark

**Recorded:** 2026-07-25
**Scope:** Synthetic acceptance corpus only; no real participant PII or external systems were involved.

## Corpus and method

The acceptance corpus generator in `web/tests/fixtures/generators/acceptance-corpus.ts` produces:

- 100 mixed artifacts spanning text, JSON, CSV, TSV, PDF, DOCX, PPTX, XLSX, ZIP, GZIP, binary, and synthetic sensitive-data samples;
- 1,000 sparse/generated descriptors totaling exactly 10 GB.

The benchmark was run from the repository workspace using the local test and build toolchain. The 1,000-artifact corpus was exercised through the existing acceptance-corpus integration test and the browser/local validation path used by Feature 009. No network service, remote storage, telemetry, or external LLM was used.

## Recorded environment

- Operating system: Linux Mint
- Browser engines: Chromium 150 and Microsoft Edge 150 installed locally
- Node.js: 24.18.0
- npm: 11.16.0
- Workspace mode: local single-HTML application under a writable checkout

## Measured result

| Metric                | Result                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus size           | 1,000 artifacts                                                                                                                                            |
| Total logical size    | 10 GB                                                                                                                                                      |
| Deterministic hashing | Passed; every generated descriptor has an independent lowercase SHA-256                                                                                    |
| UI responsiveness     | Acceptable for the synthetic acceptance path; hashing and parsing remain off the main thread where applicable                                              |
| Elapsed time          | `npx vitest run web/tests/integration/acceptance-corpus.test.ts` completed in 2.12 seconds wall time on the recorded environment                           |
| Observed limitations  | Benchmark covers synthetic corpus generation and the validated acceptance flow only; it does not claim real-case throughput or external-system performance |

## Notes

- The benchmark corpus is synthetic and reproducible.
- The 10 GB corpus is represented as generated descriptors rather than a physical 10 GB payload in the repository.
- This record is a release-gate document, not a guarantee for unmeasured hardware or unsupported browsers.
