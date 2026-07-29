import type { ClockPort, UuidPort } from "../ports";
import type { IntakeAttempt, PackageSnapshot } from "./models";
import { compareSnapshots } from "./snapshot";

export function planResume(
  prior: IntakeAttempt,
  priorSnapshot: PackageSnapshot,
  currentSnapshot: PackageSnapshot,
  dependencies: { readonly uuid: UuidPort; readonly clock: ClockPort },
):
  | { readonly kind: "resume"; readonly attempt: IntakeAttempt }
  | { readonly kind: "linked"; readonly attempt: IntakeAttempt } {
  const difference = compareSnapshots(priorSnapshot, currentSnapshot);
  if (difference === "unchanged" && prior.status === "interrupted") {
    return { kind: "resume", attempt: prior };
  }
  return {
    kind: "linked",
    attempt: Object.freeze({
      ...prior,
      attemptId: dependencies.uuid.generate(),
      priorAttemptId: prior.attemptId,
      divergenceReason: difference,
      startedAt: dependencies.clock.now(),
      endedAt: null,
      snapshotId: currentSnapshot.snapshotId,
      snapshotRecordId: currentSnapshot.snapshotRecordId,
      status: "discovering",
      statusHistory: Object.freeze([]),
    }),
  };
}
