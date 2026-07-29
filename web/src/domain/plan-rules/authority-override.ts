import type { EvidenceCatalog, SourceRole } from "../evidence/models";
import {
  defaultAuthorityOrder,
  requiresAuthorityOverride,
} from "../evidence/source-roles";
import { canonicalize, hashTyped } from "../manifests/canonical-json";
import type { HumanActor } from "../quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
} from "../shared/types";
import type { AuthorityOverride, OverrideSupersessionLink } from "./models";

interface OverrideDependencies {
  readonly now: () => string;
  readonly uuid: () => string;
}

const systemOverrideDependencies: OverrideDependencies = {
  now: () => new Date().toISOString(),
  uuid: () => globalThis.crypto.randomUUID(),
};

export interface AuthorityOverrideInput {
  readonly overrideId: string;
  readonly caseId: string;
  readonly affectedRuleScope: string;
  readonly authorizedSourceRole: SourceRole;
  readonly authorizedArtifactSha256: string;
  readonly scopeRationale: string;
  readonly issuer: HumanActor;
  readonly issuedAt: string;
  readonly supersessionChain?: readonly OverrideSupersessionLink[];
}

export async function createAuthorityOverride(
  input: AuthorityOverrideInput,
): Promise<Result<AuthorityOverride, string>> {
  if (
    input.affectedRuleScope.trim() === "" ||
    input.scopeRationale.trim() === ""
  ) {
    return failure("Override scope and rationale are required.");
  }
  const overrideId = parseUuid(input.overrideId);
  const caseId = parseUuid(input.caseId);
  const artifactSha256 = parseSha256(input.authorizedArtifactSha256);
  const issuedAt = parseUtcTimestamp(input.issuedAt);
  if (!overrideId.ok || !caseId.ok || !artifactSha256.ok || !issuedAt.ok) {
    return failure(
      "Override identity, artifact hash, or timestamp is invalid.",
    );
  }
  const withoutHash = {
    overrideId: overrideId.value,
    caseId: caseId.value,
    affectedRuleScope: input.affectedRuleScope,
    authorizedSourceRole: input.authorizedSourceRole,
    authorizedArtifactSha256: artifactSha256.value,
    scopeRationale: input.scopeRationale,
    defaultAuthorityOrder: defaultAuthorityOrder(),
    issuer: input.issuer,
    issuedAt: issuedAt.value,
    supersessionChain: [...(input.supersessionChain ?? [])].sort(
      (left, right) => left.ordinal - right.ordinal,
    ),
    schemaVersion: "1.0.0" as const,
  };
  return {
    ok: true,
    value: deepFreeze({
      ...withoutHash,
      overrideContentSha256: await overrideContentHash(withoutHash),
    }),
  };
}

export async function issueOverride(
  caseId: string,
  affectedRuleScope: string,
  authorizedSourceRole: SourceRole,
  authorizedArtifactSha256: string,
  rationale: string,
  issuer: HumanActor,
  dependencies: OverrideDependencies = systemOverrideDependencies,
): Promise<Result<AuthorityOverride, string>> {
  return createAuthorityOverride({
    overrideId: dependencies.uuid(),
    caseId,
    affectedRuleScope,
    authorizedSourceRole,
    authorizedArtifactSha256,
    scopeRationale: rationale,
    issuer,
    issuedAt: dependencies.now(),
  });
}

export async function validateAuthorityOverride(
  override: AuthorityOverride,
): Promise<Result<void, string>> {
  if (
    canonicalize(override.defaultAuthorityOrder) !==
    canonicalize(defaultAuthorityOrder())
  ) {
    return failure(
      "Authority override records a nonconstitutional authority order.",
    );
  }
  for (let index = 0; index < override.supersessionChain.length; index += 1) {
    const link = override.supersessionChain[index];
    if (
      link?.ordinal !== index + 1 ||
      (link.priorOverrideId === null) !==
        (link.priorOverrideContentSha256 === null)
    ) {
      return failure("Authority override replay chain is invalid.");
    }
  }
  const { overrideContentSha256, ...withoutHash } = override;
  if ((await overrideContentHash(withoutHash)) !== overrideContentSha256) {
    return failure("Authority override content hash is invalid.");
  }
  return { ok: true, value: undefined };
}

export async function effectiveAuthorityOverrides(
  overrides: readonly AuthorityOverride[],
  catalog: EvidenceCatalog,
): Promise<Result<readonly AuthorityOverride[], string>> {
  const byId = new Map(overrides.map((value) => [value.overrideId, value]));
  if (byId.size !== overrides.length)
    return failure("Authority override identities must be unique.");
  const superseded = new Set<string>();
  const successorByPrior = new Map<string, string>();
  for (const override of overrides) {
    const validation = await validateAuthorityOverride(override);
    if (!validation.ok) return validation;
    if (override.caseId !== catalog.caseId)
      return failure("Authority override belongs to a different case.");
    const artifacts = [
      ...catalog.caseEvidence,
      ...catalog.referenceOnly,
    ].filter(
      (artifact) => artifact.sha256 === override.authorizedArtifactSha256,
    );
    if (
      artifacts.length !== 1 ||
      artifacts[0]?.sourceRole !== override.authorizedSourceRole ||
      artifacts[0].reviewStatus !== "released"
    ) {
      return failure(
        "Authority override does not bind one released catalog artifact and role.",
      );
    }
    const latest = override.supersessionChain.at(-1);
    if (latest?.priorOverrideId != null) {
      const prior = byId.get(latest.priorOverrideId);
      if (
        prior?.overrideContentSha256 !== latest.priorOverrideContentSha256 ||
        prior.caseId !== override.caseId ||
        prior.affectedRuleScope !== override.affectedRuleScope ||
        override.issuedAt <= prior.issuedAt ||
        canonicalize(override.supersessionChain.slice(0, -1)) !==
          canonicalize(prior.supersessionChain)
      ) {
        return failure(
          "Authority override does not preserve its hash-bound predecessor chain.",
        );
      }
      if (successorByPrior.has(prior.overrideId)) {
        return failure(
          "Authority override history branches from one predecessor.",
        );
      }
      successorByPrior.set(prior.overrideId, override.overrideId);
      superseded.add(prior.overrideId);
    }
  }
  return {
    ok: true,
    value: deepFreeze(
      overrides.filter(
        (override) =>
          !superseded.has(override.overrideId) &&
          override.supersessionChain.at(-1)?.linkType !== "repeal",
      ),
    ),
  };
}

export function validateAuthorityOverrideRequired(
  sourceRole: SourceRole,
): boolean {
  return requiresAuthorityOverride(sourceRole);
}

async function overrideContentHash(
  value: Omit<AuthorityOverride, "overrideContentSha256">,
): Promise<Sha256> {
  const parsed = parseSha256(
    await hashTyped(value, {
      schemaId: "authority-override.schema.json",
      typeName: "AuthorityOverrideContent",
    }),
  );
  if (!parsed.ok)
    throw new Error("Canonical authority override SHA-256 failed.");
  return parsed.value;
}

function failure(error: string): Result<never, string> {
  return { ok: false, error };
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
