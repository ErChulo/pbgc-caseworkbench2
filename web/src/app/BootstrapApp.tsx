import { FeasibilityStatus } from "../components/FeasibilityStatus";
import { HelpPanel } from "../components/HelpPanel";

const setupChecks = [
  ["Distribution", "Single HTML target"],
  ["Data boundary", "Local device only"],
  ["Network", "Disabled in production"],
] as const;

export function BootstrapApp() {
  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <p className="eyebrow">PBGC Case Workbench 2</p>
          <h1>Evidence intake foundation</h1>
        </div>
        <span
          className="phase-badge"
          aria-label="Current implementation maturity: setup only"
        >
          Setup only
        </span>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <section className="intro" aria-labelledby="intro-title">
          <p className="section-label">Local-first workspace</p>
          <h2 id="intro-title">
            A controlled starting point for auditable case evidence
          </h2>
          <p>
            This bootstrap verifies the offline application shell and build
            boundary. Case creation and evidence processing are intentionally
            unavailable until their governed implementation phases.
          </p>
        </section>
        <HelpPanel title="Startup help" label="Operator guidance" />
        <section className="status-panel" aria-labelledby="status-title">
          <div className="panel-heading">
            <div>
              <p className="section-label">Phase 1 checkpoint</p>
              <h2 id="status-title">Environment status</h2>
            </div>
            <span className="status-chip">Provisional</span>
          </div>
          <dl className="status-grid">
            {setupChecks.map(([term, description]) => (
              <div key={term} className="status-item">
                <dt>{term}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
          <p className="notice" role="status">
            No participant data is loaded, stored, or transmitted by this setup
            shell.
          </p>
          <FeasibilityStatus />
        </section>
      </main>
    </div>
  );
}
