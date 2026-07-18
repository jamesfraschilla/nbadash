import { gLeagueHeadshotOverrides } from "./gLeagueHeadshotOverrides.js";
import {
  normalizePlayerHeadshotOverrides,
  resolvePlayerHeadshotOverrideUrls,
} from "./playerHeadshotOverrides.js";
import { NBA_TEAMS } from "./data/nbaTeams.js";
import { aggregateSegmentStats } from "./segmentStats.js";
import {
  isSummerLeagueGameId,
  normalizeSummerLeagueMinutesData,
  shouldUseDirectSummerLeagueGame,
} from "./summerLeagueGameSource.js";
import {
  fetchBrowserPlayerStatsFallback,
  fetchOfficialNbaPlayerStatsFallback,
} from "./personnelStatsFallback.js";
import {
  getPersonnelStatsCoverage,
  mergePersonnelStatsPayloads,
} from "./personnelStatsResolution.js";
import { supabase } from "./supabaseClient.js";
import { currentSeasonString, formatDateInput, seasonBoundsForSeason } from "./utils.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const ALL_ORIGINS_RAW_URL = "https://api.allorigins.win/raw?url=";
const SUMMER_LEAGUE_IDS = new Set(["13", "14", "15", "16"]);
const SUMMER_LEAGUE_PAGE_CACHE = new Map();
const SUMMER_LEAGUE_GAME_URL_CACHE = new Map();
const NBA_TEAM_BY_TRICODE = new Map(NBA_TEAMS.map((team) => [team.tricode, team]));
const SUPABASE_URL = import.meta?.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta?.env?.VITE_SUPABASE_ANON_KEY;
const SUPABASE_FUNCTIONS_BASE = SUPABASE_URL
  ? `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1`
  : "";
const APP_BASE_PATH = import.meta?.env?.BASE_URL || "/nbadash/";

async function requestJson(url, options = {}) {
  const { timeoutMs = 0 } = options;
  const headers = { Accept: "application/json" };
  if (SUPABASE_FUNCTIONS_BASE && String(url || "").startsWith(SUPABASE_FUNCTIONS_BASE)) {
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    }
    const accessToken = await supabase?.auth?.getSession?.()
      .then(({ data }) => data?.session?.access_token || "")
      .catch(() => "");
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  const res = await fetch(url, {
    headers,
    signal: controller?.signal,
  }).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
  if (!res.ok) {
    const error = new Error(`Request failed: ${res.status}`);
    error.status = res.status;
    error.url = url;
    throw error;
  }
  return res.json();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
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

async function requestText(url, accept = "text/html", options = {}) {
  const {
    preferDirect = false,
    allowProxy = true,
    proxyTimeoutMs = 2500,
  } = options;

  const fetchDirect = async () => {
    const directResponse = await fetch(url, {
      headers: { Accept: accept },
    });
    if (!directResponse.ok) {
      throw new Error(`Request failed: ${directResponse.status}`);
    }
    return directResponse.text();
  };

  if (preferDirect) {
    try {
      return await fetchDirect();
    } catch {
      // Fall through to the proxy when direct fetches are blocked or unavailable.
    }
  }

  if (allowProxy) {
    try {
      const proxiedResponse = await fetchWithTimeout(`${ALL_ORIGINS_RAW_URL}${encodeURIComponent(url)}`, {
        headers: { Accept: accept },
      }, proxyTimeoutMs);
      if (proxiedResponse.ok) {
        return proxiedResponse.text();
      }
    } catch {
      // Fall through to a direct fetch when the proxy is unavailable.
    }
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

export function isSummerLeagueGame(gameId) {
  return isSummerLeagueGameId(gameId);
}

function normalizeSummerLeagueGameMetadata(game) {
  if (!isSummerLeagueGameId(game?.gameId)) return game;
  return {
    ...game,
    seasonType: "Summer League",
  };
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function formatClockToIso(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return "PT00M00.00S";
  return `PT${Number(match[1])}M${Number(match[2])}.00S`;
}

function formatMinutesToIso(value) {
  return formatClockToIso(value);
}

function splitMarkdownRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdownNumeric(value, fallback = 0) {
  const normalized = String(value || "").replace(/[+,]/g, "").trim();
  if (!normalized) return fallback;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildPlayerNameParts(fullName = "") {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
    familyName: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

function extractMarkdownPlayerLabel(cell = "") {
  const cleaned = String(cell || "").replace(/!\[[^\]]*]\([^)]+\)/g, "");
  const match = /\[(.+?)]\(https:\/\/www\.nba\.com\/player\/(\d+)\/[^)]+\)([A-Z]*)/.exec(cleaned);
  if (!match) return null;
  const rawLabel = String(match[1] || "").trim();
  const rawTokens = rawLabel.split(/\s+/).filter(Boolean);
  const shortNameIndex = rawTokens.findIndex((token) => token.includes("."));
  const fullName = (shortNameIndex > 0 ? rawTokens.slice(0, shortNameIndex) : rawTokens).join(" ").trim();
  return {
    personId: safeNumber(match[2], 0),
    fullName,
    position: String(match[3] || "").trim(),
  };
}

function parseSummerBoxScoreBlock(blockText, teamMeta) {
  if (!blockText) {
    return {
      teamId: safeNumber(teamMeta?.teamId, 0),
      teamName: teamMeta?.teamName || "",
      teamCity: teamMeta?.teamCity || "",
      teamTricode: teamMeta?.teamTricode || "",
      players: [],
      totals: null,
    };
  }

  const lines = String(blockText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  const players = [];
  let totals = null;

  lines.forEach((line) => {
    const cells = splitMarkdownRow(line);
    if (!cells.length || /^---/.test(cells[0])) return;
    if (cells[0] === "TOTALS") {
      totals = {
        points: parseMarkdownNumeric(cells[19]),
        reboundsTotal: parseMarkdownNumeric(cells[13]),
        reboundsOffensive: parseMarkdownNumeric(cells[11]),
        assists: parseMarkdownNumeric(cells[14]),
        blocks: parseMarkdownNumeric(cells[16]),
        steals: parseMarkdownNumeric(cells[15]),
        turnovers: parseMarkdownNumeric(cells[17]),
        foulsPersonal: parseMarkdownNumeric(cells[18]),
        fieldGoalsMade: parseMarkdownNumeric(cells[2]),
        fieldGoalsAttempted: parseMarkdownNumeric(cells[3]),
        threePointersMade: parseMarkdownNumeric(cells[5]),
        threePointersAttempted: parseMarkdownNumeric(cells[6]),
        freeThrowsMade: parseMarkdownNumeric(cells[8]),
        freeThrowsAttempted: parseMarkdownNumeric(cells[9]),
        rimFieldGoalsMade: 0,
        rimFieldGoalsAttempted: 0,
        midFieldGoalsMade: 0,
        midFieldGoalsAttempted: 0,
      };
      return;
    }
    const isDnp = /DNP/i.test(cells[1] || "");
    const playerLabel = extractMarkdownPlayerLabel(cells[0]);
    if (!playerLabel?.personId) return;
    const nameParts = buildPlayerNameParts(playerLabel.fullName);
    players.push({
      personId: playerLabel.personId,
      firstName: nameParts.firstName,
      familyName: nameParts.familyName,
      jerseyNum: "",
      position: playerLabel.position,
      minutes: isDnp ? "PT00M00.00S" : formatMinutesToIso(cells[1]),
      notPlayingReason: isDnp ? String(cells[1] || "").trim() : "",
      plusMinusPoints: parseMarkdownNumeric(cells[20]),
      points: parseMarkdownNumeric(cells[19]),
      reboundsTotal: parseMarkdownNumeric(cells[13]),
      reboundsOffensive: parseMarkdownNumeric(cells[11]),
      assists: parseMarkdownNumeric(cells[14]),
      blocks: parseMarkdownNumeric(cells[16]),
      steals: parseMarkdownNumeric(cells[15]),
      turnovers: parseMarkdownNumeric(cells[17]),
      foulsPersonal: parseMarkdownNumeric(cells[18]),
      fieldGoalsMade: parseMarkdownNumeric(cells[2]),
      fieldGoalsAttempted: parseMarkdownNumeric(cells[3]),
      threePointersMade: parseMarkdownNumeric(cells[5]),
      threePointersAttempted: parseMarkdownNumeric(cells[6]),
      freeThrowsMade: parseMarkdownNumeric(cells[8]),
      freeThrowsAttempted: parseMarkdownNumeric(cells[9]),
      offensiveRating: null,
      defensiveRating: null,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      chargesDrawn: 0,
      deflections: 0,
    });
  });

  return {
    teamId: safeNumber(teamMeta?.teamId, 0),
    teamName: teamMeta?.teamName || "",
    teamCity: teamMeta?.teamCity || "",
    teamTricode: teamMeta?.teamTricode || "",
    players,
    totals,
  };
}

function parseSummerBoxScoreTable(markdown, heading, teamMeta) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = new RegExp(
    `## ${escapedHeading}\\n\\n\\| PLAYER \\| MIN \\|[\\s\\S]*?\\n\\| ---[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n## |\\nNBA Organization|$)`
  ).exec(markdown);
  return parseSummerBoxScoreBlock(sectionMatch?.[1] || "", teamMeta);
}

function extractSummerBoxScoreBlocks(markdown) {
  return [...String(markdown || "").matchAll(
    /\| PLAYER \| MIN \|[^\n]*\n\| ---[^\n]*\n([\s\S]*?)(?=\n\| PLAYER \| MIN \||\nNBA Organization|$)/g
  )]
    .map((match) => match[1] || "")
    .filter(Boolean);
}

function parseSummerScoreboard(markdown, awayTricode, homeTricode) {
  const pattern = new RegExp(
    `${awayTricode}[\\s\\S]{0,120}?(\\d+)[\\s\\S]{0,120}?((?:Final(?:\\/OT\\d*)?|Final\\/OT|Halftime|Q\\d\\s+\\d+:\\d+|\\d+:\\d+\\s*(?:am|pm)\\s*ET))[\\s\\S]{0,120}?(\\d+)[\\s\\S]{0,240}?${homeTricode}`,
    "i"
  );
  const match = pattern.exec(String(markdown || ""));
  if (!match) return null;
  return {
    awayScore: parseMarkdownNumeric(match[1], 0),
    statusText: String(match[2] || "").trim(),
    homeScore: parseMarkdownNumeric(match[3], 0),
  };
}

export function parseSummerLeagueBoxScoreMarkdown(markdown, shareUrl) {
  const slugMatch = /\/game\/([a-z]{2,4})-vs-([a-z]{2,4})-\d+/i.exec(String(shareUrl || ""));
  const awayTricode = String(slugMatch?.[1] || "").toUpperCase();
  const homeTricode = String(slugMatch?.[2] || "").toUpperCase();
  const awayMeta = NBA_TEAM_BY_TRICODE.get(awayTricode) || {};
  const homeMeta = NBA_TEAM_BY_TRICODE.get(homeTricode) || {};
  const awayHeadingMatch = /## ([^\n]+)\n\n\| PLAYER \| MIN \|/m.exec(markdown);
  const homeHeadingMatch = /## ([^\n]+)\n\n\| PLAYER \| MIN \|[\s\S]*?\n## ([^\n]+)\n\n\| PLAYER \| MIN \|/m.exec(markdown);
  const awayHeading = awayHeadingMatch?.[1] || awayMeta.fullName || awayTricode;
  const homeHeading = homeHeadingMatch?.[2] || homeMeta.fullName || homeTricode;
  let awayTeam = parseSummerBoxScoreTable(markdown, awayHeading, {
    teamId: awayMeta.teamId,
    teamName: awayMeta.nickname || awayMeta.fullName?.split(" ").slice(-1)[0] || awayHeading,
    teamCity: awayMeta.city || awayMeta.fullName?.replace(/\s+[^ ]+$/, "") || "",
    teamTricode: awayTricode,
  });
  let homeTeam = parseSummerBoxScoreTable(markdown, homeHeading, {
    teamId: homeMeta.teamId,
    teamName: homeMeta.nickname || homeMeta.fullName?.split(" ").slice(-1)[0] || homeHeading,
    teamCity: homeMeta.city || homeMeta.fullName?.replace(/\s+[^ ]+$/, "") || "",
    teamTricode: homeTricode,
  });

  if (!awayTeam.players.length || !homeTeam.players.length) {
    const tableBlocks = extractSummerBoxScoreBlocks(markdown);
    awayTeam = awayTeam.players.length ? awayTeam : parseSummerBoxScoreBlock(tableBlocks[0] || "", {
      teamId: awayMeta.teamId,
      teamName: awayMeta.nickname || awayMeta.fullName?.split(" ").slice(-1)[0] || awayHeading,
      teamCity: awayMeta.city || awayMeta.fullName?.replace(/\s+[^ ]+$/, "") || "",
      teamTricode: awayTricode,
    });
    homeTeam = homeTeam.players.length ? homeTeam : parseSummerBoxScoreBlock(tableBlocks[1] || "", {
      teamId: homeMeta.teamId,
      teamName: homeMeta.nickname || homeMeta.fullName?.split(" ").slice(-1)[0] || homeHeading,
      teamCity: homeMeta.city || homeMeta.fullName?.replace(/\s+[^ ]+$/, "") || "",
      teamTricode: homeTricode,
    });
  }

  const scoreboard = parseSummerScoreboard(markdown, awayTricode, homeTricode);
  const statusText = String(scoreboard?.statusText || "").trim();
  const dateMatch = /\n([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4})\n/.exec(markdown);
  const arenaMatch = /\n([^\n]+,\s+[A-Za-z .'-]+,\s+[A-Z]{2})\n/.exec(markdown);
  const periodMatch = /^Q(\d+)/i.exec(statusText);
  const clockMatch = /^Q\d\s+(\d{1,2}:\d{2})/i.exec(statusText);
  const parsedDate = dateMatch?.[1] || "";
  const seasonYearMatch = /(\d{4})/.exec(parsedDate);

  return {
    gameStatus: /^final/i.test(statusText) ? 3 : /^q\d/i.test(statusText) ? 2 : 1,
    gameStatusText: statusText || "",
    period: safeNumber(periodMatch?.[1], /^final/i.test(statusText) ? 4 : 0),
    gameClock: clockMatch ? formatClockToIso(clockMatch[1]) : "PT00M00.00S",
    seasonYear: seasonYearMatch?.[1] || "",
    arena: {
      arenaName: arenaMatch?.[1]?.split(",")[0] || "",
      arenaCity: arenaMatch?.[1]?.split(",")[1]?.trim() || "",
      arenaState: arenaMatch?.[1]?.split(",")[2]?.trim() || "",
    },
    awayScore: safeNumber(scoreboard?.awayScore, awayTeam.totals?.points || 0),
    homeScore: safeNumber(scoreboard?.homeScore, homeTeam.totals?.points || 0),
    awayTeam,
    homeTeam,
  };
}

function buildSummerPlayerAliasMap(teams = []) {
  const aliases = [];
  const lastNameCounts = new Map();

  teams.forEach((team) => {
    (team.players || []).forEach((player) => {
      const fullName = `${player.firstName || ""} ${player.familyName || ""}`.trim();
      const lastName = String(player.familyName || "").trim();
      if (lastName) {
        const key = normalizeText(lastName);
        lastNameCounts.set(key, (lastNameCounts.get(key) || 0) + 1);
      }
      if (fullName) {
        aliases.push({
          alias: fullName,
          normalized: normalizeText(fullName),
          personId: player.personId,
          teamId: team.teamId,
        });
      }
      if (player.firstName && player.familyName) {
        aliases.push({
          alias: `${player.firstName[0]}. ${player.familyName}`,
          normalized: normalizeText(`${player.firstName[0]}. ${player.familyName}`),
          personId: player.personId,
          teamId: team.teamId,
        });
      }
    });
  });

  teams.forEach((team) => {
    (team.players || []).forEach((player) => {
      const lastName = String(player.familyName || "").trim();
      const key = normalizeText(lastName);
      if (!lastName || lastNameCounts.get(key) !== 1) return;
      aliases.push({
        alias: lastName,
        normalized: key,
        personId: player.personId,
        teamId: team.teamId,
      });
    });
  });

  return aliases
    .filter((entry) => entry.normalized)
    .sort((left, right) => right.alias.length - left.alias.length);
}

function parseSummerPlayByPlayMarkdown(markdown, awayTeam, homeTeam) {
  const lines = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const aliases = buildSummerPlayerAliasMap([awayTeam, homeTeam]);
  const teamByName = new Map([
    [normalizeText(`${awayTeam.teamCity} ${awayTeam.teamName}`), awayTeam],
    [normalizeText(`${homeTeam.teamCity} ${homeTeam.teamName}`), homeTeam],
    [normalizeText(awayTeam.teamTricode), awayTeam],
    [normalizeText(homeTeam.teamTricode), homeTeam],
    [normalizeText(awayTeam.teamName), awayTeam],
    [normalizeText(homeTeam.teamName), homeTeam],
  ]);

  const findAliasAtStart = (text) => {
    const normalizedText = normalizeText(text);
    for (const alias of aliases) {
      if (normalizedText === alias.normalized || normalizedText.startsWith(`${alias.normalized} `)) {
        return alias;
      }
    }
    return null;
  };

  const parseTeamId = (blockLines, description) => {
    for (const line of blockLines) {
      const team = teamByName.get(normalizeText(line));
      if (team) return team.teamId;
    }
    const reboundMatch = /^([A-Z]{2,4})\s+REBOUND$/i.exec(description);
    if (reboundMatch) {
      return teamByName.get(normalizeText(reboundMatch[1]))?.teamId || null;
    }
    const alias = findAliasAtStart(description.replace(/^MISS\s+/, "").replace(/^SUB:\s+/, ""));
    return alias?.teamId || null;
  };

  let currentPeriod = 0;
  let orderNumber = 1;
  let pendingTurnoverBeneficiary = null;
  let pendingOffensiveReboundTeamId = null;
  let pendingMissTeamId = null;
  const actions = [];

  const pushAction = (action) => {
    actions.push({
      actionNumber: orderNumber,
      orderNumber,
      clock: formatClockToIso(action.clockText),
      period: currentPeriod,
      teamId: action.teamId ?? null,
      teamTricode:
        action.teamId === awayTeam.teamId
          ? awayTeam.teamTricode
          : action.teamId === homeTeam.teamId
            ? homeTeam.teamTricode
            : null,
      description: action.description || "",
      qualifier: null,
      qualifiers: action.qualifiers || [],
      actionType: action.actionType || "",
      subType: action.subType || "",
      descriptor: action.descriptor || "",
      personId: action.personId ?? null,
      assistPersonId: action.assistPersonId ?? 0,
      shotDistance: action.shotDistance ?? null,
      shotResult: action.shotResult || null,
      playerName: action.playerName || null,
      playerNameI: action.playerName || null,
      isFieldGoal: action.actionType === "2pt" || action.actionType === "3pt" ? 1 : 0,
      timeActual: "",
      scoreHome: "",
      scoreAway: "",
      location: "",
      edited: "",
      personIdsFilter: [],
    });
    orderNumber += 1;
  };

  const isTimestamp = (line) => /^\d{1,2}:\d{2}(?:\s+\d+\s*-\s*\d+)?$/.test(line);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const qMatch = /^## Q(\d+) start$/i.exec(line);
    if (qMatch) {
      currentPeriod = safeNumber(qMatch[1], currentPeriod);
      pendingTurnoverBeneficiary = null;
      pendingOffensiveReboundTeamId = null;
      pendingMissTeamId = null;
      continue;
    }
    if (!isTimestamp(line) || !currentPeriod) continue;

    const clockText = line.split(/\s+/)[0];
    const blockLines = [];
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !isTimestamp(lines[nextIndex]) && !/^## /i.test(lines[nextIndex])) {
      if (lines[nextIndex]) blockLines.push(lines[nextIndex]);
      nextIndex += 1;
    }
    index = nextIndex - 1;
    if (!blockLines.length) continue;

    const description = blockLines
      .filter((entry) => !entry.startsWith("![Image"))
      .slice(-1)[0];
    if (!description) continue;

    const teamId = parseTeamId(blockLines, description);
    const otherTeamId =
      teamId === awayTeam.teamId ? homeTeam.teamId : teamId === homeTeam.teamId ? awayTeam.teamId : null;

    if (/^Timeout:/i.test(description) || /^Jump Ball/i.test(description)) {
      pendingTurnoverBeneficiary = null;
      continue;
    }

    const reboundMatch = /^(?:([A-Z]{2,4})|(.+?))\s+REBOUND(?:\s+\(Off:(\d+)\s+Def:(\d+)\))?$/i.exec(description);
    if (reboundMatch) {
      const alias = reboundMatch[2] ? findAliasAtStart(reboundMatch[2]) : null;
      const reboundTeamId = teamId ?? alias?.teamId ?? null;
      const isOffensive = reboundTeamId != null && pendingMissTeamId != null && reboundTeamId === pendingMissTeamId;
      pushAction({
        clockText,
        teamId: reboundTeamId,
        actionType: "rebound",
        subType: isOffensive ? "offensive" : "defensive",
        description,
        personId: alias?.personId ?? null,
        playerName: reboundMatch[2] || reboundMatch[1] || null,
      });
      pendingOffensiveReboundTeamId = isOffensive ? reboundTeamId : null;
      pendingMissTeamId = null;
      continue;
    }

    const stealMatch = /^(.+?)\s+STEAL\b/i.exec(description);
    if (stealMatch) {
      const alias = findAliasAtStart(stealMatch[1]);
      pushAction({
        clockText,
        teamId: alias?.teamId ?? teamId ?? null,
        actionType: "steal",
        description,
        personId: alias?.personId ?? null,
        playerName: stealMatch[1],
      });
      pendingTurnoverBeneficiary = alias?.teamId ?? teamId ?? null;
      continue;
    }

    const blockMatch = /^(.+?)\s+BLOCK\b/i.exec(description);
    if (blockMatch) {
      const alias = findAliasAtStart(blockMatch[1]);
      pushAction({
        clockText,
        teamId: alias?.teamId ?? teamId ?? null,
        actionType: "block",
        description,
        personId: alias?.personId ?? null,
        playerName: blockMatch[1],
      });
      continue;
    }

    const turnoverMatch = /^(.+?)\s+.+?\s+Turnover\b/i.exec(description);
    if (turnoverMatch) {
      const alias = findAliasAtStart(turnoverMatch[1]);
      const turnoverTeamId = alias?.teamId ?? teamId ?? null;
      pushAction({
        clockText,
        teamId: turnoverTeamId,
        actionType: "turnover",
        description,
        personId: alias?.personId ?? null,
        playerName: turnoverMatch[1],
      });
      pendingTurnoverBeneficiary =
        turnoverTeamId === awayTeam.teamId ? homeTeam.teamId : turnoverTeamId === homeTeam.teamId ? awayTeam.teamId : null;
      pendingOffensiveReboundTeamId = null;
      pendingMissTeamId = null;
      continue;
    }

    const foulMatch = /^(.+?)\s+([A-Z.]+FOUL)\b/i.exec(description);
    if (foulMatch) {
      const alias = findAliasAtStart(foulMatch[1]);
      const foulType = foulMatch[2].toUpperCase();
      pushAction({
        clockText,
        teamId: alias?.teamId ?? teamId ?? null,
        actionType: "foul",
        subType: foulType.includes("OFF") ? "offensive" : foulType.includes("T.") ? "technical" : "personal",
        description,
        personId: alias?.personId ?? null,
        playerName: foulMatch[1],
      });
      pendingTurnoverBeneficiary = null;
      if (!foulType.includes("OFF")) pendingOffensiveReboundTeamId = null;
      continue;
    }

    const subMatch = /^SUB:\s+(.+?)\s+FOR\s+(.+)$/i.exec(description);
    if (subMatch) {
      const incoming = findAliasAtStart(subMatch[1]);
      const outgoing = findAliasAtStart(subMatch[2]);
      const subTeamId = incoming?.teamId ?? outgoing?.teamId ?? teamId ?? null;
      if (outgoing?.personId) {
        pushAction({
          clockText,
          teamId: subTeamId,
          actionType: "substitution",
          subType: "out",
          description,
          personId: outgoing.personId,
          playerName: subMatch[2],
        });
      }
      if (incoming?.personId) {
        pushAction({
          clockText,
          teamId: subTeamId,
          actionType: "substitution",
          subType: "in",
          description,
          personId: incoming.personId,
          playerName: subMatch[1],
        });
      }
      continue;
    }

    const freeThrowMatch = /^(MISS\s+)?(.+?)\s+Free Throw\s+\d+\s+of\s+\d+/i.exec(description);
    if (freeThrowMatch) {
      const alias = findAliasAtStart(freeThrowMatch[2]);
      const shotResult = freeThrowMatch[1] ? "Missed" : "Made";
      const qualifiers = [];
      if (pendingTurnoverBeneficiary && alias?.teamId === pendingTurnoverBeneficiary) qualifiers.push("fromturnover");
      pushAction({
        clockText,
        teamId: alias?.teamId ?? teamId ?? null,
        actionType: "freethrow",
        description,
        personId: alias?.personId ?? null,
        playerName: freeThrowMatch[2],
        shotResult,
        qualifiers,
      });
      if (shotResult === "Missed") {
        pendingMissTeamId = alias?.teamId ?? teamId ?? null;
      } else {
        pendingMissTeamId = null;
      }
      pendingTurnoverBeneficiary = null;
      continue;
    }

    const shotMatch = /^(MISS\s+)?(.+?)\s+(?:(\d+)'\s+)?(.+)$/i.exec(description);
    if (shotMatch) {
      const alias = findAliasAtStart(shotMatch[2]);
      if (alias?.personId) {
        const shotText = `${shotMatch[3] ? `${shotMatch[3]}' ` : ""}${shotMatch[4]}`.trim();
        const isThree = /\b3PT\b/i.test(shotText);
        const shotResult = shotMatch[1] ? "Missed" : /\(\d+\s+PTS\)/i.test(description) ? "Made" : null;
        const assistMatch = /\((.+?)\s+\d+\s+AST\)/i.exec(description);
        const assistAlias = assistMatch ? findAliasAtStart(assistMatch[1]) : null;
        const qualifiers = [];
        if (!isThree && (Number(shotMatch[3] || 0) <= 8 || /layup|dunk|tip|hook/i.test(shotText))) {
          qualifiers.push("pointsinthepaint");
        }
        if (pendingOffensiveReboundTeamId && alias.teamId === pendingOffensiveReboundTeamId) {
          qualifiers.push("2ndchance");
        }
        if (pendingTurnoverBeneficiary && alias.teamId === pendingTurnoverBeneficiary) {
          qualifiers.push("fromturnover", "fastbreak");
        }
        pushAction({
          clockText,
          teamId: alias.teamId,
          actionType: isThree ? "3pt" : "2pt",
          description: shotText,
          descriptor: shotText,
          personId: alias.personId,
          playerName: shotMatch[2],
          assistPersonId: assistAlias?.personId ?? 0,
          shotDistance: shotMatch[3] ? safeNumber(shotMatch[3], null) : null,
          shotResult,
          qualifiers,
        });
        pendingMissTeamId = shotResult === "Missed" ? alias.teamId : null;
        pendingOffensiveReboundTeamId = null;
        pendingTurnoverBeneficiary = null;
        continue;
      }
    }

    pendingTurnoverBeneficiary = null;
  }

  return actions.map(normalizeSummerAction);
}

function mergeSummerPlayerWithDerived(player, derived = {}) {
  return {
    ...player,
    rimFieldGoalsMade: safeNumber(derived.rimFieldGoalsMade, 0),
    rimFieldGoalsAttempted: safeNumber(derived.rimFieldGoalsAttempted, 0),
    midFieldGoalsMade: safeNumber(derived.midFieldGoalsMade, 0),
    midFieldGoalsAttempted: safeNumber(derived.midFieldGoalsAttempted, 0),
  };
}

function mergeSummerTeamTotals(base = {}, derived = {}) {
  return {
    ...base,
    rimFieldGoalsMade: safeNumber(derived.rimFieldGoalsMade, 0),
    rimFieldGoalsAttempted: safeNumber(derived.rimFieldGoalsAttempted, 0),
    midFieldGoalsMade: safeNumber(derived.midFieldGoalsMade, 0),
    midFieldGoalsAttempted: safeNumber(derived.midFieldGoalsAttempted, 0),
    drivingFGMade: safeNumber(derived.drivingFGMade, 0),
    drivingFGAttempted: safeNumber(derived.drivingFGAttempted, 0),
    cuttingFGMade: safeNumber(derived.cuttingFGMade, 0),
    cuttingFGAttempted: safeNumber(derived.cuttingFGAttempted, 0),
    catchAndShoot3FGMade: safeNumber(derived.catchAndShoot3FGMade, 0),
    catchAndShoot3FGAttempted: safeNumber(derived.catchAndShoot3FGAttempted, 0),
    secondChance3FGMade: safeNumber(derived.secondChance3FGMade, 0),
    secondChance3FGAttempted: safeNumber(derived.secondChance3FGAttempted, 0),
    offensiveFoulsDrawn: safeNumber(derived.offensiveFoulsDrawn, 0),
    transitionPoints: safeNumber(derived.transitionPoints, 0),
    transitionTurnovers: safeNumber(derived.transitionTurnovers, 0),
    transitionPossessions: safeNumber(derived.transitionPossessions, 0),
    secondChancePoints: safeNumber(derived.secondChancePoints, 0),
    pointsOffTurnovers: safeNumber(derived.pointsOffTurnovers, 0),
    paintPoints: safeNumber(derived.paintPoints, 0),
    threePointOReb: safeNumber(derived.threePointOReb, 0),
  };
}

function buildSummerTeamAdvancedStatsFromTotals(teamTotals = {}) {
  return {
    drivingFGPercent: safeRatio(teamTotals.drivingFGMade, teamTotals.drivingFGAttempted).toFixed(1),
    drivingFGMade: safeNumber(teamTotals.drivingFGMade, 0),
    drivingFGAttempted: safeNumber(teamTotals.drivingFGAttempted, 0),
    cuttingFGPercent: safeRatio(teamTotals.cuttingFGMade, teamTotals.cuttingFGAttempted).toFixed(1),
    cuttingFGMade: safeNumber(teamTotals.cuttingFGMade, 0),
    cuttingFGAttempted: safeNumber(teamTotals.cuttingFGAttempted, 0),
    catchAndShoot3FGPercent: safeRatio(teamTotals.catchAndShoot3FGMade, teamTotals.catchAndShoot3FGAttempted).toFixed(1),
    catchAndShoot3FGMade: safeNumber(teamTotals.catchAndShoot3FGMade, 0),
    catchAndShoot3FGAttempted: safeNumber(teamTotals.catchAndShoot3FGAttempted, 0),
    chargesDrawn: safeNumber(teamTotals.chargesDrawn, 0),
    offensiveFoulsDrawn: safeNumber(teamTotals.offensiveFoulsDrawn, 0),
    deflections: safeNumber(teamTotals.deflections, 0),
  };
}

function buildSummerTeamStatsFromTotals(teamTotals = {}, opponentTotals = {}) {
  const possessions = estimatePossessions(teamTotals, opponentTotals);
  const points = safeNumber(teamTotals.points, 0);
  const opponentPoints = safeNumber(opponentTotals.points, 0);
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
      transitionRate: possessions > 0 ? (safeNumber(teamTotals.transitionPossessions, 0) / possessions) * 100 : 0,
      transitionPoints: safeNumber(teamTotals.transitionPoints, 0),
      transitionTurnovers: safeNumber(teamTotals.transitionTurnovers, 0),
      secondChancePoints: safeNumber(teamTotals.secondChancePoints, 0),
      threePointORebPercent: safeRatio(teamTotals.threePointOReb, teamTotals.reboundsOffensive),
      pointsOffTurnovers: safeNumber(teamTotals.pointsOffTurnovers, 0),
      paintPoints: safeNumber(teamTotals.paintPoints, 0),
      transitionPossessions: safeNumber(teamTotals.transitionPossessions, 0),
    },
    defensiveRating: possessions > 0 ? (opponentPoints / possessions) * 100 : 0,
    netRating: possessions > 0 ? ((points - opponentPoints) / possessions) * 100 : 0,
    shotProfile: {
      rimRate: safeRatio(teamTotals.rimFieldGoalsAttempted, teamTotals.fieldGoalsAttempted),
      midRate: safeRatio(teamTotals.midFieldGoalsAttempted, teamTotals.fieldGoalsAttempted),
      threePRate: safeRatio(teamTotals.threePointersAttempted, teamTotals.fieldGoalsAttempted),
    },
    shotEfficiency: {
      rimFGPercent: safeRatio(teamTotals.rimFieldGoalsMade, teamTotals.rimFieldGoalsAttempted),
      rimFGMade: safeNumber(teamTotals.rimFieldGoalsMade, 0),
      rimFGAttempted: safeNumber(teamTotals.rimFieldGoalsAttempted, 0),
      midFGPercent: safeRatio(teamTotals.midFieldGoalsMade, teamTotals.midFieldGoalsAttempted),
      midFGMade: safeNumber(teamTotals.midFieldGoalsMade, 0),
      midFGAttempted: safeNumber(teamTotals.midFieldGoalsAttempted, 0),
      threeFGPercent: safeRatio(teamTotals.threePointersMade, teamTotals.threePointersAttempted),
      threeFGMade: safeNumber(teamTotals.threePointersMade, 0),
      threeFGAttempted: safeNumber(teamTotals.threePointersAttempted, 0),
    },
    advancedStats: buildSummerTeamAdvancedStatsFromTotals(teamTotals),
  };
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
    const markdown = await requestText(`https://r.jina.ai/http://https://www.nba.com/games?date=${dateStr}`, "text/plain", {
      preferDirect: true,
      allowProxy: false,
    });
    const games = parseSummerLeagueGamesMarkdown(markdown, dateStr);
    if (games.length) return games;
  } catch {
    // Fall through to the HTML parser below.
  }

  const data = await fetchSummerGamesPage(dateStr);
  const cards = data?.props?.pageProps?.gameCardFeed?.modules?.flatMap((module) => module?.cards || []) || [];
  return cards
    .map((card) => card?.cardData)
    .filter((card) => card && SUMMER_LEAGUE_IDS.has(String(card.leagueId || "")))
    .map(normalizeSummerScheduleCard);
}

function buildSummerLeagueShareUrlFromGame(game) {
  const awayTricode = String(game?.awayTeam?.teamTricode || "").trim().toLowerCase();
  const homeTricode = String(game?.homeTeam?.teamTricode || "").trim().toLowerCase();
  const gameId = String(game?.gameId || "").trim();
  if (!awayTricode || !homeTricode || !gameId) return "";
  return `https://www.nba.com/game/${awayTricode}-vs-${homeTricode}-${gameId}`;
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
    const sameDateGames = await requestJson(`${API_BASE}/games/byDate?date=${dateStr}`).catch(() => []);
    const sameDateMatch = (Array.isArray(sameDateGames) ? sameDateGames : [])
      .find((game) => String(game?.gameId || "") === safeGameId);
    const directShareUrl = buildSummerLeagueShareUrlFromGame(sameDateMatch);
    if (directShareUrl) {
      SUMMER_LEAGUE_GAME_URL_CACHE.set(safeGameId, directShareUrl);
      return directShareUrl;
    }
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
  const [boxMarkdown, playByPlayMarkdown] = await Promise.all([
    requestText(`https://r.jina.ai/http://${shareUrl}/box-score`, "text/plain", {
      preferDirect: true,
      allowProxy: false,
    }),
    requestText(`https://r.jina.ai/http://${shareUrl}/play-by-play`, "text/plain", {
      preferDirect: true,
      allowProxy: false,
    }),
  ]);
  const parsedBox = parseSummerLeagueBoxScoreMarkdown(boxMarkdown, shareUrl);
  const playByPlayActions = parseSummerPlayByPlayMarkdown(
    playByPlayMarkdown,
    parsedBox.awayTeam,
    parsedBox.homeTeam
  );
  const basePlayers = [...parsedBox.awayTeam.players, ...parsedBox.homeTeam.players];
  const aggregated = aggregateSegmentStats({
    gameId,
    actions: playByPlayActions,
    segment: "all",
    minutesData: null,
    homeTeam: parsedBox.homeTeam,
    awayTeam: parsedBox.awayTeam,
    basePlayers,
    currentPeriod: parsedBox.period,
    currentClock: parsedBox.gameClock,
    isLive: parsedBox.gameStatus === 2,
  });
  const awayDerivedTotals = aggregated.teamTotals[parsedBox.awayTeam.teamId] || {};
  const homeDerivedTotals = aggregated.teamTotals[parsedBox.homeTeam.teamId] || {};
  const playerDerivedMap = aggregated.playerMap || new Map();
  const awayBox = {
    ...parsedBox.awayTeam,
    players: parsedBox.awayTeam.players.map((player) => mergeSummerPlayerWithDerived(
      player,
      playerDerivedMap.get(player.personId) || {}
    )),
    totals: mergeSummerTeamTotals(parsedBox.awayTeam.totals || {}, awayDerivedTotals),
  };
  const homeBox = {
    ...parsedBox.homeTeam,
    players: parsedBox.homeTeam.players.map((player) => mergeSummerPlayerWithDerived(
      player,
      playerDerivedMap.get(player.personId) || {}
    )),
    totals: mergeSummerTeamTotals(parsedBox.homeTeam.totals || {}, homeDerivedTotals),
  };

  return {
    gameId: String(gameId),
    gameCode: "",
    gameStatus: parsedBox.gameStatus,
    gameStatusText: parsedBox.gameStatusText,
    period: parsedBox.period,
    gameClock: parsedBox.gameClock,
    gameTimeUTC: "",
    gameEt: "",
    seasonYear: String(parsedBox.seasonYear || parseDateParts(dateStr)?.year || ""),
    seasonType: "Summer League",
    arena: parsedBox.arena,
    homeTeam: {
      teamId: parsedBox.homeTeam.teamId,
      teamName: parsedBox.homeTeam.teamName,
      teamCity: parsedBox.homeTeam.teamCity,
      teamTricode: parsedBox.homeTeam.teamTricode,
      wins: 0,
      losses: 0,
      score: parsedBox.homeScore,
      timeoutsRemaining: 0,
    },
    awayTeam: {
      teamId: parsedBox.awayTeam.teamId,
      teamName: parsedBox.awayTeam.teamName,
      teamCity: parsedBox.awayTeam.teamCity,
      teamTricode: parsedBox.awayTeam.teamTricode,
      wins: 0,
      losses: 0,
      score: parsedBox.awayScore,
      timeoutsRemaining: 0,
    },
    officials: [],
    callsAgainst: null,
    timeouts: {
      home: 0,
      away: 0,
    },
    challenges: {
      home: { challengesTotal: 0, challengesWon: 0 },
      away: { challengesTotal: 0, challengesWon: 0 },
    },
    playByPlayActions,
    teamStats: {
      home: buildSummerTeamStatsFromTotals(homeBox.totals, awayBox.totals),
      away: buildSummerTeamStatsFromTotals(awayBox.totals, homeBox.totals),
    },
    boxScore: {
      home: homeBox,
      away: awayBox,
    },
  };
}

export async function fetchGamesByDate(dateStr) {
  const url = `${API_BASE}/games/byDate?date=${dateStr}`;
  const [baseGames, summerGames] = await Promise.all([
    requestJson(url),
    isJulyDate(dateStr) ? fetchSummerLeagueGamesByDate(dateStr).catch(() => []) : Promise.resolve([]),
  ]);
  const filteredBaseGames = (Array.isArray(baseGames) ? baseGames : []).filter(isNbaDashboardGame);
  const normalizedBaseGames = filteredBaseGames.map(normalizeSummerLeagueGameMetadata);

  if (!summerGames.length) {
    return normalizedBaseGames;
  }

  const merged = new Map();
  [...summerGames, ...normalizedBaseGames].forEach((game) => {
    if (game?.gameId) {
      merged.set(String(game.gameId), game);
    }
  });
  return [...merged.values()];
}

const SEASON_GAMES_CACHE = new Map();
const SEASON_GAMES_PROMISES = new Map();
const TEAM_SEASON_GAMES_CACHE = new Map();
const TEAM_SEASON_GAMES_PROMISES = new Map();
const SEASON_GAMES_STORAGE_PREFIX = "nba-dashboard-season-games:";
const TEAM_SEASON_GAMES_STORAGE_PREFIX = "nba-dashboard-team-season-games:";
const SEASON_GAMES_STORAGE_TTL_MS = 6 * 60 * 60 * 1000;

function enumerateDateInputs(start, end) {
  const dates = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    dates.push(formatDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function isPlayedGame(game) {
  return Number(game?.gameStatus) === 2 || Number(game?.gameStatus) === 3;
}

function annotateSeasonGame(game, gameDate) {
  return {
    ...game,
    gameDate,
  };
}

function compactSeasonGameTeam(team) {
  return {
    teamId: String(team?.teamId || ""),
    teamTricode: String(team?.teamTricode || ""),
    score: String(team?.score ?? ""),
    wins: String(team?.wins ?? ""),
    losses: String(team?.losses ?? ""),
  };
}

function compactSeasonGame(game) {
  return {
    gameId: String(game?.gameId || ""),
    gameDate: String(game?.gameDate || ""),
    gameStatus: Number(game?.gameStatus || 0),
    gameStatusText: String(game?.gameStatusText || ""),
    gameClock: String(game?.gameClock || ""),
    seasonType: String(game?.seasonType || ""),
    homeTeam: compactSeasonGameTeam(game?.homeTeam),
    awayTeam: compactSeasonGameTeam(game?.awayTeam),
  };
}

function normalizeCachedSeasonGame(game) {
  if (!game || typeof game !== "object") return null;
  const gameId = String(game?.gameId || "").trim();
  if (!gameId) return null;
  return compactSeasonGame(game);
}

function seasonGamesStorageKey(season) {
  return `${SEASON_GAMES_STORAGE_PREFIX}${season}`;
}

function teamSeasonGamesStorageKey(teamId, season) {
  return `${TEAM_SEASON_GAMES_STORAGE_PREFIX}${season}:${teamId}`;
}

function loadSeasonGamesFromStorage(season) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(seasonGamesStorageKey(season));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    if (updatedAt && Date.now() - updatedAt > SEASON_GAMES_STORAGE_TTL_MS) {
      window.localStorage.removeItem(seasonGamesStorageKey(season));
      return null;
    }
    if (!Array.isArray(parsed?.games)) return null;
    return parsed.games
      .map(normalizeCachedSeasonGame)
      .filter(Boolean);
  } catch {
    return null;
  }
}

function loadTeamSeasonGamesFromStorage(teamId, season) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(teamSeasonGamesStorageKey(teamId, season));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    if (updatedAt && Date.now() - updatedAt > SEASON_GAMES_STORAGE_TTL_MS) {
      window.localStorage.removeItem(teamSeasonGamesStorageKey(teamId, season));
      return null;
    }
    if (!Array.isArray(parsed?.games)) return null;
    return parsed.games.map(normalizeCachedSeasonGame).filter(Boolean);
  } catch {
    return null;
  }
}

function saveSeasonGamesToStorage(season, games) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(seasonGamesStorageKey(season), JSON.stringify({
      updatedAt: Date.now(),
      games: games.map(compactSeasonGame),
    }));
  } catch {
    // Ignore storage failures.
  }
}

function saveTeamSeasonGamesToStorage(teamId, season, games) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(teamSeasonGamesStorageKey(teamId, season), JSON.stringify({
      updatedAt: Date.now(),
      games: games.map(compactSeasonGame),
    }));
  } catch {
    // Ignore storage failures.
  }
}

async function fetchAllSeasonGames(season = currentSeasonString()) {
  const cachedInMemory = SEASON_GAMES_CACHE.get(season);
  if (cachedInMemory) return cachedInMemory;

  const cachedInStorage = loadSeasonGamesFromStorage(season);
  if (cachedInStorage) {
    SEASON_GAMES_CACHE.set(season, cachedInStorage);
    return cachedInStorage;
  }

  const pending = SEASON_GAMES_PROMISES.get(season);
  if (pending) return pending;

  const nextPromise = (async () => {
    const { start, end } = seasonBoundsForSeason(season, new Date());
    const dateInputs = enumerateDateInputs(start, end);
    const concurrency = 8;
    const aggregated = [];

    for (let index = 0; index < dateInputs.length; index += concurrency) {
      const slice = dateInputs.slice(index, index + concurrency);
      const batchResults = await Promise.all(
        slice.map(async (dateInput) => {
          const games = await fetchGamesByDate(dateInput).catch(() => []);
          return (Array.isArray(games) ? games : [])
            .filter((game) => !String(game?.gameId || "").startsWith("202"))
            .filter(isPlayedGame)
            .map((game) => annotateSeasonGame(game, dateInput));
        })
      );
      aggregated.push(...batchResults.flat());
    }

    const deduped = [...new Map(
      aggregated.map((game) => [String(game.gameId || ""), compactSeasonGame(game)])
    ).values()].sort((left, right) => {
      const dateCompare = String(right.gameDate || "").localeCompare(String(left.gameDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(right.gameId || "").localeCompare(String(left.gameId || ""));
    });

    SEASON_GAMES_CACHE.set(season, deduped);
    saveSeasonGamesToStorage(season, deduped);
    return deduped;
  })();

  SEASON_GAMES_PROMISES.set(season, nextPromise);
  try {
    return await nextPromise;
  } finally {
    SEASON_GAMES_PROMISES.delete(season);
  }
}

export function prefetchCurrentSeasonGames(season = currentSeasonString()) {
  return fetchAllSeasonGames(season).catch(() => null);
}

function filterSeasonGamesForTeam(games, teamId, opponentTeamId = "") {
  const safeTeamId = String(teamId || "").trim();
  const safeOpponentTeamId = String(opponentTeamId || "").trim();
  return (Array.isArray(games) ? games : []).filter((game) => {
    const homeTeamId = String(game?.homeTeam?.teamId || "");
    const awayTeamId = String(game?.awayTeam?.teamId || "");
    const teamMatches = homeTeamId === safeTeamId || awayTeamId === safeTeamId;
    if (!teamMatches) return false;
    if (!safeOpponentTeamId) return true;
    return homeTeamId === safeOpponentTeamId || awayTeamId === safeOpponentTeamId;
  });
}

export async function fetchTeamSeasonGames(teamId, opponentTeamId = "", season = currentSeasonString()) {
  const safeTeamId = String(teamId || "").trim();
  const safeOpponentTeamId = String(opponentTeamId || "").trim();
  const teamSeasonCacheKey = `${season}:${safeTeamId}`;
  let seasonGames = TEAM_SEASON_GAMES_CACHE.get(teamSeasonCacheKey) || loadTeamSeasonGamesFromStorage(safeTeamId, season);

  if (!seasonGames) {
    const pending = TEAM_SEASON_GAMES_PROMISES.get(teamSeasonCacheKey);
    if (pending) {
      seasonGames = await pending;
    } else {
      const nextPromise = (
        SUPABASE_FUNCTIONS_BASE
          ? fetchTeamSeasonGamesFromFunction(safeTeamId, season).catch(() => {
            const cachedFullSeasonGames = SEASON_GAMES_CACHE.get(season) || loadSeasonGamesFromStorage(season);
            if (cachedFullSeasonGames?.length) {
              return filterSeasonGamesForTeam(cachedFullSeasonGames, safeTeamId);
            }
            return fetchAllSeasonGames(season);
          })
          : fetchAllSeasonGames(season)
      ).then((games) => {
        TEAM_SEASON_GAMES_CACHE.set(teamSeasonCacheKey, games);
        saveTeamSeasonGamesToStorage(safeTeamId, season, games);
        return games;
      }).finally(() => {
        TEAM_SEASON_GAMES_PROMISES.delete(teamSeasonCacheKey);
      });
      TEAM_SEASON_GAMES_PROMISES.set(teamSeasonCacheKey, nextPromise);
      seasonGames = await nextPromise;
    }
  } else {
    TEAM_SEASON_GAMES_CACHE.set(teamSeasonCacheKey, seasonGames);
  }

  return filterSeasonGamesForTeam(seasonGames, safeTeamId, safeOpponentTeamId);
}

export async function fetchGame(gameId, segment = null, options = {}) {
  if (isSummerLeagueGameId(gameId)) {
    const segmentParam = segment ? `?segment=${segment}` : "";
    const directUrl = `${API_BASE}/games/${gameId}${segmentParam}`;
    let directGame = null;
    try {
      directGame = await requestJson(directUrl);
      if (shouldUseDirectSummerLeagueGame(directGame)) {
        return normalizeSummerLeagueGameMetadata(directGame);
      }
    } catch {
      // Fall back to the Summer League markdown parser when the direct API payload is unavailable.
    }
    try {
      return await fetchSummerLeagueGame(gameId, options?.dateStr || null);
    } catch (error) {
      if (directGame) return normalizeSummerLeagueGameMetadata(directGame);
      throw error;
    }
  }
  const segmentParam = segment ? `?segment=${segment}` : "";
  const url = `${API_BASE}/games/${gameId}${segmentParam}`;
  return requestJson(url);
}

export async function fetchMinutes(gameId, options = {}) {
  const url = `${API_BASE}/games/${gameId}/minutes`;
  try {
    const minutesData = await requestJson(url);
    return normalizeSummerLeagueMinutesData(gameId, minutesData);
  } catch (error) {
    if (options.optional && error?.status === 404) {
      return null;
    }
    throw error;
  }
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
  const numericTeamId = Number(teamId);
  if (numericTeamId >= 1612700000 && numericTeamId < 1612710000) return "gleague";
  if (numericTeamId >= 1611661300 && numericTeamId < 1611661400) return "wnba";
  return "nba";
}

function isNbaDashboardGame(game) {
  const homeLeague = inferLeagueFromTeamId(game?.homeTeam?.teamId);
  const awayLeague = inferLeagueFromTeamId(game?.awayTeam?.teamId);
  return homeLeague !== "wnba" && awayLeague !== "wnba";
}

export function playerHeadshotUrls(personId, teamId = null, options = {}) {
  const safePersonId = String(personId || "").trim();
  const overrideKeys = Array.isArray(options?.overrideKeys) ? options.overrideKeys : [];
  const keyOverrideUrls = [
    ...overrideKeys.flatMap((key) => resolvePlayerHeadshotOverrideUrls(key, APP_BASE_PATH)),
    ...resolvePlayerHeadshotOverrideUrls(safePersonId, APP_BASE_PATH),
  ];
  const isOfficialPersonId = /^\d+$/.test(safePersonId);
  if (!safePersonId || !isOfficialPersonId) return [...new Set(keyOverrideUrls)];

  const league = inferLeagueFromTeamId(teamId);
  const gLeagueOverrideUrls = normalizePlayerHeadshotOverrides(gLeagueHeadshotOverrides[safePersonId], APP_BASE_PATH);
  const gLeagueResolverUrl = SUPABASE_FUNCTIONS_BASE
    ? `${SUPABASE_FUNCTIONS_BASE}/player-headshot?personId=${encodeURIComponent(safePersonId)}`
    : null;
  const overrideUrls = [
    ...keyOverrideUrls,
  ];

  const candidates = league === "gleague"
    ? [
      ...overrideUrls,
      ...gLeagueOverrideUrls,
      gLeagueResolverUrl,
      `https://cdn.nba.com/headshots/nba/latest/1040x760/${safePersonId}.png`,
      `https://cdn.nba.com/headshots/nba/latest/260x190/${safePersonId}.png`,
    ]
    : [
      ...overrideUrls,
      `https://cdn.nba.com/headshots/nba/latest/260x190/${safePersonId}.png`,
      `https://cdn.nba.com/headshots/nba/latest/1040x760/${safePersonId}.png`,
      ...(league === "wnba" ? [] : gLeagueOverrideUrls),
      ...(league === "wnba" ? [] : [gLeagueResolverUrl]),
    ];

  return [...new Set(candidates.filter(Boolean))];
}

export function playerHeadshotUrl(personId, teamId = null, options = {}) {
  return playerHeadshotUrls(personId, teamId, options)[0] || null;
}

export async function fetchCurrentNbaRosters() {
  if (!SUPABASE_FUNCTIONS_BASE) {
    throw new Error("Supabase functions are not configured.");
  }
  return requestJson(`${SUPABASE_FUNCTIONS_BASE}/nba-rosters`);
}

export async function fetchNbaPlayerStats(options = {}) {
  const safeOptions = options && typeof options === "object" ? options : { teamId: options };
  const safeTeamId = typeof safeOptions.teamId === "string" || typeof safeOptions.teamId === "number"
    ? String(safeOptions.teamId).trim()
    : "";
  const safeSeason = typeof safeOptions.season === "string" ? safeOptions.season.trim() : "";
  const safePlayers = Array.isArray(safeOptions.players) ? safeOptions.players : [];
  if (!safeSeason) throw new Error("A stats season is required.");

  const edgeRequest = SUPABASE_FUNCTIONS_BASE
    ? (() => {
      const url = new URL(`${SUPABASE_FUNCTIONS_BASE}/nba-player-stats`);
      if (safeTeamId) url.searchParams.set("teamId", safeTeamId);
      url.searchParams.set("season", safeSeason);
      return requestJson(url.toString(), { timeoutMs: 15000 }).then((payload) => {
        if (payload?.season && payload.season !== safeSeason) {
          throw new Error(`Stats service returned ${payload.season} instead of ${safeSeason}.`);
        }
        return payload;
      });
    })()
    : Promise.reject(new Error("Supabase functions are not configured."));
  const officialFallbackRequest = fetchOfficialNbaPlayerStatsFallback({
    season: safeSeason,
    teamId: safeTeamId,
    players: safePlayers,
  });
  const asOutcome = (kind, promise) => promise.then(
    (payload) => ({ kind, payload, error: null }),
    (error) => ({ kind, payload: null, error })
  );
  const primaryOutcomes = await Promise.all([
    asOutcome("edge", edgeRequest),
    asOutcome("official", officialFallbackRequest),
  ]);
  const payloadsByPriority = [
    primaryOutcomes.find((outcome) => outcome.kind === "edge")?.payload,
    primaryOutcomes.find((outcome) => outcome.kind === "official")?.payload,
  ].filter(Boolean);
  let merged = mergePersonnelStatsPayloads(payloadsByPriority, safeSeason);
  const requestedCount = safePlayers.filter((player) => (
    String(player?.personId || player?.fullName || "").trim()
  )).length;
  const coveredCount = getPersonnelStatsCoverage(merged, safePlayers);

  if (!requestedCount || coveredCount < requestedCount) {
    const browserOutcome = await asOutcome("browser", fetchBrowserPlayerStatsFallback(safeSeason));
    if (browserOutcome.payload) {
      payloadsByPriority.unshift(browserOutcome.payload);
      merged = mergePersonnelStatsPayloads(payloadsByPriority, safeSeason);
    } else if (!payloadsByPriority.length) {
      throw browserOutcome.error
        || primaryOutcomes.find((outcome) => outcome.error)?.error
        || new Error("Unable to load NBA player stats.");
    }
  }

  return merged;
}

export async function fetchCurrentGLeagueRosters() {
  if (!SUPABASE_FUNCTIONS_BASE) {
    throw new Error("Supabase functions are not configured.");
  }
  return requestJson(`${SUPABASE_FUNCTIONS_BASE}/gleague-rosters`);
}

async function fetchTeamSeasonGamesFromFunction(teamId, season = currentSeasonString()) {
  if (!SUPABASE_FUNCTIONS_BASE) {
    throw new Error("Supabase functions are not configured.");
  }
  const url = new URL(`${SUPABASE_FUNCTIONS_BASE}/team-games`);
  url.searchParams.set("teamId", String(teamId || "").trim());
  url.searchParams.set("season", season);
  const payload = await requestJson(url.toString(), { timeoutMs: 8000 });
  return Array.isArray(payload?.games) ? payload.games : [];
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
