const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const GLEAGUE_PLAYER_INDEX_URL = "https://stats.gleague.nba.com/stats/playerindex";

function responseWithHeaders(status: number, body: BodyInit | null, extraHeaders: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return responseWithHeaders(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
  });
}

function toSortableJersey(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function buildCurrentSeasonLabel(now = new Date()) {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function previousSeasonLabel(season: string) {
  const startYear = Number(season.slice(0, 4)) - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

type GLeagueTeam = {
  teamId: string;
  teamCity: string;
  teamName: string;
  teamAbbreviation: string;
  players: Array<{
    personId: string;
    firstName: string;
    familyName: string;
    fullName: string;
    jerseyNum: string;
    position: string;
    height: string;
    teamId: string;
  }>;
};

async function fetchRosterSeason(season: string) {
  const url = new URL(GLEAGUE_PLAYER_INDEX_URL);
  url.searchParams.set("LeagueID", "20");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", "Regular Season");
  url.searchParams.set("Active", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard G League Roster Resolver)",
      Accept: "application/json",
      Referer: "https://stats.gleague.nba.com/players/",
      Origin: "https://stats.gleague.nba.com",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Roster fetch failed (${response.status}) for ${season}`);
  }

  const payload = await response.json();
  const resultSet = Array.isArray(payload?.resultSets) ? payload.resultSets[0] : null;
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];
  const columnIndex = Object.fromEntries(headers.map((header: string, index: number) => [header, index]));
  const teams: Record<string, GLeagueTeam> = {};

  rows.forEach((row: unknown[]) => {
    if (!Array.isArray(row)) return;
    const teamId = String(row[columnIndex.TEAM_ID] || "").trim();
    const personId = String(row[columnIndex.PERSON_ID] || "").trim();
    const firstName = String(row[columnIndex.PLAYER_FIRST_NAME] || "").trim();
    const familyName = String(row[columnIndex.PLAYER_LAST_NAME] || "").trim();
    const fullName = [firstName, familyName].filter(Boolean).join(" ").trim();
    if (!teamId || !personId || !fullName) return;

    if (!teams[teamId]) {
      teams[teamId] = {
        teamId,
        teamCity: String(row[columnIndex.TEAM_CITY] || "").trim(),
        teamName: String(row[columnIndex.TEAM_NAME] || "").trim(),
        teamAbbreviation: String(row[columnIndex.TEAM_ABBREVIATION] || "").trim(),
        players: [],
      };
    }

    teams[teamId].players.push({
      personId,
      firstName,
      familyName,
      fullName,
      jerseyNum: String(row[columnIndex.JERSEY_NUMBER] || "").trim(),
      position: String(row[columnIndex.POSITION] || "").trim(),
      height: String((columnIndex.HEIGHT != null ? row[columnIndex.HEIGHT] : "") || "").trim(),
      teamId,
    });
  });

  Object.values(teams).forEach((team) => {
    team.players.sort((a, b) => {
      const jerseyCompare = toSortableJersey(a.jerseyNum) - toSortableJersey(b.jerseyNum);
      return jerseyCompare !== 0 ? jerseyCompare : a.fullName.localeCompare(b.fullName);
    });
  });

  return { teams, source: url.toString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const requestedSeason = buildCurrentSeasonLabel();
  const seasons = [requestedSeason, previousSeasonLabel(requestedSeason)];
  const errors: string[] = [];

  try {
    for (const season of seasons) {
      try {
        const result = await fetchRosterSeason(season);
        const playerCount = Object.values(result.teams).reduce((count, team) => count + team.players.length, 0);
        if (!playerCount) continue;

        return responseWithHeaders(200, JSON.stringify({
          fetchedAt: new Date().toISOString(),
          requestedSeason,
          season,
          fallbackSeason: season !== requestedSeason,
          teams: result.teams,
        }), {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "unknown");
      }
    }

    return jsonResponse(502, {
      error: "G League roster feed returned no players",
      detail: errors.join("; ") || `No roster rows were available for ${seasons.join(" or ")}`,
      source: GLEAGUE_PLAYER_INDEX_URL,
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to resolve G League rosters",
      detail: error instanceof Error ? error.message : "unknown",
      source: GLEAGUE_PLAYER_INDEX_URL,
    });
  }
});
