# PBGC CaseworkBench 2.0 User Manual

This folder contains the user-facing documentation for PBGC CaseworkBench 2.0.
The Markdown manuals are the current source for browser use and explain the
draft V1 summary scaffold, final casework output package, workspace artifact
linking, and Section 436 evaluation artifact handling.

## Start Here

| Document | Use It For |
| --- | --- |
| [Quick-Start Guide](quick-start.md) | First-day use, happy path, basic steps. |
| [Full User Manual](full-manual.md) | Complete screen-by-screen and workflow instructions. |
| [Technical Appendix](technical-appendix.md) | Plain-language explanations of technical terms. |

## PDF Editions

| PDF | Use It For |
| --- | --- |
| [Standard PDF Manual](pdf/pbgc-caseworkbench-user-manual-standard.pdf) | Clean corporate manual for general office use. |
| [Book-Style PDF Manual](pdf/pbgc-caseworkbench-user-manual-book-edition.pdf) | More polished printable edition with book styling. |

## LaTeX Sources

The PDF sources are in [latex/](latex/):

- `standard-manual.tex` builds the clean standard manual.
- `book-edition.tex` builds the book-style edition.
- `manual-content.tex` contains shared content used by both editions.

Regenerate the PDFs after changing manual content so the printable editions do
not lag the Markdown source.

## Recommended Reading Order

1. Read the Quick-Start Guide before first use.
2. Use the Full User Manual while processing a case.
3. Use the Technical Appendix when a term or error message is unclear.

## Important Limits

- These documents use synthetic examples only.
- Do not copy real participant PII into documentation, screenshots, logs, fixtures, or Git.
- Manual real-data testing is deferred until the app is used in the approved office environment.
- The SC-010 usability study remains incomplete until performed with authorized human participants.
- A `draft-v1-summary` is a pre-package scaffold-selection artifact. It is not a final V1 architecture, BuildSpec, workbook, validation result, or approval.
- Final output packages reference generated artifacts by hash; they do not prove Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution unless separate evidence is linked.
