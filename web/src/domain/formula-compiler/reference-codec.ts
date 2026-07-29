const cellPattern = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,6})$/u;
const namePattern = /^[A-Za-z_][A-Za-z0-9_.]{0,254}$/u;

function columnNumber(column: string): number {
  let value = 0;
  for (const character of column.toUpperCase())
    value = value * 26 + character.charCodeAt(0) - 64;
  return value;
}

export function normalizeCellAddress(value: string): string | null {
  const match = cellPattern.exec(value);
  if (!match) return null;
  const absoluteColumn = match[1] ?? "";
  const column = match[2]?.toUpperCase();
  const absoluteRow = match[3] ?? "";
  const rowText = match[4];
  if (column === undefined || rowText === undefined) return null;
  const row = Number(rowText);
  if (columnNumber(column) > 16_384 || row > 1_048_576) return null;
  return `${absoluteColumn}${column}${absoluteRow}${String(row)}`;
}

export function isValidName(value: string): boolean {
  return (
    namePattern.test(value) &&
    normalizeCellAddress(value) === null &&
    !/^R[0-9]+C[0-9]+$/iu.test(value)
  );
}

export function quoteSheetName(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function canonicalCellReference(
  sheetName: string,
  address: string,
): string {
  return `${quoteSheetName(sheetName)}!${address}`;
}

export function referenceKey(sheetName: string, address: string): string {
  return `${sheetName.toUpperCase()}!${address.toUpperCase()}`;
}
