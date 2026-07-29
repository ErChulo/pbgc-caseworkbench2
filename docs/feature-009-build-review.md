# Feature 009 build review

**Recorded:** 2026-07-25
**Scope:** Local single-HTML production bundle.

## Build result

- Command: `npm run build`
- Result: passed
- Output artifact: `dist/pbgc-caseworkbench.html`
- Reported size: 691.55 kB uncompressed, 223.92 kB gzip

## Review notes

- The bundled artifact is the only file in `dist/`.
- Runtime assets are inlined into the single HTML artifact.
- The build remains local-first and does not add a backend, telemetry, remote assets, or external API calls.
- Build-size review remains tied to the generated production artifact and should be repeated if dependencies or bundling change.
