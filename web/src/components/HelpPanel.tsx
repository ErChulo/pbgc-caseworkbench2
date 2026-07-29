const helpTopics = [
  [
    "Workspace selection",
    "Choose an approved local folder. The app writes only to that folder and never to a remote service.",
  ],
  [
    "Backups and recovery",
    "Keep a backup of the selected folder before production work. If the folder is reopened, the app reloads the local records only.",
  ],
  [
    "Keyboard shortcuts",
    "Tab and Shift+Tab move between controls. Enter activates buttons. Cmd+Enter or Ctrl+Enter approves the current review. Escape cancels dialogs.",
  ],
  [
    "Static-origin fallback",
    "If direct file execution is not approved, use the approved localhost launcher. It serves files locally and does not receive case data.",
  ],
  [
    "Local PII handling",
    "Real participant information stays on your device and remains out of Git, logs, screenshots, and external services.",
  ],
] as const;

export function HelpPanel({
  title = "Built-in help",
  label = "Help",
}: {
  readonly title?: string;
  readonly label?: string;
}) {
  return (
    <section className="case-panel" aria-labelledby="help-panel-title">
      <div className="panel-heading">
        <div>
          <p className="section-label">{label}</p>
          <h2 id="help-panel-title">{title}</h2>
        </div>
        <span className="status-chip">Available offline</span>
      </div>
      <p>
        These notes summarize the local operating rules that the application
        enforces in production.
      </p>
      <dl className="status-grid">
        {helpTopics.map(([topic, detail]) => (
          <div key={topic} className="status-item">
            <dt>{topic}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
