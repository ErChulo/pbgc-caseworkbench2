# LaTeX PDF Editions

This folder contains PDF-ready LaTeX sources for the PBGC CaseworkBench 2.0 user manual.

## Files

| File | Purpose |
| --- | --- |
| `manual-content.tex` | Shared manual content used by both editions. |
| `standard-manual.tex` | Clean corporate manual PDF wrapper. |
| `book-edition.tex` | More polished book-style PDF wrapper. |

## Build

From this directory:

```bash
SOURCE_DATE_EPOCH=1785628800 xelatex -interaction=nonstopmode -halt-on-error standard-manual.tex
SOURCE_DATE_EPOCH=1785628800 xelatex -interaction=nonstopmode -halt-on-error book-edition.tex
```

Run each command twice if you need a fully updated table of contents.

Generated PDFs are copied to `../pdf/` in the repository when built by the automation used in this session:

- `../pdf/pbgc-caseworkbench-user-manual-standard.pdf`
- `../pdf/pbgc-caseworkbench-user-manual-book-edition.pdf`
