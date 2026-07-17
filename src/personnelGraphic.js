export const PERSONNEL_SLOT_COUNT = 18;

export const PERSONNEL_STAT_OPTIONS = Object.freeze([
  Object.freeze({ key: "ppg", label: "PPG" }),
  Object.freeze({ key: "rpg", label: "RPG" }),
  Object.freeze({ key: "threePointPercentage", label: "3P%" }),
  Object.freeze({ key: "apg", label: "APG" }),
  Object.freeze({ key: "bpg", label: "BPG" }),
  Object.freeze({ key: "spg", label: "SPG" }),
  Object.freeze({ key: "fta", label: "FTA" }),
]);

export const DEFAULT_PERSONNEL_STAT_KEYS = Object.freeze(
  PERSONNEL_STAT_OPTIONS.slice(0, 4).map((option) => option.key)
);

export const PERSONNEL_TAG_OPTIONS = Object.freeze([
  Object.freeze({ key: "fire", label: "Fire" }),
  Object.freeze({ key: "cold", label: "Cold" }),
  Object.freeze({ key: "drives_right", label: "Drives Right" }),
  Object.freeze({ key: "drives_left", label: "Drives Left" }),
]);

export const PERSONNEL_THREE_POINT_COLOR_OPTIONS = Object.freeze([
  Object.freeze({ key: "bright_green", label: "Bright Green", color: "#00ff00" }),
  Object.freeze({ key: "dark_green", label: "Dark Green", color: "#008c00" }),
  Object.freeze({ key: "yellow", label: "Yellow", color: "#ffd400" }),
  Object.freeze({ key: "orange", label: "Orange", color: "#ff4d00" }),
  Object.freeze({ key: "red", label: "Red", color: "#ff0000" }),
]);

export const DEFAULT_PERSONNEL_THREE_POINT_COLOR = PERSONNEL_THREE_POINT_COLOR_OPTIONS[0].key;

export function getPersonnelThreePointColorForPercentage(value) {
  const percentage = normalizePercentage(value);
  if (percentage === null) return DEFAULT_PERSONNEL_THREE_POINT_COLOR;
  if (percentage >= 40) return "bright_green";
  if (percentage >= 30) return "dark_green";
  if (percentage >= 20) return "yellow";
  if (percentage >= 15) return "orange";
  if (percentage >= 0) return "red";
  return DEFAULT_PERSONNEL_THREE_POINT_COLOR;
}

export function getCurrentPersonnelSeason(date = new Date()) {
  const parsedDate = date instanceof Date ? date : new Date(date);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const year = safeDate.getFullYear();
  const startYear = safeDate.getMonth() >= 9 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function normalizePersonnelSeason(value, fallback = getCurrentPersonnelSeason()) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(normalized);
  if (!match) return fallback;
  const expectedEndYear = String(Number(match[1]) + 1).slice(-2);
  return match[2] === expectedEndYear ? normalized : fallback;
}

export function getPreviousPersonnelSeason(season) {
  const normalized = normalizePersonnelSeason(season);
  const startYear = Number(normalized.slice(0, 4)) - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

const STAT_KEY_SET = new Set(PERSONNEL_STAT_OPTIONS.map((option) => option.key));
const TAG_KEY_SET = new Set(PERSONNEL_TAG_OPTIONS.map((option) => option.key));
const COLOR_KEY_SET = new Set(PERSONNEL_THREE_POINT_COLOR_OPTIONS.map((option) => option.key));

const STAT_KEY_ALIASES = new Map([
  ["ppg", "ppg"],
  ["pts", "ppg"],
  ["points", "ppg"],
  ["pointspergame", "ppg"],
  ["rpg", "rpg"],
  ["reb", "rpg"],
  ["rebounds", "rpg"],
  ["reboundspergame", "rpg"],
  ["3p", "threePointPercentage"],
  ["3p%", "threePointPercentage"],
  ["3pt%", "threePointPercentage"],
  ["fg3pct", "threePointPercentage"],
  ["threepointpercentage", "threePointPercentage"],
  ["threepointpercent", "threePointPercentage"],
  ["apg", "apg"],
  ["ast", "apg"],
  ["assists", "apg"],
  ["assistspergame", "apg"],
  ["bpg", "bpg"],
  ["blk", "bpg"],
  ["blocks", "bpg"],
  ["blockspergame", "bpg"],
  ["spg", "spg"],
  ["stl", "spg"],
  ["steals", "spg"],
  ["stealspergame", "spg"],
  ["fta", "fta"],
  ["freethrowattempts", "fta"],
  ["freethrowattemptspergame", "fta"],
]);

const TAG_KEY_ALIASES = new Map([
  ["fire", "fire"],
  ["hot", "fire"],
  ["cold", "cold"],
  ["ice", "cold"],
  ["drivesright", "drives_right"],
  ["driveright", "drives_right"],
  ["drivesleft", "drives_left"],
  ["driveleft", "drives_left"],
]);

const COLOR_KEY_ALIASES = new Map([
  ["brightgreen", "bright_green"],
  ["green", "bright_green"],
  ["#00ff00", "bright_green"],
  ["darkgreen", "dark_green"],
  ["#008c00", "dark_green"],
  ["yellow", "yellow"],
  ["#ffd400", "yellow"],
  ["orange", "orange"],
  ["#ff4d00", "orange"],
  ["red", "red"],
  ["#ff0000", "red"],
]);

function normalizeLookupKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9%#]/g, "");
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizePlayerId(value) {
  const normalized = normalizeString(value);
  return normalized && normalized !== "0" ? normalized : "";
}

function firstPresentValue(record, keys) {
  if (!record || typeof record !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || String(value).trim().toLowerCase() === "true") return true;
  if (value === 0 || String(value).trim().toLowerCase() === "false") return false;
  return fallback;
}

function normalizeStatKey(value) {
  if (STAT_KEY_SET.has(value)) return value;
  return STAT_KEY_ALIASES.get(normalizeLookupKey(value)) || "";
}

function normalizeTagKey(value) {
  if (TAG_KEY_SET.has(value)) return value;
  return TAG_KEY_ALIASES.get(normalizeLookupKey(value)) || "";
}

function normalizeThreePointColor(value) {
  if (COLOR_KEY_SET.has(value)) return value;
  return COLOR_KEY_ALIASES.get(normalizeLookupKey(value)) || DEFAULT_PERSONNEL_THREE_POINT_COLOR;
}

function normalizeUniqueList(values, normalizeValue) {
  const result = [];
  const seen = new Set();
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = normalizeValue(rawValue);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeSelectedStats(value, useDefaults = true) {
  if (!Array.isArray(value)) return useDefaults ? [...DEFAULT_PERSONNEL_STAT_KEYS] : [];
  return normalizeUniqueList(value, normalizeStatKey);
}

function normalizeTags(value) {
  return normalizeUniqueList(value, normalizeTagKey);
}

function normalizeStatOverrides(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([rawKey, rawValue]) => {
    const key = normalizeStatKey(rawKey);
    if (!key) return [];
    return [[key, normalizeString(rawValue)]];
  }));
}

export function createPersonnelRow(index = 0, overrides = {}) {
  const source = index && typeof index === "object"
    ? index
    : overrides && typeof overrides === "object"
      ? overrides
      : {};
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
  const personId = normalizePlayerId(firstPresentValue(source, ["personId", "playerId", "PLAYER_ID"]));
  const selectedStats = firstPresentValue(source, ["selectedStats", "stats", "statKeys"]);
  const statOverrides = firstPresentValue(source, ["statOverrides", "manualStats", "statValues"]);
  const tags = firstPresentValue(source, ["tags", "tagKeys"]);
  const enabled = firstPresentValue(source, ["enabled", "selected", "included"]);
  const threePointColor = firstPresentValue(source, [
    "threePointColor",
    "threeColor",
    "threePointColorKey",
  ]);
  const threePointColorEdited = firstPresentValue(source, [
    "threePointColorEdited",
    "threePointColorManual",
    "colorEdited",
  ]);

  return {
    id: `personnel-slot-${safeIndex + 1}`,
    enabled: normalizeBoolean(enabled, Boolean(personId)),
    personId,
    teamId: normalizePlayerId(firstPresentValue(source, ["teamId", "TEAM_ID"])),
    fullName: normalizeString(firstPresentValue(source, ["fullName", "playerName", "PLAYER_NAME"])),
    firstName: normalizeString(firstPresentValue(source, ["firstName", "FIRST_NAME"])),
    familyName: normalizeString(firstPresentValue(source, ["familyName", "lastName", "LAST_NAME"])),
    jerseyNum: normalizeString(firstPresentValue(source, ["jerseyNum", "jerseyNumber", "number", "NUM"])),
    selectedStats: normalizeSelectedStats(selectedStats, selectedStats === undefined),
    statOverrides: normalizeStatOverrides(statOverrides),
    tags: normalizeTags(tags),
    threePointColor: normalizeThreePointColor(threePointColor),
    threePointColorEdited: normalizeBoolean(threePointColorEdited, threePointColor !== undefined),
  };
}

export function createPersonnelDraft(options = {}) {
  const safeOptions = options && typeof options === "object" ? options : { teamId: options };
  const incomingRows = Array.isArray(safeOptions.rows) ? safeOptions.rows : [];
  return {
    league: "nba",
    teamId: normalizePlayerId(safeOptions.teamId),
    season: normalizePersonnelSeason(safeOptions.season),
    rows: Array.from(
      { length: PERSONNEL_SLOT_COUNT },
      (_, index) => createPersonnelRow(index, incomingRows[index])
    ),
  };
}

export function hydratePersonnelDraft(payload) {
  const rawPayload = payload && typeof payload === "object" ? payload : {};
  const source = rawPayload.personnelDraft && typeof rawPayload.personnelDraft === "object"
    ? rawPayload.personnelDraft
    : rawPayload;
  return createPersonnelDraft({
    teamId: normalizePlayerId(source.teamId),
    season: source.season,
    rows: Array.isArray(source) ? source : source.rows,
  });
}

function getRosterPlayerId(player) {
  return normalizePlayerId(firstPresentValue(player, ["playerId", "personId", "PLAYER_ID"]));
}

function normalizeRosterPlayer(player) {
  if (!player || typeof player !== "object") return null;
  const personId = getRosterPlayerId(player);
  if (!personId) return null;
  return {
    personId,
    teamId: normalizePlayerId(firstPresentValue(player, ["teamId", "TEAM_ID"])),
    fullName: normalizeString(firstPresentValue(player, ["fullName", "playerName", "PLAYER_NAME"])),
    firstName: normalizeString(firstPresentValue(player, ["firstName", "FIRST_NAME"])),
    familyName: normalizeString(firstPresentValue(player, ["familyName", "lastName", "LAST_NAME"])),
    jerseyNum: normalizeString(firstPresentValue(player, ["jerseyNum", "jerseyNumber", "number", "NUM"])),
  };
}

export function populatePersonnelDraftFromRoster(draft, roster, options = {}) {
  const currentDraft = hydratePersonnelDraft(draft);
  const configByPersonId = new Map();
  currentDraft.rows.forEach((row) => {
    if (row.personId && !configByPersonId.has(row.personId)) {
      configByPersonId.set(row.personId, {
        enabled: row.enabled,
        selectedStats: row.selectedStats,
        statOverrides: row.statOverrides,
        tags: row.tags,
        threePointColor: row.threePointColor,
        threePointColorEdited: row.threePointColorEdited,
      });
    }
  });

  const rosterPlayers = [];
  const seenPersonIds = new Set();
  for (const rawPlayer of Array.isArray(roster) ? roster : []) {
    const player = normalizeRosterPlayer(rawPlayer);
    if (!player || seenPersonIds.has(player.personId)) continue;
    seenPersonIds.add(player.personId);
    rosterPlayers.push(player);
    if (rosterPlayers.length === PERSONNEL_SLOT_COUNT) break;
  }

  const optionTeamId = options && typeof options === "object" ? options.teamId : options;
  const teamId = normalizePlayerId(optionTeamId) || rosterPlayers[0]?.teamId || currentDraft.teamId;
  const optionSeason = options && typeof options === "object" ? options.season : "";

  return {
    league: "nba",
    teamId,
    season: normalizePersonnelSeason(optionSeason, currentDraft.season),
    rows: Array.from({ length: PERSONNEL_SLOT_COUNT }, (_, index) => {
      const player = rosterPlayers[index];
      if (!player) return createPersonnelRow(index);
      const existing = configByPersonId.get(player.personId);
      return createPersonnelRow(index, {
        ...player,
        ...(existing || {}),
        enabled: existing ? existing.enabled : true,
      });
    }),
  };
}

export function togglePersonnelStat(selectedStats, statKey) {
  const current = normalizeSelectedStats(selectedStats, !Array.isArray(selectedStats));
  const normalizedKey = normalizeStatKey(statKey);
  if (!normalizedKey) return current;
  if (current.includes(normalizedKey)) return current.filter((key) => key !== normalizedKey);
  if (current.length >= 4) return current;
  return [...current, normalizedKey];
}

export function togglePersonnelRowStat(row, statKey) {
  return {
    ...row,
    selectedStats: togglePersonnelStat(row?.selectedStats, statKey),
  };
}

export function hasExactlyFourPersonnelStats(rowOrSelectedStats) {
  const selectedStats = Array.isArray(rowOrSelectedStats)
    ? rowOrSelectedStats
    : rowOrSelectedStats?.selectedStats;
  return Array.isArray(selectedStats) && normalizeSelectedStats(selectedStats, false).length === 4;
}

export function validatePersonnelDraftForExport(draft, options = {}) {
  const hydrated = hydratePersonnelDraft(draft);
  const selectedOnly = options.selectedOnly === true || options.mode === "selected";
  const rows = hydrated.rows.filter((row) => row.personId && (!selectedOnly || row.enabled));
  const errors = [];
  if (!rows.length) {
    errors.push({
      code: "NO_PLAYERS",
      message: selectedOnly ? "Select at least one player to export." : "The roster has no players to export.",
    });
  }
  rows.forEach((row, index) => {
    if (!hasExactlyFourPersonnelStats(row)) {
      errors.push({
        code: "INVALID_STAT_COUNT",
        rowId: row.id,
        personId: row.personId,
        rowIndex: index,
        message: "Every exported player must have exactly four stats selected.",
      });
    }
  });
  return { valid: errors.length === 0, rows, errors };
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstFiniteValue(record, keys) {
  for (const key of keys) {
    const numeric = toFiniteNumber(record?.[key]);
    if (numeric !== null) return numeric;
  }
  return null;
}

export function calculateThreePointAttemptRatio(statsOrThreePointAttempts, fieldGoalAttempts) {
  const isStatsRecord = statsOrThreePointAttempts && typeof statsOrThreePointAttempts === "object";
  const threePointAttempts = isStatsRecord
    ? firstFiniteValue(statsOrThreePointAttempts, [
      "threePointAttemptsPerGame",
      "threePointAttempts",
      "fg3a",
      "FG3A",
      "threePointersAttempted",
    ])
    : toFiniteNumber(statsOrThreePointAttempts);
  const totalFieldGoalAttempts = isStatsRecord
    ? firstFiniteValue(statsOrThreePointAttempts, [
      "fieldGoalAttemptsPerGame",
      "fieldGoalAttempts",
      "fga",
      "FGA",
    ])
    : toFiniteNumber(fieldGoalAttempts);

  if (threePointAttempts === null || totalFieldGoalAttempts === null || totalFieldGoalAttempts <= 0) return 0;
  return Math.min(1, Math.max(0, threePointAttempts / totalFieldGoalAttempts));
}

function normalizePercentage(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return null;
  const percentage = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return Number(percentage.toFixed(3));
}

export function formatPersonnelStatValue(stats, statKey) {
  const key = normalizeStatKey(statKey);
  const aliasesByKey = {
    ppg: ["ppg", "pointsPerGame", "points", "PTS"],
    rpg: ["rpg", "reboundsPerGame", "rebounds", "REB"],
    apg: ["apg", "assistsPerGame", "assists", "AST"],
    bpg: ["bpg", "blocksPerGame", "blocks", "BLK"],
    spg: ["spg", "stealsPerGame", "steals", "STL"],
    fta: ["fta", "freeThrowAttemptsPerGame", "freeThrowAttempts", "FTA"],
  };

  let value = key === "threePointPercentage"
    ? firstFiniteValue(stats, [
      "threePointPercentage",
      "threePointPercent",
      "threePointPct",
      "fg3Pct",
      "FG3_PCT",
    ])
    : firstFiniteValue(stats, aliasesByKey[key] || []);
  if (key === "threePointPercentage" && value !== null && Math.abs(value) <= 1) value *= 100;
  return value === null ? "" : value.toFixed(1);
}

export function mergePersonnelStatOverrides(stats, statOverrides) {
  const normalizedOverrides = normalizeStatOverrides(statOverrides);
  if (!Object.keys(normalizedOverrides).length) return stats || {};
  return { ...(stats || {}), ...normalizedOverrides };
}

export function normalizePersonnelPlayerStats(record) {
  if (!record || typeof record !== "object") return null;
  const personId = getRosterPlayerId(record);
  if (!personId) return null;
  return {
    personId,
    teamId: normalizePlayerId(firstPresentValue(record, ["teamId", "TEAM_ID"])),
    fullName: normalizeString(firstPresentValue(record, ["fullName", "playerName", "PLAYER_NAME"])),
    teamTricode: normalizeString(firstPresentValue(record, [
      "teamTricode",
      "teamAbbreviation",
      "TEAM_ABBREVIATION",
    ])).toUpperCase(),
    gamesPlayed: firstFiniteValue(record, ["gamesPlayed", "gp", "GP"]),
    ppg: firstFiniteValue(record, ["ppg", "pointsPerGame", "points", "PTS"]),
    rpg: firstFiniteValue(record, ["rpg", "reboundsPerGame", "rebounds", "REB"]),
    threePointPercentage: normalizePercentage(firstPresentValue(record, [
      "threePointPercentage",
      "threePointPercent",
      "fg3Pct",
      "FG3_PCT",
    ])),
    apg: firstFiniteValue(record, ["apg", "assistsPerGame", "assists", "AST"]),
    bpg: firstFiniteValue(record, ["bpg", "blocksPerGame", "blocks", "BLK"]),
    spg: firstFiniteValue(record, ["spg", "stealsPerGame", "steals", "STL"]),
    fta: firstFiniteValue(record, ["fta", "freeThrowAttemptsPerGame", "freeThrowAttempts", "FTA"]),
    threePointAttemptsPerGame: firstFiniteValue(record, [
      "threePointAttemptsPerGame",
      "threePointAttempts",
      "fg3a",
      "FG3A",
    ]),
    fieldGoalAttemptsPerGame: firstFiniteValue(record, [
      "fieldGoalAttemptsPerGame",
      "fieldGoalAttempts",
      "fga",
      "FGA",
    ]),
  };
}

function rowsFromResultSet(resultSet) {
  if (!resultSet || typeof resultSet !== "object") return [];
  const headers = Array.isArray(resultSet.headers) ? resultSet.headers.map(normalizeString) : [];
  const rows = Array.isArray(resultSet.rowSet) ? resultSet.rowSet : [];
  if (!headers.length) return [];
  return rows
    .filter(Array.isArray)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function extractPersonnelStatsRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.players)) return payload.players;
  if (Array.isArray(payload.stats)) return payload.stats;

  const mapSource = payload.players && typeof payload.players === "object"
    ? payload.players
    : payload.playersById && typeof payload.playersById === "object"
      ? payload.playersById
    : payload.statsByPlayerId && typeof payload.statsByPlayerId === "object"
      ? payload.statsByPlayerId
      : null;
  if (mapSource) {
    return Object.entries(mapSource).map(([personId, record]) => ({ personId, ...(record || {}) }));
  }

  const resultSets = Array.isArray(payload.resultSets)
    ? payload.resultSets
    : payload.resultSet
      ? [payload.resultSet]
      : [];
  const resultSet = resultSets.find((entry) => (
    normalizeString(entry?.name).toLowerCase() === "leaguedashplayerstats"
  )) || resultSets[0];
  return resultSet ? rowsFromResultSet(resultSet) : [];
}

function normalizeComparablePlayerName(value) {
  const parts = normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (["jr", "sr", "ii", "iii", "iv", "v"].includes(parts.at(-1))) parts.pop();
  return parts.join("");
}

export function normalizePersonnelStatsMap(payload, roster = []) {
  const result = {};
  const statsByName = new Map();
  extractPersonnelStatsRows(payload).forEach((record) => {
    const normalized = normalizePersonnelPlayerStats(record);
    if (!normalized) return;
    result[normalized.personId] = normalized;
    const nameKey = normalizeComparablePlayerName(normalized.fullName);
    if (!nameKey) return;
    statsByName.set(nameKey, statsByName.has(nameKey) ? null : normalized);
  });

  for (const player of Array.isArray(roster) ? roster : []) {
    const personId = getRosterPlayerId(player);
    if (!personId || result[personId]) continue;
    const fullName = firstPresentValue(player, ["fullName", "playerName", "PLAYER_NAME"]);
    const nameMatch = statsByName.get(normalizeComparablePlayerName(fullName));
    if (nameMatch) result[personId] = { ...nameMatch, personId };
  }
  return result;
}
