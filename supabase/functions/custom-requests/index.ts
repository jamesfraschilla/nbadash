const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL =
  Deno.env.get("OPENAI_SCOUTING_MODEL") ||
  Deno.env.get("OPENAI_ANALYSIS_MODEL") ||
  "gpt-4.1-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NBA_TEAMS = [
  { teamId: "1610612737", tricode: "ATL", fullName: "Atlanta Hawks", aliases: ["atlanta", "hawks", "atl"] },
  { teamId: "1610612738", tricode: "BOS", fullName: "Boston Celtics", aliases: ["boston", "celtics", "bos"] },
  { teamId: "1610612751", tricode: "BKN", fullName: "Brooklyn Nets", aliases: ["brooklyn", "nets", "bkn"] },
  { teamId: "1610612766", tricode: "CHA", fullName: "Charlotte Hornets", aliases: ["charlotte", "hornets", "cha"] },
  { teamId: "1610612741", tricode: "CHI", fullName: "Chicago Bulls", aliases: ["chicago", "bulls", "chi"] },
  { teamId: "1610612739", tricode: "CLE", fullName: "Cleveland Cavaliers", aliases: ["cleveland", "cavaliers", "cavs", "cle"] },
  { teamId: "1610612742", tricode: "DAL", fullName: "Dallas Mavericks", aliases: ["dallas", "mavericks", "mavs", "dal"] },
  { teamId: "1610612743", tricode: "DEN", fullName: "Denver Nuggets", aliases: ["denver", "nuggets", "den"] },
  { teamId: "1610612765", tricode: "DET", fullName: "Detroit Pistons", aliases: ["detroit", "pistons", "det"] },
  { teamId: "1610612744", tricode: "GSW", fullName: "Golden State Warriors", aliases: ["golden state", "warriors", "gsw"] },
  { teamId: "1610612745", tricode: "HOU", fullName: "Houston Rockets", aliases: ["houston", "rockets", "hou"] },
  { teamId: "1610612754", tricode: "IND", fullName: "Indiana Pacers", aliases: ["indiana", "pacers", "ind"] },
  { teamId: "1610612746", tricode: "LAC", fullName: "LA Clippers", aliases: ["clippers", "la clippers", "los angeles clippers", "lac"] },
  { teamId: "1610612747", tricode: "LAL", fullName: "Los Angeles Lakers", aliases: ["lakers", "la lakers", "los angeles lakers", "lal"] },
  { teamId: "1610612763", tricode: "MEM", fullName: "Memphis Grizzlies", aliases: ["memphis", "grizzlies", "griz", "mem"] },
  { teamId: "1610612748", tricode: "MIA", fullName: "Miami Heat", aliases: ["miami", "heat", "mia"] },
  { teamId: "1610612749", tricode: "MIL", fullName: "Milwaukee Bucks", aliases: ["milwaukee", "bucks", "mil"] },
  { teamId: "1610612750", tricode: "MIN", fullName: "Minnesota Timberwolves", aliases: ["minnesota", "timberwolves", "wolves", "min"] },
  { teamId: "1610612740", tricode: "NOP", fullName: "New Orleans Pelicans", aliases: ["new orleans", "pelicans", "pels", "nop"] },
  { teamId: "1610612752", tricode: "NYK", fullName: "New York Knicks", aliases: ["new york", "knicks", "nyk"] },
  { teamId: "1610612760", tricode: "OKC", fullName: "Oklahoma City Thunder", aliases: ["oklahoma city", "thunder", "okc"] },
  { teamId: "1610612753", tricode: "ORL", fullName: "Orlando Magic", aliases: ["orlando", "magic", "orl"] },
  { teamId: "1610612755", tricode: "PHI", fullName: "Philadelphia 76ers", aliases: ["philadelphia", "76ers", "sixers", "phi"] },
  { teamId: "1610612756", tricode: "PHX", fullName: "Phoenix Suns", aliases: ["phoenix", "suns", "phx"] },
  { teamId: "1610612757", tricode: "POR", fullName: "Portland Trail Blazers", aliases: ["portland", "trail blazers", "blazers", "por"] },
  { teamId: "1610612758", tricode: "SAC", fullName: "Sacramento Kings", aliases: ["sacramento", "kings", "sac"] },
  { teamId: "1610612759", tricode: "SAS", fullName: "San Antonio Spurs", aliases: ["san antonio", "spurs", "sas"] },
  { teamId: "1610612761", tricode: "TOR", fullName: "Toronto Raptors", aliases: ["toronto", "raptors", "tor"] },
  { teamId: "1610612762", tricode: "UTA", fullName: "Utah Jazz", aliases: ["utah", "jazz", "uta"] },
  { teamId: "1610612764", tricode: "WAS", fullName: "Washington Wizards", aliases: ["washington", "wizards", "was"] },
] as const;

type MetricDefinition = {
  key: string;
  label: string;
  aliases: string[];
  kind: "count" | "rate";
  formatter?: "integer" | "percent" | "decimal";
};

const METRICS: MetricDefinition[] = [
  { key: "points", label: "Points", aliases: ["points", "pts"], kind: "count" },
  { key: "rebounds_total", label: "Rebounds", aliases: ["rebounds", "total rebounds", "reb"], kind: "count" },
  { key: "rebounds_offensive", label: "Offensive Rebounds", aliases: ["offensive rebounds", "oreb", "orb"], kind: "count" },
  { key: "assists", label: "Assists", aliases: ["assists", "ast"], kind: "count" },
  { key: "steals", label: "Steals", aliases: ["steals", "stl"], kind: "count" },
  { key: "blocks", label: "Blocks", aliases: ["blocks", "blk"], kind: "count" },
  { key: "turnovers", label: "Turnovers", aliases: ["turnovers", "tos", "to"], kind: "count" },
  { key: "fouls_personal", label: "Personal Fouls", aliases: ["personal fouls", "fouls"], kind: "count" },
  { key: "transition_points", label: "Transition Points", aliases: ["transition points", "fastbreak points", "fast break points"], kind: "count" },
  { key: "transition_possessions", label: "Transition Possessions", aliases: ["transition possessions", "fastbreak possessions", "fast break possessions"], kind: "count" },
  { key: "transition_turnovers", label: "Transition Turnovers", aliases: ["transition turnovers", "fastbreak turnovers", "fast break turnovers"], kind: "count" },
  { key: "transition_rate", label: "Transition Rate", aliases: ["transition rate", "fastbreak rate", "fast break rate"], kind: "rate", formatter: "percent" },
  { key: "transition_ppp", label: "Transition PPP", aliases: ["transition ppp", "fastbreak ppp", "fast break ppp"], kind: "rate", formatter: "decimal" },
  { key: "second_chance_points", label: "Second-Chance Points", aliases: ["second chance points", "2nd chance points"], kind: "count" },
  { key: "points_off_turnovers", label: "Points Off Turnovers", aliases: ["points off turnovers", "pot"], kind: "count" },
  { key: "paint_points", label: "Paint Points", aliases: ["paint points", "points in the paint"], kind: "count" },
  { key: "dynamite_3s_made", label: "Dynamite 3s", aliases: ["dynamite 3s", "dynamite threes", "second chance 3s", "second-chance 3s"], kind: "count" },
  { key: "dynamite_3s_attempted", label: "Dynamite 3s Attempted", aliases: ["dynamite 3 attempts", "dynamite 3s attempted", "second chance 3 attempts"], kind: "count" },
  { key: "driving_fg_made", label: "Driving FG Made", aliases: ["driving field goals made", "driving fgm"], kind: "count" },
  { key: "driving_fg_attempted", label: "Driving FG Attempted", aliases: ["driving field goals attempted", "driving fga"], kind: "count" },
  { key: "driving_fg_percent", label: "Driving FG%", aliases: ["driving fg%", "driving field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "cutting_fg_made", label: "Cutting FG Made", aliases: ["cutting field goals made", "cutting fgm"], kind: "count" },
  { key: "cutting_fg_attempted", label: "Cutting FG Attempted", aliases: ["cutting field goals attempted", "cutting fga"], kind: "count" },
  { key: "cutting_fg_percent", label: "Cutting FG%", aliases: ["cutting fg%", "cutting field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "catch_shoot_3_made", label: "Catch-and-Shoot 3s", aliases: ["catch and shoot 3s", "c&s 3s", "catch-and-shoot 3s"], kind: "count" },
  { key: "catch_shoot_3_attempted", label: "Catch-and-Shoot 3s Attempted", aliases: ["catch and shoot 3 attempts", "c&s 3 attempts"], kind: "count" },
  { key: "catch_shoot_3_percent", label: "Catch-and-Shoot 3P%", aliases: ["catch and shoot 3 percentage", "c&s 3%", "catch-and-shoot 3p%"], kind: "rate", formatter: "percent" },
  { key: "offensive_fouls_drawn", label: "Offensive Fouls Drawn", aliases: ["offensive fouls drawn", "off fouls drawn", "offensive fd"], kind: "count" },
  { key: "charges_drawn", label: "Charges Drawn", aliases: ["charges drawn"], kind: "count" },
  { key: "deflections", label: "Deflections", aliases: ["deflections"], kind: "count" },
  { key: "disruptions", label: "Disruptions", aliases: ["disruptions"], kind: "count" },
  { key: "kills", label: "Kills", aliases: ["kills"], kind: "count" },
  { key: "offensive_rating", label: "Offensive Rating", aliases: ["offensive rating", "ortg"], kind: "rate", formatter: "decimal" },
  { key: "defensive_rating", label: "Defensive Rating", aliases: ["defensive rating", "drtg"], kind: "rate", formatter: "decimal" },
  { key: "net_rating", label: "Net Rating", aliases: ["net rating", "netrtg"], kind: "rate", formatter: "decimal" },
  { key: "efg_pct", label: "eFG%", aliases: ["efg", "efg%", "effective field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "tov_pct", label: "TOV%", aliases: ["tov%", "turnover percentage"], kind: "rate", formatter: "percent" },
  { key: "orb_pct", label: "ORB%", aliases: ["orb%", "offensive rebound percentage"], kind: "rate", formatter: "percent" },
  { key: "ftr", label: "FTr", aliases: ["ftr", "free throw rate"], kind: "rate", formatter: "decimal" },
  { key: "rim_rate", label: "Rim Rate", aliases: ["rim rate"], kind: "rate", formatter: "percent" },
  { key: "mid_rate", label: "Mid Rate", aliases: ["mid rate", "midrange rate", "mid-range rate"], kind: "rate", formatter: "percent" },
  { key: "three_rate", label: "3P Rate", aliases: ["3p rate", "3pt rate", "three point rate"], kind: "rate", formatter: "percent" },
  { key: "rim_fg_pct", label: "Rim FG%", aliases: ["rim fg%", "rim field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "mid_fg_pct", label: "Mid FG%", aliases: ["mid fg%", "mid field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "three_fg_pct", label: "3P FG%", aliases: ["3p fg%", "3pt fg%", "three point percentage", "3pt percentage"], kind: "rate", formatter: "percent" },
];

const TEAM_LOOKUP = new Map(
  NBA_TEAMS.flatMap((team) => team.aliases.map((alias) => [normalizeText(alias), team] as const)),
);
const METRIC_LOOKUP = new Map(
  METRICS.flatMap((metric) => metric.aliases.map((alias) => [normalizeText(alias), metric] as const)),
);
const SEASON_GAMES_CACHE = new Map<string, Promise<Record<string, unknown>[]>>();
const GAME_DETAILS_CACHE = new Map<string, Promise<Record<string, unknown>>>();

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

function currentSeasonString(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function currentSeasonBounds(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  const seasonStart = new Date(Date.UTC(startYear, 9, 1));
  const seasonEnd = new Date(Date.UTC(startYear + 1, 5, 30));
  return {
    start: seasonStart,
    end: date < seasonEnd ? date : seasonEnd,
  };
}

function formatDateInput(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function enumerateDateInputs(start: Date, end: Date) {
  const dates: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    dates.push(formatDateInput(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isPlayedGame(game: Record<string, unknown>) {
  const status = safeNumber(game?.gameStatus, 0);
  return status === 2 || status === 3;
}

function isNbaDashboardGame(game: Record<string, unknown>) {
  return !String(game?.gameId || "").startsWith("202");
}

async function fetchGamesByDate(dateStr: string) {
  return requestJson(`${API_BASE}/games/byDate?date=${dateStr}`).catch(() => []);
}

async function fetchSeasonGames(season = currentSeasonString()) {
  if (!SEASON_GAMES_CACHE.has(season)) {
    SEASON_GAMES_CACHE.set(season, (async () => {
      const { start, end } = currentSeasonBounds(new Date());
      const dateInputs = enumerateDateInputs(start, end);
      const concurrency = 8;
      const aggregated: Record<string, unknown>[] = [];

      for (let index = 0; index < dateInputs.length; index += concurrency) {
        const batch = dateInputs.slice(index, index + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (dateInput) => {
            const games = await fetchGamesByDate(dateInput).catch(() => []);
            return (Array.isArray(games) ? games : [])
              .filter((game) => isNbaDashboardGame(game as Record<string, unknown>))
              .filter((game) => isPlayedGame(game as Record<string, unknown>))
              .map((game) => ({ ...(game as Record<string, unknown>), gameDate: dateInput }));
          }),
        );
        aggregated.push(...batchResults.flat());
      }

      return [...new Map(aggregated.map((game) => [String(game.gameId || ""), game])).values()]
        .sort((left, right) => String(right.gameDate || "").localeCompare(String(left.gameDate || "")));
    })());
  }
  return SEASON_GAMES_CACHE.get(season)!;
}

async function fetchGameDetails(gameId: string) {
  if (!GAME_DETAILS_CACHE.has(gameId)) {
    GAME_DETAILS_CACHE.set(gameId, requestJson(`${API_BASE}/games/${gameId}`));
  }
  return GAME_DETAILS_CACHE.get(gameId)!;
}

async function fetchGameDetailsSafe(gameId: string) {
  try {
    const game = await fetchGameDetails(gameId);
    return { game, error: null };
  } catch (error) {
    console.error(`Skipping game ${gameId} after upstream failure.`, error);
    return {
      game: null,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

function classifyShot(action: Record<string, unknown>) {
  if (String(action.actionType || "") === "3pt") return "three";
  const distance = safeNumber(action.shotDistance, 0);
  return distance <= 4.9 ? "rim" : "mid";
}

function isPersonalFoul(action: Record<string, unknown>) {
  const subtype = String(action.subType || "").toLowerCase();
  return !subtype.includes("technical");
}

function sameTeam(a: unknown, b: unknown) {
  return Number(a) === Number(b);
}

function estimatePossessions(teamTotals: Record<string, unknown>, opponentTotals: Record<string, unknown>) {
  const fieldGoalsAttempted = safeNumber(teamTotals.fieldGoalsAttempted, 0);
  const freeThrowsAttempted = safeNumber(teamTotals.freeThrowsAttempted, 0);
  const offensiveRebounds = safeNumber(teamTotals.reboundsOffensive, 0);
  const turnovers = safeNumber(teamTotals.turnovers, 0);
  const opponentFieldGoalsAttempted = safeNumber(opponentTotals.fieldGoalsAttempted, 0);
  const opponentFreeThrowsAttempted = safeNumber(opponentTotals.freeThrowsAttempted, 0);
  const opponentOffensiveRebounds = safeNumber(opponentTotals.reboundsOffensive, 0);
  const opponentTurnovers = safeNumber(opponentTotals.turnovers, 0);
  return 0.5 * (
    (fieldGoalsAttempted + 0.44 * freeThrowsAttempted - offensiveRebounds + turnovers) +
    (opponentFieldGoalsAttempted + 0.44 * opponentFreeThrowsAttempted - opponentOffensiveRebounds + opponentTurnovers)
  );
}

function buildDerivedTeamTotals(actions: Array<Record<string, unknown>>, homeTeamId: string, awayTeamId: string) {
  const orderedActions = [...actions].sort((a, b) => {
    const aOrder = safeNumber(a.orderNumber ?? a.actionNumber, 0);
    const bOrder = safeNumber(b.orderNumber ?? b.actionNumber, 0);
    return aOrder - bOrder;
  });

  const teamTotals: Record<string, Record<string, number>> = {
    [homeTeamId]: {
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      transitionPossessions: 0,
      secondChancePoints: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      drivingFGMade: 0,
      drivingFGAttempted: 0,
      cuttingFGMade: 0,
      cuttingFGAttempted: 0,
      catchAndShoot3FGMade: 0,
      catchAndShoot3FGAttempted: 0,
      secondChance3FGMade: 0,
      secondChance3FGAttempted: 0,
      pointsOffTurnovers: 0,
      paintPoints: 0,
      threePointOReb: 0,
      offensiveFoulsDrawn: 0,
    },
    [awayTeamId]: {
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      transitionPossessions: 0,
      secondChancePoints: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      drivingFGMade: 0,
      drivingFGAttempted: 0,
      cuttingFGMade: 0,
      cuttingFGAttempted: 0,
      catchAndShoot3FGMade: 0,
      catchAndShoot3FGAttempted: 0,
      secondChance3FGMade: 0,
      secondChance3FGAttempted: 0,
      pointsOffTurnovers: 0,
      paintPoints: 0,
      threePointOReb: 0,
      offensiveFoulsDrawn: 0,
    },
  };

  const creditedTransitionTurnovers = new Set<string>();
  const creditedBlocks = new Set<string>();
  const lastMissedShotByTeam = new Map<string, Record<string, unknown>>();
  let currentPossession: number | null = null;
  let possessionTeam: number | null = null;
  let orebInPossession = false;
  let currentTransitionPossessionTeamId: string | null = null;
  let currentTransitionPossessionIsFastbreak = false;

  const finalizeTransitionPossession = () => {
    if (
      currentTransitionPossessionTeamId &&
      currentTransitionPossessionIsFastbreak &&
      teamTotals[currentTransitionPossessionTeamId]
    ) {
      teamTotals[currentTransitionPossessionTeamId].transitionPossessions += 1;
    }
    currentTransitionPossessionIsFastbreak = false;
  };

  const isStoppage = (action: Record<string, unknown>) =>
    ["timeout", "foul", "freethrow", "substitution", "violation"].includes(String(action.actionType || ""));

  const creditBlock = (playerId: unknown, blockTeamId: string, period: unknown, clock: unknown) => {
    if (!playerId || !blockTeamId || !teamTotals[blockTeamId]) return;
    const key = `${String(playerId)}:${String(period || "")}:${String(clock || "")}`;
    if (creditedBlocks.has(key)) return;
    creditedBlocks.add(key);
    teamTotals[blockTeamId].blocks += 1;
  };

  orderedActions.forEach((action) => {
    if (action.possession != null) {
      const nextPossession = Number(action.possession);
      if (Number.isFinite(nextPossession) && nextPossession !== currentPossession) {
        currentPossession = nextPossession;
        possessionTeam = nextPossession;
        orebInPossession = false;
      }
    }

    const possessionTeamId = action.possession != null && action.possession !== ""
      ? String(action.possession)
      : null;
    if (possessionTeamId && possessionTeamId !== currentTransitionPossessionTeamId) {
      finalizeTransitionPossession();
      currentTransitionPossessionTeamId = possessionTeamId;
    }

    const teamId = String(action.teamId || "");
    const teamStats = teamTotals[teamId];
    const isHome = teamId === homeTeamId;
    const isAway = teamId === awayTeamId;

    if (orebInPossession && isStoppage(action)) orebInPossession = false;

    if (action.actionType === "2pt" || action.actionType === "3pt") {
      const description = `${action.description || ""} ${action.descriptor || ""}`.toLowerCase();
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      const isFastBreak = qualifiers.includes("fastbreak");
      const isSecondChance = qualifiers.includes("2ndchance") || qualifiers.includes("secondchance");
      const isFromTurnover = qualifiers.includes("fromturnover");
      const drivingKeywords = ["driving layup", "driving dunk", "driving float", "driving hook"];
      const shotDistance = safeNumber(action.shotDistance, 0);
      const isDriving =
        action.actionType === "2pt" &&
        shotDistance <= 7 &&
        drivingKeywords.some((keyword) => description.includes(keyword));
      const isCutting = description.includes("cutting");
      const isPullup = /pull.?up/.test(description);
      const isStepBack = /step.?back/.test(description);
      const isCatchAndShoot3 = action.actionType === "3pt" && !isPullup && !isStepBack;

      if (isFastBreak) currentTransitionPossessionIsFastbreak = true;

      if (isFromTurnover) {
        const opponentId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        if (opponentId && teamTotals[opponentId]) {
          const possessionKey = String(action.possession ?? action.actionNumber ?? "");
          const creditKey = `${opponentId}:${possessionKey}`;
          if (!creditedTransitionTurnovers.has(creditKey)) {
            creditedTransitionTurnovers.add(creditKey);
            teamTotals[opponentId].transitionTurnovers += 1;
          }
        }
      }

      if (teamStats) {
        teamStats.fieldGoalsAttempted += 1;
        const shotType = classifyShot(action);
        if (shotType === "three") teamStats.threePointersAttempted += 1;
        if (shotType === "rim") teamStats.rimFieldGoalsAttempted += 1;
        if (shotType === "mid") teamStats.midFieldGoalsAttempted += 1;
        if (isDriving) teamStats.drivingFGAttempted += 1;
        if (isCutting) teamStats.cuttingFGAttempted += 1;
        if (isCatchAndShoot3) teamStats.catchAndShoot3FGAttempted += 1;
        if (action.actionType === "3pt" && orebInPossession && sameTeam(teamId, possessionTeam)) {
          teamStats.secondChance3FGAttempted += 1;
        }
      }

      if (String(action.shotResult || "") === "Made" && teamStats) {
        const points = action.actionType === "3pt" ? 3 : 2;
        const shotType = classifyShot(action);
        teamStats.points += points;
        if (isFastBreak) teamStats.transitionPoints += points;
        if (isSecondChance) teamStats.secondChancePoints += points;
        teamStats.fieldGoalsMade += 1;
        if (action.actionType === "3pt") teamStats.threePointersMade += 1;
        if (shotType === "rim") teamStats.rimFieldGoalsMade += 1;
        if (shotType === "mid") teamStats.midFieldGoalsMade += 1;
        if (isDriving) teamStats.drivingFGMade += 1;
        if (isCutting) teamStats.cuttingFGMade += 1;
        if (isCatchAndShoot3) teamStats.catchAndShoot3FGMade += 1;
        if (qualifiers.includes("fromturnover")) teamStats.pointsOffTurnovers += points;
        if (qualifiers.includes("pointsinthepaint")) teamStats.paintPoints += points;
        if (action.actionType === "3pt" && orebInPossession && sameTeam(teamId, possessionTeam)) {
          teamStats.secondChance3FGMade += 1;
        }
      } else if (teamId) {
        lastMissedShotByTeam.set(teamId, action);
      }

      if (safeNumber(action.assistPersonId, 0) && teamStats) teamStats.assists += 1;
      if (safeNumber(action.blockPersonId, 0)) {
        const blockTeamId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        creditBlock(action.blockPersonId, blockTeamId, action.period, action.clock);
      }
    }

    if (action.actionType === "freethrow") {
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      const isFastBreak = qualifiers.includes("fastbreak");
      if (isFastBreak) currentTransitionPossessionIsFastbreak = true;
      if (teamStats) teamStats.freeThrowsAttempted += 1;
      if (String(action.shotResult || "") === "Made" && teamStats) {
        teamStats.freeThrowsMade += 1;
        teamStats.points += 1;
        if (isFastBreak) teamStats.transitionPoints += 1;
      }
    }

    if (action.actionType === "rebound" && teamStats) {
      const isOffensive = String(action.subType || "") === "offensive";
      teamStats.reboundsTotal += 1;
      if (isOffensive) teamStats.reboundsOffensive += 1;

      if (isOffensive) {
        if (sameTeam(teamId, possessionTeam)) {
          orebInPossession = Boolean(action.personId);
        }
        const shot = action.shotActionNumber
          ? orderedActions.find((entry) => safeNumber(entry.actionNumber, 0) === safeNumber(action.shotActionNumber, 0))
          : null;
        const lastMiss = lastMissedShotByTeam.get(teamId);
        if (shot?.actionType === "3pt" || lastMiss?.actionType === "3pt") {
          teamStats.threePointOReb += 1;
        }
        if (teamId) lastMissedShotByTeam.delete(teamId);
      } else {
        const opponentId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        if (opponentId) lastMissedShotByTeam.delete(opponentId);
      }
    }

    if (action.actionType === "steal" && teamStats) teamStats.steals += 1;

    if (action.actionType === "block") {
      creditBlock(action.personId, teamId, action.period, action.clock);
    }

    if (action.actionType === "turnover" && teamStats) {
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      if (qualifiers.includes("fastbreak")) currentTransitionPossessionIsFastbreak = true;
      teamStats.turnovers += 1;
      if (qualifiers.includes("fromturnover") || qualifiers.includes("fastbreak")) {
        teamStats.transitionTurnovers += 1;
      }
    }

    if (action.actionType === "foul" && teamStats) {
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      if (qualifiers.includes("fastbreak")) currentTransitionPossessionIsFastbreak = true;
      if (isPersonalFoul(action)) teamStats.foulsPersonal += 1;
      if (String(action.subType || "") === "offensive") {
        const opponentId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        if (opponentId && teamTotals[opponentId]) {
          teamTotals[opponentId].offensiveFoulsDrawn += 1;
        }
      }
    }
  });

  finalizeTransitionPossession();
  return teamTotals;
}

function computeDisplayedKills(actions: Array<Record<string, unknown>>, teamId: string, homeTeamId: string, awayTeamId: string) {
  const orderedActions = [...actions].sort((a, b) => {
    const aOrder = safeNumber(a.orderNumber ?? a.actionNumber, 0);
    const bOrder = safeNumber(b.orderNumber ?? b.actionNumber, 0);
    return aOrder - bOrder;
  });
  const streaks: Record<string, number> = { [homeTeamId]: 0, [awayTeamId]: 0 };
  const kills: Record<string, number> = { [homeTeamId]: 0, [awayTeamId]: 0 };
  let currentPossession: unknown = null;
  let possessionScored = false;
  let possessionTeam: unknown = null;

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
  return kills[teamId] || 0;
}

function selectTeamPerspective(game: Record<string, unknown>, teamId: string) {
  const homeTeamId = String(game?.homeTeam?.teamId || "");
  const awayTeamId = String(game?.awayTeam?.teamId || "");
  if (teamId === homeTeamId) {
    return {
      side: "home",
      team: (game.homeTeam || {}) as Record<string, unknown>,
      opponent: (game.awayTeam || {}) as Record<string, unknown>,
      teamStats: ((game.teamStats || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
      opponentStats: ((game.teamStats || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
      teamBox: ((game.boxScore || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
      opponentBox: ((game.boxScore || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
    };
  }
  return {
    side: "away",
    team: (game.awayTeam || {}) as Record<string, unknown>,
    opponent: (game.homeTeam || {}) as Record<string, unknown>,
    teamStats: ((game.teamStats || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
    opponentStats: ((game.teamStats || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
    teamBox: ((game.boxScore || {}) as Record<string, unknown>).away as Record<string, unknown> || {},
    opponentBox: ((game.boxScore || {}) as Record<string, unknown>).home as Record<string, unknown> || {},
  };
}

function buildGameMetrics(game: Record<string, unknown>, teamId: string) {
  const perspective = selectTeamPerspective(game, teamId);
  const homeTeamId = String(game?.homeTeam?.teamId || "");
  const awayTeamId = String(game?.awayTeam?.teamId || "");
  const derivedTotals = buildDerivedTeamTotals(
    Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [],
    homeTeamId,
    awayTeamId,
  );
  const teamTotals = derivedTotals[teamId] || {};
  const opponentId = teamId === homeTeamId ? awayTeamId : homeTeamId;
  const opponentTotals = derivedTotals[opponentId] || {};
  const advancedStats = (perspective.teamStats?.advancedStats || {}) as Record<string, unknown>;
  const possessions = safeNumber(perspective.teamStats?.possessions, estimatePossessions(teamTotals, opponentTotals));
  const opponentPoints = safeNumber(opponentTotals.points, 0);
  const deflections = safeNumber(advancedStats.deflections, 0);
  const offensiveFoulsDrawn = safeNumber(teamTotals.offensiveFoulsDrawn, safeNumber(advancedStats.offensiveFoulsDrawn, 0));
  const disruptions = safeNumber(teamTotals.steals, 0) + safeNumber(teamTotals.blocks, 0) + offensiveFoulsDrawn + deflections;
  const totalFga = Math.max(1, safeNumber(teamTotals.fieldGoalsAttempted, 0));
  const opponentDefReb = Math.max(0, safeNumber(opponentTotals.reboundsTotal, 0) - safeNumber(opponentTotals.reboundsOffensive, 0));
  const transitionPossessions = safeNumber(teamTotals.transitionPossessions, 0);
  const transitionPoints = safeNumber(teamTotals.transitionPoints, 0);

  return {
    teamId,
    opponentId,
    opponent: {
      teamId: String(perspective.opponent?.teamId || ""),
      tricode: String(perspective.opponent?.teamTricode || ""),
      fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
    },
    metrics: {
      points: safeNumber(teamTotals.points, 0),
      rebounds_total: safeNumber(teamTotals.reboundsTotal, 0),
      rebounds_offensive: safeNumber(teamTotals.reboundsOffensive, 0),
      assists: safeNumber(teamTotals.assists, 0),
      steals: safeNumber(teamTotals.steals, 0),
      blocks: safeNumber(teamTotals.blocks, 0),
      turnovers: safeNumber(teamTotals.turnovers, 0),
      fouls_personal: safeNumber(teamTotals.foulsPersonal, 0),
      transition_points: transitionPoints,
      transition_possessions: transitionPossessions,
      transition_turnovers: safeNumber(teamTotals.transitionTurnovers, 0),
      transition_rate: possessions > 0 ? (transitionPossessions / possessions) * 100 : 0,
      transition_ppp: transitionPossessions > 0 ? transitionPoints / transitionPossessions : 0,
      second_chance_points: safeNumber(teamTotals.secondChancePoints, 0),
      points_off_turnovers: safeNumber(teamTotals.pointsOffTurnovers, 0),
      paint_points: safeNumber(teamTotals.paintPoints, 0),
      dynamite_3s_made: safeNumber(teamTotals.secondChance3FGMade, 0),
      dynamite_3s_attempted: safeNumber(teamTotals.secondChance3FGAttempted, 0),
      driving_fg_made: safeNumber(teamTotals.drivingFGMade, 0),
      driving_fg_attempted: safeNumber(teamTotals.drivingFGAttempted, 0),
      driving_fg_percent: safeNumber(teamTotals.drivingFGAttempted, 0) > 0 ? (safeNumber(teamTotals.drivingFGMade, 0) / safeNumber(teamTotals.drivingFGAttempted, 1)) * 100 : 0,
      cutting_fg_made: safeNumber(teamTotals.cuttingFGMade, 0),
      cutting_fg_attempted: safeNumber(teamTotals.cuttingFGAttempted, 0),
      cutting_fg_percent: safeNumber(teamTotals.cuttingFGAttempted, 0) > 0 ? (safeNumber(teamTotals.cuttingFGMade, 0) / safeNumber(teamTotals.cuttingFGAttempted, 1)) * 100 : 0,
      catch_shoot_3_made: safeNumber(teamTotals.catchAndShoot3FGMade, 0),
      catch_shoot_3_attempted: safeNumber(teamTotals.catchAndShoot3FGAttempted, 0),
      catch_shoot_3_percent: safeNumber(teamTotals.catchAndShoot3FGAttempted, 0) > 0 ? (safeNumber(teamTotals.catchAndShoot3FGMade, 0) / safeNumber(teamTotals.catchAndShoot3FGAttempted, 1)) * 100 : 0,
      offensive_fouls_drawn: offensiveFoulsDrawn,
      charges_drawn: safeNumber(advancedStats.chargesDrawn, 0),
      deflections,
      disruptions,
      kills: computeDisplayedKills(
        Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [],
        teamId,
        homeTeamId,
        awayTeamId,
      ),
      offensive_rating: possessions > 0 ? (safeNumber(teamTotals.points, 0) / possessions) * 100 : 0,
      defensive_rating: possessions > 0 ? (opponentPoints / possessions) * 100 : 0,
      net_rating: possessions > 0 ? ((safeNumber(teamTotals.points, 0) - opponentPoints) / possessions) * 100 : 0,
      efg_pct: totalFga > 0 ? ((safeNumber(teamTotals.fieldGoalsMade, 0) + (0.5 * safeNumber(teamTotals.threePointersMade, 0))) / totalFga) * 100 : 0,
      tov_pct: (safeNumber(teamTotals.fieldGoalsAttempted, 0) || safeNumber(teamTotals.freeThrowsAttempted, 0) || safeNumber(teamTotals.turnovers, 0))
        ? (safeNumber(teamTotals.turnovers, 0) / (safeNumber(teamTotals.fieldGoalsAttempted, 0) + (0.44 * safeNumber(teamTotals.freeThrowsAttempted, 0)) + safeNumber(teamTotals.turnovers, 0))) * 100
        : 0,
      orb_pct: (safeNumber(teamTotals.reboundsOffensive, 0) || opponentDefReb)
        ? (safeNumber(teamTotals.reboundsOffensive, 0) / (safeNumber(teamTotals.reboundsOffensive, 0) + opponentDefReb)) * 100
        : 0,
      ftr: totalFga > 0 ? safeNumber(teamTotals.freeThrowsAttempted, 0) / totalFga : 0,
      rim_rate: (safeNumber(teamTotals.rimFieldGoalsAttempted, 0) / totalFga) * 100,
      mid_rate: (safeNumber(teamTotals.midFieldGoalsAttempted, 0) / totalFga) * 100,
      three_rate: (safeNumber(teamTotals.threePointersAttempted, 0) / totalFga) * 100,
      rim_fg_pct: safeNumber(teamTotals.rimFieldGoalsAttempted, 0) > 0 ? (safeNumber(teamTotals.rimFieldGoalsMade, 0) / safeNumber(teamTotals.rimFieldGoalsAttempted, 1)) * 100 : 0,
      mid_fg_pct: safeNumber(teamTotals.midFieldGoalsAttempted, 0) > 0 ? (safeNumber(teamTotals.midFieldGoalsMade, 0) / safeNumber(teamTotals.midFieldGoalsAttempted, 1)) * 100 : 0,
      three_fg_pct: safeNumber(teamTotals.threePointersAttempted, 0) > 0 ? (safeNumber(teamTotals.threePointersMade, 0) / safeNumber(teamTotals.threePointersAttempted, 1)) * 100 : 0,
    },
  };
}

function findTeamFromPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  let bestMatch: (typeof NBA_TEAMS)[number] | null = null;
  let bestLength = 0;
  TEAM_LOOKUP.forEach((team, alias) => {
    if (normalizedPrompt.includes(alias) && alias.length > bestLength) {
      bestMatch = team;
      bestLength = alias.length;
    }
  });
  return bestMatch;
}

function findMetricFromPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  let bestMatch: MetricDefinition | null = null;
  let bestLength = 0;
  METRIC_LOOKUP.forEach((metric, alias) => {
    if (normalizedPrompt.includes(alias) && alias.length > bestLength) {
      bestMatch = metric;
      bestLength = alias.length;
    }
  });
  return bestMatch;
}

function buildFallbackParse(prompt: string) {
  const team = findTeamFromPrompt(prompt);
  const metric = findMetricFromPrompt(prompt);
  const normalizedPrompt = normalizeText(prompt);
  const thresholdMatch = /(\d+(?:\.\d+)?)\s*(?:or more|or greater|at least|>=)/.exec(normalizedPrompt)
    || /at least\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /over\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /more than\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt);

  if (!team || !metric) return null;

  if (normalizedPrompt.includes("how many games")) {
    return {
      teamId: team.teamId,
      statKey: metric.key,
      aggregation: "count_games_gte",
      threshold: thresholdMatch ? safeNumber(thresholdMatch[1], 0) : 1,
    };
  }

  if (normalizedPrompt.includes("average") || normalizedPrompt.includes("per game")) {
    return {
      teamId: team.teamId,
      statKey: metric.key,
      aggregation: "season_average",
    };
  }

  if (normalizedPrompt.includes("highest") || normalizedPrompt.includes("most") || normalizedPrompt.includes("max")) {
    return {
      teamId: team.teamId,
      statKey: metric.key,
      aggregation: "max_game",
    };
  }

  return {
    teamId: team.teamId,
    statKey: metric.key,
    aggregation: "season_total",
  };
}

async function parsePromptWithOpenAI(prompt: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return null;

  const teamSummary = NBA_TEAMS.map((team) => `${team.fullName} (${team.tricode})`).join(", ");
  const metricSummary = METRICS.map((metric) => `${metric.key}: ${metric.label}`).join("; ");
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Parse an NBA dashboard stat request into JSON only. " +
            "Use one team only. Choose one statKey from the provided catalog. " +
            "Allowed aggregations: count_games_gte, season_total, season_average, max_game. " +
            "Return JSON with keys teamId, statKey, aggregation, threshold(optional).",
        },
        {
          role: "user",
          content: `Teams: ${teamSummary}\nStats: ${metricSummary}\nPrompt: ${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const text = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isSupportedAggregation(value: unknown) {
  return [
    "count_games_gte",
    "season_total",
    "season_average",
    "max_game",
  ].includes(String(value || "").trim());
}

function normalizeParsedQuery(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const teamId = String(candidate.teamId || "").trim();
  const statKey = String(candidate.statKey || "").trim();
  const aggregation = String(candidate.aggregation || "").trim();
  if (!teamId || !statKey || !isSupportedAggregation(aggregation)) return null;
  return {
    teamId,
    statKey,
    aggregation,
    threshold: candidate.threshold != null ? safeNumber(candidate.threshold, 0) : undefined,
  };
}

function formatValue(value: number, metric: MetricDefinition) {
  if (metric.formatter === "percent") return `${value.toFixed(1)}%`;
  if (metric.formatter === "decimal") return value.toFixed(1);
  return `${Math.round(value)}`;
}

function executeQuery(games: Array<Record<string, unknown>>, metric: MetricDefinition, query: Record<string, unknown>, team: (typeof NBA_TEAMS)[number]) {
  const threshold = safeNumber(query.threshold, 0);
  const requestedAggregation = String(query.aggregation || "season_total");
  const aggregation = metric.kind === "rate" && requestedAggregation === "season_total"
    ? "season_average"
    : requestedAggregation;
  const values = games.map((game) => {
    const metrics = buildGameMetrics(game, team.teamId);
    return {
      gameId: String(game.gameId || ""),
      gameDate: String(game.gameDate || ""),
      opponent: metrics.opponent,
      value: safeNumber((metrics.metrics as Record<string, unknown>)[metric.key], 0),
    };
  });

  if (aggregation === "count_games_gte") {
    const matchingGames = values.filter((entry) => entry.value >= threshold);
    return {
      aggregation,
      value: matchingGames.length,
      displayValue: `${matchingGames.length}`,
      answer: `${team.fullName} had ${matchingGames.length} game${matchingGames.length === 1 ? "" : "s"} this season with ${threshold}+ ${metric.label.toLowerCase()}.`,
      games: matchingGames,
    };
  }

  if (aggregation === "season_average") {
    const average = values.length
      ? values.reduce((sum, entry) => sum + entry.value, 0) / values.length
      : 0;
    return {
      aggregation,
      value: average,
      displayValue: formatValue(average, metric),
      answer: `${team.fullName} averaged ${formatValue(average, metric)} ${metric.label.toLowerCase()} this season across ${values.length} games.`,
      games: values,
    };
  }

  if (aggregation === "max_game") {
    const best = values.reduce((current, entry) => (!current || entry.value > current.value ? entry : current), null as null | typeof values[number]);
    return {
      aggregation,
      value: best?.value || 0,
      displayValue: formatValue(best?.value || 0, metric),
      answer: best
        ? `${team.fullName}'s highest single-game ${metric.label.toLowerCase()} total this season was ${formatValue(best.value, metric)} on ${best.gameDate} against ${best.opponent.tricode || best.opponent.fullName}.`
        : `No completed games found for ${team.fullName}.`,
      games: best ? [best] : [],
    };
  }

  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  return {
    aggregation: "season_total",
    value: total,
    displayValue: formatValue(total, metric),
    answer: `${team.fullName}'s season total for ${metric.label.toLowerCase()} is ${formatValue(total, metric)} across ${values.length} games.`,
    games: values,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) return jsonResponse(400, { error: "Prompt is required." });

    const fallbackParsed = normalizeParsedQuery(buildFallbackParse(prompt));
    const openAiParsed = normalizeParsedQuery(await parsePromptWithOpenAI(prompt).catch(() => null));
    const candidateParses = [fallbackParsed, openAiParsed].filter(Boolean) as Array<{
      teamId: string;
      statKey: string;
      aggregation: string;
      threshold?: number;
    }>;

    let parsed: null | {
      teamId: string;
      statKey: string;
      aggregation: string;
      threshold?: number;
    } = null;
    let team: (typeof NBA_TEAMS)[number] | null = null;
    let metric: MetricDefinition | null = null;

    for (const candidate of candidateParses) {
      const matchedTeam = NBA_TEAMS.find((entry) => entry.teamId === candidate.teamId) || null;
      const matchedMetric = METRICS.find((entry) => entry.key === candidate.statKey) || null;
      if (matchedTeam && matchedMetric) {
        parsed = candidate;
        team = matchedTeam;
        metric = matchedMetric;
        break;
      }
    }

    if (!parsed || !team || !metric) {
      return jsonResponse(400, {
        error: "I could not match that request to a single NBA team and a supported dashboard stat.",
        fallbackParsed,
        openAiParsed,
        supportedStats: METRICS.map((entry) => entry.label),
      });
    }

    const season = currentSeasonString();
    const seasonGames = await fetchSeasonGames(season);
    const teamGames = seasonGames.filter((game) => (
      String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
      String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
    ));
    const detailedGames = await Promise.all(
      teamGames.map((game) => fetchGameDetailsSafe(String((game as Record<string, unknown>).gameId || ""))),
    );
    const enrichedGames = detailedGames
      .map((entry, index) => (
        entry.game
          ? {
            ...entry.game,
            gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
          }
          : null
      ))
      .filter(Boolean) as Array<Record<string, unknown>>;
    const skippedGames = detailedGames
      .map((entry, index) => (
        entry.error
          ? {
            gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
            gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
            error: entry.error,
          }
          : null
      ))
      .filter(Boolean);

    if (!enrichedGames.length) {
      return jsonResponse(502, {
        error: "Unable to load any completed game details for this request.",
        skippedGames,
      });
    }

    const result = executeQuery(enrichedGames, metric, parsed as unknown as Record<string, unknown>, team);

    return jsonResponse(200, {
      prompt,
      season,
      team: {
        teamId: team.teamId,
        tricode: team.tricode,
        fullName: team.fullName,
      },
      stat: {
        key: metric.key,
        label: metric.label,
      },
      parsedQuery: parsed,
      result: {
        ...result,
        games: (result.games as Array<Record<string, unknown>>).slice(0, 25),
        sampleSize: enrichedGames.length,
      },
      skippedGames,
      supportedStats: METRICS.map((entry) => ({ key: entry.key, label: entry.label })),
    });
  } catch (error) {
    console.error("custom-requests failed", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unknown error.",
    });
  }
});
