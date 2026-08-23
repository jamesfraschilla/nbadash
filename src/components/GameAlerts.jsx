import { useEffect, useRef, useState } from "react";
import { teamLogoUrl } from "../api.js";
import styles from "../pages/Game.module.css";

const COMPACT_ALERT_CATEGORIES = new Set([
  "Run",
  "Foul Trouble",
  "Player Impact",
  "Team Trend",
  "Quarter",
  "Half",
  "Halftime",
  "Player Scoring",
  "Milestone",
]);

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

function AlertCard({ alert, awayTeam, homeTeam, compact = false, glow = false }) {
  const team = teamForAlert(alert, awayTeam, homeTeam);
  const logoUrl = team?.teamId ? teamLogoUrl(team.teamId) : "";
  const logoAlt = team ? `${teamLabel(team)} logo` : "";
  const cardClassName = [
    styles.alertItem,
    compact ? styles.alertItemCompact : "",
    glow ? styles.alertItemCompactGlow : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={cardClassName}>
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
}

export default function GameAlerts({
  alerts = [],
  awayTeam = null,
  homeTeam = null,
  collapsed = true,
  onToggleCollapsed = null,
}) {
  const [compactAlertGlowing, setCompactAlertGlowing] = useState(false);
  const hasSeenCompactAlertRef = useRef(false);
  const lastCompactAlertIdRef = useRef(null);
  const displayedAlerts = alerts
    .map((alert, index) => ({ alert, index }))
    .sort((left, right) => {
      const leftSort = Number.isFinite(Number(left.alert?.sortIndex)) ? Number(left.alert.sortIndex) : left.index;
      const rightSort = Number.isFinite(Number(right.alert?.sortIndex)) ? Number(right.alert.sortIndex) : right.index;
      return rightSort - leftSort;
    })
    .map(({ alert }) => alert);
  const compactAlert = displayedAlerts.find((alert) => COMPACT_ALERT_CATEGORIES.has(alert?.category));
  const compactAlertId = compactAlert?.id ?? null;

  useEffect(() => {
    if (!compactAlertId) return undefined;

    if (!hasSeenCompactAlertRef.current) {
      hasSeenCompactAlertRef.current = true;
      lastCompactAlertIdRef.current = compactAlertId;
      return undefined;
    }

    if (lastCompactAlertIdRef.current === compactAlertId) return undefined;

    lastCompactAlertIdRef.current = compactAlertId;
    setCompactAlertGlowing(true);

    const timeoutId = window.setTimeout(() => {
      setCompactAlertGlowing(false);
    }, 18000);

    return () => window.clearTimeout(timeoutId);
  }, [compactAlertId]);

  if (!alerts.length) return null;

  if (collapsed) {
    return (
      <section className={`${styles.strategyPanel} ${styles.alertsPanel} ${styles.alertsPanelCompact}`} aria-label="Alerts">
        <div className={styles.alertsCompactBody}>
          {compactAlert ? (
            <AlertCard alert={compactAlert} awayTeam={awayTeam} homeTeam={homeTeam} compact glow={compactAlertGlowing} />
          ) : (
            <div className={`${styles.alertsEmpty} ${styles.alertsCompactEmpty}`}>
              No key alerts yet.
            </div>
          )}
          <button
            type="button"
            className={styles.alertsShowMore}
            onClick={onToggleCollapsed}
            aria-expanded={false}
          >
            Show More
          </button>
        </div>
      </section>
    );
  }

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

      <div className={styles.strategyPanelBody}>
        <div className={styles.alertsList}>
          {displayedAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} awayTeam={awayTeam} homeTeam={homeTeam} />
          ))}
        </div>
      </div>
    </section>
  );
}
