import { hashTyped } from "../manifests/canonical-json";
import type { HumanActor } from "../quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type {
  Interpretation,
  ResolutionEvent,
  RuleCitation,
  UnresolvedItem,
} from "./models";
interface UnresolvedDependencies {
  readonly now: () => string;
  readonly uuid: () => string;
}

const systemUnresolvedDependencies: UnresolvedDependencies = {
  now: () => new Date().toISOString(),
  uuid: () => globalThis.crypto.randomUUID(),
};

export type UnresolvedItemKind = UnresolvedItem["kind"];

export interface CreateUnresolvedItemInput {
  readonly kind: UnresolvedItemKind;
  readonly affectedScope: string;
  readonly competingInterpretations: readonly Interpretation[];
  readonly consequence: string;
  readonly reviewer: HumanActor | null;
  readonly assignee?: HumanActor | null;
  readonly linkedUnresolvedItemIds?: readonly string[];
}

type UnresolvedItemDraft = Omit<CreateUnresolvedItemInput, "kind">;
type UnresolvedItemEmitter = (
  draft: UnresolvedItemDraft,
) => CreateUnresolvedItemInput;

const emitter =
  (kind: UnresolvedItemKind): UnresolvedItemEmitter =>
  (draft) => ({ ...draft, kind });

export const unresolvedItemEmitters = Object.freeze({
  "ambiguous-text": emitter("ambiguous-text"),
  "conflicting-provisions": emitter("conflicting-provisions"),
  "missing-sequencing": emitter("missing-sequencing"),
  "undefined-term": emitter("undefined-term"),
  "hidden-content-flag": emitter("hidden-content-flag"),
  "stale-source": emitter("stale-source"),
  "superseded-source": emitter("superseded-source"),
  "missing-required-value": emitter("missing-required-value"),
  "ambiguous-source-role": emitter("ambiguous-source-role"),
  other: emitter("other"),
}) satisfies Readonly<Record<UnresolvedItemKind, UnresolvedItemEmitter>>;

export interface ResolutionResult {
  readonly item: UnresolvedItem;
  readonly branchedItem: UnresolvedItem | null;
}

export async function createUnresolvedItem(
  input: CreateUnresolvedItemInput,
  dependencies: UnresolvedDependencies = systemUnresolvedDependencies,
): Promise<Result<UnresolvedItem, string>> {
  if (
    input.affectedScope.trim() === "" ||
    input.consequence.trim() === "" ||
    input.competingInterpretations.length < 2 ||
    input.competingInterpretations.some(
      (value) => value.statement.trim() === "",
    )
  ) {
    return failure(
      "An unresolved item requires scope, consequence, and at least two interpretations.",
    );
  }
  const itemId = parseUuid(dependencies.uuid());
  const openAt = parseUtcTimestamp(dependencies.now());
  if (!itemId.ok || !openAt.ok)
    return failure(
      "Injected unresolved-item identity or timestamp is invalid.",
    );
  const linkedUnresolvedItemIds: Uuid[] = [];
  for (const linkedId of input.linkedUnresolvedItemIds ?? []) {
    const parsed = parseUuid(linkedId);
    if (!parsed.ok)
      return failure("A linked unresolved-item identity is invalid.");
    linkedUnresolvedItemIds.push(parsed.value);
  }
  const deterministic = {
    kind: input.kind,
    affectedScope: input.affectedScope,
    competingInterpretations: input.competingInterpretations,
    consequence: input.consequence,
    linkedUnresolvedItemIds: linkedUnresolvedItemIds.sort(),
    assignee: input.assignee ?? null,
  };
  const withoutRevisionHash = {
    itemId: itemId.value,
    ...deterministic,
    reviewerHuman: input.reviewer,
    openAt: openAt.value,
    resolutionHistory: [],
    itemContentSha256: await unresolvedItemContentHash(deterministic),
    status: "open" as const,
    revisionOrdinal: 1,
    priorRevisionContentSha256: null,
  };
  return {
    ok: true,
    value: deepFreeze({
      ...withoutRevisionHash,
      revisionContentSha256: await unresolvedRevisionHash(withoutRevisionHash),
    }),
  };
}

export async function resolveItem(
  item: UnresolvedItem,
  decisionType: ResolutionEvent["decisionType"],
  selectedInterpretationId: string | null,
  rationale: string,
  reviewer: HumanActor,
  dependencies: UnresolvedDependencies = systemUnresolvedDependencies,
  consumedAssumptions: readonly string[] = [],
): Promise<Result<ResolutionResult, string>> {
  const replay = await replayResolutionHistory(item);
  if (!replay.ok) return replay;
  if (replay.value !== "open")
    return failure(
      "Only an open unresolved item can receive a resolution event.",
    );
  if (rationale.trim() === "")
    return failure("Resolution rationale is required.");
  const selected =
    selectedInterpretationId === null
      ? null
      : (item.competingInterpretations.find(
          (value) => value.interpretationId === selectedInterpretationId,
        ) ?? null);
  if (
    (decisionType === "accept" || decisionType === "branch") &&
    selected === null
  ) {
    return failure(
      "Accept and branch decisions require a selected interpretation.",
    );
  }
  const eventId = parseUuid(dependencies.uuid());
  const decidedAt = parseUtcTimestamp(dependencies.now());
  if (!eventId.ok || !decidedAt.ok)
    return failure("Injected resolution identity or timestamp is invalid.");
  const prior = item.resolutionHistory.at(-1) ?? null;
  const resultingStatus: UnresolvedItem["status"] =
    decisionType === "supersede" || decisionType === "branch"
      ? "superseded"
      : "resolved";
  const parsedAssumptions: Uuid[] = [];
  for (const assumption of consumedAssumptions) {
    const parsed = parseUuid(assumption);
    if (!parsed.ok)
      return failure("A consumed-assumption identity is invalid.");
    parsedAssumptions.push(parsed.value);
  }
  const eventPayload = {
    appendOrdinal: item.resolutionHistory.length + 1,
    priorEventId: prior?.eventId ?? null,
    priorEventContentSha256: prior?.eventContentSha256 ?? null,
    decisionType,
    resultingStatus,
    selectedInterpretationId: selected?.interpretationId ?? null,
    actor: reviewer,
    rationale,
    consumedAssumptions: parsedAssumptions.sort(),
  } as const;
  const event: ResolutionEvent = deepFreeze({
    eventId: eventId.value,
    ...eventPayload,
    decidedAt: decidedAt.value,
    eventContentSha256: await resolutionEventContentHash(eventPayload),
  });
  const { revisionContentSha256: priorRevisionHash, ...priorRevision } = item;
  const withoutRevisionHash = {
    ...priorRevision,
    resolutionHistory: [...item.resolutionHistory, event],
    status: resultingStatus,
    revisionOrdinal: item.revisionOrdinal + 1,
    priorRevisionContentSha256: priorRevisionHash,
  };
  const resolved: UnresolvedItem = deepFreeze({
    ...withoutRevisionHash,
    revisionContentSha256: await unresolvedRevisionHash(withoutRevisionHash),
  });
  if (decisionType !== "branch") {
    return {
      ok: true,
      value: deepFreeze({ item: resolved, branchedItem: null }),
    };
  }
  if (selected === null)
    return failure("A branch requires a selected interpretation.");
  const branched = await createUnresolvedItem(
    {
      kind: item.kind,
      affectedScope: item.affectedScope,
      competingInterpretations: [
        selected,
        ...item.competingInterpretations.filter(
          (value) => value.interpretationId !== selectedInterpretationId,
        ),
      ],
      consequence: item.consequence,
      reviewer,
      assignee: item.assignee,
      linkedUnresolvedItemIds: [...item.linkedUnresolvedItemIds, item.itemId],
    },
    dependencies,
  );
  return branched.ok
    ? {
        ok: true,
        value: deepFreeze({ item: resolved, branchedItem: branched.value }),
      }
    : branched;
}

export async function replayResolutionHistory(
  item: UnresolvedItem,
): Promise<Result<UnresolvedItem["status"], string>> {
  let status: UnresolvedItem["status"] = "open";
  let prior: ResolutionEvent | null = null;
  for (const [index, event] of item.resolutionHistory.entries()) {
    if (
      event.appendOrdinal !== index + 1 ||
      event.priorEventId !== (prior?.eventId ?? null) ||
      event.priorEventContentSha256 !== (prior?.eventContentSha256 ?? null)
    ) {
      return failure(
        "Resolution history is not gapless and predecessor-bound.",
      );
    }
    const {
      eventId: _id,
      decidedAt: _at,
      eventContentSha256,
      ...payload
    } = event;
    void _id;
    void _at;
    if ((await resolutionEventContentHash(payload)) !== eventContentSha256) {
      return failure("Resolution event content hash is invalid.");
    }
    if (status !== "open")
      return failure("Resolution history continues after a terminal decision.");
    status = event.resultingStatus;
    if (
      (event.decisionType === "accept" || event.decisionType === "reject") !==
        (status === "resolved") ||
      (event.decisionType === "supersede" ||
        event.decisionType === "branch") !==
        (status === "superseded")
    ) {
      return failure("Resolution event transition is invalid.");
    }
    prior = event;
  }
  if (status !== item.status)
    return failure("Stored unresolved-item status does not match replay.");
  return { ok: true, value: status };
}

export async function validateUnresolvedItem(
  item: UnresolvedItem,
): Promise<Result<void, string>> {
  const deterministic = {
    kind: item.kind,
    affectedScope: item.affectedScope,
    competingInterpretations: item.competingInterpretations,
    consequence: item.consequence,
    linkedUnresolvedItemIds: [...item.linkedUnresolvedItemIds].sort(),
    assignee: item.assignee,
  };
  if (
    (await unresolvedItemContentHash(deterministic)) !== item.itemContentSha256
  ) {
    return failure("Unresolved-item content hash is invalid.");
  }
  const { revisionContentSha256, ...withoutRevisionHash } = item;
  if (
    (await unresolvedRevisionHash(withoutRevisionHash)) !==
    revisionContentSha256
  ) {
    return failure("Unresolved-item revision content hash is invalid.");
  }
  const replay = await replayResolutionHistory(item);
  return replay.ok ? { ok: true, value: undefined } : replay;
}

export async function projectLatestUnresolvedItems(
  revisions: readonly UnresolvedItem[],
): Promise<Result<readonly UnresolvedItem[], string>> {
  const latest = new Map<string, UnresolvedItem>();
  for (const revision of revisions) {
    const validation = await validateUnresolvedItem(revision);
    if (!validation.ok) return validation;
    const prior = latest.get(revision.itemId);
    if (prior === undefined) {
      if (
        revision.revisionOrdinal !== 1 ||
        revision.priorRevisionContentSha256 !== null ||
        revision.status !== "open" ||
        revision.resolutionHistory.length !== 0
      ) {
        return failure(
          "Unresolved-item history must begin with an open creation revision.",
        );
      }
    } else if (
      revision.revisionOrdinal !== prior.revisionOrdinal + 1 ||
      revision.priorRevisionContentSha256 !== prior.revisionContentSha256 ||
      revision.itemContentSha256 !== prior.itemContentSha256 ||
      JSON.stringify(revision.resolutionHistory.slice(0, -1)) !==
        JSON.stringify(prior.resolutionHistory) ||
      revision.resolutionHistory.length !== prior.resolutionHistory.length + 1
    ) {
      return failure(
        "Unresolved-item revision does not extend its immediate predecessor.",
      );
    }
    latest.set(revision.itemId, revision);
  }
  return { ok: true, value: deepFreeze([...latest.values()]) };
}

export function hiddenContentUnresolvedInput(
  affectedScope: string,
  citation: RuleCitation,
  reviewer: HumanActor | null,
): CreateUnresolvedItemInput {
  return typedSourceIssue(
    "hidden-content-flag",
    affectedScope,
    citation,
    reviewer,
  );
}

export async function surfaceHiddenContentFlag(
  hiddenContentFlagged: boolean,
  affectedScope: string,
  citation: RuleCitation,
  reviewer: HumanActor | null,
  dependencies: UnresolvedDependencies = systemUnresolvedDependencies,
): Promise<Result<UnresolvedItem | null, string>> {
  if (!hiddenContentFlagged) return { ok: true, value: null };
  return createUnresolvedItem(
    hiddenContentUnresolvedInput(affectedScope, citation, reviewer),
    dependencies,
  );
}

export function staleSourceUnresolvedInput(
  affectedScope: string,
  citation: RuleCitation,
  reviewer: HumanActor | null,
  superseded = false,
): CreateUnresolvedItemInput {
  return typedSourceIssue(
    superseded ? "superseded-source" : "stale-source",
    affectedScope,
    citation,
    reviewer,
  );
}

function typedSourceIssue(
  kind: "hidden-content-flag" | "stale-source" | "superseded-source",
  affectedScope: string,
  citation: RuleCitation,
  reviewer: HumanActor | null,
): CreateUnresolvedItemInput {
  const evidence = [citation];
  return {
    kind,
    affectedScope,
    competingInterpretations: [
      interpretation(
        "00000000-0000-4000-8000-000000000101",
        "The cited source remains applicable after human review.",
        evidence,
      ),
      interpretation(
        "00000000-0000-4000-8000-000000000102",
        "The cited source cannot govern until replaced or re-authorized.",
        evidence,
      ),
    ],
    consequence:
      "Rule authoring and downstream calculations may use non-current or incomplete evidence.",
    reviewer,
  };
}

function interpretation(
  id: string,
  statement: string,
  evidence: readonly RuleCitation[],
): Interpretation {
  const parsed = parseUuid(id);
  if (!parsed.ok)
    throw new Error("Internal synthetic interpretation UUID is invalid.");
  return {
    interpretationId: parsed.value,
    statement,
    evidence,
    sourceCandidateId: null,
  };
}

async function unresolvedItemContentHash(value: object): Promise<Sha256> {
  return sha(
    await hashTyped(value, {
      schemaId: "unresolved-item.schema.json",
      typeName: "UnresolvedItemContent",
    }),
  );
}

async function resolutionEventContentHash(value: object): Promise<Sha256> {
  return sha(
    await hashTyped(value, {
      schemaId: "unresolved-item.schema.json",
      typeName: "ResolutionEventContent",
    }),
  );
}

async function unresolvedRevisionHash(value: object): Promise<Sha256> {
  return sha(
    await hashTyped(value, {
      schemaId: "unresolved-item.schema.json",
      typeName: "UnresolvedItemRevisionContent",
    }),
  );
}

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok)
    throw new Error("Canonical unresolved-item SHA-256 computation failed.");
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
