# AGENTS.md

## Governing source

Read `.specify/memory/constitution.md` before planning or editing.

## Project rules

1. Build deterministic actuarial logic; do not use narrative LLM output as the calculation engine.
2. Preserve source citations, effective dates, supersession, and review status for every material plan rule.
3. Do not invent participant data or replace missing required values with zero.
4. Keep `CALC_INDICATOR`, `CALCULATION`, and I/O/B metadata distinct.
5. Use redacted or synthetic participant data only.
6. Do not recreate `mySort`.
7. Canonical support sheets are `Summary`, `Tables`, and `UD Table`.
8. Do not claim Excel, ValTool, Runtime, ATPBGC, or BCV execution unless actually performed.
9. Add or update tests for every material actuarial-rule change.
10. Generated workbooks must be fixed by changing the generator, not by manual patching.

## Implementation order

1. Evidence ingestion
2. Plan-rule model
3. Population profile
4. V1 architecture selector
5. V1 build specification
6. Formula compiler
7. Workbook builder
8. Validation and reconciliation

## Mandatory skill routing

Invoke installed skills automatically when their trigger applies:

- React/Vite: use `vercel:react-best-practices` after editing multiple TSX components. Do not invoke Next.js-specific or unrelated Vercel skills for this React/Vite project.
- Browser verification: use `vercel:agent-browser-verify` whenever a development server starts; use `vercel:agent-browser` for interactive browser testing and `vercel:verification` for end-to-end flow validation or “why isn’t this working” investigations.
- GitHub: use `github:github` for repository, issue, and PR orientation; `github:gh-address-comments` for PR review feedback; `github:gh-fix-ci` for failing GitHub Actions checks; and `github:yeet` when explicitly asked to commit, push, and open a draft PR.
- OpenAI: use `openai-docs` for current OpenAI product/API guidance, `openai-developers:openai-platform-api-key` when building or configuring an OpenAI-backed feature, and `openai-developers:openai-api-troubleshooting` when an OpenAI API request fails. OpenAI output must never replace deterministic actuarial calculations.
- Deployment: use `vercel:deployments-cicd`, `vercel:vercel-cli`, `vercel:vercel-api`, `vercel:env-vars`, or `vercel:vercel-functions` only when the task actually involves the corresponding Vercel capability.
- Skill discovery: use `find-skills` when needed functionality may exist as an installable skill; use `skill-installer` or `skill-creator` only when explicitly asked to install or create a skill.

No Spec Kit skill is installed. Govern Spec Kit work directly through `.specify/` and `.specify/memory/constitution.md`.

## Repository indexing and token-efficiency

For all development work in this repository:

- Prefer using **codegraph** for repository-wide code discovery, symbol lookup, dependency analysis, cross-reference navigation, impact analysis, and locating existing implementations before reading large numbers of files.

- Prefer using **caveman** for semantic repository search, documentation discovery, architectural exploration, and retrieval of relevant context instead of repeatedly scanning the repository.

- Treat both tools as the primary mechanisms for repository exploration and context retrieval whenever they are available.

- Avoid reading large portions of the repository when the required information can be obtained through codegraph or caveman.

- Minimize token consumption by retrieving only the files, symbols, functions, classes, or documents necessary to complete the current task.

- When a task requires repository-wide understanding, first query codegraph and/or caveman before opening source files.

- If either tool is unavailable or cannot answer the required query, fall back to ordinary repository inspection and note the reason.

This policy applies to all future tasks unless explicitly overridden by the user.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
