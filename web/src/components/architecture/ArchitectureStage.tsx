import { useMemo, useState } from "react";

export interface ArchitectureSelection {
  readonly scenarioIds: readonly string[];
  readonly tabNames: readonly string[];
  readonly reviewer: string;
  readonly rationale: string;
}

export interface ArchitectureStageProps {
  readonly enabled: boolean;
  readonly scenarioOptions: readonly string[];
  readonly tabOptions: readonly string[];
  readonly message: string | null;
  readonly selection: ArchitectureSelection | null;
  readonly onApprove: (selection: ArchitectureSelection) => Promise<void>;
}

export function ArchitectureStage({
  enabled,
  scenarioOptions,
  tabOptions,
  message,
  selection,
  onApprove,
}: ArchitectureStageProps) {
  const [scenarios, setScenarios] = useState<readonly string[]>([]);
  const [tabs, setTabs] = useState<readonly string[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedScenarioSet = useMemo(() => new Set(scenarios), [scenarios]);
  const selectedTabSet = useMemo(() => new Set(tabs), [tabs]);

  const toggle = (
    value: string,
    current: readonly string[],
    setCurrent: (next: readonly string[]) => void,
  ) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setCurrent([...next].sort());
  };

  const approve = async () => {
    setBusy(true);
    try {
      await onApprove({
        scenarioIds: [...scenarios].sort(),
        tabNames: [...tabs].sort(),
        reviewer: reviewer.trim(),
        rationale: rationale.trim(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="case-panel" aria-labelledby="architecture-stage-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">Governed V1 engine design</p>
          <h2 id="architecture-stage-title">Architecture selection</h2>
        </div>
        <span className="status-chip status-chip-warning">
          Human approval required
        </span>
      </div>
      <p>
        Select the scenarios and population tabs that will be used to construct
        the V1 calculation engine. Reference matches remain proposals only.
      </p>
      <fieldset disabled={!enabled || busy}>
        <legend>Calculation scenarios</legend>
        {scenarioOptions.length === 0 ? <p>No governed scenarios are available.</p> : null}
        {scenarioOptions.map((value) => (
          <label key={value} className="checkbox-row">
            <input
              type="checkbox"
              checked={selectedScenarioSet.has(value)}
              onChange={() => {
                toggle(value, scenarios, setScenarios);
              }}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={!enabled || busy}>
        <legend>Source tabs</legend>
        {tabOptions.length === 0 ? <p>No approved population tabs are available.</p> : null}
        {tabOptions.map((value) => (
          <label key={value} className="checkbox-row">
            <input
              type="checkbox"
              checked={selectedTabSet.has(value)}
              onChange={() => {
                toggle(value, tabs, setTabs);
              }}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <label>
        Reviewer
        <input
          value={reviewer}
          onChange={(event) => {
            setReviewer(event.currentTarget.value);
          }}
          disabled={!enabled || busy}
        />
      </label>
      <label>
        Approval rationale
        <textarea
          value={rationale}
          onChange={(event) => {
            setRationale(event.currentTarget.value);
          }}
          disabled={!enabled || busy}
          rows={3}
        />
      </label>
      <button
        type="button"
        className="button button-primary"
        disabled={!enabled || busy || scenarios.length === 0 || tabs.length === 0 || reviewer.trim() === "" || rationale.trim() === ""}
        onClick={() => void approve()}
      >
        Approve architecture selection
      </button>
      {!enabled ? <p className="form-message form-message-warning">Create or resume a case before selecting architecture.</p> : null}
      {message !== null ? <p className="notice" role="status">{message}</p> : null}
      {selection !== null ? (
        <div className="case-output-linked-artifacts">
          <h3>Governed selection</h3>
          <p>Scenarios: {selection.scenarioIds.join(", ")}</p>
          <p>Tabs: {selection.tabNames.join(", ")}</p>
          <p>Approved by {selection.reviewer}</p>
        </div>
      ) : null}
    </section>
  );
}
