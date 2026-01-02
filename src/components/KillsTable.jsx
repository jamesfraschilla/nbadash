import styles from "./KillsTable.module.css";

const killKeys = ["three", "four", "five", "six", "seven", "eight", "delta", "pi"];

export default function KillsTable({ homeLabel, awayLabel, homeData, awayData }) {
  if (!homeData || !awayData) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.title}>Kills</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th></th>
            <th>{awayLabel}</th>
            <th>{homeLabel}</th>
          </tr>
        </thead>
        <tbody>
          {killKeys.map((key) => (
            <tr key={key}>
              <td className={styles.key}>{key.toUpperCase()}</td>
              <td>{awayData[key] ?? 0}</td>
              <td>{homeData[key] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
