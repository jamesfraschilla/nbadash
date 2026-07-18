const ESPN_PLAYER_STATS_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete";
const JINA_READER_BASE = "https://r.jina.ai/";

async function mapSettledWithConcurrency(items, worker, concurrency = 4) {
  const values = Array.isArray(items) ? items : [];
  const results = Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(values[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export function buildEspnPlayerStatsUrl(season, page) {
  const startYear = Number(String(season || "").slice(0, 4));
  const url = new URL(ESPN_PLAYER_STATS_URL);
  url.searchParams.set("region", "us");
  url.searchParams.set("lang", "en");
  url.searchParams.set("contentorigin", "espn");
  url.searchParams.set("isqualified", "true");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", "500");
  url.searchParams.set("sort", "offensive.avgPoints:desc");
  url.searchParams.set("season", String(startYear + 1));
  url.searchParams.set("seasontype", "2");
  return url.toString();
}

function buildNbaStatsPageUrl(pathname, season, teamId = "") {
  const url = new URL(pathname, "https://www.nba.com");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", "Regular Season");
  url.searchParams.set("PerMode", "PerGame");
  if (teamId) url.searchParams.set("TeamID", teamId);
  return `${JINA_READER_BASE}${url.toString()}`;
}

function markdownCellValue(value) {
  return String(value || "")
    .trim()
    .replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1")
    .trim();
}

function finiteNumber(value) {
  const normalized = markdownCellValue(value);
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseNbaPlayerStatsMarkdown(markdown, player, season) {
  const seasonPrefix = `| ${season} |`;
  const row = String(markdown || "")
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith(seasonPrefix));
  if (!row) return null;
  const cells = row.split("|").slice(1, -1).map(markdownCellValue);
  if (cells.length < 20 || cells[0] !== season) return null;
  return {
    personId: String(player?.personId || "").trim(),
    fullName: String(player?.fullName || "").trim(),
    teamId: String(player?.teamId || "").trim(),
    gamesPlayed: finiteNumber(cells[1]),
    pointsPerGame: finiteNumber(cells[3]),
    fieldGoalAttemptsPerGame: finiteNumber(cells[5]),
    threePointAttemptsPerGame: finiteNumber(cells[8]),
    threePointPercentage: finiteNumber(cells[9]),
    freeThrowAttemptsPerGame: finiteNumber(cells[11]),
    reboundsPerGame: finiteNumber(cells[15]),
    assistsPerGame: finiteNumber(cells[16]),
    stealsPerGame: finiteNumber(cells[18]),
    blocksPerGame: finiteNumber(cells[19]),
  };
}

function categoryValues(definitions, categories, categoryName) {
  const definition = definitions.find((entry) => entry?.name === categoryName);
  const category = categories.find((entry) => entry?.name === categoryName);
  const names = Array.isArray(definition?.names) ? definition.names : [];
  const values = Array.isArray(category?.values) ? category.values : [];
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

function normalizeEntry(entry, definitions) {
  const athleteId = String(entry?.athlete?.id || "").trim();
  const fullName = String(entry?.athlete?.displayName || "").trim();
  if (!athleteId || !fullName) return null;
  const categories = Array.isArray(entry?.categories) ? entry.categories : [];
  const general = categoryValues(definitions, categories, "general");
  const offensive = categoryValues(definitions, categories, "offensive");
  const defensive = categoryValues(definitions, categories, "defensive");
  return {
    personId: `espn-${athleteId}`,
    fullName,
    teamId: "",
    teamAbbreviation: String(entry?.athlete?.teamShortName || "").trim(),
    gamesPlayed: general.gamesPlayed,
    pointsPerGame: offensive.avgPoints,
    reboundsPerGame: general.avgRebounds,
    threePointPercentage: offensive.threePointFieldGoalPct,
    assistsPerGame: offensive.avgAssists,
    blocksPerGame: defensive.avgBlocks,
    stealsPerGame: defensive.avgSteals,
    freeThrowAttemptsPerGame: offensive.avgFreeThrowsAttempted,
    fieldGoalAttemptsPerGame: offensive.avgFieldGoalsAttempted,
    threePointAttemptsPerGame: offensive.avgThreePointFieldGoalsAttempted,
  };
}

export function normalizeEspnPlayerStatsPages(pages, season) {
  const safePages = Array.isArray(pages) ? pages : [];
  const definitions = Array.isArray(safePages[0]?.categories) ? safePages[0].categories : [];
  const entries = safePages.flatMap((page) => (Array.isArray(page?.athletes) ? page.athletes : []));
  const players = entries.reduce((result, entry) => {
    const player = normalizeEntry(entry, definitions);
    if (player) result[player.personId] = player;
    return result;
  }, {});
  return {
    fetchedAt: new Date().toISOString(),
    requestedSeason: season,
    season,
    seasonType: "Regular Season",
    perMode: "PerGame",
    source: "espn-browser-fallback",
    count: Object.keys(players).length,
    players,
  };
}

async function requestJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Fallback stats request failed: ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`NBA stats page fallback failed: ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchOfficialNbaPlayerStatsFallback({
  season,
  teamId,
  players,
}) {
  const roster = (Array.isArray(players) ? players : [])
    .filter((player) => String(player?.personId || "").trim())
    .slice(0, 18);
  if (!season || !teamId || !roster.length) {
    throw new Error("Team and roster are required for the NBA stats page fallback.");
  }

  const teamPage = await requestText(buildNbaStatsPageUrl("/stats/players/traditional", season, teamId));
  const hasSeasonData = /^\|\s*\d+\s*\|\s*\[[^\]]+\]\(https:\/\/www\.nba\.com\/stats\/player\/\d+/m
    .test(teamPage);
  if (!hasSeasonData) {
    if (!/No data available/i.test(teamPage)) {
      throw new Error("The NBA stats page did not contain a recognizable player table.");
    }
    return {
      fetchedAt: new Date().toISOString(),
      requestedSeason: season,
      season,
      seasonType: "Regular Season",
      perMode: "PerGame",
      source: "nba-web-fallback",
      count: 0,
      players: {},
    };
  }

  const playerResults = await mapSettledWithConcurrency(roster, async (player) => {
    const personId = String(player.personId).trim();
    const markdown = await requestText(
      buildNbaStatsPageUrl(`/stats/player/${personId}/traditional`, season)
    );
    const stats = parseNbaPlayerStatsMarkdown(markdown, player, season);
    if (!stats && !/No data available/i.test(markdown)) {
      throw new Error(`The NBA stats page for player ${personId} was not recognizable.`);
    }
    return stats;
  }, 4);
  const resolvedPlayers = playerResults.flatMap((result) => (
    result.status === "fulfilled" && result.value ? [result.value] : []
  ));
  const errors = playerResults.flatMap((result, index) => (
    result.status === "rejected"
      ? [{
        personId: String(roster[index]?.personId || "").trim(),
        message: result.reason instanceof Error ? result.reason.message : "unknown",
      }]
      : []
  ));
  const playerMap = Object.fromEntries(
    resolvedPlayers.map((player) => [player.personId, player])
  );
  return {
    fetchedAt: new Date().toISOString(),
    requestedSeason: season,
    season,
    seasonType: "Regular Season",
    perMode: "PerGame",
    source: "nba-web-fallback",
    count: Object.keys(playerMap).length,
    players: playerMap,
    partial: errors.length > 0,
    errors,
  };
}

export async function fetchBrowserPlayerStatsFallback(season) {
  const firstPage = await requestJson(buildEspnPlayerStatsUrl(season, 1));
  const reportedPageCount = Math.max(
    1,
    Number(firstPage?.pagination?.pages) || 1
  );
  const remainingResults = reportedPageCount > 1
    ? await mapSettledWithConcurrency(Array.from(
      { length: reportedPageCount - 1 },
      (_, index) => index + 2
    ), (page) => requestJson(buildEspnPlayerStatsUrl(season, page)), 3)
    : [];
  const remainingPages = remainingResults.flatMap((result) => (
    result.status === "fulfilled" ? [result.value] : []
  ));
  const payload = normalizeEspnPlayerStatsPages([firstPage, ...remainingPages], season);
  const errors = remainingResults.flatMap((result, index) => (
    result.status === "rejected"
      ? [{
        page: index + 2,
        message: result.reason instanceof Error ? result.reason.message : "unknown",
      }]
      : []
  ));
  return {
    ...payload,
    partial: errors.length > 0,
    errors,
  };
}
