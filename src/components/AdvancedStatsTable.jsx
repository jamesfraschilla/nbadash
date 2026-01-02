import styles from "./AdvancedStatsTable.module.css";

const rows = [
  { key: "drivingFGPercent", label: "Driving FG%", format: (v) => `${v || 0}%` },
  { key: "cuttingFGPercent", label: "Cutting FG%", format: (v) => `${v || 0}%` },
  { key: "catchAndShoot3FGPercent", label: "C&S 3P%", format: (v) => `${v || 0}%` },
  { key: "chargesDrawn", label: "Charges Drawn" },
  { key: "offensiveFoulsDrawn", label: "Off Fouls Drawn" },
];

export default function AdvancedStatsTable({ homeLabel, awayLabel, homeStats, awayStats }) {
  if (!homeStats || !awayStats) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.title}>Advanced Stats</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th></th>
            <th>{awayLabel}</th>
            <th>{homeLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const format = row.format || ((v) => v ?? 0);
            return (
              <tr key={row.key}>
                <td className={styles.key}>{row.label}</td>
                <td>{format(awayStats[row.key])}</td>
                <td>{format(homeStats[row.key])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
