import { formatMinutes } from "../utils.js";
import styles from "./BoxScoreTable.module.css";

const columns = [
  "MIN",
  "PTS",
  "REB",
  "OREB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PF",
  "FG",
  "RIM",
  "MID",
  "3PT",
  "FT",
  "+/-",
  "ORTG",
  "DRTG",
];

function playerLine(player) {
  return {
    MIN: formatMinutes(player.minutes),
    PTS: player.points,
    REB: player.reboundsTotal,
    OREB: player.reboundsOffensive,
    AST: player.assists,
    STL: player.steals,
    BLK: player.blocks,
    TO: player.turnovers,
    PF: player.foulsPersonal,
    FG: `${player.fieldGoalsMade}-${player.fieldGoalsAttempted}`,
    RIM: `${player.rimFieldGoalsMade}-${player.rimFieldGoalsAttempted}`,
    MID: `${player.midFieldGoalsMade}-${player.midFieldGoalsAttempted}`,
    "3PT": `${player.threePointersMade}-${player.threePointersAttempted}`,
    FT: `${player.freeThrowsMade}-${player.freeThrowsAttempted}`,
    "+/-": player.plusMinusPoints,
    ORTG: "",
    DRTG: "",
  };
}

function pfClass(fouls, period) {
  const safeFouls = fouls || 0;
  const quarter = Math.min(Math.max(period || 1, 1), 4);

  if (quarter === 1) {
    if (safeFouls <= 1) return styles.pfBlack;
    if (safeFouls === 2) return styles.pfYellow;
    return styles.pfRed;
  }

  if (quarter === 2) {
    if (safeFouls <= 2) return styles.pfBlack;
    if (safeFouls === 3) return styles.pfYellow;
    return styles.pfRed;
  }

  if (safeFouls <= 3) return styles.pfBlack;
  if (safeFouls === 4) return styles.pfYellow;
  return styles.pfRed;
}

export default function BoxScoreTable({ teamLabel, boxScore, currentPeriod, ratings = {} }) {
  if (!boxScore) return null;

  const shadedColumns = new Set(["FG", "RIM", "MID", "3PT", "FT"]);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
              <th className={styles.playerCol}>{teamLabel}</th>
              {columns.map((col) => (
                <th
                  key={col}
                  className={`${styles.statHeader} ${shadedColumns.has(col) ? styles.shadedColumn : ""}`}
                >
                  {col}
                </th>
              ))}
            </tr>
        </thead>
        <tbody>
          {boxScore.players.map((player) => {
            const stats = playerLine(player);
            return (
              <tr key={player.personId}>
                <td className={styles.playerCol}>
                  <span className={styles.playerName}>
                    {player.jerseyNum ? `#${player.jerseyNum} ` : ""}{player.familyName || player.firstName || ""}
                  </span>
                  <span className={styles.position}>{player.position || ""}</span>
                </td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className={shadedColumns.has(col) ? styles.shadedColumn : ""}
                  >
                    {col === "PF" ? <span className={pfClass(stats[col], currentPeriod)}>{stats[col]}</span> : stats[col]}
                  </td>
                ))}
              </tr>
            );
          })}
          {boxScore.totals && (
            <tr className={styles.totalsRow}>
              <td className={styles.playerCol}>Totals</td>
              <td>{""}</td>
              <td>{boxScore.totals.points}</td>
              <td>{boxScore.totals.reboundsTotal}</td>
              <td>{boxScore.totals.reboundsOffensive}</td>
              <td>{boxScore.totals.assists}</td>
              <td>{boxScore.totals.steals}</td>
              <td>{boxScore.totals.blocks}</td>
              <td>{boxScore.totals.turnovers}</td>
              <td>{boxScore.totals.foulsPersonal}</td>
              <td>{boxScore.totals.fieldGoalsMade}-{boxScore.totals.fieldGoalsAttempted}</td>
              <td>{boxScore.totals.rimFieldGoalsMade}-{boxScore.totals.rimFieldGoalsAttempted}</td>
              <td>{boxScore.totals.midFieldGoalsMade}-{boxScore.totals.midFieldGoalsAttempted}</td>
              <td>{boxScore.totals.threePointersMade}-{boxScore.totals.threePointersAttempted}</td>
              <td>{boxScore.totals.freeThrowsMade}-{boxScore.totals.freeThrowsAttempted}</td>
              <td>{""}</td>
              <td>{ratings.ortg ?? ""}</td>
              <td>{ratings.drtg ?? ""}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
