import { normalizeFractionPercentage, toNullableNumber } from "./normalizers.ts";

type StatsRow = Record<string, unknown>;

export function normalizeNbaPlayerRow(row: StatsRow) {
  const personId = String(row.PLAYER_ID || "").trim();
  if (!personId) return null;
  return {
    personId,
    fullName: String(row.PLAYER_NAME || "").trim(),
    teamId: String(row.TEAM_ID || "").trim(),
    teamAbbreviation: String(row.TEAM_ABBREVIATION || "").trim(),
    gamesPlayed: toNullableNumber(row.GP),
    pointsPerGame: toNullableNumber(row.PTS),
    reboundsPerGame: toNullableNumber(row.REB),
    threePointPercentage: normalizeFractionPercentage(row.FG3_PCT),
    assistsPerGame: toNullableNumber(row.AST),
    blocksPerGame: toNullableNumber(row.BLK),
    stealsPerGame: toNullableNumber(row.STL),
    freeThrowAttemptsPerGame: toNullableNumber(row.FTA),
    fieldGoalAttemptsPerGame: toNullableNumber(row.FGA),
    threePointAttemptsPerGame: toNullableNumber(row.FG3A),
  };
}

// The G League endpoint reports Totals separately by season type and, for
// traded players, by team. Sum counting stats before deriving per-game rates.
export function combineGLeaguePlayerRows(rows: StatsRow[]) {
  const combined = new Map<string, StatsRow>();
  for (const row of rows) {
    const id = String(row.PLAYER_ID || "").trim();
    if (!id) continue;
    const existing = combined.get(id) || { ...row, GP: 0, PTS: 0, REB: 0, AST: 0, BLK: 0, STL: 0, FTA: 0, FGA: 0, FG3A: 0, FG3M: 0 };
    for (const field of ["GP", "PTS", "REB", "AST", "BLK", "STL", "FTA", "FGA", "FG3A", "FG3M"]) {
      existing[field] = Number(existing[field] || 0) + Number(row[field] || 0);
    }
    combined.set(id, existing);
  }
  return [...combined.values()].map((row) => {
    const games = Number(row.GP || 0);
    const threes = Number(row.FG3A || 0);
    return normalizeNbaPlayerRow({ ...row,
      PTS: games ? Number(row.PTS) / games : null,
      REB: games ? Number(row.REB) / games : null,
      AST: games ? Number(row.AST) / games : null,
      BLK: games ? Number(row.BLK) / games : null,
      STL: games ? Number(row.STL) / games : null,
      FTA: games ? Number(row.FTA) / games : null,
      FGA: games ? Number(row.FGA) / games : null,
      FG3A: games ? threes / games : null,
      FG3_PCT: threes ? Number(row.FG3M || 0) / threes : null,
    });
  }).filter(Boolean) as StatsRow[];
}
