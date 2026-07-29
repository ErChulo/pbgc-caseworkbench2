import { hashTyped } from "../../domain/manifests/canonical-json";
import type {
  ScreeningFinding,
  ScreeningResult,
} from "../../domain/quarantine/models";
import { screeningRuleSetVersion } from "../../domain/quarantine/models";
import type { Sha256 } from "../../domain/shared/types";

export interface SensitiveDataContext {
  readonly authorizedRealPii: boolean;
  readonly authorizationVerified?: boolean;
  readonly expectedFields: readonly string[];
  readonly maximumSensitiveMatches: number;
}

const directIdentifierPatterns = [
  { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu },
  { id: "us-ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/gu },
] as const;
const secretPatterns = [
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  },
  { id: "api-token", pattern: /\b(?:sk|ghp)_[A-Za-z0-9_-]{20,}\b/gu },
] as const;

export async function screenSensitiveText(
  text: string,
  artifactSha256: Sha256,
  context: SensitiveDataContext,
): Promise<ScreeningResult> {
  const observations: { kind: string; count: number }[] = [];
  for (const entry of directIdentifierPatterns) {
    observations.push({
      kind: entry.id,
      count: [...text.matchAll(entry.pattern)].length,
    });
  }
  for (const entry of secretPatterns) {
    observations.push({
      kind: entry.id,
      count: [...text.matchAll(entry.pattern)].length,
    });
  }
  const piiCount = observations
    .filter((item) =>
      directIdentifierPatterns.some((entry) => entry.id === item.kind),
    )
    .reduce((total, item) => total + item.count, 0);
  const secretCount = observations
    .filter((item) => secretPatterns.some((entry) => entry.id === item.kind))
    .reduce((total, item) => total + item.count, 0);
  const excessive = piiCount > context.maximumSensitiveMatches;
  const unverifiable = piiCount > 0 && context.authorizationVerified === false;
  const category =
    secretCount > 0
      ? ("secret" as const)
      : context.authorizedRealPii && !excessive && !unverifiable
        ? ("authorized-pii" as const)
        : ("unauthorized-pii" as const);
  const blocked =
    secretCount > 0 ||
    excessive ||
    unverifiable ||
    (!context.authorizedRealPii && piiCount > 0);
  const findingId = await hashTyped(
    {
      artifactSha256,
      category,
      observations,
      ruleSetVersion: screeningRuleSetVersion,
    },
    {},
  );
  const findings: ScreeningFinding[] =
    piiCount === 0 && secretCount === 0
      ? []
      : [
          {
            findingId,
            artifactSha256,
            ruleId: "sensitive-data-patterns",
            ruleVersion: screeningRuleSetVersion,
            category,
            outcome: blocked ? "blocked" : "passed",
            severity: blocked ? "critical" : "informational",
            evidence: [
              ...observations
                .filter((item) => item.count > 0)
                .map((item) => `${item.kind}:${String(item.count)}`),
              ...(unverifiable ? ["authorization:unverifiable"] : []),
              ...(excessive ? ["scope:excessive"] : []),
            ],
            limitations: [
              "Pattern screening cannot prove that content contains no sensitive data.",
            ],
            blocksDownstream: blocked,
          },
        ];
  return Object.freeze({
    artifactSha256,
    findings: Object.freeze(findings),
    provisionalState: blocked ? "provisional-quarantine" : "screening-pending",
    downstreamBlocked: true,
    ruleSetVersion: screeningRuleSetVersion,
  });
}
