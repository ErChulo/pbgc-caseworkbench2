# Feature 009 browser feasibility record

**Initial run date:** 2026-07-19
**Final verification and approval date:** 2026-07-25
**Scope:** Phase 1 spike only; no evidence or participant data was processed.

## Acceptance target

Production acceptance requires one downloadable HTML artifact, direct-file execution where the full capability suite is supported, or an approved data-blind loopback/static-origin launcher that performs no server-side processing and receives no case data. The runtime must inline its worker, WASM probe, schema, and asset; enforce its CSP; and issue no outbound requests.

## Environment and evidence

- Linux Mint with Chromium `150.0.7871.181` and Microsoft Edge `150.0.4078.99`.
- Node.js `24.18.0` and npm `11.16.0` were used for final verification.
- `npm run build` and `npm run verify:single-file` produce and verify only `dist/pbgc-caseworkbench.html`.
- The application imports its worker with Vite's inline-worker mechanism and embeds the WASM probe, Draft 2020-12 schema, SVG asset, scripts, and styles.
- The browser suite records requests and rejects any URL outside the approved loopback origin.
- CSP declares `connect-src 'none'`, blocks objects, frames, forms, and remote base URLs, and permits only the inline execution needed by the single-file artifact.
- The UI reports the current execution mode, secure-context state, File System Access availability, and each inline capability result without handling case data.

## Execution-mode decision

| Mode                      | Result         | Evidence and limitation                                                                                                                                                                             |
| ------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium static origin    | Candidate pass | Single HTML, worker, WASM, schema, asset, CSP, and zero-outbound-request checks are automated. File System Access is expected only in a supported secure context.                                   |
| Chromium direct `file://` | No-go          | The built artifact loaded as a secure context with File System Access available, but its inline worker was blocked. WASM, schema, asset, and CSP checks passed and no HTTP(S) request was observed. |
| Edge static origin        | Pass           | The same static-origin, inline-runtime, CSP, rendered-content, and zero-outbound-request tests passed in installed Microsoft Edge 150.                                                              |
| Edge direct `file://`     | No-go          | The built artifact loaded locally and correctly reported the required inline worker as blocked; the test confirmed no outbound HTTP(S) request.                                                     |

## Go/no-go result

**GO for Phase 2 using the approved data-blind static-origin mode.** On 2026-07-25, all six Playwright tests passed across Chromium and Edge, the full Phase 1 quality gate passed, and the repository owner approved ADR 009. Direct `file://` remains a no-go because the required inline worker is blocked. The static-origin launcher may serve immutable application bytes only; it may not receive, process, or transmit case data.

Required regression commands after browser, toolchain, dependency, CSP, worker, or bundling changes:

```text
npm run quality
npm run test:browser:e2e
```
