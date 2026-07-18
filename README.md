# PBGC Case Workbench 2

> **Work in progress:** This repository is under active development.

Deterministic, evidence-traceable V1 compiler for PBGC terminated-plan casework.

## Pilot

- Plan: College of Saint Rose Non-Contract Employees Pension Plan
- PBGC case: 24884900
- DOPT: 2024-06-30
- Benefit/participation freeze: 2020-07-31

## Initial workflow

```text
R5 JSON + plan evidence + case controls + redacted population
    -> effective-dated plan-rule model
    -> population profile
    -> V1 architecture
    -> V1BuildSpec.json
    -> V1 workbook
    -> validation and reconciliation
```

See `.specify/memory/constitution.md` before implementation.
