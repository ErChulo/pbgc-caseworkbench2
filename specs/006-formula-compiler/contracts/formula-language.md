# Formula Language Contract: excel-scalar-v1.0.0

## Accepted Grammar

```ebnf
formula        = whitespace, ["="], whitespace, comparison, whitespace, EOF ;
comparison     = concatenation, [comparison-op, concatenation] ;
concatenation  = additive, {"&", additive} ;
additive       = multiplicative, {("+" | "-"), multiplicative} ;
multiplicative = power, {("*" | "/"), power} ;
power          = unary, {"^", unary} ;
unary          = {"+" | "-"}, primary ;
primary        = number | string | boolean | reference | function-call | "(", comparison, ")" ;
function-call  = identifier, "(", [comparison, {",", comparison}], ")" ;
reference      = [sheet-name, "!"], (cell-reference | identifier) ;
sheet-name     = unquoted-sheet-name | "'", {sheet-character | "''"}, "'" ;
```

Comparison operators are `=`, `<>`, `<`, `<=`, `>`, and `>=`. Chained comparisons are invalid. Numeric literals use a period decimal separator and no exponent notation. Text uses workbook-style doubled double quotes. Booleans are `TRUE` and `FALSE`.

## Reference Rules

- A1 cells are limited to columns `A`–`XFD` and rows `1`–`1048576`.
- `$` absolute markers are preserved.
- Unqualified cells resolve to the formula target sheet.
- Names use `[A-Za-z_][A-Za-z0-9_.]{0,254}` and cannot resemble A1 or R1C1 references.
- Sheet and name matching is case-insensitive; canonical registered spelling is emitted.
- Unquoted sheet names contain letters, digits, underscores, and periods; names containing spaces or punctuation are single-quoted, and an apostrophe inside a quoted name is doubled.
- External workbook syntax, ranges, structured references, arrays, spill syntax, implicit intersection, and R1C1 syntax are prohibited.

## Function Catalog

| Function                                                                    | Arity |
| --------------------------------------------------------------------------- | ----- |
| ABS, DAY, INT, ISBLANK, ISLOGICAL, ISNUMBER, ISTEXT, MONTH, NOT, SIGN, YEAR | 1     |
| DAYS, MOD, ROUND, ROUNDDOWN, ROUNDUP                                        | 2     |
| DATE, IF                                                                    | 3     |
| TRUNC                                                                       | 1–2   |
| AND, MAX, MIN, OR, PRODUCT, SUM                                             | 1–255 |

Volatile functions (`NOW`, `TODAY`, `RAND`, `RANDBETWEEN`, `RANDARRAY`, `OFFSET`, `INDIRECT`, `CELL`, `INFO`), active/external functions, UDFs, and every unlisted function are blocking errors.

## Canonical Output

- No leading equals sign.
- No insignificant whitespace.
- Function names, booleans, and cell columns are uppercase.
- Binary expressions are fully parenthesized.
- Source formulas are preserved separately and never algebraically simplified.
- SheetJS/OOXML compatibility refers only to formula text representation, not successful external execution.

## Limits

- Formula source: 8,192 UTF-16 code units.
- Nesting: 64.
- Tokens: 4,096.
- Function arguments: 255.
