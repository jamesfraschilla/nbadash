import staticSchedule2026_27 from "./nbaSchedule2026_27.json" with { type: "json" };

const STATS_API_URL = "https://stats.nba.com/stats/leaguegamefinder";
const SCHEDULE_API_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
const SCHEDULE_TIMEOUT_MS = 8_000;
const STATS_TIMEOUT_MS = 5_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SEASON_TYPES = ["Pre Season", "Regular Season", "Playoffs"] as const;

const TEAM_METADATA = [
  { teamId: 1610612737, teamTricode: "ATL", teamCity: "Atlanta", teamName: "Hawks" },
  { teamId: 1610612738, teamTricode: "BOS", teamCity: "Boston", teamName: "Celtics" },
  { teamId: 1610612751, teamTricode: "BKN", teamCity: "Brooklyn", teamName: "Nets" },
  { teamId: 1610612766, teamTricode: "CHA", teamCity: "Charlotte", teamName: "Hornets" },
  { teamId: 1610612741, teamTricode: "CHI", teamCity: "Chicago", teamName: "Bulls" },
  { teamId: 1610612739, teamTricode: "CLE", teamCity: "Cleveland", teamName: "Cavaliers" },
  { teamId: 1610612742, teamTricode: "DAL", teamCity: "Dallas", teamName: "Mavericks" },
  { teamId: 1610612743, teamTricode: "DEN", teamCity: "Denver", teamName: "Nuggets" },
  { teamId: 1610612765, teamTricode: "DET", teamCity: "Detroit", teamName: "Pistons" },
  { teamId: 1610612744, teamTricode: "GSW", teamCity: "Golden State", teamName: "Warriors" },
  { teamId: 1610612745, teamTricode: "HOU", teamCity: "Houston", teamName: "Rockets" },
  { teamId: 1610612754, teamTricode: "IND", teamCity: "Indiana", teamName: "Pacers" },
  { teamId: 1610612746, teamTricode: "LAC", teamCity: "LA", teamName: "Clippers" },
  { teamId: 1610612747, teamTricode: "LAL", teamCity: "Los Angeles", teamName: "Lakers" },
  { teamId: 1610612763, teamTricode: "MEM", teamCity: "Memphis", teamName: "Grizzlies" },
  { teamId: 1610612748, teamTricode: "MIA", teamCity: "Miami", teamName: "Heat" },
  { teamId: 1610612749, teamTricode: "MIL", teamCity: "Milwaukee", teamName: "Bucks" },
  { teamId: 1610612750, teamTricode: "MIN", teamCity: "Minnesota", teamName: "Timberwolves" },
  { teamId: 1610612740, teamTricode: "NOP", teamCity: "New Orleans", teamName: "Pelicans" },
  { teamId: 1610612752, teamTricode: "NYK", teamCity: "New York", teamName: "Knicks" },
  { teamId: 1610612760, teamTricode: "OKC", teamCity: "Oklahoma City", teamName: "Thunder" },
  { teamId: 1610612753, teamTricode: "ORL", teamCity: "Orlando", teamName: "Magic" },
  { teamId: 1610612755, teamTricode: "PHI", teamCity: "Philadelphia", teamName: "76ers" },
  { teamId: 1610612756, teamTricode: "PHX", teamCity: "Phoenix", teamName: "Suns" },
  { teamId: 1610612757, teamTricode: "POR", teamCity: "Portland", teamName: "Trail Blazers" },
  { teamId: 1610612758, teamTricode: "SAC", teamCity: "Sacramento", teamName: "Kings" },
  { teamId: 1610612759, teamTricode: "SAS", teamCity: "San Antonio", teamName: "Spurs" },
  { teamId: 1610612761, teamTricode: "TOR", teamCity: "Toronto", teamName: "Raptors" },
  { teamId: 1610612762, teamTricode: "UTA", teamCity: "Utah", teamName: "Jazz" },
  { teamId: 1610612764, teamTricode: "WAS", teamCity: "Washington", teamName: "Wizards" },
] as const;

const TEAM_BY_ID = new Map<string, (typeof TEAM_METADATA)[number]>(TEAM_METADATA.map((team) => [String(team.teamId), team]));
const TEAM_BY_TRICODE = new Map<string, (typeof TEAM_METADATA)[number]>(TEAM_METADATA.map((team) => [team.teamTricode, team]));

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function currentSeasonString(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function parseRowSet(payload: Record<string, unknown>) {
  const resultSets = Array.isArray(payload?.resultSets) ? payload.resultSets : [];
  const resultSet = (resultSets[0] as Record<string, unknown> | undefined) || payload?.resultSet as Record<string, unknown> | undefined;
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];

  return rows.map((row) => headers.reduce((accumulator, header, index) => {
    accumulator[String(header)] = Array.isArray(row) ? row[index] : undefined;
    return accumulator;
  }, {} as Record<string, unknown>));
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSeasonTypeRows(season: string, seasonType: string, teamId: string) {
  const url = new URL(STATS_API_URL);
  url.searchParams.set("LeagueID", "00");
  url.searchParams.set("PlayerOrTeam", "T");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", seasonType);
  url.searchParams.set("TeamID", teamId);

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.nba.com",
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Team Games Bot)",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
    cache: "no-store",
  }, STATS_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Stats request failed (${response.status}) for ${seasonType}`);
  }

  const payload = await response.json();
  return parseRowSet(payload);
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function seasonTypeRank(seasonType: unknown) {
  if (seasonType === "Pre Season" || seasonType === "Preseason") return 0;
  if (seasonType === "Regular Season") return 1;
  if (seasonType === "Playoffs") return 2;
  return 3;
}

function sortRowsChronologically(rows: Record<string, unknown>[]) {
  return [...rows].sort((left, right) => {
    const dateCompare = String(left.GAME_DATE || "").localeCompare(String(right.GAME_DATE || ""));
    if (dateCompare !== 0) return dateCompare;
    const seasonTypeCompare = seasonTypeRank(left.seasonType) - seasonTypeRank(right.seasonType);
    if (seasonTypeCompare !== 0) return seasonTypeCompare;
    const gameCompare = String(left.GAME_ID || "").localeCompare(String(right.GAME_ID || ""));
    if (gameCompare !== 0) return gameCompare;
    return String(left.TEAM_ABBREVIATION || "").localeCompare(String(right.TEAM_ABBREVIATION || ""));
  });
}

type TeamGameFinderRow = Record<string, unknown> & {
  recordAfter?: { wins: number; losses: number } | null;
};

function annotateRowsWithRecords(rows: Record<string, unknown>[]): TeamGameFinderRow[] {
  const tallies = new Map<string, { wins: number; losses: number }>();

  return sortRowsChronologically(rows).map((row) => {
    const teamId = String(row.TEAM_ID || "");
    const current = tallies.get(teamId) || { wins: 0, losses: 0 };
    const won = String(row.WL || "").toUpperCase() === "W";
    const nextRecord = {
      wins: current.wins + (won ? 1 : 0),
      losses: current.losses + (won ? 0 : 1),
    };
    tallies.set(teamId, nextRecord);
    return {
      ...row,
      recordAfter: nextRecord,
    };
  });
}

function buildTeamPayload(row: TeamGameFinderRow, fallbackTricode = "", recordOverride: { wins: number; losses: number } | null = null) {
  const teamId = String(row?.TEAM_ID || "");
  const fallbackMeta = TEAM_BY_TRICODE.get(String(fallbackTricode || "").trim().toUpperCase()) || null;
  const meta = TEAM_BY_ID.get(teamId) || fallbackMeta;
  const record = recordOverride || row?.recordAfter as { wins: number; losses: number } | null;
  return {
    teamId: toNumber(teamId, 0),
    teamName: meta?.teamName || String(row?.TEAM_NAME || "").trim(),
    teamCity: meta?.teamCity || "",
    teamTricode: String(row?.TEAM_ABBREVIATION || fallbackTricode || meta?.teamTricode || "").trim(),
    wins: record ? toNumber(record.wins, 0) : null,
    losses: record ? toNumber(record.losses, 0) : null,
    score: toNumber(row?.PTS, 0),
    timeoutsRemaining: 0,
  };
}

function normalizeSeasonType(seasonType: unknown) {
  if (seasonType === "Pre Season") return "Preseason";
  return String(seasonType || "");
}

function formatScheduleDate(value: unknown) {
  const raw = String(value || "").trim();
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (isoMatch) return isoMatch[1];

  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (!usMatch) return "";
  return `${usMatch[3]}-${String(usMatch[1]).padStart(2, "0")}-${String(usMatch[2]).padStart(2, "0")}`;
}

function inferScheduleSeasonType(game: Record<string, unknown>) {
  const gameId = String(game?.gameId || "");
  const label = `${String(game?.gameLabel || "")} ${String(game?.gameSubLabel || "")}`.toLowerCase();
  if (gameId.startsWith("001") || label.includes("preseason")) return "Preseason";
  if (gameId.startsWith("004") || label.includes("playoff")) return "Playoffs";
  return "Regular Season";
}

function buildScheduleTeamPayload(team: Record<string, unknown> | null | undefined) {
  return {
    teamId: toNumber(team?.teamId, 0),
    teamName: String(team?.teamName || "").trim(),
    teamCity: String(team?.teamCity || "").trim(),
    teamTricode: String(team?.teamTricode || "").trim(),
    wins: Number.isFinite(Number(team?.wins)) ? toNumber(team?.wins, 0) : null,
    losses: Number.isFinite(Number(team?.losses)) ? toNumber(team?.losses, 0) : null,
    score: toNumber(team?.score, 0),
    timeoutsRemaining: 0,
  };
}

function normalizeScheduleGame(game: Record<string, unknown>, season: string) {
  return {
    gameId: String(game?.gameId || ""),
    gameCode: String(game?.gameCode || ""),
    gameStatus: toNumber(game?.gameStatus, 1),
    gameStatusText: String(game?.gameStatusText || ""),
    period: 0,
    gameClock: "",
    gameTimeUTC: String(game?.gameDateTimeUTC || game?.gameTimeUTC || ""),
    gameEt: String(game?.gameDateTimeEst || game?.gameTimeEst || ""),
    seasonYear: season,
    seasonType: inferScheduleSeasonType(game),
    gameDate: formatScheduleDate(game?.gameDateEst || game?.gameDateTimeEst || game?.gameDateUTC),
    arena: {
      arenaName: String(game?.arenaName || "").trim(),
      arenaState: String(game?.arenaState || "").trim(),
      arenaCity: String(game?.arenaCity || "").trim(),
    },
    homeTeam: buildScheduleTeamPayload(game?.homeTeam as Record<string, unknown> | null),
    awayTeam: buildScheduleTeamPayload(game?.awayTeam as Record<string, unknown> | null),
  };
}

function normalizeStaticScheduleGame(game: Record<string, unknown>, season: string) {
  return {
    gameId: String(game?.gameId || ""),
    gameCode: String(game?.gameCode || ""),
    gameStatus: toNumber(game?.gameStatus, 1),
    gameStatusText: String(game?.gameStatusText || ""),
    period: toNumber(game?.period, 0),
    gameClock: String(game?.gameClock || ""),
    gameTimeUTC: String(game?.gameTimeUTC || ""),
    gameEt: String(game?.gameEt || ""),
    seasonYear: season,
    seasonType: String(game?.seasonType || ""),
    gameDate: formatScheduleDate(game?.gameDate),
    arena: {
      arenaName: String((game?.arena as Record<string, unknown> | undefined)?.arenaName || "").trim(),
      arenaState: String((game?.arena as Record<string, unknown> | undefined)?.arenaState || "").trim(),
      arenaCity: String((game?.arena as Record<string, unknown> | undefined)?.arenaCity || "").trim(),
    },
    homeTeam: buildScheduleTeamPayload(game?.homeTeam as Record<string, unknown> | null),
    awayTeam: buildScheduleTeamPayload(game?.awayTeam as Record<string, unknown> | null),
  };
}

async function fetchScheduleGames(season: string, teamId: string) {
  const response = await fetchWithTimeout(SCHEDULE_API_URL, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.nba.com/schedule",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Team Games Bot)",
    },
    cache: "no-store",
  }, SCHEDULE_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Schedule request failed (${response.status})`);
  }

  const payload = await response.json();
  if (String(payload?.leagueSchedule?.seasonYear || "").trim() !== season) {
    return [];
  }

  const gameDates = Array.isArray(payload?.leagueSchedule?.gameDates)
    ? payload.leagueSchedule.gameDates
    : [];
  const games = gameDates.flatMap((dateRecord: Record<string, unknown>) => (
    Array.isArray(dateRecord?.games) ? dateRecord.games : []
  ));

  return games
    .filter((game: Record<string, unknown>) => {
      const homeTeamId = String((game?.homeTeam as Record<string, unknown> | undefined)?.teamId || "");
      const awayTeamId = String((game?.awayTeam as Record<string, unknown> | undefined)?.teamId || "");
      return homeTeamId === teamId || awayTeamId === teamId;
    })
    .map((game: Record<string, unknown>) => normalizeScheduleGame(game, season))
    .filter((game: Record<string, unknown>) => Boolean(game.gameId && game.gameDate))
    .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
      const dateCompare = String(right.gameDate || "").localeCompare(String(left.gameDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(right.gameId || "").localeCompare(String(left.gameId || ""));
    });
}

function filterStaticScheduleGames(season: string, teamId: string) {
  if (season !== "2026-27") return [];
  const games = Array.isArray(staticSchedule2026_27?.games) ? staticSchedule2026_27.games : [];

  return games
    .filter((game: Record<string, unknown>) => {
      const homeTeamId = String((game?.homeTeam as Record<string, unknown> | undefined)?.teamId || "");
      const awayTeamId = String((game?.awayTeam as Record<string, unknown> | undefined)?.teamId || "");
      return homeTeamId === teamId || awayTeamId === teamId;
    })
    .map((game: Record<string, unknown>) => normalizeStaticScheduleGame(game, season))
    .filter((game: Record<string, unknown>) => Boolean(game.gameId && game.gameDate))
    .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
      const dateCompare = String(right.gameDate || "").localeCompare(String(left.gameDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(right.gameId || "").localeCompare(String(left.gameId || ""));
    });
}

function buildSyntheticOpponentRow(selectedRow: TeamGameFinderRow, opponentTricode: string): TeamGameFinderRow {
  const meta = TEAM_BY_TRICODE.get(String(opponentTricode || "").trim().toUpperCase()) || null;
  const selectedScore = toNumber(selectedRow?.PTS, 0);
  const pointDelta = toNumber(selectedRow?.PLUS_MINUS, 0);
  return {
    TEAM_ID: meta?.teamId || 0,
    TEAM_ABBREVIATION: meta?.teamTricode || opponentTricode,
    TEAM_NAME: meta?.teamName || opponentTricode,
    PTS: Math.max(0, selectedScore - pointDelta),
    MATCHUP: "",
    GAME_ID: selectedRow?.GAME_ID || "",
    GAME_DATE: selectedRow?.GAME_DATE || "",
    seasonType: selectedRow?.seasonType || "",
    recordAfter: null,
  };
}

function groupRowsIntoGames(rows: Record<string, unknown>[], season: string) {
  const rowsWithRecords = annotateRowsWithRecords(rows);
  return rowsWithRecords
    .map((selectedRow) => {
      const opponentTricodeMatch = /(?:vs\.|@)\s+([A-Z]{2,4})$/.exec(String(selectedRow.MATCHUP || ""));
      const opponentTricode = opponentTricodeMatch?.[1] || "";
      const syntheticOpponentRow = buildSyntheticOpponentRow(selectedRow, opponentTricode);
      const awayRow = String(selectedRow.MATCHUP || "").includes("@") ? selectedRow : syntheticOpponentRow;
      const homeRow = String(selectedRow.MATCHUP || "").includes("vs.") ? selectedRow : syntheticOpponentRow;
      const awayTeam = buildTeamPayload(
        awayRow,
        awayRow === selectedRow ? opponentTricode : "",
        awayRow === selectedRow ? selectedRow.recordAfter as { wins: number; losses: number } : null,
      );
      const homeTeam = buildTeamPayload(
        homeRow,
        homeRow === selectedRow ? opponentTricode : "",
        homeRow === selectedRow ? selectedRow.recordAfter as { wins: number; losses: number } : null,
      );

      return {
        gameId: String(selectedRow.GAME_ID || ""),
        gameCode: "",
        gameStatus: 3,
        gameStatusText: "Final",
        period: 4,
        gameClock: "PT00M00.00S",
        gameTimeUTC: "",
        gameEt: "",
        seasonYear: season,
        seasonType: normalizeSeasonType(selectedRow.seasonType),
        gameDate: String(selectedRow.GAME_DATE || ""),
        arena: {
          arenaName: "",
          arenaState: "",
          arenaCity: "",
        },
        homeTeam,
        awayTeam,
      };
    })
    .sort((left, right) => {
      const dateCompare = String(right.gameDate || "").localeCompare(String(left.gameDate || ""));
      if (dateCompare !== 0) return dateCompare;
      const seasonTypeCompare = seasonTypeRank(right.seasonType) - seasonTypeRank(left.seasonType);
      if (seasonTypeCompare !== 0) return seasonTypeCompare;
      return String(right.gameId || "").localeCompare(String(left.gameId || ""));
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const url = new URL(req.url);
  const teamId = String(url.searchParams.get("teamId") || "").trim();
  const season = String(url.searchParams.get("season") || "").trim() || currentSeasonString();

  if (!TEAM_BY_ID.has(teamId)) {
    return jsonResponse(400, { error: "A valid NBA teamId is required." });
  }

  try {
    const scheduleGames = await fetchScheduleGames(season, teamId).catch(() => filterStaticScheduleGames(season, teamId));
    if (scheduleGames.length) {
      return jsonResponse(200, {
        season,
        teamId,
        source: "schedule",
        count: scheduleGames.length,
        games: scheduleGames,
      });
    }

    const rowsBySeasonType = await Promise.all(
      SEASON_TYPES.map(async (seasonType) => {
        const rows = await fetchSeasonTypeRows(season, seasonType, teamId);
        return rows.map((row) => ({ ...row, seasonType }));
      }),
    );

    const games = groupRowsIntoGames(rowsBySeasonType.flat(), season);

    return jsonResponse(200, {
      season,
      teamId,
      source: "gamefinder",
      count: games.length,
      games,
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to fetch team games",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});
