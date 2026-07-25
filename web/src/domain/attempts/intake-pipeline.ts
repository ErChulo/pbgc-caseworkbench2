import type { ArtifactRecord } from "../artifacts/models";
import type { ScreeningResult } from "../quarantine/models";

export interface IntakeStageEvent {
  readonly artifactId: ArtifactRecord["artifactId"];
  readonly stage:
    "discovered" | "hashed" | "preserved" | "screened" | "extracted" | "failed";
  readonly message: string;
}

export interface ScreenedArtifactOutcome {
  readonly artifact: ArtifactRecord;
  readonly screening: ScreeningResult;
  readonly passiveExtractionAttempted: boolean;
  readonly downstreamBlocked: true;
}

export async function runScreenedArtifactPipeline(
  artifacts: readonly ArtifactRecord[],
  screen: (artifact: ArtifactRecord) => Promise<ScreeningResult>,
  inspectPassively: (artifact: ArtifactRecord) => Promise<void>,
  signal?: AbortSignal,
): Promise<readonly ScreenedArtifactOutcome[]> {
  const outcomes: ScreenedArtifactOutcome[] = [];
  for (const artifact of artifacts) {
    if (signal?.aborted === true) break;
    const screening = await screen(artifact);
    const blocked =
      screening.provisionalState === "provisional-quarantine" ||
      screening.provisionalState === "provisional-safety-block" ||
      screening.provisionalState === "rescreen-required";
    if (!blocked) await inspectPassively(artifact);
    outcomes.push(
      Object.freeze({
        artifact,
        screening,
        passiveExtractionAttempted: !blocked,
        downstreamBlocked: true,
      }),
    );
  }
  return Object.freeze(outcomes);
}

export interface IntakePipelineOutcome {
  readonly artifacts: readonly ArtifactRecord[];
  readonly events: readonly IntakeStageEvent[];
  readonly status: "completed" | "partial" | "interrupted";
  readonly downstreamBlocked: true;
  readonly governedState: "provisional";
}

export async function runArtifactPipeline(
  artifacts: readonly ArtifactRecord[],
  process: (artifact: ArtifactRecord) => Promise<readonly IntakeStageEvent[]>,
  signal?: AbortSignal,
  persistEvent?: (event: IntakeStageEvent) => Promise<void>,
): Promise<IntakePipelineOutcome> {
  const events: IntakeStageEvent[] = [];
  let failures = 0;
  for (const artifact of artifacts) {
    if (signal?.aborted === true) {
      return freezeOutcome(artifacts, events, "interrupted");
    }
    try {
      const nextEvents = await process(artifact);
      for (const event of nextEvents) {
        await persistEvent?.(event);
        events.push(event);
      }
    } catch {
      failures += 1;
      const failureEvent = Object.freeze({
        artifactId: artifact.artifactId,
        stage: "failed" as const,
        message: "Artifact processing failed safely.",
      });
      await persistEvent?.(failureEvent);
      events.push(failureEvent);
    }
  }
  return freezeOutcome(
    artifacts,
    events,
    failures === 0 ? "completed" : "partial",
  );
}

function freezeOutcome(
  artifacts: readonly ArtifactRecord[],
  events: readonly IntakeStageEvent[],
  status: IntakePipelineOutcome["status"],
): IntakePipelineOutcome {
  return Object.freeze({
    artifacts: Object.freeze([...artifacts]),
    events: Object.freeze([...events]),
    status,
    downstreamBlocked: true,
    governedState: "provisional",
  });
}
