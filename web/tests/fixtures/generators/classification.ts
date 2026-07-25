import { parseSha256, type Sha256 } from "../../../src/domain/shared/types";

export interface SyntheticClassificationArtifact {
  readonly name: string;
  readonly filename: string;
  readonly sha256: Sha256;
  readonly artifactSha256: Sha256;
  readonly mediaType: string;
  readonly text: string;
}

const sha = (character: string): Sha256 => {
  const parsed = parseSha256(character.repeat(64));
  if (!parsed.ok) throw new Error("Synthetic fixture SHA-256 is invalid.");
  return parsed.value;
};

export function syntheticClassificationArtifacts(): readonly SyntheticClassificationArtifact[] {
  return Object.freeze(
    [
      {
        name: "synthetic-plan.txt",
        sha256: sha("a"),
        mediaType: "text/plain",
        text: "Executed Defined Benefit Plan Document. Effective 2020-01-01.",
      },
      {
        name: "synthetic-plan-copy.txt",
        sha256: sha("a"),
        mediaType: "text/plain",
        text: "Executed Defined Benefit Plan Document. Effective 2020-01-01.",
      },
      {
        name: "synthetic-plan-near-copy.txt",
        sha256: sha("b"),
        mediaType: "text/plain",
        text: "Executed defined benefit plan document effective 2020-01-01 with formatting change.",
      },
      {
        name: "synthetic-amendment.txt",
        sha256: sha("c"),
        mediaType: "text/plain",
        text: "First Amendment. The plan is hereby amended effective 2021-02-01 and adopted 02/15/2021.",
      },
      {
        name: "synthetic-conflicting-dates.txt",
        sha256: sha("d"),
        mediaType: "text/plain",
        text: "Effective 2020-01-01. Effective 2020-02-01.",
      },
      {
        name: "synthetic-training-sample.txt",
        sha256: sha("e"),
        mediaType: "text/plain",
        text: "Training sample and illustrative example only.",
      },
    ].map((item) => ({
      ...item,
      filename: item.name,
      artifactSha256: item.sha256,
    })),
  );
}

export function classificationFixture(
  index: number,
): SyntheticClassificationArtifact {
  const fixture = syntheticClassificationArtifacts()[index];
  if (fixture === undefined) throw new Error("Synthetic fixture is missing.");
  return fixture;
}
