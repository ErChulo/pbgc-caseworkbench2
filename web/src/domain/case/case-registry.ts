import {
  createCase,
  type CaseCreationDependencies,
  type CaseCreationError,
  type CaseCreationInput,
  type CaseRecord,
  type HumanActor,
  type NonProductionCasePurpose,
} from "./case";
import type { Result, UtcTimestamp, Uuid } from "../shared/types";

export type CaseRegistryDependencies = CaseCreationDependencies;

export interface CaseCollision {
  readonly kind: "collision";
  readonly authoritativeCaseId: string;
  readonly existingCase: CaseRecord;
  readonly requestedInput: CaseCreationInput;
}

export interface CaseCreated {
  readonly kind: "created";
  readonly caseRecord: CaseRecord;
}

export type CaseRegistrationResult =
  | CaseCreated
  | CaseCollision
  | { readonly kind: "rejected"; readonly error: CaseCreationError };

export interface CollisionResolutionInput {
  readonly action: "resume-existing" | "create-non-production";
  readonly actor: HumanActor;
  readonly rationale: string;
  readonly nonProductionPurpose: NonProductionCasePurpose | null;
}

export interface CaseCollisionDecision {
  readonly decisionId: Uuid;
  readonly action: CollisionResolutionInput["action"];
  readonly authoritativeCaseId: string;
  readonly existingCaseId: Uuid;
  readonly actor: HumanActor;
  readonly decidedAt: UtcTimestamp;
  readonly rationale: string;
  readonly nonProductionPurpose: NonProductionCasePurpose | null;
  readonly resultingCaseId: Uuid;
}

export type CollisionResolution =
  | {
      readonly kind: "resumed-existing";
      readonly linkedCaseId: Uuid;
      readonly decision: CaseCollisionDecision;
    }
  | {
      readonly kind: "created-non-production";
      readonly caseRecord: CaseRecord;
      readonly decision: CaseCollisionDecision;
    };

export interface CaseCollisionError {
  readonly code:
    | "COLLISION_RATIONALE_REQUIRED"
    | "NON_PRODUCTION_PURPOSE_REQUIRED"
    | "CLOSED_CASE_CANNOT_RESUME"
    | "CASE_CREATION_REJECTED";
  readonly safeMessage: string;
  readonly blocksDownstream: true;
}

export class CaseRegistry {
  private readonly caseRecords: CaseRecord[];
  private readonly collisionDecisions: CaseCollisionDecision[] = [];

  constructor(
    private readonly dependencies: CaseRegistryDependencies,
    initialCases: readonly CaseRecord[] = [],
  ) {
    this.caseRecords = [...initialCases];
    assertUniqueProductionIdentifiers(this.caseRecords);
  }

  create(input: CaseCreationInput): CaseRegistrationResult {
    if (input.purpose === "production" && input.authoritativeCaseId !== null) {
      const existing = this.caseRecords.find(
        (caseRecord) =>
          caseRecord.purpose === "production" &&
          caseRecord.authoritativeCaseId === input.authoritativeCaseId,
      );
      if (existing !== undefined) {
        return Object.freeze({
          kind: "collision",
          authoritativeCaseId: input.authoritativeCaseId,
          existingCase: existing,
          requestedInput: Object.freeze({ ...input }),
        });
      }
    }

    const created = createCase(input, this.dependencies);
    if (!created.ok) {
      return Object.freeze({ kind: "rejected", error: created.error });
    }
    this.caseRecords.push(created.value);
    return Object.freeze({ kind: "created", caseRecord: created.value });
  }

  resolveCollision(
    collision: CaseCollision,
    input: CollisionResolutionInput,
  ): Result<CollisionResolution, CaseCollisionError> {
    const nonProductionPurpose = input.nonProductionPurpose;
    if (!nonblank(input.rationale)) {
      return failure(
        "COLLISION_RATIONALE_REQUIRED",
        "An explicit collision decision requires a rationale.",
      );
    }
    if (
      input.action === "resume-existing" &&
      collision.existingCase.status !== "active"
    ) {
      return failure(
        "CLOSED_CASE_CANNOT_RESUME",
        "Only an active existing case can resume intake.",
      );
    }
    if (
      input.action === "create-non-production" &&
      nonProductionPurpose === null
    ) {
      return failure(
        "NON_PRODUCTION_PURPOSE_REQUIRED",
        "Choose an explicit non-production purpose.",
      );
    }

    const decisionId = this.dependencies.uuid.generate();
    if (input.action === "resume-existing") {
      const decision = this.decision(
        decisionId,
        collision,
        input,
        collision.existingCase.caseId,
      );
      this.collisionDecisions.push(decision);
      return {
        ok: true,
        value: Object.freeze({
          kind: "resumed-existing",
          linkedCaseId: collision.existingCase.caseId,
          decision,
        }),
      };
    }

    if (nonProductionPurpose === null) {
      return failure(
        "NON_PRODUCTION_PURPOSE_REQUIRED",
        "Choose an explicit non-production purpose.",
      );
    }
    const created = createCase(
      {
        authoritativeCaseId: collision.authoritativeCaseId,
        purpose: nonProductionPurpose,
        designationRationale: input.rationale,
        createdBy: input.actor,
        collisionDecisionId: decisionId,
      },
      this.dependencies,
    );
    if (!created.ok) {
      return failure(
        "CASE_CREATION_REJECTED",
        "The approved non-production case could not be created.",
      );
    }
    const decision = this.decision(
      decisionId,
      collision,
      input,
      created.value.caseId,
    );
    this.caseRecords.push(created.value);
    this.collisionDecisions.push(decision);
    return {
      ok: true,
      value: Object.freeze({
        kind: "created-non-production",
        caseRecord: created.value,
        decision,
      }),
    };
  }

  cases(): readonly CaseRecord[] {
    return Object.freeze([...this.caseRecords]);
  }

  collisionHistory(): readonly CaseCollisionDecision[] {
    return Object.freeze([...this.collisionDecisions]);
  }

  private decision(
    decisionId: Uuid,
    collision: CaseCollision,
    input: CollisionResolutionInput,
    resultingCaseId: Uuid,
  ): CaseCollisionDecision {
    return Object.freeze({
      decisionId,
      action: input.action,
      authoritativeCaseId: collision.authoritativeCaseId,
      existingCaseId: collision.existingCase.caseId,
      actor: Object.freeze({ ...input.actor }),
      decidedAt: this.dependencies.clock.now(),
      rationale: input.rationale,
      nonProductionPurpose: input.nonProductionPurpose,
      resultingCaseId,
    });
  }
}

function assertUniqueProductionIdentifiers(cases: readonly CaseRecord[]): void {
  const identifiers = new Set<string>();
  for (const caseRecord of cases) {
    if (
      caseRecord.purpose !== "production" ||
      caseRecord.authoritativeCaseId === null
    ) {
      continue;
    }
    if (identifiers.has(caseRecord.authoritativeCaseId)) {
      throw new Error(
        "Workspace catalog contains duplicate production case identifiers.",
      );
    }
    identifiers.add(caseRecord.authoritativeCaseId);
  }
}

function nonblank(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function failure(
  code: CaseCollisionError["code"],
  safeMessage: string,
): Result<never, CaseCollisionError> {
  return {
    ok: false,
    error: { code, safeMessage, blocksDownstream: true },
  };
}
