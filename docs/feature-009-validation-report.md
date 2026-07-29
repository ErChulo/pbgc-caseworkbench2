# Feature 009 validation report

**Recorded:** 2026-07-25
**Scope:** Only commands actually executed for the current validation pass are recorded here.

## Executed checks

- `npm run typecheck` — passed
- `npm run build` — passed
- `npx vitest run web/tests/integration/acceptance-corpus.test.ts` — passed
- `npm run lint` — passed
- `npm run format:check` — passed
- `npm run validate:schemas` — passed
- `npm run validate:contracts` — passed
- `npm run verify:single-file` — passed
- `npm test` — passed
- `npm run test:browser:e2e` — passed with 42 browser tests and 2 approved skips
- `npm run build` — passed
- `git diff --check` — passed
- `npm audit --omit=dev` — attempted in the current offline session and could not reach `registry.npmjs.org`; the earlier connected dependency review remains the recorded vulnerability evidence
- Browser validation: Chromium and Edge journeys completed for the added workspace-selection, delivery-mode, end-to-end intake, and offline single-file coverage; direct-file checks were intentionally skipped in Edge because that path is not approved there.

## Notes

- This report intentionally does not invent results that were not executed.
- Full release validation remains gated on completion of the remaining Phase 9 work and the usability protocol.
