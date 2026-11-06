/** A blank template contains no asserted results or execution metadata. */
export function createProvisionalOracleTemplate(
  formulaCells: readonly {
    readonly formulaId: string;
    readonly cellAddress: string;
  }[],
): string {
  return (
    formulaCells
      .map(({ formulaId, cellAddress }) =>
        JSON.stringify({
          formulaId,
          cellAddress,
          value: null,
          error: "No result supplied",
        }),
      )
      .join("\n") + "\n"
  );
}
