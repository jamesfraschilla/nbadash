import {
  buildStrategyOverrideDraft,
  getMarginOptionLabel,
  MARGIN_OPTION_VALUES,
} from "./lateGamePanelHelpers.js";
import styles from "../pages/Game.module.css";

const PERIOD_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 1));
const TIMEOUT_OPTIONS = Array.from({ length: 8 }, (_, index) => String(index));
const FOUL_OPTIONS = Array.from({ length: 6 }, (_, index) => String(index));
const CLOCK_OPTIONS = Array.from({ length: 61 }, (_, index) => {
  const seconds = 60 - index;
  return `0:${String(seconds).padStart(2, "0")}`;
});

export default function LateGameMatrixPanel({
  title = "Live Game Situation Matrix",
  collapsed = false,
  onToggleCollapsed = null,
  awayTeam,
  homeTeam,
  strategyState,
  strategyEvaluation,
  strategyVantageTeamId,
  setStrategyVantageTeamId,
  strategyOverrides,
  setStrategyOverrides,
  strategyManualOpen,
  setStrategyManualOpen,
  strategyOverrideDraft,
  setStrategyOverrideDraft,
  onApplyManualSituationOverride,
  onClearStrategyOverrides,
  strategyRangeRecommendations = [],
  footerActions = null,
}) {
  const vantageLabel = strategyState?.vantageTeam?.teamTricode || awayTeam?.teamTricode || "OUR";
  const opponentLabel = strategyState?.opponentTeam?.teamTricode || homeTeam?.teamTricode || "OPP";

  const toggleManualSituationOverride = () => {
    setStrategyOverrideDraft(buildStrategyOverrideDraft(strategyState));
    setStrategyManualOpen((prev) => !prev);
  };

  return (
    <section className={styles.strategyPanel}>
      <div className={styles.strategyPanelTopbar}>
        {onToggleCollapsed ? (
          <button
            type="button"
            className={styles.strategyPanelToggle}
            onClick={onToggleCollapsed}
          >
            <span className={styles.strategyPanelToggleLabel}>{title}</span>
            <span className={styles.strategyPanelToggleIcon}>{collapsed ? "+" : "−"}</span>
          </button>
        ) : (
          <div className={styles.strategyPanelToggle}>
            <span className={styles.strategyPanelToggleLabel}>{title}</span>
          </div>
        )}
        {!collapsed ? (
          <div className={styles.strategyToggleGroup}>
            <span className={styles.strategyToggleLabel}>Vantage</span>
            {[awayTeam, homeTeam].filter(Boolean).map((team) => (
              <button
                key={`strategy-team-${team.teamId}`}
                type="button"
                className={`${styles.strategyToggle} ${String(strategyVantageTeamId) === String(team.teamId) ? styles.strategyToggleActive : ""}`}
                onClick={() => setStrategyVantageTeamId(String(team.teamId))}
              >
                {team.teamTricode}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div className={styles.strategyPanelBody}>
          <div className={styles.strategyFeedPanel}>
            <div className={styles.strategyOverrideControls}>
              <button
                type="button"
                className={strategyManualOpen ? styles.strategyOverrideActive : ""}
                onClick={toggleManualSituationOverride}
              >
                Edit Game Details
              </button>
              {footerActions}
            </div>
            {strategyManualOpen ? (
              <div className={styles.strategyManualOverride}>
                <label>
                  <span>Period</span>
                  <select
                    value={strategyOverrideDraft.period}
                    onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, period: event.target.value }))}
                  >
                    {PERIOD_OPTIONS.map((period) => (
                      <option key={period} value={period}>{period}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Clock</span>
                  <select
                    value={strategyOverrideDraft.clock}
                    onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, clock: event.target.value }))}
                  >
                    {CLOCK_OPTIONS.map((clock) => (
                      <option key={clock} value={clock}>{clock}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Possession</span>
                  <select
                    value={strategyOverrideDraft.possessionTeamId}
                    onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, possessionTeamId: event.target.value }))}
                  >
                    <option value="">Feed</option>
                    {strategyState?.vantageTeam ? (
                      <option value={strategyState.vantageTeam.teamId}>{strategyState.vantageTeam.teamTricode}</option>
                    ) : null}
                    {strategyState?.opponentTeam ? (
                      <option value={strategyState.opponentTeam.teamId}>{strategyState.opponentTeam.teamTricode}</option>
                    ) : null}
                  </select>
                </label>
                <label className={styles.strategyMarginField}>
                  <span>Margin</span>
                  <div className={styles.strategyMarginPicker}>
                    <select
                      value={strategyOverrideDraft.scoreDiff}
                      onChange={(event) => setStrategyOverrideDraft((prev) => ({
                        ...prev,
                        scoreDiff: event.target.value,
                        scoreDiffEnd: prev.scoreDiffRange ? prev.scoreDiffEnd : event.target.value,
                      }))}
                    >
                      {MARGIN_OPTION_VALUES.map((value) => (
                        <option key={`margin-${value}`} value={String(value)}>{getMarginOptionLabel(value)}</option>
                      ))}
                    </select>
                    {strategyOverrideDraft.scoreDiffRange ? (
                      <select
                        value={strategyOverrideDraft.scoreDiffEnd}
                        onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, scoreDiffEnd: event.target.value }))}
                      >
                        {MARGIN_OPTION_VALUES.map((value) => (
                          <option key={`margin-end-${value}`} value={String(value)}>{getMarginOptionLabel(value)}</option>
                        ))}
                      </select>
                    ) : null}
                    <label className={styles.strategyRangeToggle}>
                      <input
                        type="checkbox"
                        checked={Boolean(strategyOverrideDraft.scoreDiffRange)}
                        onChange={(event) => setStrategyOverrideDraft((prev) => ({
                          ...prev,
                          scoreDiffRange: event.target.checked,
                          scoreDiffEnd: event.target.checked ? (prev.scoreDiffEnd || prev.scoreDiff) : prev.scoreDiff,
                        }))}
                      />
                      <span>Range</span>
                    </label>
                  </div>
                </label>
                <div className={styles.strategyTeamGrid}>
                  <div className={styles.strategyTeamCard}>
                    <div className={styles.strategyTeamCardTitle}>{vantageLabel}</div>
                    <label>
                      <span>Timeouts</span>
                      <select
                        value={strategyOverrideDraft.ourTimeouts}
                        onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, ourTimeouts: event.target.value }))}
                      >
                        {TIMEOUT_OPTIONS.map((value) => (
                          <option key={`our-to-${value}`} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Fouls</span>
                      <select
                        value={strategyOverrideDraft.ourFouls}
                        onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, ourFouls: event.target.value }))}
                      >
                        {FOUL_OPTIONS.map((value) => (
                          <option key={`our-fouls-${value}`} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={styles.strategyTeamCard}>
                    <div className={styles.strategyTeamCardTitle}>{opponentLabel}</div>
                    <label>
                      <span>Timeouts</span>
                      <select
                        value={strategyOverrideDraft.opponentTimeouts}
                        onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, opponentTimeouts: event.target.value }))}
                      >
                        {TIMEOUT_OPTIONS.map((value) => (
                          <option key={`opp-to-${value}`} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Fouls</span>
                      <select
                        value={strategyOverrideDraft.opponentFouls}
                        onChange={(event) => setStrategyOverrideDraft((prev) => ({ ...prev, opponentFouls: event.target.value }))}
                      >
                        {FOUL_OPTIONS.map((value) => (
                          <option key={`opp-fouls-${value}`} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className={styles.strategyManualActions}>
                  <button type="button" onClick={onApplyManualSituationOverride}>
                    Apply to Matrix
                  </button>
                  <button type="button" onClick={onClearStrategyOverrides}>
                    Clear Overrides
                  </button>
                </div>
              </div>
            ) : null}
            {strategyRangeRecommendations.length ? (
              <div className={styles.strategyScenarioBlock}>
                <div className={styles.strategyScenarioHeader}>
                  <strong>Margin range planning</strong>
                  <span>One recommendation per selected margin.</span>
                </div>
                <div className={styles.strategyScenarioGrid}>
                  {strategyRangeRecommendations.map((scenario) => (
                    <div key={scenario.key} className={styles.strategyScenarioCard}>
                      <div className={styles.strategyScenarioLabel}>Margin {scenario.marginLabel}</div>
                      <div className={styles.strategyScenarioCall}>{scenario.recommendation.call}</div>
                      <div className={styles.strategyScenarioDetail}>{scenario.recommendation.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles.strategyRecommendation}>
            <p className={styles.strategyDecisionText}>{strategyEvaluation?.summary || "No recommendation yet."}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
