import type { Sha256 } from "../shared/types";
import type { ScreeningFinding, ScreeningResult } from "./models";
import { isBlockingOutcome, screeningRuleSetVersion } from "./models";

export interface ScreeningCheck {
  readonly checkId: string;
  run(): Promise<readonly ScreeningFinding[]>;
}

export async function runScreening(
  artifactSha256: Sha256,
  checks: readonly ScreeningCheck[],
): Promise<ScreeningResult> {
  const findings: ScreeningFinding[] = [];
  for (const check of checks) {
    try {
      findings.push(...(await check.run()));
    } catch {
      findings.push({
        findingId: `${artifactSha256}:${check.checkId}:error`,
        artifactSha256,
        ruleId: check.checkId,
        ruleVersion: screeningRuleSetVersion,
        category: "unsupported",
        outcome: "error",
        severity: "error",
        evidence: [],
        limitations: ["Screening check failed safely; no pass was inferred."],
        blocksDownstream: true,
      });
    }
  }
  const blocking = findings.some(
    (finding) => finding.blocksDownstream || isBlockingOutcome(finding.outcome),
  );
  return Object.freeze({
    artifactSha256,
    findings: Object.freeze(findings),
    provisionalState: blocking
      ? "provisional-safety-block"
      : "screening-pending",
    downstreamBlocked: true,
    ruleSetVersion: screeningRuleSetVersion,
  });
}

export function derivativesAllowed(result: ScreeningResult): false {
  void result;
  return false;
}
