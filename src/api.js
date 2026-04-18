import { gLeagueHeadshotOverrides } from "./gLeagueHeadshotOverrides.js";
import { NBA_TEAMS } from "./data/nbaTeams.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const ALL_ORIGINS_RAW_URL = "https://api.allorigins.win/raw?url=";
const SUMMER_LEAGUE_IDS = new Set(["13", "14", "15", "16"]);
const SUMMER_LEAGUE_PAGE_CACHE = new Map();
const SUMMER_LEAGUE_GAME_URL_CACHE = new Map();
const NBA_TEAM_BY_TRICODE = new Map(NBA_TEAMS.map((team) => [team.tricode, team]));
const SUPABASE_URL = import.meta?.env?.VITE_SUPABASE_URL;
const SUPABASE_FUNCTIONS_BASE = SUPABASE_URL
  ? `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1`
  : "";

async function requestJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function requestText(url, accept = "text/html") {
  try {
    const proxiedResponse = await fetch(`${ALL_ORIGINS_RAW_URL}${encodeURIComponent(url)}`, {
      headers: { Accept: accept },
    });
    if (proxiedResponse.ok) {
      return proxiedResponse.text();
    }
  } catch {
    // Fall through to a direct fetch when the proxy is unavailable.
  }
  const directResponse = await fetch(url, {
    headers: { Accept: accept },
  });
  if (!directResponse.ok) {
    throw new Error(`Request failed: ${directResponse.status}`);
  }
  return directResponse.text();
}

function extractNextDataFromHtml(html) {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(String(html || ""));
  if (!match) {
    throw new Error("Unable to locate page data.");
  }
  return JSON.parse(match[1]);
}

function parseDateParts(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function isJulyDate(dateStr) {
  const parts = parseDateParts(dateStr);
  return parts?.month === 7;
}

function isSummerLeagueGameId(gameId) {
  return /^1(?:3|4|5|6)\d{8}$/.test(String(gameId || "").trim());
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeRatio(numerator, denominator) {
  const safeDenominator = safeNumber(denominator, 0);
  if (safeDenominator <= 0) return 0;
  return (safeNumber(numerator, 0) / safeDenominator) * 100;
}

function toIsoClock(value) {
  if (!value) return "PT00M00.00S";
  const text = String(value).trim();
  if (text.startsWith("PT")) return text;
  return text;
}

function normalizeSummerScheduleTeam(team = {}) {
  return {
    teamId: safeNumber(team.teamId, 0),
    teamName: team.teamName || "",
    teamCity: team.teamSubtitle || "",
    teamTricode: team.teamTricode || "",
    wins: safeNumber(team.wins, 0),
    losses: safeNumber(team.losses, 0),
    score: safeNumber(team.score, 0),
    timeoutsRemaining: safeNumber(team.timeoutsRemaining, 0),
  };
}

function normalizeSummerScheduleCard(card = {}) {
  return {
    gameId: String(card.gameId || ""),
    gameCode: "",
    gameStatus: safeNumber(card.gameStatus, 1),
    gameStatusText: card.gameStatusText || "",
    period: safeNumber(card.period, 0),
    gameClock: toIsoClock(card.gameClock),
    gameTimeUTC: card.gameTimeUtc || "",
    gameEt: card.gameTimeEastern || "",
    seasonYear: String(card.seasonYear || ""),
    seasonType: card.seasonType || "Summer League",
    arena: {
      arenaName: "",
      arenaState: "",
      arenaCity: "",
    },
    homeTeam: normalizeSummerScheduleTeam(card.homeTeam),
    awayTeam: normalizeSummerScheduleTeam(card.awayTeam),
    summerLeague: {
      leagueId: String(card.leagueId || ""),
      cardHat: card.cardHat || "",
      shareUrl: card.shareUrl || "",
    },
  };
}

function parseSummerLeagueRecordParts(recordText = "") {
  const match = /(\d+)-(\d+)/.exec(String(recordText || ""));
  return {
    wins: safeNumber(match?.[1], 0),
    losses: safeNumber(match?.[2], 0),
  };
}

function buildSummerScheduleTeamFromMarkdown(tricode, displayName, recordText, scoreText) {
  const teamMeta = NBA_TEAM_BY_TRICODE.get(String(tricode || "").toUpperCase()) || null;
  const record = parseSummerLeagueRecordParts(recordText);
  const fullName = String(displayName || teamMeta?.fullName || "").trim();
  const teamName = teamMeta?.fullName
    ? teamMeta.fullName.replace(/^.*?\s(?=[^ ]+$)/, "")
    : fullName.replace(/^.*?\s(?=[^ ]+$)/, "") || fullName;
  const teamCity = teamMeta?.fullName
    ? teamMeta.fullName.slice(0, Math.max(0, teamMeta.fullName.length - teamName.length)).trim()
    : fullName === teamName ? "" : fullName.slice(0, Math.max(0, fullName.length - teamName.length)).trim();
  return {
    teamId: safeNumber(teamMeta?.teamId, 0),
    teamName,
    teamCity,
    teamTricode: String(tricode || "").toUpperCase(),
    wins: record.wins,
    losses: record.losses,
    score: safeNumber(scoreText, 0),
    timeoutsRemaining: 0,
  };
}

function parseSummerLeagueGamesMarkdown(markdown, dateStr) {
  const gamePattern = /\[(?<league>[^[]+?)!\[Image[^\]]*?\]\([^)]+\)\s+(?<awayName>.+?)\s+(?<awayRecord>\d+-\d+)\s+(?<awayScore>\d+)\s+(?<status>Final(?:\/OT\d*)?|Final\/OT|Halftime|Q\d\s+\d+:\d+|[\d:]+\s*(?:am|pm)\s*ET)\s+(?<homeScore>\d+)\s+!\[Image[^\]]*?\]\([^)]+\)\s+(?<homeName>.+?)\s+(?<homeRecord>\d+-\d+)\]\((?<url>https:\/\/www\.nba\.com\/game\/(?<slug>[^)]+?)-(?<gameId>\d+))\)/g;
  const games = [];
  for (const match of markdown.matchAll(gamePattern)) {
    const groups = match.groups || {};
    const slugParts = String(groups.slug || "").split("-vs-");
    const awayTricode = String(slugParts[0] || "").toUpperCase();
    const homeTricode = String(slugParts[1] || "").toUpperCase();
    if (!SUMMER_LEAGUE_IDS.has(String(groups.gameId || "").slice(0, 2))) continue;
    const statusText = String(groups.status || "").trim();
    const gameStatus = /^final/i.test(statusText) ? 3 : /^q\d/i.test(statusText) ? 2 : 1;
    const gameClockMatch = /^Q\d\s+(\d+:\d+)/i.exec(statusText);
    const gameClock = gameClockMatch ? `PT${gameClockMatch[1].split(":")[0]}M${gameClockMatch[1].split(":")[1]}.00S` : "";
    const leagueText = String(groups.league || "").trim();
    let leagueId = "14";
    if (/california/i.test(leagueText)) leagueId = "13";
    if (/2k/i.test(leagueText)) leagueId = "15";
    if (/salt lake/i.test(leagueText)) leagueId = "16";
    games.push({
      gameId: String(groups.gameId || ""),
      gameCode: "",
      gameStatus,
      gameStatusText: statusText,
      period: gameStatus === 2 ? safeNumber(/^Q(\d)/i.exec(statusText)?.[1], 0) : gameStatus === 3 ? 4 : 0,
      gameClock,
      gameTimeUTC: "",
      gameEt: "",
      seasonYear: String(parseDateParts(dateStr)?.year || ""),
      seasonType: "Summer League",
      arena: {
        arenaName: "",
        arenaState: "",
        arenaCity: "",
      },
      awayTeam: buildSummerScheduleTeamFromMarkdown(awayTricode, groups.awayName, groups.awayRecord, groups.awayScore),
      homeTeam: buildSummerScheduleTeamFromMarkdown(homeTricode, groups.homeName, groups.homeRecord, groups.homeScore),
      summerLeague: {
        leagueId,
        cardHat: leagueText,
        shareUrl: String(groups.url || ""),
      },
    });
  }
  return games;
}

async function fetchSummerGamesPage(dateStr) {
  if (SUMMER_LEAGUE_PAGE_CACHE.has(dateStr)) {
    return SUMMER_LEAGUE_PAGE_CACHE.get(dateStr);
  }
  const html = await requestText(`https://www.nba.com/games?date=${dateStr}`);
  const data = extractNextDataFromHtml(html);
  SUMMER_LEAGUE_PAGE_CACHE.set(dateStr, data);
  return data;
}

async function fetchSummerLeagueGamesByDate(dateStr) {
  try {
    const data = await fetchSummerGamesPage(dateStr);
    const cards = data?.props?.pageProps?.gameCardFeed?.modules?.flatMap((module) => module?.cards || []) || [];
    const games = cards
      .map((card) => card?.cardData)
      .filter((card) => card && SUMMER_LEAGUE_IDS.has(String(card.leagueId || "")))
      .map(normalizeSummerScheduleCard);
    if (games.length) return games;
  } catch {
    // Fall through to the mirror parser below.
  }

  const markdown = await requestText(`https://r.jina.ai/http://https://www.nba.com/games?date=${dateStr}`, "text/plain");
  return parseSummerLeagueGamesMarkdown(markdown, dateStr);
}

async function findSummerLeagueGameUrlById(gameId, dateStr = null) {
  const safeGameId = String(gameId || "").trim();
  if (!safeGameId) {
    throw new Error("Missing Summer League game id.");
  }
  if (SUMMER_LEAGUE_GAME_URL_CACHE.has(safeGameId)) {
    return SUMMER_LEAGUE_GAME_URL_CACHE.get(safeGameId);
  }

  const datesToCheck = [];
  if (dateStr && isJulyDate(dateStr)) {
    datesToCheck.push(dateStr);
  } else {
    const seasonYearSuffix = String(safeGameId).slice(3, 5);
    const seasonYear = 2000 + safeNumber(seasonYearSuffix, 0);
    const indexDate = `${seasonYear}-07-01`;
    const indexPage = await fetchSummerGamesPage(indexDate);
    const gameCounts = indexPage?.props?.pageProps?.allGamesInCurrentYear?.[String(seasonYear)] || {};
    Object.entries(gameCounts)
      .filter(([dateKey, count]) => parseDateParts(dateKey)?.month === 7 && safeNumber(count, 0) > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([dateKey]) => datesToCheck.push(dateKey));
  }

  for (const candidateDate of datesToCheck) {
    const games = await fetchSummerLeagueGamesByDate(candidateDate);
    const match = games.find((game) => String(game.gameId) === safeGameId);
    if (match?.summerLeague?.shareUrl) {
      SUMMER_LEAGUE_GAME_URL_CACHE.set(safeGameId, match.summerLeague.shareUrl);
      return match.summerLeague.shareUrl;
    }
  }

  throw new Error(`Unable to locate Summer League game ${safeGameId}.`);
}

function normalizeSummerOfficial(official = {}) {
  return {
    personId: safeNumber(official.personId, 0),
    firstName: official.firstName || "",
    familyName: official.familyName || "",
    jerseyNum: String(official.jerseyNum || "").trim(),
  };
}

function normalizeSummerPlayer(identity = {}, statsSource = {}) {
  const stats = statsSource.statistics || {};
  return {
    personId: safeNumber(identity.personId ?? statsSource.personId, 0),
    firstName: identity.firstName || statsSource.firstName || "",
    familyName: identity.familyName || statsSource.familyName || "",
    jerseyNum: String(identity.jerseyNum ?? statsSource.jerseyNum ?? "").trim(),
    position: statsSource.position || "",
    minutes: stats.minutes || "PT00M00.00S",
    plusMinusPoints: safeNumber(stats.plusMinusPoints, 0),
    points: safeNumber(stats.points, 0),
    reboundsTotal: safeNumber(stats.reboundsTotal, 0),
    reboundsOffensive: safeNumber(stats.reboundsOffensive, 0),
    opponentDRBWhileOnCourt: 0,
    assists: safeNumber(stats.assists, 0),
    blocks: safeNumber(stats.blocks, 0),
    steals: safeNumber(stats.steals, 0),
    turnovers: safeNumber(stats.turnovers, 0),
    foulsPersonal: safeNumber(stats.foulsPersonal, 0),
    fieldGoalsMade: safeNumber(stats.fieldGoalsMade, 0),
    fieldGoalsAttempted: safeNumber(stats.fieldGoalsAttempted, 0),
    threePointersMade: safeNumber(stats.threePointersMade, 0),
    threePointersAttempted: safeNumber(stats.threePointersAttempted, 0),
    freeThrowsMade: safeNumber(stats.freeThrowsMade, 0),
    freeThrowsAttempted: safeNumber(stats.freeThrowsAttempted, 0),
    offensiveRating: null,
    defensiveRating: null,
    rimFieldGoalsMade: 0,
    rimFieldGoalsAttempted: 0,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
    chargesDrawn: 0,
    deflections: 0,
  };
}

function normalizeSummerBoxScoreTotals(team = {}) {
  const stats = team.statistics || {};
  return {
    points: safeNumber(stats.points, 0),
    reboundsTotal: safeNumber(stats.reboundsTotal, 0),
    reboundsOffensive: safeNumber(stats.reboundsOffensive, 0),
    assists: safeNumber(stats.assists, 0),
    blocks: safeNumber(stats.blocks, 0),
    steals: safeNumber(stats.steals, 0),
    turnovers: safeNumber(stats.turnoversTotal ?? stats.turnovers, 0),
    foulsPersonal: safeNumber(stats.foulsPersonal, 0),
    fieldGoalsMade: safeNumber(stats.fieldGoalsMade, 0),
    fieldGoalsAttempted: safeNumber(stats.fieldGoalsAttempted, 0),
    threePointersMade: safeNumber(stats.threePointersMade, 0),
    threePointersAttempted: safeNumber(stats.threePointersAttempted, 0),
    freeThrowsMade: safeNumber(stats.freeThrowsMade, 0),
    freeThrowsAttempted: safeNumber(stats.freeThrowsAttempted, 0),
    rimFieldGoalsMade: 0,
    rimFieldGoalsAttempted: 0,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
  };
}

function normalizeSummerBoxScoreTeam(team = {}, rosterPlayers = []) {
  const statsPlayers = Array.isArray(team.players) ? team.players : [];
  const statsByPersonId = new Map(
    statsPlayers.map((player) => [String(player?.personId || "").trim(), player])
  );
  const identityPlayers = Array.isArray(rosterPlayers) && rosterPlayers.length ? rosterPlayers : statsPlayers;
  const players = identityPlayers
    .slice()
    .sort((left, right) => {
      const leftStats = statsByPersonId.get(String(left?.personId || "").trim()) || left;
      const rightStats = statsByPersonId.get(String(right?.personId || "").trim()) || right;
      return safeNumber(leftStats.order, 999) - safeNumber(rightStats.order, 999);
    })
    .map((identity) => normalizeSummerPlayer(
      identity,
      statsByPersonId.get(String(identity?.personId || "").trim()) || {}
    ));
  return {
    teamId: safeNumber(team.teamId, 0),
    teamName: team.teamName || "",
    teamTricode: team.teamTricode || "",
    players,
    totals: normalizeSummerBoxScoreTotals(team),
  };
}

function estimatePossessions(teamStats = {}, opponentStats = {}) {
  const fieldGoalsAttempted = safeNumber(teamStats.fieldGoalsAttempted, 0);
  const freeThrowsAttempted = safeNumber(teamStats.freeThrowsAttempted, 0);
  const offensiveRebounds = safeNumber(teamStats.reboundsOffensive, 0);
  const turnovers = safeNumber(teamStats.turnoversTotal ?? teamStats.turnovers, 0);
  const opponentFieldGoalsAttempted = safeNumber(opponentStats.fieldGoalsAttempted, 0);
  const opponentFreeThrowsAttempted = safeNumber(opponentStats.freeThrowsAttempted, 0);
  const opponentOffensiveRebounds = safeNumber(opponentStats.reboundsOffensive, 0);
  const opponentTurnovers = safeNumber(opponentStats.turnoversTotal ?? opponentStats.turnovers, 0);
  return 0.5 * (
    (fieldGoalsAttempted + 0.44 * freeThrowsAttempted - offensiveRebounds + turnovers) +
    (opponentFieldGoalsAttempted + 0.44 * opponentFreeThrowsAttempted - opponentOffensiveRebounds + opponentTurnovers)
  );
}

function buildSummerTeamAdvancedStats(team = {}) {
  const players = Array.isArray(team.players) ? team.players : [];
  return players.reduce((totals, player) => {
    const stats = player.statistics || {};
    return {
      ...totals,
      chargesDrawn: totals.chargesDrawn + safeNumber(stats.chargesDrawn, 0),
      offensiveFoulsDrawn: totals.offensiveFoulsDrawn + safeNumber(stats.offensiveFoulsDrawn, 0),
      deflections: totals.deflections + safeNumber(stats.deflections, 0),
    };
  }, {
    drivingFGPercent: 0,
    drivingFGMade: 0,
    drivingFGAttempted: 0,
    cuttingFGPercent: 0,
    cuttingFGMade: 0,
    cuttingFGAttempted: 0,
    catchAndShoot3FGPercent: 0,
    catchAndShoot3FGMade: 0,
    catchAndShoot3FGAttempted: 0,
    chargesDrawn: 0,
    offensiveFoulsDrawn: 0,
    deflections: 0,
  });
}

function buildSummerTeamStats(team = {}, opponent = {}) {
  const teamStats = team.statistics || {};
  const opponentStats = opponent.statistics || {};
  const possessions = estimatePossessions(teamStats, opponentStats);
  const points = safeNumber(teamStats.points, 0);
  const opponentPoints = safeNumber(opponentStats.points, 0);
  const twoPointersMade = safeNumber(teamStats.twoPointersMade, 0);
  const twoPointersAttempted = safeNumber(teamStats.twoPointersAttempted, 0);
  const paintMade = safeNumber(teamStats.pointsInThePaintMade, 0);
  const paintAttempted = safeNumber(teamStats.pointsInThePaintAttempted, 0);
  const midMade = Math.max(0, twoPointersMade - paintMade);
  const midAttempted = Math.max(0, twoPointersAttempted - paintAttempted);

  return {
    possessions,
    offensiveRating: possessions > 0 ? (points / possessions) * 100 : 0,
    killsData: {
      three: 0,
      four: 0,
      five: 0,
      six: 0,
      seven: 0,
      eight: 0,
      delta: 0,
      pi: 0,
    },
    transitionStats: {
      transitionRate: safeRatio(teamStats.fastBreakPointsAttempted, teamStats.fieldGoalsAttempted),
      transitionPoints: safeNumber(teamStats.pointsFastBreak, 0),
      transitionTurnovers: 0,
      secondChancePoints: safeNumber(teamStats.pointsSecondChance, 0),
      threePointORebPercent: 0,
    },
    defensiveRating: possessions > 0 ? (opponentPoints / possessions) * 100 : 0,
    netRating: possessions > 0 ? ((points - opponentPoints) / possessions) * 100 : 0,
    shotProfile: {
      rimRate: safeRatio(paintAttempted, teamStats.fieldGoalsAttempted),
      midRate: safeRatio(midAttempted, teamStats.fieldGoalsAttempted),
      threePRate: safeRatio(teamStats.threePointersAttempted, teamStats.fieldGoalsAttempted),
    },
    shotEfficiency: {
      rimFGPercent: safeRatio(paintMade, paintAttempted),
      rimFGMade: paintMade,
      rimFGAttempted: paintAttempted,
      midFGPercent: safeRatio(midMade, midAttempted),
      midFGMade: midMade,
      midFGAttempted: midAttempted,
      threeFGPercent: safeRatio(teamStats.threePointersMade, teamStats.threePointersAttempted),
      threeFGMade: safeNumber(teamStats.threePointersMade, 0),
      threeFGAttempted: safeNumber(teamStats.threePointersAttempted, 0),
    },
    advancedStats: buildSummerTeamAdvancedStats(team),
  };
}

function normalizeSummerAction(action = {}) {
  return {
    actionNumber: safeNumber(action.actionNumber, 0),
    clock: toIsoClock(action.clock),
    timeActual: action.timeActual || "",
    period: safeNumber(action.period, 0),
    teamId: action.teamId == null ? null : safeNumber(action.teamId, 0),
    teamTricode: action.teamTricode || null,
    actionType: action.actionType || "",
    subType: action.subType || "",
    descriptor: action.descriptor || "",
    qualifiers: Array.isArray(action.qualifiers) ? action.qualifiers : null,
    personId: action.personId == null ? null : safeNumber(action.personId, 0),
    playerName: action.playerName || null,
    playerNameI: action.playerNameI || null,
    x: action.x ?? null,
    y: action.y ?? null,
    side: action.side ?? null,
    shotDistance: action.shotDistance ?? null,
    shotResult: action.shotResult ?? null,
    possession: action.possession ?? 0,
    isFieldGoal: safeNumber(action.isFieldGoal, 0),
    scoreHome: String(action.scoreHome ?? ""),
    scoreAway: String(action.scoreAway ?? ""),
    orderNumber: safeNumber(action.orderNumber, 0),
    location: action.location || "",
    description: action.description || "",
    isTargetScoreLastPeriod: Boolean(action.isTargetScoreLastPeriod),
    assistPlayerNameI: action.assistPlayerNameI || "",
    assistPersonId: safeNumber(action.assistPersonId, 0),
    assistTotal: safeNumber(action.assistTotal, 0),
    reboundTotal: safeNumber(action.reboundTotal, 0),
    reboundDefensiveTotal: safeNumber(action.reboundDefensiveTotal, 0),
    reboundOffensiveTotal: safeNumber(action.reboundOffensiveTotal, 0),
    turnoverTotal: safeNumber(action.turnoverTotal, 0),
    stealPlayerNameI: action.stealPlayerNameI || "",
    stealPersonId: safeNumber(action.stealPersonId, 0),
    foulPersonalTotal: safeNumber(action.foulPersonalTotal, 0),
    foulTechnicalTotal: safeNumber(action.foulTechnicalTotal, 0),
    foulDrawnPlayerName: action.foulDrawnPlayerName || "",
    foulDrawnPersonId: safeNumber(action.foulDrawnPersonId, 0),
    jumpBallRecoveredNameInitial: action.jumpBallRecoveredNameInitial || "",
    jumpBallRecoveredPersonId: safeNumber(action.jumpBallRecoveredPersonId, 0),
    jumpBallWonPlayerNameI: action.jumpBallWonPlayerNameI || "",
    jumpBallWonPersonId: safeNumber(action.jumpBallWonPersonId, 0),
    jumpBallLostPlayerNameI: action.jumpBallLostPlayerNameI || "",
    jumpBallLostPersonId: safeNumber(action.jumpBallLostPersonId, 0),
    edited: action.edited || "",
    xLegacy: action.xLegacy ?? null,
    yLegacy: action.yLegacy ?? null,
    officialId: action.officialId ?? null,
    area: action.area ?? null,
    areaDetail: action.areaDetail ?? null,
    personIdsFilter: Array.isArray(action.personIdsFilter) ? action.personIdsFilter : [],
  };
}

async function fetchSummerLeagueGame(gameId, dateStr = null) {
  const shareUrl = await findSummerLeagueGameUrlById(gameId, dateStr);
  const [boxHtml, playByPlayHtml] = await Promise.all([
    requestText(`${shareUrl}/box-score`),
    requestText(`${shareUrl}/play-by-play`),
  ]);
  const boxData = extractNextDataFromHtml(boxHtml);
  const playByPlayData = extractNextDataFromHtml(playByPlayHtml);
  const boxPageProps = boxData?.props?.pageProps || {};
  const playByPlayPageProps = playByPlayData?.props?.pageProps || {};
  const game = boxPageProps.game || {};
  const playByPlay = playByPlayPageProps.playByPlay || {};

  return {
    gameId: String(game.gameId || gameId),
    gameCode: game.gameCode || "",
    gameStatus: safeNumber(game.gameStatus, 1),
    gameStatusText: game.gameStatusText || "",
    period: safeNumber(game.period, 0),
    gameClock: toIsoClock(game.gameClock),
    gameTimeUTC: game.gameTimeUTC || "",
    gameEt: game.gameEt || "",
    seasonYear: String(boxPageProps?.analyticsObject?.season || parseDateParts(game.gameTimeUTC?.slice(0, 10))?.year || ""),
    seasonType: "Summer League",
    arena: {
      arenaName: game?.arena?.arenaName || "",
      arenaState: game?.arena?.arenaState || "",
      arenaCity: game?.arena?.arenaCity || "",
    },
    homeTeam: {
      teamId: safeNumber(game?.homeTeam?.teamId, 0),
      teamName: game?.homeTeam?.teamName || "",
      teamCity: game?.homeTeam?.teamCity || "",
      teamTricode: game?.homeTeam?.teamTricode || "",
      wins: safeNumber(game?.homeTeam?.teamWins, 0),
      losses: safeNumber(game?.homeTeam?.teamLosses, 0),
      score: safeNumber(game?.homeTeam?.score, 0),
      timeoutsRemaining: safeNumber(game?.homeTeam?.timeoutsRemaining, 0),
    },
    awayTeam: {
      teamId: safeNumber(game?.awayTeam?.teamId, 0),
      teamName: game?.awayTeam?.teamName || "",
      teamCity: game?.awayTeam?.teamCity || "",
      teamTricode: game?.awayTeam?.teamTricode || "",
      wins: safeNumber(game?.awayTeam?.teamWins, 0),
      losses: safeNumber(game?.awayTeam?.teamLosses, 0),
      score: safeNumber(game?.awayTeam?.score, 0),
      timeoutsRemaining: safeNumber(game?.awayTeam?.timeoutsRemaining, 0),
    },
    officials: (Array.isArray(game.officials) ? game.officials : []).slice(0, 3).map(normalizeSummerOfficial),
    callsAgainst: null,
    timeouts: {
      home: safeNumber(game?.homeTeam?.timeoutsRemaining, 0),
      away: safeNumber(game?.awayTeam?.timeoutsRemaining, 0),
    },
    challenges: {
      home: { challengesTotal: 0, challengesWon: 0 },
      away: { challengesTotal: 0, challengesWon: 0 },
    },
    playByPlayActions: (Array.isArray(playByPlay.actions) ? playByPlay.actions : []).map(normalizeSummerAction),
    teamStats: {
      home: buildSummerTeamStats(game.homeTeam, game.awayTeam),
      away: buildSummerTeamStats(game.awayTeam, game.homeTeam),
    },
    boxScore: {
      home: normalizeSummerBoxScoreTeam(game.homeTeam, game.homeTeamPlayers),
      away: normalizeSummerBoxScoreTeam(game.awayTeam, game.awayTeamPlayers),
    },
  };
}

export async function fetchGamesByDate(dateStr) {
  const url = `${API_BASE}/games/byDate?date=${dateStr}`;
  const [baseGames, summerGames] = await Promise.all([
    requestJson(url).catch(() => []),
    isJulyDate(dateStr) ? fetchSummerLeagueGamesByDate(dateStr).catch(() => []) : Promise.resolve([]),
  ]);

  if (!summerGames.length) {
    return baseGames;
  }

  const merged = new Map();
  [...baseGames, ...summerGames].forEach((game) => {
    if (game?.gameId) {
      merged.set(String(game.gameId), game);
    }
  });
  return [...merged.values()];
}

export async function fetchGame(gameId, segment = null, options = {}) {
  if (isSummerLeagueGameId(gameId)) {
    return fetchSummerLeagueGame(gameId, options?.dateStr || null);
  }
  const segmentParam = segment ? `?segment=${segment}` : "";
  const url = `${API_BASE}/games/${gameId}${segmentParam}`;
  return requestJson(url);
}

export function fetchMinutes(gameId) {
  const url = `${API_BASE}/games/${gameId}/minutes`;
  return requestJson(url);
}

export function teamLogoUrl(teamId, league = null) {
  const inferredLeague =
    league ||
    inferLeagueFromTeamId(teamId);

  if (inferredLeague === "gleague") {
    return `https://ak-static.cms.nba.com/wp-content/uploads/logos/nbagleague/${teamId}/primary/L/logo.svg`;
  }
  if (inferredLeague === "wnba") {
    return `https://cdn.wnba.com/logos/wnba/${teamId}/D/logo.svg`;
  }
  return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
}

export function inferLeagueFromTeamId(teamId) {
  return Number(teamId) >= 1612700000 && Number(teamId) < 1612710000 ? "gleague" : "nba";
}

export function playerHeadshotUrls(personId, teamId = null) {
  const safePersonId = String(personId || "").trim();
  if (!safePersonId) return [];

  const league = inferLeagueFromTeamId(teamId);
  const overrideValue = league === "gleague" ? gLeagueHeadshotOverrides[safePersonId] : null;
  const overrideUrls = Array.isArray(overrideValue)
    ? overrideValue
    : overrideValue
      ? [overrideValue]
      : [];

  const candidates = league === "gleague"
    ? [
      ...overrideUrls,
      SUPABASE_FUNCTIONS_BASE
        ? `${SUPABASE_FUNCTIONS_BASE}/player-headshot?personId=${encodeURIComponent(safePersonId)}`
        : null,
      `https://cdn.nba.com/headshots/nba/latest/1040x760/${safePersonId}.png`,
      `https://cdn.nba.com/headshots/nba/latest/260x190/${safePersonId}.png`,
    ]
    : [
      `https://cdn.nba.com/headshots/nba/latest/260x190/${safePersonId}.png`,
      `https://cdn.nba.com/headshots/nba/latest/1040x760/${safePersonId}.png`,
    ];

  return [...new Set(candidates.filter(Boolean))];
}

export function playerHeadshotUrl(personId, teamId = null) {
  return playerHeadshotUrls(personId, teamId)[0] || null;
}

export async function fetchCurrentNbaRosters() {
  if (!SUPABASE_FUNCTIONS_BASE) {
    throw new Error("Supabase functions are not configured.");
  }
  return requestJson(`${SUPABASE_FUNCTIONS_BASE}/nba-rosters`);
}

export async function fetchCurrentGLeagueRosters() {
  if (!SUPABASE_FUNCTIONS_BASE) {
    throw new Error("Supabase functions are not configured.");
  }
  return requestJson(`${SUPABASE_FUNCTIONS_BASE}/gleague-rosters`);
}

export function nbaEventVideoUrl({ gameId, actionNumber, seasonYear, title }) {
  if (!gameId || actionNumber == null) return null;

  const seasonText = String(seasonYear ?? "").trim();
  let season;
  if (/^\d{4}$/.test(seasonText)) {
    const startYear = Number(seasonText);
    season = `${startYear}-${String(startYear + 1).slice(-2)}`;
  } else if (/^\d{4}-\d{2}$/.test(seasonText)) {
    season = seasonText;
  } else if (/^\d{4}-\d{4}$/.test(seasonText)) {
    const startYear = Number(seasonText.slice(0, 4));
    season = `${startYear}-${String(startYear + 1).slice(-2)}`;
  }

  const params = new URLSearchParams({
    flag: "1",
    GameID: String(gameId),
    GameEventID: String(actionNumber),
  });

  if (season) params.set("Season", season);
  if (title) params.set("title", String(title));

  return `https://www.nba.com/stats/events?${params.toString()}`;
}
