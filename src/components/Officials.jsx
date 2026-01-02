import styles from "./Officials.module.css";

export default function Officials({ officials, callsAgainst, homeAbr, awayAbr }) {
  if (!officials?.length) return null;
  const awayTotal = callsAgainst
    ? officials.reduce((sum, official) => sum + (callsAgainst?.[official.personId]?.[awayAbr] ?? 0), 0)
    : 0;
  const homeTotal = callsAgainst
    ? officials.reduce((sum, official) => sum + (callsAgainst?.[official.personId]?.[homeAbr] ?? 0), 0)
    : 0;

  return (
    <section className={styles.container}>
      <div className={styles.officialsLabel}>Officials</div>
      {callsAgainst ? (
        <table className={styles.callsTable}>
          <thead>
            <tr className={styles.headerRow}>
              <th className={styles.headerCellLeft}>
                <div className={styles.callsAgainstLabel}>Calls Against</div>
              </th>
              <th className={styles.headerCell}>Total</th>
              {officials.map((official) => (
                <th key={official.personId} className={styles.headerCell}>
                  <span className={styles.name}>
                    #{official.jerseyNum} {official.firstName} {official.familyName}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={styles.teamCell}>{awayAbr}</td>
              <td className={styles.dataCell}>{awayTotal}</td>
              {officials.map((official) => (
                <td key={official.personId} className={styles.dataCell}>
                  {callsAgainst?.[official.personId]?.[awayAbr] ?? 0}
                </td>
              ))}
            </tr>
            <tr>
              <td className={styles.teamCell}>{homeAbr}</td>
              <td className={styles.dataCell}>{homeTotal}</td>
              {officials.map((official) => (
                <td key={official.personId} className={styles.dataCell}>
                  {callsAgainst?.[official.personId]?.[homeAbr] ?? 0}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : (
        <div className={styles.officialsStack}>
          {officials.map((official) => (
            <div key={official.personId} className={styles.officialItem}>
              <span className={styles.officialName}>
                #{official.jerseyNum} {official.firstName} {official.familyName}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
