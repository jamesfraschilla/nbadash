import styles from "./TransitionStats.module.css";

const columns = [
  { key: "transitionRate", label: "%", format: (v) => `${(v || 0).toFixed(1)}%` },
  { key: "transitionPoints", label: "PTS" },
  { key: "transitionPPP", label: "PPP", format: (v) => (v || 0).toFixed(1) },
  { key: "transitionTurnovers", label: "TOV" },
];

export default function TransitionStats({ awayLabel, homeLabel, awayStats, homeStats }) {
  if (!awayStats || !homeStats) return null;

  const buildPPP = (stats) => {
    const points = stats.transitionPoints || 0;
    const possessions = stats.transitionPossessions || 0;
    return possessions ? points / possessions : 0;
  };
  const derivedAway = { ...awayStats, transitionPPP: buildPPP(awayStats) };
  const derivedHome = { ...homeStats, transitionPPP: buildPPP(homeStats) };

  return (
    <section className={styles.container}>
      <h3 className={styles.title}>Transition</h3>
      <div className={styles.table}>
        <div className={styles.corner} />
        <div className={styles.teamHeader}>{awayLabel}</div>
        <div className={styles.teamHeader}>{homeLabel}</div>
        {columns.map((col) => {
          const format = col.format || ((v) => v ?? 0);
          return (
            <div key={col.key} className={styles.row}>
              <div className={styles.statLabel}>{col.label}</div>
              <div className={styles.statValue}>{format(derivedAway[col.key])}</div>
              <div className={styles.statValue}>{format(derivedHome[col.key])}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
