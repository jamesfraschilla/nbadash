import styles from "./MiscStats.module.css";

const columns = [
  { key: "secondChancePoints", label: "2nd Chance" },
  { key: "pointsOffTurnovers", label: "Pts Off TO" },
  { key: "paintPoints", label: "Paint Pts" },
  { key: "threePointORebPercent", label: "3P-OR%", format: (v) => `${(v || 0).toFixed(1)}%` },
];

export default function MiscStats({ awayLabel, homeLabel, awayStats, homeStats }) {
  if (!awayStats || !homeStats) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.title}>Misc</h3>
      <div className={styles.table}>
        <div className={styles.corner} />
        <div className={styles.teamHeader}>{awayLabel}</div>
        <div className={styles.teamHeader}>{homeLabel}</div>
        {columns.map((col) => {
          const format = col.format || ((v) => v ?? 0);
          return (
            <div key={col.key} className={styles.row}>
              <div className={styles.statLabel}>{col.label}</div>
              <div className={styles.statValue}>{format(awayStats[col.key])}</div>
              <div className={styles.statValue}>{format(homeStats[col.key])}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
