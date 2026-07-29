import { hashTyped } from "../../domain/manifests/canonical-json";
import type { ScreeningFinding } from "../../domain/quarantine/models";
import { screeningRuleSetVersion } from "../../domain/quarantine/models";
import type { Sha256 } from "../../domain/shared/types";

const signatures = [
  {
    bytes: [0x4d, 0x5a],
    category: "executable" as const,
    media: "application/x-dosexec",
  },
  {
    bytes: [0x7f, 0x45, 0x4c, 0x46],
    category: "executable" as const,
    media: "application/x-elf",
  },
  {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    category: "other" as const,
    media: "application/zip",
  },
  {
    bytes: [0x25, 0x50, 0x44, 0x46],
    category: "other" as const,
    media: "application/pdf",
  },
] as const;

export async function screenBinaryRisk(
  bytes: Uint8Array,
  artifactSha256: Sha256,
  declaredMediaType: string | null,
  filename = "",
): Promise<{
  readonly detectedMediaType: string | null;
  readonly findings: readonly ScreeningFinding[];
}> {
  const match = signatures.find((entry) =>
    entry.bytes.every((value, index) => bytes[index] === value),
  );
  const findings: ScreeningFinding[] = [];
  if (match?.category === "executable") {
    findings.push(
      await finding(
        artifactSha256,
        "executable-signature",
        "executable",
        "critical",
        [match.media],
      ),
    );
  }
  if (/\.(?:bat|cmd|js|mjs|ps1|sh|vbs)$/iu.test(filename)) {
    findings.push(
      await finding(
        artifactSha256,
        "script-capable-extension",
        "executable",
        "critical",
        [`filename:${filename.normalize("NFC")}`],
      ),
    );
  }
  if (
    match &&
    declaredMediaType &&
    declaredMediaType !== "application/octet-stream" &&
    declaredMediaType !== match.media
  ) {
    findings.push(
      await finding(
        artifactSha256,
        "media-signature-mismatch",
        "media-mismatch",
        "error",
        [`declared:${declaredMediaType}`, `detected:${match.media}`],
      ),
    );
  }
  return Object.freeze({
    detectedMediaType: match?.media ?? null,
    findings: Object.freeze(findings),
  });
}

async function finding(
  artifactSha256: Sha256,
  ruleId: string,
  category: ScreeningFinding["category"],
  severity: ScreeningFinding["severity"],
  evidence: readonly string[],
): Promise<ScreeningFinding> {
  return Object.freeze({
    findingId: await hashTyped(
      {
        artifactSha256,
        ruleId,
        evidence,
        ruleSetVersion: screeningRuleSetVersion,
      },
      {},
    ),
    artifactSha256,
    ruleId,
    ruleVersion: screeningRuleSetVersion,
    category,
    outcome: "blocked",
    severity,
    evidence: Object.freeze([...evidence]),
    limitations: Object.freeze([
      "Signature screening detects known structures and is not an antivirus claim.",
    ]),
    blocksDownstream: true,
  });
}
