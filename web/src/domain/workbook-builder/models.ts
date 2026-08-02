import type { Uuid, Sha256, UtcTimestamp } from "../shared/types";
import type { BuildSpecV2, NamedRangeDefinition, CellMapping } from "../build-spec/models";
import type { PopulationDecisionProjection } from "../population/population-profile";
import type {
  ValidationError,
  ValidationWarning,
} from "../shared/validation-result";

export interface WorkbookGenerationInput {
  readonly buildSpec: BuildSpecV2;
  readonly populationProfile: PopulationDecisionProjection;
  readonly workbookProfileContentSha256: Sha256;
  readonly generatorVersion: string;
  readonly populationData?: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>>;
}

export interface V1Workbook {
  readonly workbookId: Uuid;
  readonly buildSpecId: Uuid;
  readonly buildSpecContentSha256: Sha256;
  readonly architectureId: Uuid;
  readonly architectureContentSha256: Sha256;
  readonly caseId: Uuid;
  readonly populationProfileDecisionId: string | null;
  readonly populationProfileContentSha256: Sha256;
  readonly generatedAt: UtcTimestamp;
  readonly sheets: readonly WorkbookSheet[];
  readonly namedRanges: readonly NamedRangeDefinition[];
  readonly cellMappings: readonly CellMapping[];
  readonly formulaCells: readonly FormulaCell[];
  readonly support: SupportSheetContent;
  readonly workbookContentSha256: Sha256;
}

export interface WorkbookSheet {
  readonly name: string;
  readonly hidden: boolean;
  readonly cells: readonly WorkbookCell[];
}

export interface WorkbookCell {
  readonly address: string;
  readonly kind: "formula" | "input" | "output" | "label" | "blank";
  readonly formulaText: string | null;
  readonly value: unknown;
  readonly dataSource: PopulationDataSource | null;
  readonly mappingId: Uuid | null;
}

export interface FormulaCell {
  readonly cellAddress: string;
  readonly tabName: string;
  readonly formulaText: string;
  readonly formulaId: string;
  readonly dependencies: readonly FormulaCell[];
  readonly executionOrder: number;
  readonly executionLevel: number;
}

export interface SupportSheetContent {
  readonly summarySheet: SummarySheetData;
  readonly tablesSheet: TablesSheetData;
  readonly udTableSheet: UDTableSheetData;
}

export interface SummarySheetData {
  readonly caseId: Uuid;
  readonly architectureId: Uuid;
  readonly architectureContentSha256: Sha256;
  readonly buildSpecId: Uuid;
  readonly buildSpecContentSha256: Sha256;
  readonly populationProfileDecisionId: string | null;
  readonly populationProfileContentSha256: Sha256;
  readonly generatedAt: UtcTimestamp;
  readonly generatorVersion: string;
  readonly workbookContentSha256: Sha256;
}

export interface TablesSheetData {
  readonly rules: readonly PlanRuleRow[];
}

export interface PlanRuleRow {
  readonly ruleId: Uuid;
  readonly statement: string;
  readonly effectiveDate: string;
  readonly endDate: string | null;
  readonly applicability: string;
  readonly primaryCitation: string;
}

export interface UDTableSheetData {
  readonly namedRanges: readonly NamedRangeRow[];
  readonly cellMappings: readonly CellMappingRow[];
}

export interface NamedRangeRow {
  readonly name: string;
  readonly scope: string;
  readonly target: string;
  readonly genericField: string | null;
}

export interface CellMappingRow {
  readonly mappingId: Uuid;
  readonly cellAddress: string;
  readonly iobValue: string;
  readonly dataSource: string | null;
  readonly formulaId: string | null;
}

export interface PopulationDataSource {
  readonly sourceTab: string;
  readonly columnIdentifier: string;
  readonly rowRange: { readonly start: number; readonly count: number };
  readonly recordCount: number;
  readonly recordHash: Sha256;
}

export interface WorkbookValidationResult {
  readonly status: "valid" | "invalid";
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly workbookContentSha256: Sha256 | null;
}

export type WorkbookGenerationError = ValidationError;
