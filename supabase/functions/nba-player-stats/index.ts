const PLAYER_STATS_URL = "https://stats.nba.com/stats/leaguedashplayerstats";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type StatsRow = Record<string, unknown>;

function responseWithHeaders(
  status: number,
  body: BodyInit | null,
  extraHeaders: HeadersInit = {},
) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(
  status: number,
  payload: Record<string, unknown>,
  extraHeaders: HeadersInit = {},
) {
  return responseWithHeaders(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
}

function currentSeasonString(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function previousSeasonString(season: string) {
  const match = /^(\d{4})-\d{2}$/.exec(String(season || "").trim());
  if (!match) throw new Error(`Invalid season: ${season}`);
  const startYear = Number(match[1]) - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function findPlayerStatsResultSet(payload: Record<string, unknown>) {
  const resultSets = Array.isArray(payload?.resultSets)
    ? payload.resultSets
    : payload?.resultSet
    ? [payload.resultSet]
    : [];

  const namedResultSet = resultSets.find((entry) => (
    String((entry as Record<string, unknown>)?.name || "").toLowerCase() ===
      "leaguedashplayerstats"
  ));
  return (namedResultSet || resultSets[0]) as
    | Record<string, unknown>
    | undefined;
}

function mapRows(resultSet: Record<string, unknown> | undefined): StatsRow[] {
  const headers = Array.isArray(resultSet?.headers)
    ? resultSet.headers.map((value) => String(value || ""))
    : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];

  return rows
    .filter((row) => Array.isArray(row))
    .map((row) =>
      headers.reduce<StatsRow>((accumulator, header, index) => {
        accumulator[header] = (row as unknown[])[index];
        return accumulator;
      }, {})
    );
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePercentage(value: unknown) {
  return toNumber(value, 0) * 100;
}

function normalizePlayerRow(row: StatsRow) {
  const personId = String(row.PLAYER_ID || "").trim();
  if (!personId) return null;

  return {
    personId,
    fullName: String(row.PLAYER_NAME || "").trim(),
    teamId: String(row.TEAM_ID || "").trim(),
    teamAbbreviation: String(row.TEAM_ABBREVIATION || "").trim(),
    gamesPlayed: toNumber(row.GP, 0),
    pointsPerGame: toNumber(row.PTS, 0),
    reboundsPerGame: toNumber(row.REB, 0),
    threePointPercentage: normalizePercentage(row.FG3_PCT),
    assistsPerGame: toNumber(row.AST, 0),
    blocksPerGame: toNumber(row.BLK, 0),
    stealsPerGame: toNumber(row.STL, 0),
    freeThrowAttemptsPerGame: toNumber(row.FTA, 0),
    fieldGoalAttemptsPerGame: toNumber(row.FGA, 0),
    threePointAttemptsPerGame: toNumber(row.FG3A, 0),
  };
}

function buildStatsUrl(season: string, teamId: string) {
  const url = new URL(PLAYER_STATS_URL);
  const params: Record<string, string> = {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    GameSegment: "",
    Height: "",
    LastNGames: "0",
    LeagueID: "00",
    Location: "",
    MeasureType: "Base",
    Month: "0",
    OpponentTeamID: "0",
    Outcome: "",
    PORound: "0",
    PaceAdjust: "N",
    PerMode: "PerGame",
    Period: "0",
    PlayerExperience: "",
    PlayerPosition: "",
    PlusMinus: "N",
    Rank: "N",
    Season: season,
    SeasonSegment: "",
    SeasonType: "Regular Season",
    ShotClockRange: "",
    StarterBench: "",
    TeamID: teamId || "0",
    VsConference: "",
    VsDivision: "",
    Weight: "",
  };

  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return url;
}

async function fetchPlayerStatsRows(season: string, teamId: string) {
  const url = buildStatsUrl(season, teamId);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
      Host: "stats.nba.com",
      Origin: "https://www.nba.com",
      Referer: "https://www.nba.com/",
      "User-Agent":
        "Mozilla/5.0 (compatible; NBA Dashboard Player Stats Resolver)",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(
      `Player stats request failed (${response.status}) for ${season}`,
    );
  }

  const payload = await response.json() as Record<string, unknown>;
  return mapRows(findPlayerStatsResultSet(payload));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const url = new URL(req.url);
  const teamId = String(url.searchParams.get("teamId") || "").trim();
  if (teamId && !/^\d+$/.test(teamId)) {
    return jsonResponse(400, { error: "teamId must contain only digits" });
  }

  const requestedSeason = currentSeasonString();
  const fallbackSeason = previousSeasonString(requestedSeason);

  try {
    let season = requestedSeason;
    let rows: StatsRow[] = [];
    let usedPreviousSeason = false;
    let currentSeasonError = "";

    try {
      rows = await fetchPlayerStatsRows(season, teamId);
    } catch (error) {
      currentSeasonError = error instanceof Error ? error.message : "unknown";
    }

    if (!rows.length || currentSeasonError) {
      season = fallbackSeason;
      rows = await fetchPlayerStatsRows(season, teamId);
      usedPreviousSeason = true;
    }

    const players = rows.reduce<
      Record<string, NonNullable<ReturnType<typeof normalizePlayerRow>>>
    >((accumulator, row) => {
      const player = normalizePlayerRow(row);
      if (player) accumulator[player.personId] = player;
      return accumulator;
    }, {});

    return jsonResponse(200, {
      fetchedAt: new Date().toISOString(),
      requestedSeason,
      season,
      usedPreviousSeason,
      currentSeasonError: currentSeasonError || null,
      seasonType: "Regular Season",
      perMode: "PerGame",
      teamId: teamId || null,
      count: Object.keys(players).length,
      players,
    }, {
      "Cache-Control":
        "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return jsonResponse(502, {
      error: "Unable to resolve NBA player stats",
      detail,
      source: PLAYER_STATS_URL,
    });
  }
});
