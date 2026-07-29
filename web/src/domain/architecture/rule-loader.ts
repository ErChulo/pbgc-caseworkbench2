import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EvidenceCatalog } from "../evidence/models";
import type { Result, Sha256 } from "../shared/types";
import {
  replayArchitecturePolicyApprovals,
  type ArchitecturePolicyApproval,
  type ArchitecturePolicyProjection,
} from "./architecture-policy-approval";
import type {
  FieldNameGlossaryEntry,
  IoBClassificationRule,
  RuleSetGovernance,
  TriggerCondition,
} from "./models";

export type { FieldNameGlossaryEntry, IoBClassificationRule } from "./models";

export interface ScenarioSelectionRule {
  readonly id: string;
  readonly label: string;
  readonly triggerConditions: readonly TriggerCondition[];
  readonly exclusionConditions: readonly TriggerCondition[];
  readonly defaultEffectiveDateRange: {
    readonly startDate: string;
    readonly endDate: string | null;
  };
}

export interface TabSelectionRule {
  readonly tabPattern: string;
  readonly requiredFields: readonly string[];
  readonly populationRequirement: string | null;
  readonly description: string;
}

interface RuleSetBase {
  readonly version: string;
  readonly governance: RuleSetGovernance;
  readonly policyContentSha256: Sha256;
  readonly sourceFileSha256: Sha256;
}

export type RuleSet =
  | (RuleSetBase & {
      readonly kind: "scenario-selection";
      readonly rules: readonly ScenarioSelectionRule[];
      readonly entries?: never;
    })
  | (RuleSetBase & {
      readonly kind: "tab-selection";
      readonly rules: readonly TabSelectionRule[];
      readonly entries?: never;
    })
  | (RuleSetBase & {
      readonly kind: "iob-classification";
      readonly rules: readonly IoBClassificationRule[];
      readonly entries?: never;
    })
  | (RuleSetBase & {
      readonly kind: "field-name-glossary";
      readonly entries: readonly FieldNameGlossaryEntry[];
      readonly rules?: never;
    });

export interface LoadedRuleSets {
  readonly scenarioSelection: Extract<RuleSet, { kind: "scenario-selection" }>;
  readonly tabSelection: Extract<RuleSet, { kind: "tab-selection" }>;
  readonly iobClassification: Extract<RuleSet, { kind: "iob-classification" }>;
  readonly fieldNameGlossary: Extract<RuleSet, { kind: "field-name-glossary" }>;
}

export interface PolicyApprovalContext {
  readonly evidenceCatalog: EvidenceCatalog;
  readonly decisions: readonly ArchitecturePolicyApproval[];
}

export type RuleLoadError =
  | { readonly code: "RULE_FILE_NOT_FOUND"; readonly path: string }
  | {
      readonly code: "RULE_PARSE_ERROR";
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly code: "RULE_VALIDATION_ERROR";
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly code: "RULE_NOT_APPROVED";
      readonly path: string;
      readonly message: string;
    };

interface ParsedLine {
  readonly number: number;
  readonly indent: number;
  readonly text: string;
}

class RuleValidationError extends Error {}

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
  required: readonly string[],
  path: string,
): void {
  const allowed = new Set(required);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0)
    invalid(`${path} contains unknown field(s): ${unknown.join(", ")}.`);
  if (missing.length > 0)
    invalid(`${path} is missing field(s): ${missing.join(", ")}.`);
}

function exactKeysWithOptional(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0)
    invalid(`${path} contains unknown field(s): ${unknown.join(", ")}.`);
  if (missing.length > 0)
    invalid(`${path} is missing field(s): ${missing.join(", ")}.`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "")
    invalid(`${path} must be a nonempty string.`);
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${path} must be an array.`);
  return value;
}

function date(value: unknown, path: string): string {
  const result = string(value, path);
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

function parseGovernance(value: unknown): RuleSetGovernance {
  const item = record(value, "governance");
  exactKeys(item, ["reviewStatus"], "governance");
  const reviewStatus = string(item.reviewStatus, "governance.reviewStatus");
  if (reviewStatus !== "provisional")
    invalid("embedded governance must remain provisional.");
  return { reviewStatus };
}

function parseCondition(value: unknown, path: string): TriggerCondition {
  const item = record(value, path);
  exactKeys(item, ["dimension", "operator", "value", "source"], path);
  const operator = string(item.operator, `${path}.operator`);
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
    invalid(`${path}.operator is invalid.`);
  const source = string(item.source, `${path}.source`);
  if (!["plan-rule", "population", "case-control"].includes(source))
    invalid(`${path}.source is invalid.`);
  if (!["string", "number", "boolean"].includes(typeof item.value))
    invalid(`${path}.value must be a string, number, or boolean.`);
  return {
    dimension: string(item.dimension, `${path}.dimension`),
    operator: operator as TriggerCondition["operator"],
    value: item.value as string | number | boolean,
    source: source as TriggerCondition["source"],
  };
}

function parsePayload(
  kind: RuleSet["kind"],
  data: Record<string, unknown>,
): {
  readonly version: string;
  readonly governance: RuleSetGovernance;
  readonly payload: readonly unknown[];
} {
  const payloadKey =
    kind === "scenario-selection"
      ? "scenarios"
      : kind === "field-name-glossary"
        ? "entries"
        : "rules";
  exactKeys(data, ["version", "governance", payloadKey], "root");
  const version = string(data.version, "version");
  if (!/^\d+\.\d+\.\d+$/u.test(version))
    invalid("version must be semantic x.y.z.");
  const payload = array(data[payloadKey], payloadKey);
  if (payload.length === 0) invalid(`${payloadKey} must not be empty.`);
  return { version, governance: parseGovernance(data.governance), payload };
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
    const triggers = array(
      item.triggerConditions,
      `${path}.triggerConditions`,
    ).map((condition, conditionIndex) =>
      parseCondition(
        condition,
        `${path}.triggerConditions[${String(conditionIndex)}]`,
      ),
    );
    if (triggers.length === 0)
      invalid(`${path}.triggerConditions must not be empty.`);
    return {
      id: string(item.id, `${path}.id`),
      label: string(item.label, `${path}.label`),
      triggerConditions: triggers,
      exclusionConditions: array(
        item.exclusionConditions,
        `${path}.exclusionConditions`,
      ).map((condition, conditionIndex) =>
        parseCondition(
          condition,
          `${path}.exclusionConditions[${String(conditionIndex)}]`,
        ),
      ),
      defaultEffectiveDateRange: {
        startDate: date(
          range.startDate,
          `${path}.defaultEffectiveDateRange.startDate`,
        ),
        endDate:
          range.endDate === null
            ? null
            : date(range.endDate, `${path}.defaultEffectiveDateRange.endDate`),
      },
    };
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
    return {
      tabPattern: string(item.tabPattern, `${path}.tabPattern`),
      requiredFields: array(item.requiredFields, `${path}.requiredFields`).map(
        (field, fieldIndex) =>
          string(field, `${path}.requiredFields[${String(fieldIndex)}]`),
      ),
      populationRequirement: nullableString(
        item.populationRequirement,
        `${path}.populationRequirement`,
      ),
      description: string(item.description, `${path}.description`),
    };
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
    const iob = string(item.iob, `${path}.iob`);
    if (!["I", "O", "B", "N", "P", ""].includes(iob))
      invalid(`${path}.iob is invalid.`);
    if (
      typeof item.priority !== "number" ||
      !Number.isSafeInteger(item.priority)
    )
      invalid(`${path}.priority must be an integer.`);
    return {
      fieldPattern: string(item.fieldPattern, `${path}.fieldPattern`),
      runPattern: string(item.runPattern, `${path}.runPattern`),
      iob: iob as IoBClassificationRule["iob"],
      priority: item.priority,
      justification: string(item.justification, `${path}.justification`),
    };
  });
}

function parseGlossary(
  values: readonly unknown[],
): readonly FieldNameGlossaryEntry[] {
  return values.map((value, index) => {
    const path = `entries[${String(index)}]`;
    const item = record(value, path);
    exactKeysWithOptional(
      item,
      ["workbookPattern", "genericField", "description"],
      ["tabContext"],
      path,
    );
    return {
      workbookPattern: string(item.workbookPattern, `${path}.workbookPattern`),
      genericField: string(item.genericField, `${path}.genericField`),
      description: string(item.description, `${path}.description`),
      tabContext:
        item.tabContext === undefined
          ? null
          : nullableString(item.tabContext, `${path}.tabContext`),
    };
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function digest(value: string): Sha256 {
  return createHash("sha256").update(value, "utf8").digest("hex") as Sha256;
}

export function policyContentHash(ruleSet: RuleSet): Sha256 {
  return digest(stableJson(ruleSet.rules ?? ruleSet.entries));
}

export async function effectivePolicyApproval(
  ruleSet: RuleSet,
  context: PolicyApprovalContext | undefined,
): Promise<Result<ArchitecturePolicyProjection, string>> {
  if (context === undefined)
    return {
      ok: false,
      error: "separate policy approval decisions are absent",
    };
  const decisions = context.decisions.filter(
    (decision) => decision.policyKind === ruleSet.kind,
  );
  const replay = await replayArchitecturePolicyApprovals(
    ruleSet,
    decisions,
    context.evidenceCatalog,
  );
  if (!replay.ok) return replay;
  return replay.value.status === "approved"
    ? replay
    : { ok: false, error: "policy has no effective non-revoked approval" };
}

export async function loadRuleSet(
  rulePath: string,
  kind: RuleSet["kind"],
  mode: "candidate" | "production" = "candidate",
  approvalContext?: PolicyApprovalContext,
): Promise<Result<RuleSet, RuleLoadError>> {
  try {
    const content = await readFile(rulePath, "utf8");
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
    const policyContentSha256 = digest(stableJson(rules ?? entries));
    const base = {
      kind,
      version: parsed.version,
      governance: parsed.governance,
      policyContentSha256,
      sourceFileSha256: digest(content),
    };
    const ruleSet = (
      kind === "field-name-glossary"
        ? { ...base, kind, entries }
        : { ...base, kind, rules }
    ) as RuleSet;
    const approval =
      mode === "production"
        ? await effectivePolicyApproval(ruleSet, approvalContext)
        : ({ ok: true, value: undefined } as const);
    return approval.ok
      ? { ok: true, value: ruleSet }
      : {
          ok: false,
          error: {
            code: "RULE_NOT_APPROVED",
            path: rulePath,
            message: approval.error,
          },
        };
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return {
        ok: false,
        error: { code: "RULE_FILE_NOT_FOUND", path: rulePath },
      };
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

export async function loadRuleSets(
  baseDir: string,
  mode: "candidate" | "production" = "candidate",
  approvalContext?: PolicyApprovalContext,
): Promise<Result<LoadedRuleSets, RuleLoadError>> {
  const definitions = [
    ["scenarioSelection", "scenario-selection"],
    ["tabSelection", "tab-selection"],
    ["iobClassification", "iob-classification"],
    ["fieldNameGlossary", "field-name-glossary"],
  ] as const;
  const loaded: Partial<LoadedRuleSets> = {};
  for (const [property, kind] of definitions) {
    const result = await loadRuleSet(
      resolveRulePath(baseDir, kind),
      kind,
      mode,
      approvalContext,
    );
    if (!result.ok) return result;
    Object.assign(loaded, { [property]: result.value });
  }
  return { ok: true, value: loaded as LoadedRuleSets };
}

export function resolveRulePath(baseDir: string, ruleName: string): string {
  return resolve(baseDir, `${ruleName}.yaml`);
}
