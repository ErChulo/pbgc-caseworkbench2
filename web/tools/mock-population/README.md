# Development-only mock population

`generate.ts` creates deterministic synthetic records from field names, a
record count, and an explicit seed. It records the structural source SHA-256
for provenance but accepts no source participant rows or values.

This tool is development-only and is not imported by the production
application. Its output is synthetic/mock data, not evidence and not an
actuarial result.
