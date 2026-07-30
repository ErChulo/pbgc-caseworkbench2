import type { V1Workbook } from "../workbook-builder/models";
import type { ValidationError } from "./models";

export function validatePopulationApplication(
  workbook: V1Workbook,
): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...validatePopulationDataCompleteness(workbook));
  errors.push(...validatePopulationDataCardinality(workbook));
  errors.push(...validatePopulationDataTypes(workbook));
  errors.push(...validateIBCellMapping(workbook));

  return errors;
}

function validatePopulationDataCompleteness(
  workbook: V1Workbook,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const mapping of workbook.cellMappings) {
    if (
      mapping.iobClassification === "I" ||
      mapping.iobClassification === "B"
    ) {
      if (!mapping.dataSource) {
        errors.push({
          code: "MISSING_POPULATION_SOURCE",
          severity: "error",
          affectedCells: [mapping.cellAddress],
          affectedNames: [],
          message: `Cell ${mapping.cellAddress} (classification: ${mapping.iobClassification}) has no data source defined.`,
          detail: `I/B cells must have an explicit population data source. The population profile does not provide data for this cell.`,
          remediation:
            "Define a population data source in the BuildSpec cell mappings or verify the population profile is complete.",
        });
        continue;
      }

      const dataSource = mapping.dataSource;
      if (!dataSource.sourceTab || !dataSource.sourceField) {
        errors.push({
          code: "INCOMPLETE_POPULATION_SOURCE",
          severity: "error",
          affectedCells: [mapping.cellAddress],
          affectedNames: [],
          message: `Cell ${mapping.cellAddress} has incomplete data source definition.`,
          detail: `Data source must specify both sourceTab and sourceField.`,
          remediation:
            "Complete the population data source definition and regenerate.",
        });
      }
    }
  }

  return errors;
}

function validatePopulationDataCardinality(
  workbook: V1Workbook,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const sourceCardinalityMap = new Map<string, number>();

  for (const mapping of workbook.cellMappings) {
    if (mapping.dataSource) {
      const sourceKey = `${mapping.dataSource.sourceTab}:${mapping.dataSource.sourceField}`;
      if (!sourceCardinalityMap.has(sourceKey)) {
        sourceCardinalityMap.set(sourceKey, 0);
      }
    }
  }

  for (const sourceKey of sourceCardinalityMap.keys()) {
    const [tab, field] = sourceKey.split(":");
    if (!tab || !field) {
      errors.push({
        code: "INVALID_SOURCE_KEY",
        severity: "error",
        affectedCells: [],
        affectedNames: [],
        message: `Invalid population source key: ${sourceKey}`,
        detail: `Population source must have both tab and field components.`,
        remediation: "Correct the population source definitions.",
      });
    }
  }

  return errors;
}

function validatePopulationDataTypes(workbook: V1Workbook): ValidationError[] {
  const errors: ValidationError[] = [];

  const cellClassifications = new Map<string, string>();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      cellClassifications.set(cell.address, cell.kind);
    }
  }

  for (const mapping of workbook.cellMappings) {
    if (mapping.dataSource && mapping.iobClassification === "I") {
      const cellKind = cellClassifications.get(mapping.cellAddress);
      if (cellKind && cellKind !== "input") {
        errors.push({
          code: "CELL_CLASSIFICATION_MISMATCH",
          severity: "error",
          affectedCells: [mapping.cellAddress],
          affectedNames: [],
          message: `Cell ${mapping.cellAddress} is classified as I but cell kind is ${cellKind}.`,
          detail: `I-classified cells must have kind 'input' to properly receive population data.`,
          remediation:
            "Correct the cell classification in the BuildSpec or verify the workbook structure.",
        });
      }
    }

    if (mapping.dataSource && mapping.iobClassification === "B") {
      const cellKind = cellClassifications.get(mapping.cellAddress);
      if (cellKind && cellKind === "label") {
        errors.push({
          code: "INVALID_BIFEED_CELL",
          severity: "error",
          affectedCells: [mapping.cellAddress],
          affectedNames: [],
          message: `Cell ${mapping.cellAddress} is classified as B but has kind 'label'.`,
          detail: `B-classified cells cannot be label cells; they must support both input data and formula calculation.`,
          remediation:
            "Change the cell kind to 'input' or 'formula', or remove the population data source.",
        });
      }
    }
  }

  return errors;
}

function validateIBCellMapping(workbook: V1Workbook): ValidationError[] {
  const errors: ValidationError[] = [];

  const ibCells = workbook.cellMappings.filter(
    (m) => m.iobClassification === "I" || m.iobClassification === "B",
  );

  for (const ibCell of ibCells) {
    if (!ibCell.dataSource && ibCell.iobClassification === "I") {
      errors.push({
        code: "UNMAPPED_INPUT_CELL",
        severity: "error",
        affectedCells: [ibCell.cellAddress],
        affectedNames: [],
        message: `Input cell ${ibCell.cellAddress} is not mapped to a population data source.`,
        detail: `All I-classified cells must map to a population source.`,
        remediation:
          "Add a data source mapping for this cell or change its classification.",
      });
    }

    if (
      ibCell.iobClassification === "B" &&
      !ibCell.dataSource &&
      !ibCell.formulaId
    ) {
      errors.push({
        code: "UNMAPPED_BIFEED_CELL",
        severity: "error",
        affectedCells: [ibCell.cellAddress],
        affectedNames: [],
        message: `Bifeed cell ${ibCell.cellAddress} has neither a formula nor a population data source.`,
        detail: `B-classified cells must receive input from either a formula (formula reference) or population data, or both.`,
        remediation:
          "Map the cell to a population data source, add a formula, or change its classification.",
      });
    }
  }

  return errors;
}
