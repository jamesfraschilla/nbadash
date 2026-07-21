import { readRosterSnapshot, writeRosterSnapshot } from "../_shared/rosterSnapshot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const COMMON_TEAM_ROSTER_URL = "https://stats.nba.com/stats/commonteamroster";
const TEAM_REQUEST_TIMEOUT_MS = 8_000;
const GLOBAL_REQUEST_DEADLINE_MS = 12_000;

const NBA_TEAMS = [
  { teamId: "1610612737", teamCity: "Atlanta", teamName: "Hawks", teamAbbreviation: "ATL" },
  { teamId: "1610612738", teamCity: "Boston", teamName: "Celtics", teamAbbreviation: "BOS" },
  { teamId: "1610612751", teamCity: "Brooklyn", teamName: "Nets", teamAbbreviation: "BKN" },
  { teamId: "1610612766", teamCity: "Charlotte", teamName: "Hornets", teamAbbreviation: "CHA" },
  { teamId: "1610612741", teamCity: "Chicago", teamName: "Bulls", teamAbbreviation: "CHI" },
  { teamId: "1610612739", teamCity: "Cleveland", teamName: "Cavaliers", teamAbbreviation: "CLE" },
  { teamId: "1610612742", teamCity: "Dallas", teamName: "Mavericks", teamAbbreviation: "DAL" },
  { teamId: "1610612743", teamCity: "Denver", teamName: "Nuggets", teamAbbreviation: "DEN" },
  { teamId: "1610612765", teamCity: "Detroit", teamName: "Pistons", teamAbbreviation: "DET" },
  { teamId: "1610612744", teamCity: "Golden State", teamName: "Warriors", teamAbbreviation: "GSW" },
  { teamId: "1610612745", teamCity: "Houston", teamName: "Rockets", teamAbbreviation: "HOU" },
  { teamId: "1610612754", teamCity: "Indiana", teamName: "Pacers", teamAbbreviation: "IND" },
  { teamId: "1610612746", teamCity: "LA", teamName: "Clippers", teamAbbreviation: "LAC" },
  { teamId: "1610612747", teamCity: "Los Angeles", teamName: "Lakers", teamAbbreviation: "LAL" },
  { teamId: "1610612763", teamCity: "Memphis", teamName: "Grizzlies", teamAbbreviation: "MEM" },
  { teamId: "1610612748", teamCity: "Miami", teamName: "Heat", teamAbbreviation: "MIA" },
  { teamId: "1610612749", teamCity: "Milwaukee", teamName: "Bucks", teamAbbreviation: "MIL" },
  { teamId: "1610612750", teamCity: "Minnesota", teamName: "Timberwolves", teamAbbreviation: "MIN" },
  { teamId: "1610612740", teamCity: "New Orleans", teamName: "Pelicans", teamAbbreviation: "NOP" },
  { teamId: "1610612752", teamCity: "New York", teamName: "Knicks", teamAbbreviation: "NYK" },
  { teamId: "1610612760", teamCity: "Oklahoma City", teamName: "Thunder", teamAbbreviation: "OKC" },
  { teamId: "1610612753", teamCity: "Orlando", teamName: "Magic", teamAbbreviation: "ORL" },
  { teamId: "1610612755", teamCity: "Philadelphia", teamName: "76ers", teamAbbreviation: "PHI" },
  { teamId: "1610612756", teamCity: "Phoenix", teamName: "Suns", teamAbbreviation: "PHX" },
  { teamId: "1610612757", teamCity: "Portland", teamName: "Trail Blazers", teamAbbreviation: "POR" },
  { teamId: "1610612758", teamCity: "Sacramento", teamName: "Kings", teamAbbreviation: "SAC" },
  { teamId: "1610612759", teamCity: "San Antonio", teamName: "Spurs", teamAbbreviation: "SAS" },
  { teamId: "1610612761", teamCity: "Toronto", teamName: "Raptors", teamAbbreviation: "TOR" },
  { teamId: "1610612762", teamCity: "Utah", teamName: "Jazz", teamAbbreviation: "UTA" },
  { teamId: "1610612764", teamCity: "Washington", teamName: "Wizards", teamAbbreviation: "WAS" },
];

type TeamRecord = typeof NBA_TEAMS[number];

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

function currentSeasonString(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function splitName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", familyName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], familyName: "" };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    familyName: parts[parts.length - 1],
  };
}

function findResultSet(payload: Record<string, unknown>, targetName: string) {
  const resultSets = Array.isArray(payload?.resultSets)
    ? payload.resultSets
    : payload?.resultSet
      ? [payload.resultSet]
      : [];
  return resultSets.find((entry) => String((entry as Record<string, unknown>)?.name || "").toLowerCase() === targetName.toLowerCase()) as Record<string, unknown> | undefined;
}

function mapRows(resultSet: Record<string, unknown>) {
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers.map((value) => String(value || "")) : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];
  return rows
    .filter((row) => Array.isArray(row))
    .map((row) => headers.reduce<Record<string, unknown>>((accumulator, header, index) => {
      accumulator[header] = (row as unknown[])[index];
      return accumulator;
    }, {}));
}

async function fetchTeamRoster(team: TeamRecord, season: string, parentSignal: AbortSignal) {
  const url = new URL(COMMON_TEAM_ROSTER_URL);
  url.searchParams.set("LeagueID", "00");
  url.searchParams.set("Season", season);
  url.searchParams.set("TeamID", team.teamId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("team-timeout"), TEAM_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort(parentSignal.reason || "global-deadline");
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        Host: "stats.nba.com",
        Origin: "https://www.nba.com",
        Referer: "https://www.nba.com/",
        "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Roster Resolver)",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", abortFromParent);
  }

  if (!response.ok) {
    throw new Error(`Roster fetch failed (${response.status}) for ${team.teamAbbreviation}`);
  }

  const payload = await response.json();
  const rosterSet = findResultSet(payload, "CommonTeamRoster");
  const rosterRows = rosterSet ? mapRows(rosterSet) : [];
  if (!rosterRows.length) {
    throw new Error(`Roster feed returned no players for ${team.teamAbbreviation}`);
  }

  return {
    teamId: team.teamId,
    teamCity: team.teamCity,
    teamName: team.teamName,
    teamAbbreviation: team.teamAbbreviation,
    players: rosterRows
      .map((row) => {
        const fullName = String(row.PLAYER || "").trim();
        const personId = String(row.PLAYER_ID || "").trim();
        if (!fullName || !personId) return null;
        const { firstName, familyName } = splitName(fullName);
        return {
          personId,
          firstName,
          familyName,
          fullName,
          jerseyNum: String(row.NUM || "").trim(),
          position: String(row.POSITION || "").trim(),
          height: String(row.HEIGHT || "").trim(),
          teamId: team.teamId,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const jerseyCompare = toSortableJersey(a!.jerseyNum) - toSortableJersey(b!.jerseyNum);
        if (jerseyCompare !== 0) return jerseyCompare;
        return a!.fullName.localeCompare(b!.fullName);
      }),
  };
}

async function mapSettledWithConcurrency<T, R>(
  values: T[],
  worker: (value: T, index: number) => Promise<R>,
  concurrency = 6,
) {
  const results: PromiseSettledResult<R>[] = Array(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = { status: "fulfilled", value: await worker(values[index], index) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const season = currentSeasonString();
    const snapshotPromise = readRosterSnapshot("nba");
    const globalController = new AbortController();
    const globalTimeoutId = setTimeout(
      () => globalController.abort("global-deadline"),
      GLOBAL_REQUEST_DEADLINE_MS,
    );
    let rosterResults: PromiseSettledResult<Awaited<ReturnType<typeof fetchTeamRoster>>>[];
    try {
      rosterResults = await mapSettledWithConcurrency(
        NBA_TEAMS,
        (team) => fetchTeamRoster(team, season, globalController.signal),
        6,
      );
    } finally {
      clearTimeout(globalTimeoutId);
    }
    const teamRosters = rosterResults
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchTeamRoster>>> => result.status === "fulfilled")
      .map((result) => result.value);
    const snapshot = await snapshotPromise;
    const snapshotTeams = snapshot?.teams && typeof snapshot.teams === "object"
      ? snapshot.teams as Record<string, Awaited<ReturnType<typeof fetchTeamRoster>>>
      : {};
    const errors = rosterResults.flatMap((result, index) => (
      result.status === "rejected"
        ? [{
          teamId: NBA_TEAMS[index].teamId,
          teamAbbreviation: NBA_TEAMS[index].teamAbbreviation,
          error: result.reason instanceof Error ? result.reason.message : "unknown",
        }]
        : []
    ));
    const liveTeams = teamRosters.reduce<Record<string, Awaited<ReturnType<typeof fetchTeamRoster>>>>((accumulator, team) => {
      accumulator[team.teamId] = team;
      return accumulator;
    }, {});
    const teams = { ...snapshotTeams, ...liveTeams };
    const cachedTeamIds = Object.keys(snapshotTeams).filter((teamId) => !liveTeams[teamId]);
    const fetchedAt = teamRosters.length ? new Date().toISOString() : String(snapshot?.fetchedAt || new Date().toISOString());
    const resolvedSeason = teamRosters.length ? season : String(snapshot?.season || season);
    const responsePayload = {
      fetchedAt,
      requestedSeason: season,
      season: resolvedSeason,
      fallbackSeason: resolvedSeason !== season,
      teams,
      partial: errors.length > 0 || cachedTeamIds.length > 0,
      deadlineReached: globalController.signal.aborted,
      cacheFallback: teamRosters.length === 0 && Object.keys(snapshotTeams).length > 0,
      cachedTeamIds,
      errors,
    };
    if (teamRosters.length) {
      await writeRosterSnapshot("nba", resolvedSeason, responsePayload);
    }

    return responseWithHeaders(200, JSON.stringify(responsePayload), {
      "Content-Type": "application/json",
      "Cache-Control": responsePayload.partial
        ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
        : "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to resolve NBA rosters",
      detail: error instanceof Error ? error.message : "unknown",
      source: COMMON_TEAM_ROSTER_URL,
    });
  }
});
