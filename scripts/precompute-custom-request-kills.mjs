import fs from "node:fs/promises";
import path from "node:path";

const NBA_STATS_BASE = "https://stats.nba.com/stats";
const NBA_CDN_BASE = "https://cdn.nba.com/static/json/liveData";
const season = process.argv[2] || "2025-26";
const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "supabase", "functions", "custom-requests", "leagueTeamGameKillsBySeason.json");
const REQUEST_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Custom Requests)",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

const NBA_TEAMS = [
  { teamId: "1610612737", tricode: "ATL", fullName: "Atlanta Hawks" },
  { teamId: "1610612738", tricode: "BOS", fullName: "Boston Celtics" },
  { teamId: "1610612751", tricode: "BKN", fullName: "Brooklyn Nets" },
  { teamId: "1610612766", tricode: "CHA", fullName: "Charlotte Hornets" },
  { teamId: "1610612741", tricode: "CHI", fullName: "Chicago Bulls" },
  { teamId: "1610612739", tricode: "CLE", fullName: "Cleveland Cavaliers" },
  { teamId: "1610612742", tricode: "DAL", fullName: "Dallas Mavericks" },
  { teamId: "1610612743", tricode: "DEN", fullName: "Denver Nuggets" },
  { teamId: "1610612765", tricode: "DET", fullName: "Detroit Pistons" },
  { teamId: "1610612744", tricode: "GSW", fullName: "Golden State Warriors" },
  { teamId: "1610612745", tricode: "HOU", fullName: "Houston Rockets" },
  { teamId: "1610612754", tricode: "IND", fullName: "Indiana Pacers" },
  { teamId: "1610612746", tricode: "LAC", fullName: "LA Clippers" },
  { teamId: "1610612747", tricode: "LAL", fullName: "Los Angeles Lakers" },
  { teamId: "1610612763", tricode: "MEM", fullName: "Memphis Grizzlies" },
  { teamId: "1610612748", tricode: "MIA", fullName: "Miami Heat" },
  { teamId: "1610612749", tricode: "MIL", fullName: "Milwaukee Bucks" },
  { teamId: "1610612750", tricode: "MIN", fullName: "Minnesota Timberwolves" },
  { teamId: "1610612740", tricode: "NOP", fullName: "New Orleans Pelicans" },
  { teamId: "1610612752", tricode: "NYK", fullName: "New York Knicks" },
  { teamId: "1610612760", tricode: "OKC", fullName: "Oklahoma City Thunder" },
  { teamId: "1610612753", tricode: "ORL", fullName: "Orlando Magic" },
  { teamId: "1610612755", tricode: "PHI", fullName: "Philadelphia 76ers" },
  { teamId: "1610612756", tricode: "PHX", fullName: "Phoenix Suns" },
  { teamId: "1610612757", tricode: "POR", fullName: "Portland Trail Blazers" },
  { teamId: "1610612758", tricode: "SAC", fullName: "Sacramento Kings" },
  { teamId: "1610612759", tricode: "SAS", fullName: "San Antonio Spurs" },
  { teamId: "1610612761", tricode: "TOR", fullName: "Toronto Raptors" },
  { teamId: "1610612762", tricode: "UTA", fullName: "Utah Jazz" },
  { teamId: "1610612764", tricode: "WAS", fullName: "Washington Wizards" },
];

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function requestJson(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

async function mapWithConcurrency(items, worker, concurrency = 8) {
  const results = new Array(items.length);
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map((item, batchIndex) => worker(item, index + batchIndex)));
    batchResults.forEach((result, batchIndex) => {
      results[index + batchIndex] = result;
    });
  }
  return results;
}

function rowObjectsFromResultSet(resultSet) {
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers.map((header) => String(header || "")) : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];
  return rows.map((row) => headers.reduce((accumulator, header, index) => {
    accumulator[header] = row[index];
    return accumulator;
  }, {}));
}

async function fetchGamefinderRows(value, seasonType) {
  const url = new URL(`${NBA_STATS_BASE}/leaguegamefinder`);
  url.searchParams.set("PlayerOrTeam", "T");
  url.searchParams.set("Season", value);
  url.searchParams.set("SeasonType", seasonType);
  url.searchParams.set("LeagueID", "00");
  const payload = await requestJson(url.toString());
  return rowObjectsFromResultSet(payload?.resultSets?.[0] || payload?.resultSet)
    .map((row) => ({
      seasonType,
      teamId: String(row.TEAM_ID || ""),
      tricode: String(row.TEAM_ABBREVIATION || ""),
      fullName: String(row.TEAM_NAME || ""),
      gameId: String(row.GAME_ID || ""),
      gameDate: String(row.GAME_DATE || ""),
      matchup: String(row.MATCHUP || ""),
      result: String(row.WL || ""),
      points: safeNumber(row.PTS, 0),
    }))
    .filter((row) => row.teamId && row.gameId && row.gameDate && (row.result === "W" || row.result === "L"));
}

async function fetchSeasonGames(value) {
  const seasonTypeRows = await Promise.all(
    ["Pre Season", "Regular Season", "Playoffs"].map((seasonType) => fetchGamefinderRows(value, seasonType).catch(() => [])),
  );
  const byGame = new Map();
  seasonTypeRows.flat().forEach((row) => {
    if (!byGame.has(row.gameId)) {
      byGame.set(row.gameId, {
        gameId: row.gameId,
        gameDate: row.gameDate,
        seasonType: row.seasonType,
        teams: [],
      });
    }
    byGame.get(row.gameId).teams.push(row);
  });
  return [...byGame.values()]
    .filter((game) => game.teams.length >= 2)
    .sort((left, right) => String(right.gameDate || "").localeCompare(String(left.gameDate || "")));
}

async function fetchPlayByPlay(gameId, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestJson(`${NBA_CDN_BASE}/playbyplay/playbyplay_${gameId}.json`);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  throw lastError || new Error(`Failed to fetch game ${gameId}.`);
}

function computeDisplayedKillsByTeam(actions, homeTeamId, awayTeamId) {
  const orderedActions = [...actions].sort((a, b) => {
    const aOrder = safeNumber(a.orderNumber ?? a.actionNumber, 0);
    const bOrder = safeNumber(b.orderNumber ?? b.actionNumber, 0);
    return aOrder - bOrder;
  });
  const streaks = { [homeTeamId]: 0, [awayTeamId]: 0 };
  const kills = { [homeTeamId]: 0, [awayTeamId]: 0 };
  let currentPossession = null;
  let possessionScored = false;
  let possessionTeam = null;

  const finishPossession = () => {
    if (!possessionTeam) return;
    const possessionKey = String(possessionTeam);
    if (!possessionScored) {
      streaks[possessionKey] += 1;
      if (streaks[possessionKey] >= 3 && streaks[possessionKey] % 3 === 0) {
        const opponent = possessionKey === homeTeamId ? awayTeamId : homeTeamId;
        kills[opponent] += 1;
      }
    } else {
      streaks[possessionKey] = 0;
    }
  };

  orderedActions.forEach((action) => {
    if (action.possession && action.possession !== currentPossession) {
      finishPossession();
      currentPossession = action.possession;
      possessionTeam = action.possession;
      possessionScored = false;
    }
    if (!possessionTeam) return;
    if ((action.actionType === "2pt" || action.actionType === "3pt") && String(action.shotResult || "") === "Made") {
      possessionScored = true;
    }
    if (action.actionType === "freethrow" && String(action.teamId || "") === String(possessionTeam)) {
      possessionScored = true;
    }
  });

  finishPossession();
  return kills;
}

function teamById(teamId) {
  return NBA_TEAMS.find((team) => team.teamId === String(teamId || "")) || null;
}

async function main() {
  const seasonGames = await fetchSeasonGames(season);
  const rows = [];
  const skippedGames = [];
  let processed = 0;

  const detailConcurrency = Math.max(1, Number.parseInt(process.env.KILLS_PRECOMPUTE_CONCURRENCY || "40", 10) || 40);
  for (let index = 0; index < seasonGames.length; index += detailConcurrency) {
    const batch = seasonGames.slice(index, index + detailConcurrency);
    const batchRows = await Promise.all(batch.map(async (seasonGame) => {
      const gameId = String(seasonGame.gameId || "");
      try {
        const game = await fetchPlayByPlay(gameId);
        const homeRow = seasonGame.teams.find((row) => row.matchup.includes(" vs. "));
        const awayRow = seasonGame.teams.find((row) => row.matchup.includes(" @ "));
        if (!homeRow || !awayRow) return [];
        const homeTeam = teamById(homeRow.teamId);
        const awayTeam = teamById(awayRow.teamId);
        if (!homeTeam || !awayTeam) return [];
        const actions = Array.isArray(game?.game?.actions) ? game.game.actions : [];
        const kills = computeDisplayedKillsByTeam(actions, homeTeam.teamId, awayTeam.teamId);
        const homeScore = safeNumber(homeRow.points, 0);
        const awayScore = safeNumber(awayRow.points, 0);
        const gameDate = String(seasonGame.gameDate || "").slice(0, 10);
        const seasonType = String(seasonGame.seasonType || "");
        return [
          {
            teamId: homeTeam.teamId,
            gameId,
            gameDate,
            opponent: { teamId: awayTeam.teamId, tricode: awayTeam.tricode, fullName: awayTeam.fullName },
            result: homeScore >= awayScore ? "W" : "L",
            teamScore: homeScore,
            opponentScore: awayScore,
            margin: homeScore - awayScore,
            isHome: true,
            seasonType,
            metrics: { kills: safeNumber(kills[homeTeam.teamId], 0) },
            opponentMetrics: { kills: safeNumber(kills[awayTeam.teamId], 0) },
          },
          {
            teamId: awayTeam.teamId,
            gameId,
            gameDate,
            opponent: { teamId: homeTeam.teamId, tricode: homeTeam.tricode, fullName: homeTeam.fullName },
            result: awayScore >= homeScore ? "W" : "L",
            teamScore: awayScore,
            opponentScore: homeScore,
            margin: awayScore - homeScore,
            isHome: false,
            seasonType,
            metrics: { kills: safeNumber(kills[awayTeam.teamId], 0) },
            opponentMetrics: { kills: safeNumber(kills[homeTeam.teamId], 0) },
          },
        ];
      } catch (error) {
        skippedGames.push({ gameId, gameDate: String(seasonGame.gameDate || ""), error: error instanceof Error ? error.message : String(error) });
        return [];
      }
    }));
    rows.push(...batchRows.flat());
    processed += batch.length;
    process.stdout.write(`\\rProcessed ${processed}/${seasonGames.length} games`);
  }

  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
  } catch {
    existing = {};
  }
  existing[season] = { generatedAt: new Date().toISOString(), rows, skippedGames };
  await fs.writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`\\nWrote ${rows.length} team-game rows to ${outputPath}`);
  if (skippedGames.length) console.log(`Skipped ${skippedGames.length} games`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
