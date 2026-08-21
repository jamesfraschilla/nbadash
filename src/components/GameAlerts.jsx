import styles from "../pages/Game.module.css";

export default function GameAlerts({
  alerts = [],
  collapsed = true,
  onToggleCollapsed = null,
}) {
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
              {alerts.map((alert) => (
                <article key={alert.id} className={styles.alertItem}>
                  <div className={styles.alertMeta}>
                    <span className={styles.alertTime}>{alert.timeLabel}</span>
                    <span className={styles.alertCategory}>{alert.category}</span>
                    {alert.teamCode ? (
                      <span className={styles.alertTeam}>{alert.teamCode}</span>
                    ) : null}
                  </div>
                  <div className={styles.alertTitle}>{alert.title}</div>
                  {alert.detail ? (
                    <div className={styles.alertDetail}>{alert.detail}</div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.alertsEmpty}>No alerts yet.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
