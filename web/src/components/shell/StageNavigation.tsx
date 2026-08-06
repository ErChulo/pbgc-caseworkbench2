export interface StageDefinition {
  readonly stageKey: string;
  readonly label: string;
  readonly description: string;
  readonly status: "locked" | "active" | "complete" | "blocked";
}

export interface StageNavigationProps {
  readonly stages: readonly StageDefinition[];
  readonly activeStage: string;
  readonly onStageSelect: (stageKey: string) => void;
}

export function StageNavigation({
  stages,
  activeStage,
  onStageSelect,
}: StageNavigationProps) {
  return (
    <nav className="stage-nav" aria-label="Casework stage navigation">
      <ol className="stage-nav-list">
        {stages.map((stage, index) => {
          const isActive = stage.stageKey === activeStage;
          const isClickable =
            stage.status === "active" ||
            stage.status === "complete" ||
            stage.status === "blocked";
          return (
            <li
              key={stage.stageKey}
              className={`stage-nav-item stage-nav-item-${stage.status} ${isActive ? "stage-nav-item-active" : ""}`}
            >
              <button
                type="button"
                className="stage-nav-button"
                disabled={!isClickable}
                aria-current={isActive ? "step" : undefined}
                onClick={() => {
                  if (isClickable) onStageSelect(stage.stageKey);
                }}
              >
                <span className="stage-nav-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="stage-nav-content">
                  <span className="stage-nav-label">{stage.label}</span>
                  <span className="stage-nav-description">
                    {stage.description}
                  </span>
                </span>
                <span className="stage-nav-status" aria-hidden="true">
                  {stage.status === "complete" && "✓"}
                  {stage.status === "blocked" && "!"}
                  {stage.status === "locked" && "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
