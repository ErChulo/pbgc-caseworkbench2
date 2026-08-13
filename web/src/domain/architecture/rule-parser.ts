import { parseSha256, type Result, type Sha256 } from "../shared/types";
import type {
  FieldNameGlossaryEntry,
  IoBClassificationRule,
  RuleSetGovernance,
  TriggerCondition,
} from "./models";
import type {
  LoadedRuleSets,
  RuleLoadError,
  RuleSet,
  ScenarioSelectionRule,
  TabSelectionRule,
} from "./rule-loader";

interface ParsedLine {
  readonly number: number;
  readonly indent: number;
  readonly text: string;
}

class RuleValidationError extends Error {}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export async function parseRuleSetText(
  rulePath: string,
  content: string,
  kind: RuleSet["kind"],
): Promise<Result<RuleSet, RuleLoadError>> {
  try {
    const data = parseYamlSubset(content);
    const parsed = parsePayload(kind, data);
    const rules =
      kind === "scenario-selection"
        ? parseScenarios(parsed.payload)
        : kind === "tab-selection"
          ? parseTabs(parsed.payload)
          : kind === "iob-classification"
            ? parseIoB(parsed.payload)
            : undefined;
    const entries =
      kind === "field-name-glossary"
        ? parseGlossary(parsed.payload)
        : undefined;
    const policyContentSha256 = await digestSemantic(rules ?? entries);
    const sourceFileSha256 = await digestText(content);
    const base = {
      kind,
      version: parsed.version,
      governance: parsed.governance,
      policyContentSha256,
      sourceFileSha256,
    };
    return {
      ok: true,
      value: (kind === "field-name-glossary"
        ? { ...base, kind, entries }
        : { ...base, kind, rules }) as RuleSet,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code:
          error instanceof RuleValidationError
            ? "RULE_VALIDATION_ERROR"
            : "RULE_PARSE_ERROR",
        path: rulePath,
        message:
          error instanceof Error ? error.message : "Unknown rule-loading error",
      },
    };
  }
}

export async function parseLoadedRuleSets(config: {
  readonly scenarioSelection: string;
  readonly tabSelection: string;
  readonly iobClassification: string;
  readonly fieldNameGlossary: string;
}): Promise<Result<LoadedRuleSets, RuleLoadError>> {
  const loaded: Partial<LoadedRuleSets> = {};
  const definitions = [
    ["scenarioSelection", "scenario-selection", config.scenarioSelection],
    ["tabSelection", "tab-selection", config.tabSelection],
    ["iobClassification", "iob-classification", config.iobClassification],
    ["fieldNameGlossary", "field-name-glossary", config.fieldNameGlossary],
  ] as const;
  for (const [property, kind, content] of definitions) {
    const parsed = await parseRuleSetText(`rules/${kind}.yaml`, content, kind);
    if (!parsed.ok) return parsed;
    Object.assign(loaded, { [property]: parsed.value });
  }
  return { ok: true, value: loaded as LoadedRuleSets };
}

async function digestSemantic(value: unknown): Promise<Sha256> {
  return digestText(stableJson(value));
}

async function digestText(value: string): Promise<Sha256> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const parsed = parseSha256(hex);
  if (!parsed.ok) throw new RuleValidationError(parsed.error.message);
  return parsed.value;
}

function parseYamlSubset(content: string): Record<string, unknown> {
  const lines: ParsedLine[] = [];
  for (const [index, raw] of content
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .entries()) {
    if (raw.includes("\t"))
      throw new SyntaxError(`Line ${String(index + 1)} contains a tab.`);
    const text = raw.trim();
    if (text === "" || text.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    if (indent % 2 !== 0)
      throw new SyntaxError(
        `Line ${String(index + 1)} has invalid indentation.`,
      );
    lines.push({ number: index + 1, indent, text });
  }
  if (lines.length === 0) throw new SyntaxError("Rule file is empty.");

  function parseNode(index: number, indent: number): [unknown, number] {
    const line = lines[index];
    if (line?.indent !== indent) {
      throw new SyntaxError(
        `Expected indentation ${String(indent)} near line ${String(line?.number ?? 0)}.`,
      );
    }
    return line.text.startsWith("- ")
      ? parseSequence(index, indent)
      : parseMap(index, indent);
  }

  function parseMap(
    index: number,
    indent: number,
    initial: Record<string, unknown> = {},
  ): [Record<string, unknown>, number] {
    let cursor = index;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line === undefined) break;
      if (
        line.indent < indent ||
        (line.indent === indent && line.text.startsWith("- "))
      )
        break;
      if (line.indent !== indent)
        throw new SyntaxError(
          `Unexpected indentation on line ${String(line.number)}.`,
        );
      const [key, scalar] = splitMapping(line);
      if (Object.hasOwn(initial, key))
        throw new SyntaxError(
          `Duplicate key ${key} on line ${String(line.number)}.`,
        );
      cursor += 1;
      if (scalar === "") {
        const next = lines[cursor];
        if (next?.indent !== indent + 2) {
          throw new SyntaxError(
            `Key ${key} on line ${String(line.number)} requires a value.`,
          );
        }
        [initial[key], cursor] = parseNode(cursor, indent + 2);
      } else {
        initial[key] = parseScalar(scalar, line.number);
      }
    }
    return [initial, cursor];
  }

  function parseSequence(
    index: number,
    indent: number,
  ): [readonly unknown[], number] {
    const values: unknown[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line?.indent !== indent || !line.text.startsWith("- ")) break;
      const item = line.text.slice(2).trim();
      if (item === "")
        throw new SyntaxError(
          `Empty sequence item on line ${String(line.number)}.`,
        );
      cursor += 1;
      if (/^[A-Za-z][A-Za-z0-9_-]*\s*:/u.test(item)) {
        const synthetic = { ...line, text: item };
        const [key, scalar] = splitMapping(synthetic);
        let record: Record<string, unknown> = {};
        if (scalar === "") {
          const next = lines[cursor];
          if (next?.indent !== indent + 2) {
            throw new SyntaxError(
              `Key ${key} on line ${String(line.number)} requires a value.`,
            );
          }
          [record[key], cursor] = parseNode(cursor, indent + 2);
        } else {
          record[key] = parseScalar(scalar, line.number);
        }
        [record, cursor] = parseMap(cursor, indent + 2, record);
        values.push(record);
      } else {
        values.push(parseScalar(item, line.number));
      }
    }
    return [values, cursor];
  }

  const [value, consumed] = parseNode(0, 0);
  if (consumed !== lines.length)
    throw new SyntaxError(
      `Unexpected content on line ${String(lines[consumed]?.number ?? 0)}.`,
    );
  return record(value, "root");
}

function splitMapping(line: ParsedLine): [string, string] {
  const separator = line.text.indexOf(":");
  if (separator < 1)
    throw new SyntaxError(
      `Expected key/value mapping on line ${String(line.number)}.`,
    );
  const key = line.text.slice(0, separator).trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(key))
    throw new SyntaxError(`Invalid key on line ${String(line.number)}.`);
  return [key, line.text.slice(separator + 1).trim()];
}

function parseScalar(value: string, line: number): unknown {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) return Number(value);
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "string") throw new Error();
      return parsed;
    } catch {
      throw new SyntaxError(`Invalid quoted string on line ${String(line)}.`);
    }
  }
  if (/^[A-Za-z0-9_. *-]+$/u.test(value)) return value;
  throw new SyntaxError(`Unsupported scalar on line ${String(line)}.`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    invalid(`${path} keys must be ${expected.join(", ")}.`);
}

function parsePayload(kind: RuleSet["kind"], data: Record<string, unknown>) {
  const payloadKey =
    kind === "scenario-selection"
      ? "scenarios"
      : kind === "field-name-glossary"
        ? "entries"
        : "rules";
  exactKeys(data, ["version", "governance", payloadKey], "rule file");
  const version = stringValue(data.version, "version");
  const governanceRecord = record(data.governance, "governance");
  exactKeys(governanceRecord, ["reviewStatus"], "governance");
  const reviewStatus = stringValue(
    governanceRecord.reviewStatus,
    "governance.reviewStatus",
  );
  if (reviewStatus !== "provisional")
    invalid(
      "Rule files are source definitions and must remain provisional before separate approval.",
    );
  return {
    version,
    governance: { reviewStatus } as RuleSetGovernance,
    payload: arrayValue(data[payloadKey], payloadKey),
  };
}

function parseScenarios(
  values: readonly unknown[],
): readonly ScenarioSelectionRule[] {
  return values.map((value, index) => {
    const path = `scenarios[${String(index)}]`;
    const item = record(value, path);
    exactKeys(
      item,
      [
        "id",
        "label",
        "triggerConditions",
        "exclusionConditions",
        "defaultEffectiveDateRange",
      ],
      path,
    );
    const range = record(
      item.defaultEffectiveDateRange,
      `${path}.defaultEffectiveDateRange`,
    );
    exactKeys(
      range,
      ["startDate", "endDate"],
      `${path}.defaultEffectiveDateRange`,
    );
    return Object.freeze({
      id: stringValue(item.id, `${path}.id`),
      label: stringValue(item.label, `${path}.label`),
      triggerConditions: parseConditions(
        item.triggerConditions,
        `${path}.triggerConditions`,
      ),
      exclusionConditions: parseConditions(
        item.exclusionConditions,
        `${path}.exclusionConditions`,
      ),
      defaultEffectiveDateRange: {
         startDate: dateValue(
           range.startDate,
           `${path}.defaultEffectiveDateRange.startDate`,
         ),

        endDate:
          range.endDate === null
            ? null
             : dateValue(
                 range.endDate,
                 `${path}.defaultEffectiveDateRange.endDate`,
               ),
      },
    });
  });
}

function parseConditions(
  value: unknown,
  path: string,
): readonly TriggerCondition[] {
  return arrayValue(value, path).map((item, index) => {
    const conditionPath = `${path}[${String(index)}]`;
    const condition = record(item, conditionPath);
    exactKeys(
      condition,
      ["dimension", "operator", "value", "source"],
      conditionPath,
    );
    const operator = stringValue(
      condition.operator,
      `${conditionPath}.operator`,
    );
    const source = stringValue(condition.source, `${conditionPath}.source`);
    if (
      ![
        "equals",
        "contains",
        "greater-than",
        "less-than",
        "present",
        "absent",
      ].includes(operator)
    )
      invalid(`${conditionPath}.operator is invalid.`);
    if (!["plan-rule", "population", "case-control"].includes(source))
      invalid(`${conditionPath}.source is invalid.`);
    return Object.freeze({
      dimension: stringValue(condition.dimension, `${conditionPath}.dimension`),
      operator: operator as TriggerCondition["operator"],
      value: primitiveValue(condition.value, `${conditionPath}.value`),
      source: source as TriggerCondition["source"],
    });
  });
}

function parseTabs(values: readonly unknown[]): readonly TabSelectionRule[] {
  return values.map((value, index) => {
    const path = `rules[${String(index)}]`;
    const item = record(value, path);
    exactKeys(
      item,
      ["tabPattern", "requiredFields", "populationRequirement", "description"],
      path,
    );
    return Object.freeze({
      tabPattern: stringValue(item.tabPattern, `${path}.tabPattern`),
      requiredFields: stringArray(
        item.requiredFields,
        `${path}.requiredFields`,
      ),
      populationRequirement:
        item.populationRequirement === null
          ? null
          : stringValue(
              item.populationRequirement,
              `${path}.populationRequirement`,
            ),
      description: stringValue(item.description, `${path}.description`),
    });
  });
}

function parseIoB(
  values: readonly unknown[],
): readonly IoBClassificationRule[] {
  return values.map((value, index) => {
    const path = `rules[${String(index)}]`;
    const item = record(value, path);
    exactKeys(
      item,
      ["fieldPattern", "runPattern", "iob", "priority", "justification"],
      path,
    );
    const iob = stringValue(item.iob, `${path}.iob`);
    if (!["I", "O", "B", "N", "P", ""].includes(iob))
      invalid(`${path}.iob is invalid.`);
    return Object.freeze({
      fieldPattern: stringValue(item.fieldPattern, `${path}.fieldPattern`),
      runPattern: stringValue(item.runPattern, `${path}.runPattern`),
      iob: iob as IoBClassificationRule["iob"],
      priority: numberValue(item.priority, `${path}.priority`),
      justification: stringValue(item.justification, `${path}.justification`),
    });
  });
}

function parseGlossary(
  values: readonly unknown[],
): readonly FieldNameGlossaryEntry[] {
  return values.map((value, index) => {
    const path = `entries[${String(index)}]`;
    const item = record(value, path);
     const keys = Object.keys(item).sort();
     if (
       keys.some(
         (key) =>
           !["workbookPattern", "genericField", "description", "tabContext"].includes(key),
       ) ||
       keys.filter((key) => key !== "tabContext").length !== 3
     )
       invalid(`${path} contains invalid fields.`);

    return Object.freeze({
      workbookPattern: stringValue(
        item.workbookPattern,
        `${path}.workbookPattern`,
      ),
      genericField: stringValue(item.genericField, `${path}.genericField`),
      description: stringValue(item.description, `${path}.description`),
      tabContext:
        item.tabContext == null
          ? null
          : stringValue(item.tabContext, `${path}.tabContext`),
    });
  });
}

function arrayValue(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${path} must be an array.`);
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "")
    invalid(`${path} must be a non-empty string.`);
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    invalid(`${path} must be a finite number.`);
  return value;
}

function primitiveValue(
  value: unknown,
  path: string,
): string | number | boolean {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  invalid(`${path} must be a string, number, or boolean.`);
}

function stringArray(value: unknown, path: string): readonly string[] {
  return arrayValue(value, path).map((item, index) =>
    stringValue(item, `${path}[${String(index)}]`),
  );
}

function dateValue(value: unknown, path: string): string {
  const result = stringValue(value, path);
  const parsed = Date.parse(`${result}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(result) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== result
  ) {
    invalid(`${path} must be a valid ISO calendar date.`);
  }
  return result;
}

function invalid(message: string): never {
  throw new RuleValidationError(message);
}
