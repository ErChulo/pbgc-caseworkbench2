import { hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import {
  classificationRuleSetVersion,
  type DateCandidate,
  type DateSelectionDecision,
} from "./models";
import type { Result } from "../shared/types";

const patterns = [
  {
    convention: "YYYY-MM-DD" as const,
    pattern: /\b(\d{4}-\d{2}-\d{2})\b/gu,
    normalize: (value: string) => value,
  },
  {
    convention: "MM/DD/YYYY" as const,
    pattern: /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/gu,
    normalize: (value: string) => {
      const [month, day, year] = value.split("/");
      return `${year ?? ""}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`;
    },
  },
  {
    convention: "Month D, YYYY" as const,
    pattern:
      /\b((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})\b/giu,
    normalize: (value: string) => {
      const date = new Date(`${value} 00:00:00 UTC`);
      return Number.isNaN(date.valueOf())
        ? null
        : date.toISOString().slice(0, 10);
    },
  },
] as const;

export async function extractDateCandidates(
  artifactSha256: Sha256,
  text: string,
  locatorPrefix = "passive-text",
): Promise<readonly DateCandidate[]> {
  const candidates: DateCandidate[] = [];
  for (const entry of patterns) {
    for (const match of text.matchAll(entry.pattern)) {
      const rawValue = match[1];
      if (rawValue === undefined) continue;
      const normalizedValue = entry.normalize(rawValue);
      const valid = normalizedValue !== null && isCalendarDate(normalizedValue);
      const core = {
        artifactSha256,
        dateKind: inferDateKind(
          text.slice(Math.max(0, match.index - 40), match.index),
        ),
        rawValue,
        normalizedValue: valid ? normalizedValue : null,
        convention: entry.convention,
        valid,
        sourceLocator: `${locatorPrefix}:offset=${String(match.index)}`,
        status: valid ? "proposed" : "unresolved",
        ruleSetVersion: classificationRuleSetVersion,
      } as const;
      candidates.push({ ...core, candidateKey: await key(core) });
    }
  }
  return Object.freeze(
    candidates.sort((left, right) =>
      left.sourceLocator.localeCompare(right.sourceLocator),
    ),
  );
}

export function conflictingDateCandidates(
  candidates: readonly DateCandidate[],
): boolean {
  return (
    new Set(
      candidates
        .filter(
          (
            item,
          ): item is DateCandidate & { readonly normalizedValue: string } =>
            item.valid && item.normalizedValue !== null,
        )
        .map((item) => `${item.dateKind}:${item.normalizedValue}`),
    ).size > 1
  );
}

export function validateDateSelection(
  candidates: readonly DateCandidate[],
  decision: DateSelectionDecision,
): Result<
  DateCandidate,
  { readonly code: "INVALID_SELECTION"; readonly safeMessage: string }
> {
  if ((decision.actor as { actorType?: unknown }).actorType !== "human")
    return invalidSelection("Date selection requires a human actor.");
  const matches = candidates.filter(
    (candidate) =>
      candidate.candidateKey === decision.selectedCandidateKey &&
      candidate.artifactSha256 === decision.artifactSha256,
  );
  const selected = matches[0];
  if (matches.length !== 1 || !selected?.valid)
    return invalidSelection(
      "Selected date must resolve to one valid same-artifact candidate.",
    );
  return { ok: true, value: selected };
}

function inferDateKind(context: string): DateCandidate["dateKind"] {
  if (/effective/iu.test(context)) return "effective-date";
  if (/adopted?/iu.test(context)) return "adoption-date";
  if (/executed?|signed/iu.test(context)) return "execution-date";
  if (/issued?/iu.test(context)) return "issue-date";
  return "unknown";
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

async function key(value: object): Promise<string> {
  const parsed = parseSha256(await hashTyped(value, {}));
  if (!parsed.ok) throw new Error("Date-candidate hash failed.");
  return parsed.value;
}

function invalidSelection(
  safeMessage: string,
): Result<
  never,
  { readonly code: "INVALID_SELECTION"; readonly safeMessage: string }
> {
  return { ok: false, error: { code: "INVALID_SELECTION", safeMessage } };
}
