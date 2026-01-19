import { formatMinutes } from "../utils.js";
import styles from "./BoxScoreTable.module.css";

const defaultColumns = [
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

function formatRating(value) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(1);
}

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
    ORTG: formatRating(player.ortg),
    DRTG: formatRating(player.drtg),
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

export default function BoxScoreTable({
  teamLabel,
  boxScore,
  currentPeriod,
  ratings = {},
  variant = "full",
}) {
  if (!boxScore) return null;

  const columns = variant === "atc"
    ? [
      "MIN",
      "PF",
      "PTS",
      "REB",
      "OREB",
      "AST",
      "STL",
      "BLK",
      "TO",
      "FG",
      "3PT",
      "FT",
      "+/-",
    ]
    : defaultColumns;
  const shadedColumns = new Set(["FG", "RIM", "MID", "3PT", "FT"]);
  const formatPlayerName = (player) => {
    const parts = [player.firstName, player.familyName].filter(Boolean);
    return parts.join(" ");
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.playerNumberCol}></th>
            <th className={styles.playerNameCol}>{teamLabel}</th>
            {columns.map((col) => (
              <th
                key={col}
                className={`${styles.statHeader} ${shadedColumns.has(col) ? styles.shadedColumn : ""} ${variant === "atc" && col === "PF" ? styles.atcSeparator : ""}`}
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
                <td className={styles.playerNumberCol}>
                  {player.jerseyNum ? `#${player.jerseyNum}` : ""}
                </td>
                <td className={styles.playerNameCol}>
                  <span className={styles.playerName}>
                    {formatPlayerName(player)}
                  </span>
                  <span className={styles.position}>{player.position || ""}</span>
                </td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`${shadedColumns.has(col) ? styles.shadedColumn : ""} ${variant === "atc" && col === "PF" ? styles.atcSeparator : ""}`}
                  >
                    {col === "PF" ? <span className={pfClass(stats[col], currentPeriod)}>{stats[col]}</span> : stats[col]}
                  </td>
                ))}
              </tr>
            );
          })}
          {boxScore.totals && (
            <tr className={styles.totalsRow}>
              <td className={styles.playerNumberCol}></td>
              <td className={styles.playerNameCol}>Totals</td>
              {columns.map((col) => {
                let value = "";
                if (col === "PTS") value = boxScore.totals.points;
                if (col === "REB") value = boxScore.totals.reboundsTotal;
                if (col === "OREB") value = boxScore.totals.reboundsOffensive;
                if (col === "AST") value = boxScore.totals.assists;
                if (col === "STL") value = boxScore.totals.steals;
                if (col === "BLK") value = boxScore.totals.blocks;
                if (col === "TO") value = boxScore.totals.turnovers;
                if (col === "PF") value = boxScore.totals.foulsPersonal;
                if (col === "FG") value = `${boxScore.totals.fieldGoalsMade}-${boxScore.totals.fieldGoalsAttempted}`;
                if (col === "RIM") value = `${boxScore.totals.rimFieldGoalsMade}-${boxScore.totals.rimFieldGoalsAttempted}`;
                if (col === "MID") value = `${boxScore.totals.midFieldGoalsMade}-${boxScore.totals.midFieldGoalsAttempted}`;
                if (col === "3PT") value = `${boxScore.totals.threePointersMade}-${boxScore.totals.threePointersAttempted}`;
                if (col === "FT") value = `${boxScore.totals.freeThrowsMade}-${boxScore.totals.freeThrowsAttempted}`;
                if (col === "ORTG") value = formatRating(ratings.ortg);
                if (col === "DRTG") value = formatRating(ratings.drtg);
                return <td key={col}>{value}</td>;
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
