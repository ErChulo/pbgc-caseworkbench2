import type { Result } from "../shared/types";

export interface CaseIdentifierRule {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly minimumLength: number;
  readonly maximumLength: number;
  readonly syntax: RegExp;
  readonly unicodeNormalization: "NFC" | "none";
  readonly letterCase: "preserve" | "uppercase" | "lowercase";
}

export interface CaseIdentifierValidationError {
  readonly code:
    | "CASE_IDENTIFIER_EMPTY"
    | "CASE_IDENTIFIER_PADDED"
    | "CASE_IDENTIFIER_LENGTH_INVALID"
    | "CASE_IDENTIFIER_SYNTAX_INVALID"
    | "CASE_IDENTIFIER_RULE_INVALID";
  readonly safeMessage: string;
  readonly blocksDownstream: true;
}

export interface ValidatedCaseIdentifier {
  readonly value: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
}

export function validateCaseIdentifier(
  sourceValue: string,
  rule: CaseIdentifierRule,
): Result<ValidatedCaseIdentifier, CaseIdentifierValidationError> {
  if (
    !nonblank(rule.ruleId) ||
    !nonblank(rule.ruleVersion) ||
    !Number.isSafeInteger(rule.minimumLength) ||
    !Number.isSafeInteger(rule.maximumLength) ||
    rule.minimumLength < 1 ||
    rule.maximumLength < rule.minimumLength
  ) {
    return failure(
      "CASE_IDENTIFIER_RULE_INVALID",
      "The configured case-identifier rule is invalid.",
    );
  }
  if (sourceValue.length === 0) {
    return failure(
      "CASE_IDENTIFIER_EMPTY",
      "Enter an authoritative PBGC case identifier.",
    );
  }
  if (sourceValue !== sourceValue.trim()) {
    return failure(
      "CASE_IDENTIFIER_PADDED",
      "The case identifier cannot contain leading or trailing whitespace.",
    );
  }

  const normalized = normalize(sourceValue, rule);
  if (
    normalized.length < rule.minimumLength ||
    normalized.length > rule.maximumLength
  ) {
    return failure(
      "CASE_IDENTIFIER_LENGTH_INVALID",
      "The case identifier length is outside the configured rule.",
    );
  }
  rule.syntax.lastIndex = 0;
  const syntaxValid = rule.syntax.test(normalized);
  rule.syntax.lastIndex = 0;
  if (!syntaxValid) {
    return failure(
      "CASE_IDENTIFIER_SYNTAX_INVALID",
      "The case identifier does not match the configured syntax rule.",
    );
  }
  return {
    ok: true,
    value: Object.freeze({
      value: normalized,
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
    }),
  };
}

function normalize(value: string, rule: CaseIdentifierRule): string {
  const unicodeNormalized =
    rule.unicodeNormalization === "NFC" ? value.normalize("NFC") : value;
  switch (rule.letterCase) {
    case "preserve":
      return unicodeNormalized;
    case "uppercase":
      return unicodeNormalized.toUpperCase();
    case "lowercase":
      return unicodeNormalized.toLowerCase();
  }
}

function nonblank(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function failure(
  code: CaseIdentifierValidationError["code"],
  safeMessage: string,
): Result<never, CaseIdentifierValidationError> {
  return {
    ok: false,
    error: { code, safeMessage, blocksDownstream: true },
  };
}
