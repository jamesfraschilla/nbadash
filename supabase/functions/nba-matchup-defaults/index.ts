const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ESPN_DEPTHCHART_TIMEOUT_MS = 7_000;
const ESPN_ATHLETE_TIMEOUT_MS = 4_000;
const POSITION_ORDER = ["pg", "sg", "sf", "pf", "c"] as const;

const NBA_TO_ESPN_TEAMS: Record<string, { espnTeamId: string; tricode: string; fullName: string }> = {
  "1610612737": { espnTeamId: "1", tricode: "ATL", fullName: "Atlanta Hawks" },
  "1610612738": { espnTeamId: "2", tricode: "BOS", fullName: "Boston Celtics" },
  "1610612751": { espnTeamId: "17", tricode: "BKN", fullName: "Brooklyn Nets" },
  "1610612766": { espnTeamId: "30", tricode: "CHA", fullName: "Charlotte Hornets" },
  "1610612741": { espnTeamId: "4", tricode: "CHI", fullName: "Chicago Bulls" },
  "1610612739": { espnTeamId: "5", tricode: "CLE", fullName: "Cleveland Cavaliers" },
  "1610612742": { espnTeamId: "6", tricode: "DAL", fullName: "Dallas Mavericks" },
  "1610612743": { espnTeamId: "7", tricode: "DEN", fullName: "Denver Nuggets" },
  "1610612765": { espnTeamId: "8", tricode: "DET", fullName: "Detroit Pistons" },
  "1610612744": { espnTeamId: "9", tricode: "GSW", fullName: "Golden State Warriors" },
  "1610612745": { espnTeamId: "10", tricode: "HOU", fullName: "Houston Rockets" },
  "1610612754": { espnTeamId: "11", tricode: "IND", fullName: "Indiana Pacers" },
  "1610612746": { espnTeamId: "12", tricode: "LAC", fullName: "LA Clippers" },
  "1610612747": { espnTeamId: "13", tricode: "LAL", fullName: "Los Angeles Lakers" },
  "1610612763": { espnTeamId: "29", tricode: "MEM", fullName: "Memphis Grizzlies" },
  "1610612748": { espnTeamId: "14", tricode: "MIA", fullName: "Miami Heat" },
  "1610612749": { espnTeamId: "15", tricode: "MIL", fullName: "Milwaukee Bucks" },
  "1610612750": { espnTeamId: "16", tricode: "MIN", fullName: "Minnesota Timberwolves" },
  "1610612740": { espnTeamId: "3", tricode: "NOP", fullName: "New Orleans Pelicans" },
  "1610612752": { espnTeamId: "18", tricode: "NYK", fullName: "New York Knicks" },
  "1610612760": { espnTeamId: "25", tricode: "OKC", fullName: "Oklahoma City Thunder" },
  "1610612753": { espnTeamId: "19", tricode: "ORL", fullName: "Orlando Magic" },
  "1610612755": { espnTeamId: "20", tricode: "PHI", fullName: "Philadelphia 76ers" },
  "1610612756": { espnTeamId: "21", tricode: "PHX", fullName: "Phoenix Suns" },
  "1610612757": { espnTeamId: "22", tricode: "POR", fullName: "Portland Trail Blazers" },
  "1610612758": { espnTeamId: "23", tricode: "SAC", fullName: "Sacramento Kings" },
  "1610612759": { espnTeamId: "24", tricode: "SAS", fullName: "San Antonio Spurs" },
  "1610612761": { espnTeamId: "28", tricode: "TOR", fullName: "Toronto Raptors" },
  "1610612762": { espnTeamId: "26", tricode: "UTA", fullName: "Utah Jazz" },
  "1610612764": { espnTeamId: "27", tricode: "WAS", fullName: "Washington Wizards" },
};

type DepthPosition = typeof POSITION_ORDER[number];
type Starter = {
  espnAthleteId: string;
  fullName: string;
  firstName: string;
  familyName: string;
  position: string;
  rank: number;
};

function responseWithHeaders(status: number, body: BodyInit | null, extraHeaders: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(status: number, payload: Record<string, unknown>, extraHeaders: HeadersInit = {}) {
  return responseWithHeaders(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
}

function currentEspnSeason(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return month >= 7 ? year : year - 1;
}

function normalizeRequestedTeamIds(url: URL) {
  const raw = [
    ...url.searchParams.getAll("teamId"),
    ...url.searchParams.getAll("teamIds").flatMap((value) => String(value || "").split(",")),
  ];
  return [...new Set(
    raw
      .map((value) => String(value || "").trim())
      .filter((teamId) => NBA_TO_ESPN_TEAMS[teamId])
  )].slice(0, 4);
}

async function requestJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; NBA Dash Match-Up Defaults)",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function athleteIdFromRef(ref: string) {
  const match = String(ref || "").match(/\/athletes\/(\d+)/);
  return match?.[1] || "";
}

function athleteUrlFromEntry(entry: Record<string, unknown>) {
  const ref = String((entry?.athlete as Record<string, unknown> | undefined)?.$ref || "").trim();
  if (!ref) return "";
  return ref.replace(/^http:\/\//, "https://");
}

async function fetchAthlete(url: string, position: string, rank: number): Promise<Starter | null> {
  const payload = await requestJson(url, ESPN_ATHLETE_TIMEOUT_MS);
  const fullName = String(payload?.fullName || payload?.displayName || "").trim();
  const espnAthleteId = String(payload?.id || athleteIdFromRef(url)).trim();
  if (!fullName || !espnAthleteId) return null;
  return {
    espnAthleteId,
    fullName,
    firstName: String(payload?.firstName || "").trim(),
    familyName: String(payload?.lastName || "").trim(),
    position,
    rank,
  };
}

async function fetchTeamDefaults(teamId: string, season: number) {
  const team = NBA_TO_ESPN_TEAMS[teamId];
  const depthUrl = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/teams/${team.espnTeamId}/depthcharts?lang=en&region=us`;
  const payload = await requestJson(depthUrl, ESPN_DEPTHCHART_TIMEOUT_MS);
  const depthChart = Array.isArray(payload?.items) ? payload.items[0] : null;
  const positions = depthChart?.positions && typeof depthChart.positions === "object"
    ? depthChart.positions as Record<DepthPosition, Record<string, unknown>>
    : {};
  const usedAthleteIds = new Set<string>();
  const players: Starter[] = [];
  const errors: Array<Record<string, unknown>> = [];

  for (const positionKey of POSITION_ORDER) {
    const athletes = Array.isArray(positions?.[positionKey]?.athletes)
      ? positions[positionKey].athletes as Array<Record<string, unknown>>
      : [];
    const ranked = [...athletes].sort((left, right) => {
      const leftRank = Number(left?.rank ?? Number.POSITIVE_INFINITY);
      const rightRank = Number(right?.rank ?? Number.POSITIVE_INFINITY);
      return leftRank - rightRank;
    });
    for (const athleteEntry of ranked) {
      const athleteUrl = athleteUrlFromEntry(athleteEntry);
      const espnAthleteId = athleteIdFromRef(athleteUrl);
      if (!athleteUrl || usedAthleteIds.has(espnAthleteId)) continue;
      try {
        const starter = await fetchAthlete(
          athleteUrl,
          positionKey.toUpperCase(),
          Number(athleteEntry?.rank ?? players.length + 1)
        );
        if (!starter || usedAthleteIds.has(starter.espnAthleteId)) continue;
        usedAthleteIds.add(starter.espnAthleteId);
        players.push(starter);
        break;
      } catch (error) {
        errors.push({
          position: positionKey.toUpperCase(),
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  return {
    teamId,
    espnTeamId: team.espnTeamId,
    tricode: team.tricode,
    fullName: team.fullName,
    season,
    source: "espn-depth-chart",
    sourceUrl: depthUrl,
    players: players.slice(0, 5),
    errors,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const url = new URL(req.url);
    const season = Number.parseInt(url.searchParams.get("season") || "", 10) || currentEspnSeason();
    const teamIds = normalizeRequestedTeamIds(url);
    if (!teamIds.length) {
      return jsonResponse(400, { error: "At least one valid NBA teamId is required." });
    }

    const results = await Promise.allSettled(teamIds.map((teamId) => fetchTeamDefaults(teamId, season)));
    const teams: Record<string, unknown> = {};
    const errors: Array<Record<string, unknown>> = [];
    results.forEach((result, index) => {
      const teamId = teamIds[index];
      if (result.status === "fulfilled") {
        teams[teamId] = result.value;
      } else {
        errors.push({
          teamId,
          error: result.reason instanceof Error ? result.reason.message : "unknown",
        });
      }
    });

    return jsonResponse(200, {
      fetchedAt: new Date().toISOString(),
      season,
      teams,
      errors,
    }, {
      "Cache-Control": "public, max-age=1800, s-maxage=1800, stale-while-revalidate=21600",
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to resolve NBA match-up defaults",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});
