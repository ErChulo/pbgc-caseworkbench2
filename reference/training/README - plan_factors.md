# pbgc-plan-factors-module

Dedicado a la programacion y estandarizacion del conjunto de factores que el plan aplica a los beneficios.

## PF Builder Workspace

This repository includes a PF workbook builder (v0.7.13):

- `packages/core-pf` - workbook patching and validation library
- `packages/web-pf` - client-side web UI (Vite)
- `packages/cli-pf` - CLI wrapper
- `packages/schemas` - JSON schemas

## Standalone One-File GUI

Build a single offline HTML file:

- `npm run build:standalone`
- output: `standalone/pf-builder-standalone.html`

Usage:

1. Open `standalone/pf-builder-standalone.html` in a browser.
2. Upload `case.json` and `planFactors.json`.
3. Download `${caseNumber}PF.v0.7.13.xlsx`.

No server and no Node runtime are required at use time.

## Required binary files

- `templates/PF_template.v0.7.13.xlsx`
- `fixtures/expected.24884900PF.v0.7.13.xlsx`

Sample JSON fixtures are included under `fixtures/`.
