import type { ValidationError, ValidationWarning } from "./validation-result";

export type ValidationRule<T> =
  | RequiredRule<T>
  | NonEmptyRule<T>
  | UniqueRule<T>
  | CustomRule<T>;

export interface RequiredRule<T> {
  readonly kind: "required";
  readonly field: keyof T;
  readonly code: string;
  readonly message: string;
}

export interface NonEmptyRule<T> {
  readonly kind: "nonEmpty";
  readonly field: keyof T;
  readonly code: string;
  readonly message: string;
}

export interface UniqueRule<T> {
  readonly kind: "unique";
  readonly field: keyof T;
  readonly key: (item: unknown) => string;
  readonly code: string;
  readonly message: string;
}

export interface CustomRule<T> {
  readonly kind: "custom";
  readonly test: (input: T) => ValidationError | null;
}

export class ValidationBuilder<T> {
  private errorRules: ValidationRule<T>[] = [];
  private warningRules: ValidationRule<T>[] = [];

  required(
    field: keyof T,
    code: string,
    message: string,
  ): this {
    this.errorRules.push({
      kind: "required",
      field,
      code,
      message,
    });
    return this;
  }

  nonEmpty(
    field: keyof T,
    code: string,
    message: string,
  ): this {
    this.errorRules.push({
      kind: "nonEmpty",
      field,
      code,
      message,
    });
    return this;
  }

  unique(
    field: keyof T,
    key: (item: unknown) => string,
    code: string,
    message: string,
  ): this {
    this.errorRules.push({
      kind: "unique",
      field,
      key,
      code,
      message,
    });
    return this;
  }

  custom(test: (input: T) => ValidationError | null): this {
    this.errorRules.push({
      kind: "custom",
      test,
    });
    return this;
  }

  warn(
    field: keyof T,
    code: string,
    message: string,
  ): this {
    this.warningRules.push({
      kind: "required",
      field,
      code,
      message,
    });
    return this;
  }

  validate(input: T): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const rule of this.errorRules) {
      const result = this.applyRule(rule, input);
      if (result) errors.push(result);
    }

    for (const rule of this.warningRules) {
      const result = this.applyWarningRule(rule, input);
      if (result) warnings.push(result);
    }

    return { errors, warnings };
  }

  private applyRule(rule: ValidationRule<T>, input: T): ValidationError | null {
    if (rule.kind === "custom") {
      return rule.test(input);
    }

    if (rule.kind === "required") {
      const value = input[rule.field];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        return {
          code: rule.code,
          severity: "error",
          affectedCells: [],
          affectedNames: [],
          message: rule.message,
          detail: rule.message,
          remediation: "Provide a value for this required field.",
        };
      }
    }

    if (rule.kind === "nonEmpty") {
      const value = input[rule.field];
      if (Array.isArray(value) && value.length === 0) {
        return {
          code: rule.code,
          severity: "error",
          affectedCells: [],
          affectedNames: [],
          message: rule.message,
          detail: rule.message,
          remediation: "Provide at least one item for this collection.",
        };
      }
    }

    if (rule.kind === "unique") {
      const value = input[rule.field];
      if (Array.isArray(value)) {
        const seen = new Set<string>();
        for (const item of value) {
          const k = rule.key(item);
          if (seen.has(k)) {
            return {
              code: rule.code,
              severity: "error",
              affectedCells: [],
              affectedNames: [],
              message: rule.message,
              detail: rule.message,
              remediation: "Remove duplicate entries.",
            };
          }
          seen.add(k);
        }
      }
    }

    return null;
  }

  private applyWarningRule(
    rule: ValidationRule<T>,
    input: T,
  ): ValidationWarning | null {
    if (rule.kind === "required") {
      const value = input[rule.field];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        return {
          code: rule.code,
          severity: "warning",
          affectedCells: [],
          message: rule.message,
          detail: rule.message,
        };
      }
    }

    return null;
  }
}
