import { useEffect, useState } from "react";

import {
  runFeasibilityChecks,
  type FeasibilityResult,
} from "../../spikes/browser-feasibility/run-feasibility";

export function FeasibilityStatus() {
  const [result, setResult] = useState<FeasibilityResult | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        Checking browser compatibility…
      </p>
    );
  }

  const requiredChecks = [result.wasm, result.schema, result.asset, result.csp];
  const passed = requiredChecks.every(Boolean);

  return (
    <section
      className="feasibility"
      aria-labelledby="feasibility-title"
      data-feasibility={passed ? "pass" : "fail"}
    >
      <p>
        Browser:{" "}
        <strong>{passed ? "Compatible" : "Not fully compatible"}</strong>
        {result.mode === "direct-file" ? " (direct file)" : ""}
        {!result.fileSystemAccess && " (limited mode)"}
      </p>
      <button
        type="button"
        className="feasibility-toggle"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        {expanded ? "Hide" : "Show"} technical details
      </button>
      {expanded && (
        <div className="feasibility-details">
          <h3 id="feasibility-title">Browser compatibility details</h3>
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
            Mode:{" "}
            {result.mode === "direct-file" ? "direct file" : "static origin"};
            Secure context: {result.secureContext ? "yes" : "no"}; File System
            Access API: {result.fileSystemAccess ? "available" : "unavailable"}.
          </p>
        </div>
      )}
    </section>
  );
}
