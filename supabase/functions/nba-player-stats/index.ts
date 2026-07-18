const NBA_PLAYER_STATS_URL =
  "https://stats.nba.com/stats/leaguedashplayerstats";
const GLEAGUE_PLAYER_STATS_URL =
  "https://stats.gleague.nba.com/stats/leaguedashplayerstats";
const ESPN_PLAYER_STATS_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete";

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

function isValidSeason(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(
    match && match[2] === String(Number(match[1]) + 1).slice(-2),
  );
}

function findPlayerStatsResultSet(payload: Record<string, unknown>) {
  const resultSets = Array.isArray(payload?.resultSets)
    ? payload.resultSets
    : payload?.resultSet
    ? [payload.resultSet]
    : [];

  const namedResultSet = resultSets.find((entry) =>
    String((entry as Record<string, unknown>)?.name || "").toLowerCase() ===
      "leaguedashplayerstats"
  );
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

function normalizeNbaPlayerRow(row: StatsRow) {
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

function buildLeagueStatsUrl(season: string, teamId: string, league: string) {
  const isGLeague = league === "gleague";
  const url = new URL(isGLeague ? GLEAGUE_PLAYER_STATS_URL : NBA_PLAYER_STATS_URL);
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
    LeagueID: isGLeague ? "20" : "00",
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

async function fetchNbaPlayerStats(
  season: string,
  teamId: string,
  league = "nba",
) {
  const isGLeague = league === "gleague";
  const url = buildLeagueStatsUrl(season, teamId, league);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: isGLeague ? "https://gleague.nba.com" : "https://www.nba.com",
      Referer: isGLeague ? "https://gleague.nba.com/" : "https://www.nba.com/",
      "User-Agent":
        "Mozilla/5.0 (compatible; NBA Dashboard Player Stats Resolver)",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(
      `${isGLeague ? "G League" : "NBA"} player stats request failed (${response.status}) for ${season}`,
    );
  }

  const payload = await response.json() as Record<string, unknown>;
  return mapRows(findPlayerStatsResultSet(payload))
    .map(normalizeNbaPlayerRow)
    .filter(Boolean) as StatsRow[];
}

function buildEspnStatsUrl(season: string, page: number) {
  const endYear = Number(season.slice(0, 4)) + 1;
  const url = new URL(ESPN_PLAYER_STATS_URL);
  url.searchParams.set("region", "us");
  url.searchParams.set("lang", "en");
  url.searchParams.set("contentorigin", "espn");
  url.searchParams.set("isqualified", "true");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", "500");
  url.searchParams.set("sort", "offensive.avgPoints:desc");
  url.searchParams.set("season", String(endYear));
  url.searchParams.set("seasontype", "2");
  return url;
}

function categoryStats(
  definitions: unknown[],
  athleteCategories: unknown[],
  categoryName: string,
) {
  const definition = definitions.find((entry) =>
    String((entry as Record<string, unknown>)?.name || "") === categoryName
  ) as Record<string, unknown> | undefined;
  const category = athleteCategories.find((entry) =>
    String((entry as Record<string, unknown>)?.name || "") === categoryName
  ) as Record<string, unknown> | undefined;
  const names = Array.isArray(definition?.names) ? definition.names : [];
  const values = Array.isArray(category?.values) ? category.values : [];
  return names.reduce<Record<string, unknown>>((result, name, index) => {
    result[String(name)] = values[index];
    return result;
  }, {});
}

function normalizeEspnAthlete(
  entry: Record<string, unknown>,
  definitions: unknown[],
) {
  const athlete = entry.athlete as Record<string, unknown> | undefined;
  const athleteId = String(athlete?.id || "").trim();
  const fullName = String(athlete?.displayName || "").trim();
  if (!athleteId || !fullName) return null;

  const categories = Array.isArray(entry.categories) ? entry.categories : [];
  const general = categoryStats(definitions, categories, "general");
  const offensive = categoryStats(definitions, categories, "offensive");
  const defensive = categoryStats(definitions, categories, "defensive");

  return {
    personId: `espn-${athleteId}`,
    fullName,
    teamId: "",
    teamAbbreviation: String(athlete?.teamShortName || "").trim(),
    gamesPlayed: toNumber(general.gamesPlayed, 0),
    pointsPerGame: toNumber(offensive.avgPoints, 0),
    reboundsPerGame: toNumber(general.avgRebounds, 0),
    threePointPercentage: toNumber(offensive.threePointFieldGoalPct, 0),
    assistsPerGame: toNumber(offensive.avgAssists, 0),
    blocksPerGame: toNumber(defensive.avgBlocks, 0),
    stealsPerGame: toNumber(defensive.avgSteals, 0),
    freeThrowAttemptsPerGame: toNumber(offensive.avgFreeThrowsAttempted, 0),
    fieldGoalAttemptsPerGame: toNumber(offensive.avgFieldGoalsAttempted, 0),
    threePointAttemptsPerGame: toNumber(
      offensive.avgThreePointFieldGoalsAttempted,
      0,
    ),
  };
}

async function fetchEspnPage(season: string, page: number) {
  const url = buildEspnStatsUrl(season, page);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "NBA Dashboard Player Stats Resolver",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Fallback player stats request failed (${response.status}) for ${season}`,
    );
  }
  return await response.json() as Record<string, unknown>;
}

async function fetchEspnPlayerStats(season: string) {
  const firstPage = await fetchEspnPage(season, 1);
  const reportedPageCount = Math.max(
    1,
    Number(
      (firstPage.pagination as Record<string, unknown> | undefined)?.pages,
    ) || 1,
  );
  const remainingResults = reportedPageCount > 1
    ? await Promise.allSettled(
      Array.from(
        { length: reportedPageCount - 1 },
        (_, index) => fetchEspnPage(season, index + 2),
      ),
    )
    : [];
  const remainingPages = remainingResults.flatMap((result) => (
    result.status === "fulfilled" ? [result.value] : []
  ));
  const definitions = Array.isArray(firstPage.categories)
    ? firstPage.categories
    : [];
  const entries = [firstPage, ...remainingPages].flatMap((page) =>
    Array.isArray(page.athletes) ? page.athletes : []
  );
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) =>
      normalizeEspnAthlete(entry as Record<string, unknown>, definitions)
    )
    .filter(Boolean) as StatsRow[];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const url = new URL(req.url);
  const leagueParam = String(url.searchParams.get("league") || "nba").trim().toLowerCase();
  if (leagueParam !== "nba" && leagueParam !== "gleague") {
    return jsonResponse(400, { error: "league must be nba or gleague" });
  }
  const league = leagueParam === "gleague" ? "gleague" : "nba";
  const teamId = String(url.searchParams.get("teamId") || "").trim();
  if (teamId && !/^\d+$/.test(teamId)) {
    return jsonResponse(400, { error: "teamId must contain only digits" });
  }

  const seasonParam = String(url.searchParams.get("season") || "").trim();
  if (seasonParam && !isValidSeason(seasonParam)) {
    return jsonResponse(400, {
      error: "season must use a valid YYYY-YY format",
    });
  }
  const requestedSeason = seasonParam || currentSeasonString();

  let rows: StatsRow[] = [];
  let source = league;
  let nbaError = "";

  try {
    rows = await fetchNbaPlayerStats(requestedSeason, teamId, league);
  } catch (error) {
    nbaError = errorMessage(error);
  }

  if (league === "gleague") {
    if (nbaError) {
      return jsonResponse(502, {
        error: "Unable to resolve G League player stats",
        detail: nbaError,
        source: GLEAGUE_PLAYER_STATS_URL,
      });
    }
  } else if (!rows.length) {
    try {
      rows = await fetchEspnPlayerStats(requestedSeason);
      source = "espn-fallback";
    } catch (error) {
      const fallbackError = errorMessage(error);
      return jsonResponse(502, {
        error: "Unable to resolve NBA player stats",
        detail: `${nbaError || "NBA API returned no rows"}; ${fallbackError}`,
        source: NBA_PLAYER_STATS_URL,
      });
    }
  }

  const players = rows.reduce<Record<string, StatsRow>>(
    (accumulator, player) => {
      const personId = String(player?.personId || "").trim();
      if (personId) accumulator[personId] = player;
      return accumulator;
    },
    {},
  );

  return jsonResponse(200, {
    fetchedAt: new Date().toISOString(),
    requestedSeason,
    season: requestedSeason,
    league,
    seasonType: "Regular Season",
    perMode: "PerGame",
    teamId: teamId || null,
    source,
    nbaError: nbaError || null,
    count: Object.keys(players).length,
    players,
  }, {
    "Cache-Control":
      "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
  });
});
