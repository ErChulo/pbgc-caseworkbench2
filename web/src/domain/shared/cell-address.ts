/**
 * Shared cell-address utilities for workbook and population modules.
 *
 * Centralizes cell-address regex logic that was duplicated across
 * population-detector.ts and architecture/tab-selector.ts.
 */

/**
 * Tests whether a cell address is in row 1 (header row).
 * Matches addresses like "A1", "B1", "AA1", etc.
 */
export function isHeaderCell(address: string): boolean {
  return /^[A-Z]+1$/u.test(address);
}

/**
 * Extracts the row number from a cell address.
 * Returns the row number as a string, or empty string if no match.
 */
export function rowNumber(address: string): string {
  return /\d+$/u.exec(address)?.[0] ?? "";
}
