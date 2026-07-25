import { useEffect, useState } from "react";

import {
  runFeasibilityChecks,
  type FeasibilityResult,
} from "../../spikes/browser-feasibility/run-feasibility";

export function FeasibilityStatus() {
  const [result, setResult] = useState<FeasibilityResult | null>(null);

  useEffect(() => {
    let active = true;
    void runFeasibilityChecks().then((nextResult) => {
      if (active) setResult(nextResult);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!result) {
    return (
      <p className="feasibility" role="status">
        Checking local browser capabilities…
      </p>
    );
  }

  const requiredChecks = [
    result.worker,
    result.wasm,
    result.schema,
    result.asset,
    result.csp,
  ];
  const passed = requiredChecks.every(Boolean);

  return (
    <section
      className="feasibility"
      aria-labelledby="feasibility-title"
      data-feasibility={passed ? "pass" : "fail"}
    >
      <h3 id="feasibility-title">Browser feasibility probe</h3>
      <p>
        Mode: <strong>{result.mode}</strong>. Required inline-runtime checks:{" "}
        <strong>{passed ? "passed" : "blocked"}</strong>.
      </p>
      <dl className="probe-grid">
        {Object.entries(result)
          .filter(
            ([key]) =>
              !["mode", "secureContext", "fileSystemAccess"].includes(key),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value ? "Pass" : "Fail"}</dd>
            </div>
          ))}
      </dl>
      <p className="capability-note">
        Secure context: {result.secureContext ? "yes" : "no"}; File System
        Access API: {result.fileSystemAccess ? "available" : "unavailable"}.
      </p>
    </section>
  );
}
