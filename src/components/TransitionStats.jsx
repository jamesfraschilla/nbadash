import styles from "./TransitionStats.module.css";

const columns = [
  { key: "transitionRate", label: "Trans%", format: (v) => `${(v || 0).toFixed(1)}%` },
  { key: "transitionPoints", label: "Trans Pts" },
  { key: "transitionTurnovers", label: "Trans TO" },
];

export default function TransitionStats({ awayLabel, homeLabel, awayStats, homeStats }) {
  if (!awayStats || !homeStats) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.title}>Transition Stats</h3>
      <div className={styles.wrapper}>
        <div className={styles.teamLabels}>
          <div className={styles.spacer} />
          <div className={styles.teamAbbr}>{awayLabel}</div>
          <div className={styles.teamAbbr}>{homeLabel}</div>
        </div>
        <div className={styles.grid}>
          {columns.map((col) => {
            const format = col.format || ((v) => v ?? 0);
            return (
              <div key={col.key} className={styles.stat}>
                <div className={styles.statLabel}>{col.label}</div>
                <div className={styles.statRow}>{format(awayStats[col.key])}</div>
                <div className={styles.statRow}>{format(homeStats[col.key])}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
