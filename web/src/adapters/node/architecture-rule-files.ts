// Node-only tooling adapter. Browser workflows use loadBundledRuleSets instead.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  effectivePolicyApproval,
  type LoadedRuleSets,
  type PolicyApprovalContext,
  type RuleLoadError,
  type RuleSet,
} from "../../domain/architecture/rule-loader";
import { parseRuleSetText } from "../../domain/architecture/rule-parser";
import {
  createFieldNameGlossary,
  type FieldNameGlossary,
} from "../../domain/architecture/field-name-glossary";
import type { Result } from "../../domain/shared/types";

export async function loadRuleSet(
  rulePath: string,
  kind: RuleSet["kind"],
  mode: "candidate" | "production" = "candidate",
  approvalContext?: PolicyApprovalContext,
): Promise<Result<RuleSet, RuleLoadError>> {
  try {
    const content = await readFile(rulePath, "utf8");
    const parsed = await parseRuleSetText(rulePath, content, kind);
    if (!parsed.ok) return parsed;
    const approval =
      mode === "production"
        ? await effectivePolicyApproval(parsed.value, approvalContext)
        : ({ ok: true, value: undefined } as const);
    return approval.ok
      ? { ok: true, value: parsed.value }
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
        code: "RULE_PARSE_ERROR",
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

export async function loadFieldNameGlossary(
  rulePath: string,
): Promise<Result<FieldNameGlossary, RuleLoadError>> {
  const result = await loadRuleSet(rulePath, "field-name-glossary");
  if (!result.ok) return result;
  if (result.value.kind !== "field-name-glossary") {
    return {
      ok: false,
      error: {
        code: "RULE_VALIDATION_ERROR",
        path: rulePath,
        message: "Loaded rule-set kind does not match field-name-glossary.",
      },
    };
  }
  return {
    ok: true,
    value: createFieldNameGlossary(result.value.entries),
  };
}
