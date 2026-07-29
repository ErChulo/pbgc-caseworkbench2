# Quickstart: V1 Architecture Selector

**Feature**: 004-v1-architecture-selector
**Date**: 2026-07-27
**Status**: Validated on 2026-07-29 with synthetic pilot inputs; see the validation evidence below and `docs/feature-004-validation-report.md`.

> The repository YAML policies and field-name glossary remain provisional. Production loading fails closed until a separate human `ArchitecturePolicyApproval` chain binds each exact kind/version, policy-content hash, source-file hash, and citations to a hash-valid released EvidenceCatalog. YAML review fields never authorize production; synthetic test decisions do not approve repository policy content.

## End-to-End Sequence

This quickstart demonstrates the architecture selector producing a deterministic V1 architecture from upstream inputs.

### Prerequisites

- Approved plan rules (Feature 002 output)
- Feature 003 population candidates, evidence observations, and candidate decision records
- Case controls (which scenarios to run)
- Four provisional rule sets plus their separate architecture-policy decision histories
- Hash-valid released EvidenceCatalog used by policy citations and population evidence

### Step 1: Load Inputs

```typescript
import { loadPlanRules } from "../domain/plan-rules";
import { loadPopulationGovernanceInputs } from "../domain/population";
import { loadCaseControls } from "../domain/case";
import { loadRuleSets } from "../domain/architecture/rule-loader";

const planRules = await loadPlanRules(workspace);
const population = await loadPopulationGovernanceInputs(workspace);
const caseControls = await loadCaseControls(workspace);
const ruleSets = await loadRuleSets(rulesDirectory); // candidate loading only
const policyApprovals = await loadArchitecturePolicyApprovals(workspace);
```

### Step 2: Select Scenarios

```typescript
import { selectScenarios } from "../domain/architecture/scenario-selector";

const scenarios = selectScenarios({
  planRules,
  caseControls,
  scenarioPolicy: ruleSets.scenarioSelection,
});

// Result: interval-keyed runs such as [{ runId: "NRD@2006-01-01..open", ... }]
// Split conditions emit only nonempty intersections and retain all contributors.
```

### Step 3: Select Tabs

```typescript
import { selectTabs } from "../domain/architecture/tab-selector";

const tabs = selectTabs({
  population,
  tabPolicy: ruleSets.tabSelection,
});

// Result includes population-role tabs plus observed canonical support-role tabs.
```

### Step 4: Build Field Inventory

```typescript
import { buildFieldInventory } from "../domain/architecture/field-inventory";

const cells = buildFieldInventory({
  tabs,
  scenarios,
  population,
});

// Result: Map<string, CellDescriptor> keyed by "TAB::CELL_ADDRESS"
```

### Step 5: Classify I/O/B

```typescript
import { classifyIoB } from "../domain/architecture/iob-classifier";

const classifiedCells = classifyIoB({
  cells,
  scenarios,
  iobPolicy: ruleSets.iobClassification,
});

// Each cell now has perRunClassification with I/O/B values
```

### Step 6: Compute Dependencies

```typescript
import { computeDependencies } from "../domain/architecture/dependency-graph";

const dependencies = computeDependencies({
  cells: classifiedCells,
  scenarios,
});

// Result: FormulaDependency[] edges
```

### Step 7: Assemble Architecture

```typescript
import { buildArchitecture } from "../domain/architecture/architecture-builder";

const architecture = await buildArchitecture({
  caseId,
  planRules,
  evidenceCatalog,
  authorityOverrides,
  population,
  caseControls,
  policies: ruleSets.value,
  policyApprovals: { evidenceCatalog, decisions: policyApprovals },
  dependencies: deterministicDependencies,
});

// The builder rehashes workbook content plus named ranges, then replays the
// population decision that binds that profile hash and source artifact hash.
// architecture.lineage and architectureContentSha256 bind every governed input.
```

### Step 8: Persist and Verify

```typescript
import { saveArchitecture } from "../adapters/filesystem/architecture-workspace";

const saveResult = await saveArchitecture(workspace, architecture);
assert(saveResult.ok, "Architecture persisted successfully");

// Verify deterministic replay
const reload = await loadArchitecture(workspace, architecture.architectureId);
assert(reload.ok, "Architecture loaded");
assert(
  reload.value.architectureContentSha256 ===
    architecture.architectureContentSha256,
  "Content hash matches - deterministic replay verified",
);
```

### Step 9: Feed to Formula Compiler

```typescript
import { compileFormulas } from "../domain/formulas/compiler";

const compiledFormulas = await compileFormulas(architecture);
// Ready for Feature 006
```

## Validation Evidence

The executable equivalent of this sequence is the synthetic pilot in `web/tests/integration/architecture-selection.test.ts`. On 2026-07-29:

- The focused Feature 004 review run passed 133/133 tests across 19 files, including 8/8 architecture-selection integration tests.
- The synthetic pilot composed governed plan-rule, population, case-control, policy, field, dependency, and named-range inputs and produced equal deterministic replay results with the same recomputed content hash.
- The pilot retained formulas below headers and relevant canonical support-sheet cells while excluding participant values from architecture descriptions.
- The pilot rejected policy content changed after approval and returned all material scenario, population/tab, field/classification, and dependency blockers in one result.
- Staged-tree `npm run quality` passed 678/678 tests across 80 files, 16 design/runtime schema pairs, the production build, and single-file verification.
- The verified build contained one self-contained HTML file of 752,023 bytes.

This evidence establishes automated implementation and test status only. It does not approve the repository candidate policies, provide independent actuarial validation, record human approval, or claim Excel or external-system execution.

## Deterministic Replay Verification

```typescript
// SC-004: Same deterministic inputs produce the same content identity.
// Full record bytes also require equal injected operational IDs/timestamps.
const arch1 = await buildArchitecture(inputs);
const arch2 = await buildArchitecture(inputs);
assert(arch1.architectureContentSha256 === arch2.architectureContentSha256);

// SC-006: Architecture survives save/load cycle
const saved = await saveWorkspace(workspace, arch1);
const loaded = await loadWorkspace(workspace);
assert(loaded.architectureContentSha256 === arch1.architectureContentSha256);
```

## Error Cases

### Empty Population

```typescript
const tabs = selectTabs({ population: emptyPopulation, tabPolicy });
// tabs = []
// UnresolvedItem emitted: kind "missing-required-value"
```

### Ambiguous Plan Rule

```typescript
const scenarios = selectScenarios({ planRules with ambiguous date, ... });
// UnresolvedItem emitted: kind "ambiguous-text"
// No architecture is emitted until the material ambiguity is resolved
```

### Conflicting Scenarios

```typescript
const scenarios = selectScenarios({ planRules with conflicting provisions, ... });
// UnresolvedItem emitted: kind "conflicting-provisions"
// All scenario blockers are aggregated; no blocked scenario is silently omitted
```
