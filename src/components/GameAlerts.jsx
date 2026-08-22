import { teamLogoUrl } from "../api.js";
import styles from "../pages/Game.module.css";

function normalizeTeamId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function teamLabel(team) {
  return team?.teamName || team?.teamTricode || "Team";
}

function teamForAlert(alert, awayTeam, homeTeam) {
  const teamId = normalizeTeamId(alert?.teamId);
  if (!teamId) return null;
  if (normalizeTeamId(awayTeam?.teamId) === teamId) return awayTeam;
  if (normalizeTeamId(homeTeam?.teamId) === teamId) return homeTeam;
  return { teamId, teamName: alert?.teamCode || "Team", teamTricode: alert?.teamCode || "" };
}

export default function GameAlerts({
  alerts = [],
  awayTeam = null,
  homeTeam = null,
  collapsed = true,
  onToggleCollapsed = null,
}) {
  const displayedAlerts = alerts
    .map((alert, index) => ({ alert, index }))
    .sort((left, right) => {
      const leftSort = Number.isFinite(Number(left.alert?.sortIndex)) ? Number(left.alert.sortIndex) : left.index;
      const rightSort = Number.isFinite(Number(right.alert?.sortIndex)) ? Number(right.alert.sortIndex) : right.index;
      return rightSort - leftSort;
    })
    .map(({ alert }) => alert);

  return (
    <section className={`${styles.strategyPanel} ${styles.alertsPanel}`} aria-label="Alerts">
      <button
        type="button"
        className={styles.strategyPanelToggle}
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
      >
        <span className={styles.strategyPanelToggleLabel}>Alerts</span>
        <span className={styles.alertsToggleMeta}>
          <span>{alerts.length}</span>
          <span className={styles.strategyPanelToggleIcon} aria-hidden="true">{collapsed ? "+" : "−"}</span>
        </span>
      </button>

      {!collapsed ? (
        <div className={styles.strategyPanelBody}>
          {alerts.length ? (
            <div className={styles.alertsList}>
              {displayedAlerts.map((alert) => {
                const team = teamForAlert(alert, awayTeam, homeTeam);
                const logoUrl = team?.teamId ? teamLogoUrl(team.teamId) : "";
                const logoAlt = team ? `${teamLabel(team)} logo` : "";
                return (
                  <article key={alert.id} className={styles.alertItem}>
                    <div className={styles.alertMeta}>
                      <span className={styles.alertTime}>{alert.timeLabel}</span>
                      <span className={styles.alertCategory}>{alert.category}</span>
                      {logoUrl ? (
                        <span className={styles.alertTeamLogo} title={teamLabel(team)}>
                          <img src={logoUrl} alt={logoAlt} />
                        </span>
                      ) : alert.teamCode ? (
                        <span className={styles.alertTeam}>{alert.teamCode}</span>
                      ) : null}
                    </div>
                    <div className={styles.alertTitle}>{alert.title}</div>
                    {alert.detail ? (
                      <div className={styles.alertDetail}>{alert.detail}</div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.alertsEmpty}>No alerts yet.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
