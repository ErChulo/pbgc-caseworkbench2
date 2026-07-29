import type {
  EvidenceArtifact,
  EvidenceCatalog,
  SourceRole,
} from "../evidence/models";
import { authorityRankOf, hasHigherAuthority } from "../evidence/source-roles";
import type { HumanActor } from "../quarantine/models";
import { canonicalize } from "../manifests/canonical-json";
import type { Result } from "../shared/types";
import type {
  AuthorityOverride,
  PlanRuleRecord,
  RuleCitation,
  UnresolvedItem,
} from "./models";
import type { GovernanceDependencies } from "./rule-authoring";
import {
  systemGovernanceDependencies,
  validateRuleGovernance,
} from "./rule-authoring";
import {
  createUnresolvedItem,
  staleSourceUnresolvedInput,
} from "./unresolved-items";

export interface AuthorityQuerySource {
  readonly artifact: EvidenceArtifact;
  readonly supersededOn: string | null;
}

export interface AuthorityQuery {
  readonly ruleId: PlanRuleRecord["ruleId"];
  readonly sourceHash: RuleCitation["artifactSha256"];
  readonly locator: string;
  readonly sourceRole: SourceRole;
  readonly confidence: number;
  readonly supersessionStatus: "current" | "superseded";
  readonly reviewStatus: EvidenceArtifact["reviewStatus"];
  readonly unresolvedItems: readonly UnresolvedItem[];
}

export interface ReauthoringProposal {
  readonly action: "retain" | "propose-re-authoring";
  readonly predecessorRuleId: PlanRuleRecord["ruleId"];
  readonly predecessorRuleContentSha256: PlanRuleRecord["ruleContentSha256"];
  readonly proposedPrimaryCitation: RuleCitation;
  readonly reason: string;
}

export async function queryAuthority(
  ruleId: string,
  rules: readonly PlanRuleRecord[],
  sources: readonly AuthorityQuerySource[],
  reviewer: HumanActor | null,
  dependencies: GovernanceDependencies = systemGovernanceDependencies,
): Promise<Result<AuthorityQuery, string>> {
  const rule = rules.find((value) => value.ruleId === ruleId);
  if (rule === undefined) return failure("Plan rule was not found.");
  const source = sources.find(
    (value) => value.artifact.sha256 === rule.primaryCitation.artifactSha256,
  );
  if (source === undefined)
    return failure(
      "The primary citation does not resolve to one evidence artifact.",
    );
  const observedAt = dependencies.now();
  const superseded =
    source.supersededOn !== null &&
    source.supersededOn <= observedAt.slice(0, 10);
  const stale = source.artifact.reviewStatus === "stale";
  const unresolvedItems: UnresolvedItem[] = [];
  if (stale || superseded) {
    const unresolved = await createUnresolvedItem(
      staleSourceUnresolvedInput(
        `rule/${rule.ruleId}`,
        rule.primaryCitation,
        reviewer,
        superseded,
      ),
      { ...dependencies, now: () => observedAt },
    );
    if (!unresolved.ok) return unresolved;
    unresolvedItems.push(unresolved.value);
  }
  return {
    ok: true,
    value: Object.freeze({
      ruleId: rule.ruleId,
      sourceHash: source.artifact.sha256,
      locator: rule.primaryCitation.citationLocator,
      sourceRole: source.artifact.sourceRole,
      confidence: rule.confidence,
      supersessionStatus: superseded ? "superseded" : "current",
      reviewStatus: source.artifact.reviewStatus,
      unresolvedItems: Object.freeze(unresolvedItems),
    }),
  };
}

export function checkAuthorityOrder(
  rule: PlanRuleRecord,
  newSource: RuleCitation,
): ReauthoringProposal {
  const higher = hasHigherAuthority(
    rule.primaryCitation.sourceRole,
    newSource.sourceRole,
  );
  return Object.freeze({
    action: higher ? "propose-re-authoring" : "retain",
    predecessorRuleId: rule.ruleId,
    predecessorRuleContentSha256: rule.ruleContentSha256,
    proposedPrimaryCitation: newSource,
    reason: higher
      ? "A higher-authority source requires a new immutable re-authoring record."
      : "The candidate source does not outrank the current primary citation.",
  });
}

export function enforceAuthorityOrder(
  rule: PlanRuleRecord,
  overrides: readonly AuthorityOverride[],
  catalog: EvidenceCatalog,
): Promise<Result<void, string>> {
  return validateRuleGovernance(rule, catalog, overrides);
}

export function getSupersessionChain(
  rules: readonly PlanRuleRecord[],
  ruleId: string,
): Result<readonly PlanRuleRecord[], string> {
  const byId = new Map<string, PlanRuleRecord>(
    rules.map((rule) => [rule.ruleId, rule]),
  );
  if (byId.size !== rules.length)
    return failure(
      "Duplicate rule identities make the supersession graph ambiguous.",
    );
  if (!byId.has(ruleId)) return failure("Plan rule was not found.");
  const edges = new Map<string, string[]>();
  const undirected = new Map<string, Set<string>>();
  const linkedPairs: (readonly [PlanRuleRecord, PlanRuleRecord])[] = [];
  for (const rule of rules) {
    const link = rule.supersessionChain.at(-1);
    if (link?.predecessorRuleId == null) continue;
    const predecessor = byId.get(link.predecessorRuleId);
    if (predecessor?.ruleContentSha256 !== link.predecessorRuleContentSha256) {
      return failure(
        "A supersession link does not bind to its immutable predecessor.",
      );
    }
    linkedPairs.push([predecessor, rule]);
    const successors = edges.get(predecessor.ruleId) ?? [];
    if (successors.length > 0) {
      return failure("Supersession history branches from one predecessor.");
    }
    successors.push(rule.ruleId);
    edges.set(predecessor.ruleId, successors);
    addNeighbor(undirected, predecessor.ruleId, rule.ruleId);
    addNeighbor(undirected, rule.ruleId, predecessor.ruleId);
  }
  if (
    hasCycle(
      edges,
      rules.map((rule) => rule.ruleId),
    )
  ) {
    return failure("The supersession graph contains a cycle.");
  }
  const rootCountByScope = new Map<string, number>();
  for (const rule of rules) {
    if (rule.supersessionChain.at(-1)?.predecessorRuleId != null) continue;
    const count = (rootCountByScope.get(rule.affectedScope) ?? 0) + 1;
    if (count > 1) {
      return failure(
        "More than one supersession root governs the same affected scope.",
      );
    }
    rootCountByScope.set(rule.affectedScope, count);
  }
  for (const [predecessor, successor] of linkedPairs) {
    const link = successor.supersessionChain.at(-1);
    if (
      link === undefined ||
      successor.affectedScope !== predecessor.affectedScope ||
      link.effectiveDate !== successor.effectiveDate ||
      successor.effectiveDate <= predecessor.effectiveDate ||
      (predecessor.endDate !== null &&
        predecessor.endDate > successor.effectiveDate)
    ) {
      return failure(
        "Supersession dates or scope overlap and do not form one strict effective chain.",
      );
    }
    if (
      canonicalize(successor.supersessionChain.slice(0, -1)) !==
      canonicalize(predecessor.supersessionChain)
    ) {
      return failure(
        "A successor does not preserve its predecessor's gapless chain.",
      );
    }
  }
  const component = new Set<string>();
  const pending = [ruleId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (component.has(current)) continue;
    component.add(current);
    pending.push(...(undirected.get(current) ?? []));
  }
  return {
    ok: true,
    value: Object.freeze(
      rules
        .filter((rule) => component.has(rule.ruleId))
        .sort(
          (left, right) =>
            left.effectiveDate.localeCompare(right.effectiveDate) ||
            left.ruleId.localeCompare(right.ruleId),
        ),
    ),
  };
}

export function queryEffectiveRule(
  chain: readonly PlanRuleRecord[],
  asOfDate: string,
): Result<PlanRuleRecord, string> {
  if (!validDate(asOfDate))
    return failure("Effective-date query is not a real ISO date.");
  const ordered = [...chain].sort((left, right) =>
    left.effectiveDate.localeCompare(right.effectiveDate),
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (
      current === undefined ||
      (next !== undefined &&
        (current.effectiveDate >= next.effectiveDate ||
          current.affectedScope !== next.affectedScope ||
          (current.endDate !== null && current.endDate > next.effectiveDate)))
    ) {
      return failure("Effective rule chain is overlapping or ambiguous.");
    }
  }
  const applicable = ordered.filter((rule, index) => {
    const nextDate = ordered[index + 1]?.effectiveDate ?? null;
    const end =
      rule.endDate === null
        ? nextDate
        : nextDate === null || rule.endDate < nextDate
          ? rule.endDate
          : nextDate;
    return rule.effectiveDate <= asOfDate && (end === null || asOfDate < end);
  });
  if (applicable.length > 1)
    return failure("More than one rule applies on the requested date.");
  return applicable[0] === undefined
    ? failure("No rule in the chain applies on the requested effective date.")
    : { ok: true, value: applicable[0] };
}

export function getHighestAuthorityRole(
  roles: readonly SourceRole[],
): SourceRole | null {
  return (
    [...roles].sort((a, b) => authorityRankOf(a) - authorityRankOf(b))[0] ??
    null
  );
}

export function sortRolesByAuthority(
  roles: readonly SourceRole[],
): readonly SourceRole[] {
  return [...roles].sort((a, b) => authorityRankOf(a) - authorityRankOf(b));
}

function hasCycle(
  edges: ReadonlyMap<string, readonly string[]>,
  nodes: readonly string[],
): boolean {
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (node: string): boolean => {
    if (active.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    active.add(node);
    for (const successor of edges.get(node) ?? [])
      if (visit(successor)) return true;
    active.delete(node);
    return false;
  };
  return nodes.some(visit);
}

function addNeighbor(
  map: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  const values = map.get(from) ?? new Set<string>();
  values.add(to);
  map.set(from, values);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function failure(error: string): Result<never, string> {
  return { ok: false, error };
}
