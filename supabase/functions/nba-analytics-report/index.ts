const NBA_STATS_BASE_URL = "https://stats.nba.com/stats";
const REQUEST_TIMEOUT_MS = 16_000;
const COMBINED_SEASON_TYPE = "Regular Season & Playoffs";
const NBA_STATS_SEASON_TYPES = ["Pre Season", "Regular Season", "Playoffs"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const nbaStatsHeaders = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
  Host: "stats.nba.com",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Analytics Report)",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

const NBA_TEAMS = [
  { teamId: "1610612737", tricode: "ATL", fullName: "Atlanta Hawks", shortName: "Atlanta", nickname: "Hawks", conference: "East" },
  { teamId: "1610612738", tricode: "BOS", fullName: "Boston Celtics", shortName: "Boston", nickname: "Celtics", conference: "East" },
  { teamId: "1610612751", tricode: "BKN", fullName: "Brooklyn Nets", shortName: "Brooklyn", nickname: "Nets", conference: "East" },
  { teamId: "1610612766", tricode: "CHA", fullName: "Charlotte Hornets", shortName: "Charlotte", nickname: "Hornets", conference: "East" },
  { teamId: "1610612741", tricode: "CHI", fullName: "Chicago Bulls", shortName: "Chicago", nickname: "Bulls", conference: "East" },
  { teamId: "1610612739", tricode: "CLE", fullName: "Cleveland Cavaliers", shortName: "Cleveland", nickname: "Cavaliers", conference: "East" },
  { teamId: "1610612742", tricode: "DAL", fullName: "Dallas Mavericks", shortName: "Dallas", nickname: "Mavericks", conference: "West" },
  { teamId: "1610612743", tricode: "DEN", fullName: "Denver Nuggets", shortName: "Denver", nickname: "Nuggets", conference: "West" },
  { teamId: "1610612765", tricode: "DET", fullName: "Detroit Pistons", shortName: "Detroit", nickname: "Pistons", conference: "East" },
  { teamId: "1610612744", tricode: "GSW", fullName: "Golden State Warriors", shortName: "Golden State", nickname: "Warriors", conference: "West" },
  { teamId: "1610612745", tricode: "HOU", fullName: "Houston Rockets", shortName: "Houston", nickname: "Rockets", conference: "West" },
  { teamId: "1610612754", tricode: "IND", fullName: "Indiana Pacers", shortName: "Indiana", nickname: "Pacers", conference: "East" },
  { teamId: "1610612746", tricode: "LAC", fullName: "LA Clippers", shortName: "LA", nickname: "Clippers", conference: "West" },
  { teamId: "1610612747", tricode: "LAL", fullName: "Los Angeles Lakers", shortName: "Los Angeles", nickname: "Lakers", conference: "West" },
  { teamId: "1610612763", tricode: "MEM", fullName: "Memphis Grizzlies", shortName: "Memphis", nickname: "Grizzlies", conference: "West" },
  { teamId: "1610612748", tricode: "MIA", fullName: "Miami Heat", shortName: "Miami", nickname: "Heat", conference: "East" },
  { teamId: "1610612749", tricode: "MIL", fullName: "Milwaukee Bucks", shortName: "Milwaukee", nickname: "Bucks", conference: "East" },
  { teamId: "1610612750", tricode: "MIN", fullName: "Minnesota Timberwolves", shortName: "Minnesota", nickname: "Timberwolves", conference: "West" },
  { teamId: "1610612740", tricode: "NOP", fullName: "New Orleans Pelicans", shortName: "New Orleans", nickname: "Pelicans", conference: "West" },
  { teamId: "1610612752", tricode: "NYK", fullName: "New York Knicks", shortName: "New York", nickname: "Knicks", conference: "East" },
  { teamId: "1610612760", tricode: "OKC", fullName: "Oklahoma City Thunder", shortName: "Oklahoma City", nickname: "Thunder", conference: "West" },
  { teamId: "1610612753", tricode: "ORL", fullName: "Orlando Magic", shortName: "Orlando", nickname: "Magic", conference: "East" },
  { teamId: "1610612755", tricode: "PHI", fullName: "Philadelphia 76ers", shortName: "Philadelphia", nickname: "76ers", conference: "East" },
  { teamId: "1610612756", tricode: "PHX", fullName: "Phoenix Suns", shortName: "Phoenix", nickname: "Suns", conference: "West" },
  { teamId: "1610612757", tricode: "POR", fullName: "Portland Trail Blazers", shortName: "Portland", nickname: "Trail Blazers", conference: "West" },
  { teamId: "1610612758", tricode: "SAC", fullName: "Sacramento Kings", shortName: "Sacramento", nickname: "Kings", conference: "West" },
  { teamId: "1610612759", tricode: "SAS", fullName: "San Antonio Spurs", shortName: "San Antonio", nickname: "Spurs", conference: "West" },
  { teamId: "1610612761", tricode: "TOR", fullName: "Toronto Raptors", shortName: "Toronto", nickname: "Raptors", conference: "East" },
  { teamId: "1610612762", tricode: "UTA", fullName: "Utah Jazz", shortName: "Utah", nickname: "Jazz", conference: "West" },
  { teamId: "1610612764", tricode: "WAS", fullName: "Washington Wizards", shortName: "Washington", nickname: "Wizards", conference: "East" },
];

type JsonRecord = Record<string, unknown>;

function responseWithHeaders(status: number, body: BodyInit | null, extraHeaders: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(status: number, payload: JsonRecord, extraHeaders: HeadersInit = {}) {
  return responseWithHeaders(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
}

function currentReportSeason(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function isValidSeason(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match && match[2] === String(Number(match[1]) + 1).slice(-2));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeReportSeasonType(value: unknown) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  if (normalized === "regular season & playoffs" || normalized === "regular season and playoffs") {
    return COMBINED_SEASON_TYPE;
  }
  if (normalized === "preseason" || normalized === "pre season") return "Pre Season";
  const supported = NBA_STATS_SEASON_TYPES.find((seasonType) => seasonType.toLowerCase() === normalized);
  return supported || "Regular Season";
}

function reportSeasonTypes(seasonType: string) {
  return seasonType === COMBINED_SEASON_TYPE ? ["Regular Season", "Playoffs"] : [seasonType];
}

function normalizeLastNGames(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "all") return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 10;
  if (parsed <= 0) return 0;
  return Math.min(82, parsed);
}

function lastNGamesLabel(lastNGames: number, gamesUsed: number | null = null) {
  if (lastNGames === 0) {
    const count = Number(gamesUsed);
    return Number.isFinite(count) && count > 0 ? `All Games (${Math.round(count)})` : "All Games";
  }
  return `Last ${lastNGames} Games`;
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeRatio(numerator: unknown, denominator: unknown, multiplier = 100) {
  const safeDenominator = safeNumber(denominator, 0);
  if (safeDenominator <= 0) return 0;
  return (safeNumber(numerator, 0) / safeDenominator) * multiplier;
}

function normalizePercent(value: unknown) {
  const numeric = safeNumber(value, 0);
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function roundValue(value: unknown, decimals = 1) {
  const numeric = safeNumber(value, 0);
  const factor = 10 ** decimals;
  return Math.round(numeric * factor) / factor;
}

function formatNumber(value: unknown, decimals = 1) {
  const rounded = roundValue(value, decimals);
  return rounded.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatPercent(value: unknown, decimals = 1) {
  return `${formatNumber(value, decimals)}%`;
}

function findTeam(teamId: string) {
  return NBA_TEAMS.find((team) => team.teamId === teamId) || null;
}

function findResultSet(payload: JsonRecord, targetName = "") {
  const resultSets = Array.isArray(payload?.resultSets)
    ? payload.resultSets
    : payload?.resultSet
      ? [payload.resultSet]
      : payload?.resultSets && typeof payload.resultSets === "object"
        ? [payload.resultSets]
        : [];

  if (!targetName) return resultSets[0] as JsonRecord | undefined;
  return resultSets.find((entry) =>
    String((entry as JsonRecord)?.name || "").toLowerCase() === targetName.toLowerCase()
  ) as JsonRecord | undefined || resultSets[0] as JsonRecord | undefined;
}

function mapRows(resultSet: JsonRecord | undefined) {
  const headers = Array.isArray(resultSet?.headers)
    ? resultSet.headers.map((value) => String(value || ""))
    : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];
  return rows
    .filter((row) => Array.isArray(row))
    .map((row) =>
      headers.reduce<JsonRecord>((accumulator, header, index) => {
        accumulator[header] = (row as unknown[])[index];
        return accumulator;
      }, {})
    );
}

function resultSetColumnNames(resultSet: JsonRecord | undefined) {
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers : [];
  if (!headers.length) return [];
  if (headers.every((entry) => typeof entry === "string")) {
    return headers.map((value) => String(value || ""));
  }
  const columnsHeader = (headers as JsonRecord[]).find((entry) => String(entry?.name || "") === "columns");
  return Array.isArray(columnsHeader?.columnNames)
    ? columnsHeader.columnNames.map((value) => String(value || ""))
    : [];
}

function resultSetRows(resultSet: JsonRecord | undefined) {
  return Array.isArray(resultSet?.rowSet)
    ? resultSet.rowSet.filter((row): row is unknown[] => Array.isArray(row))
    : [];
}

function rowIdentity(row: unknown[], columns: string[], fallback: string) {
  const keyColumn = ["PLAYER_ID", "VS_PLAYER_ID", "GROUP_VALUE", "TEAM_ID"].find((column) => columns.includes(column));
  if (!keyColumn) return fallback;
  const value = String(row[columns.indexOf(keyColumn)] || "").trim();
  return value || fallback;
}

function rowMergeWeight(row: unknown[], columns: string[]) {
  const gpIndex = columns.indexOf("GP");
  if (gpIndex < 0) return 1;
  return Math.max(0, safeNumber(row[gpIndex], 0));
}

function isIdentityColumn(column: string) {
  return column === "PLAYER_ID" ||
    column === "TEAM_ID" ||
    column === "VS_PLAYER_ID" ||
    column === "GROUP_VALUE" ||
    /_ID$/.test(column);
}

function mergeRowsByGames(rows: unknown[][], columns: string[]) {
  if (rows.length === 1) return rows[0];
  const weights = rows.map((row) => rowMergeWeight(row, columns));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const merged = [...rows[0]];
  columns.forEach((column, index) => {
    if (isIdentityColumn(column)) {
      merged[index] = rows.find((row) => String(row[index] || "").trim())?.[index] ?? "";
      return;
    }
    const numericValues = rows.map((row) => Number(row[index]));
    const allNumeric = numericValues.every((value) => Number.isFinite(value));
    if (!allNumeric) {
      merged[index] = rows.find((row) => String(row[index] || "").trim())?.[index] ?? "";
      return;
    }
    if (column === "GP" || column === "W" || column === "L") {
      merged[index] = numericValues.reduce((sum, value) => sum + value, 0);
      return;
    }
    if (/_RANK$/.test(column)) {
      merged[index] = "";
      return;
    }
    if (totalWeight <= 0) {
      merged[index] = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
      return;
    }
    merged[index] = numericValues.reduce((sum, value, weightIndex) => sum + value * weights[weightIndex], 0) / totalWeight;
  });

  const setRatio = (target: string, made: string, attempted: string) => {
    const targetIndex = columns.indexOf(target);
    const madeIndex = columns.indexOf(made);
    const attemptedIndex = columns.indexOf(attempted);
    if (targetIndex >= 0 && madeIndex >= 0 && attemptedIndex >= 0) {
      merged[targetIndex] = safeRatio(merged[madeIndex], merged[attemptedIndex], 1);
    }
  };
  setRatio("FG_PCT", "FGM", "FGA");
  setRatio("FG3_PCT", "FG3M", "FG3A");
  setRatio("FT_PCT", "FTM", "FTA");
  setRatio("OPP_FG_PCT", "OPP_FGM", "OPP_FGA");
  setRatio("OPP_FG3_PCT", "OPP_FG3M", "OPP_FG3A");

  return merged;
}

function mergeResultSets(resultSets: JsonRecord[]) {
  const first = resultSets[0];
  if (!first || resultSets.length <= 1) return first;
  const columns = resultSetColumnNames(first);
  if (!columns.length) return first;
  const grouped = new Map<string, unknown[][]>();
  resultSets.forEach((resultSet, resultSetIndex) => {
    resultSetRows(resultSet).forEach((row, rowIndex) => {
      const key = rowIdentity(row, columns, `source-${resultSetIndex}-row-${rowIndex}`);
      const existing = grouped.get(key) || [];
      existing.push(row);
      grouped.set(key, existing);
    });
  });
  return {
    ...first,
    rowSet: Array.from(grouped.values()).map((rows) => mergeRowsByGames(rows, columns)),
  };
}

function payloadResultSets(payload: JsonRecord) {
  if (Array.isArray(payload.resultSets)) return payload.resultSets as JsonRecord[];
  if (payload.resultSet) return [payload.resultSet as JsonRecord];
  if (payload.resultSets && typeof payload.resultSets === "object") return [payload.resultSets as JsonRecord];
  return [];
}

function mergeStatsPayloads(payloads: JsonRecord[]) {
  const presentPayloads = payloads.filter(Boolean);
  if (presentPayloads.length <= 1) return presentPayloads[0] || {};
  const grouped = new Map<string, JsonRecord[]>();
  presentPayloads.forEach((payload) => {
    payloadResultSets(payload).forEach((resultSet, index) => {
      const key = String(resultSet.name || `resultSet-${index}`);
      const existing = grouped.get(key) || [];
      existing.push(resultSet);
      grouped.set(key, existing);
    });
  });
  const resultSets = Array.from(grouped.values()).map((resultSetsForName) => mergeResultSets(resultSetsForName));
  return {
    ...presentPayloads[0],
    resultSets,
    resultSet: resultSets[0],
  };
}

function mapBy(rows: JsonRecord[], key: string) {
  return rows.reduce<Record<string, JsonRecord>>((accumulator, row) => {
    const value = String(row?.[key] || "").trim();
    if (value) accumulator[value] = row;
    return accumulator;
  }, {});
}

function mapShotLocationRows(payload: JsonRecord) {
  const resultSet = findResultSet(payload);
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers as JsonRecord[] : [];
  const categoryHeader = headers.find((entry) => String(entry?.name || "") === "SHOT_CATEGORY");
  const columnsHeader = headers.find((entry) => String(entry?.name || "") === "columns");
  const categories = Array.isArray(categoryHeader?.columnNames)
    ? categoryHeader.columnNames.map((value) => String(value || ""))
    : [];
  const skip = clampInteger(categoryHeader?.columnsToSkip, 2, 1, 8);
  const span = clampInteger(categoryHeader?.columnSpan, 3, 1, 6);
  const columnNames = Array.isArray(columnsHeader?.columnNames)
    ? columnsHeader.columnNames.map((value) => String(value || ""))
    : [];
  const rows = Array.isArray(resultSet?.rowSet) ? resultSet.rowSet : [];

  return rows
    .filter((row) => Array.isArray(row))
    .map((row) => {
      const source = row as unknown[];
      const mapped: JsonRecord = {};
      for (let index = 0; index < skip; index += 1) {
        mapped[columnNames[index] || `ID_${index}`] = source[index];
      }
      mapped.zones = categories.reduce<Record<string, JsonRecord>>((accumulator, category, index) => {
        const offset = skip + index * span;
        accumulator[category] = {
          fgm: safeNumber(source[offset], 0),
          fga: safeNumber(source[offset + 1], 0),
          fgPct: normalizePercent(source[offset + 2]),
        };
        return accumulator;
      }, {});
      return mapped;
    });
}

function getZone(row: JsonRecord | undefined, zone: string) {
  const zones = row?.zones && typeof row.zones === "object" ? row.zones as Record<string, JsonRecord> : {};
  return zones[zone] || { fgm: 0, fga: 0, fgPct: 0 };
}

function buildStatsParams(overrides: Record<string, string>) {
  return {
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
    LastNGames: "10",
    LeagueID: "00",
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
    Rank: "Y",
    Season: currentReportSeason(),
    SeasonSegment: "",
    SeasonType: "Regular Season",
    ShotClockRange: "",
    StarterBench: "",
    TeamID: "0",
    TwoWay: "0",
    VsConference: "",
    VsDivision: "",
    Weight: "",
    ...overrides,
  };
}

function buildShotLocationParams(overrides: Record<string, string>) {
  return {
    Conference: "",
    DateFrom: "",
    DateTo: "",
    DistanceRange: "By Zone",
    Division: "",
    GameScope: "",
    GameSegment: "",
    LastNGames: "10",
    LeagueID: "00",
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
    Rank: "Y",
    Season: currentReportSeason(),
    SeasonSegment: "",
    SeasonType: "Regular Season",
    ShotClockRange: "",
    StarterBench: "",
    TeamID: "0",
    VsConference: "",
    VsDivision: "",
    ...overrides,
  };
}

async function fetchNbaStats(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${NBA_STATS_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("nba-stats-timeout"), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: nbaStatsHeaders,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${endpoint} failed (${response.status})`);
    }
    return await response.json() as JsonRecord;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchNbaStatsForSeasonTypes(
  endpoint: string,
  params: Record<string, string>,
  seasonTypes: string[],
) {
  if (seasonTypes.length <= 1) {
    return fetchNbaStats(endpoint, { ...params, SeasonType: seasonTypes[0] || params.SeasonType || "Regular Season" });
  }
  const payloads = await Promise.all(
    seasonTypes.map((seasonType) => fetchNbaStats(endpoint, { ...params, SeasonType: seasonType })),
  );
  return mergeStatsPayloads(payloads);
}

function buildRankMap<T>(
  rows: T[],
  idGetter: (row: T) => string,
  valueGetter: (row: T) => number,
  direction: "asc" | "desc" = "desc",
  output: "percentile" | "ordinal" = "percentile",
) {
  const sorted = rows
    .map((row) => ({ row, id: idGetter(row), value: valueGetter(row) }))
    .filter((entry) => entry.id && Number.isFinite(entry.value))
    .sort((a, b) => direction === "asc" ? a.value - b.value : b.value - a.value);
  const rankMap: Record<string, number> = {};
  sorted.forEach((entry, index) => {
    const ordinal = index + 1;
    rankMap[entry.id] = output === "ordinal"
      ? ordinal
      : sorted.length <= 1
        ? 50
        : Math.round(((ordinal - 1) / (sorted.length - 1)) * 98 + 1);
  });
  return rankMap;
}

function rankValue<T>(
  rows: T[],
  targetId: string,
  idGetter: (row: T) => string,
  valueGetter: (row: T) => number,
  direction: "asc" | "desc" = "desc",
  output: "percentile" | "ordinal" = "percentile",
) {
  return buildRankMap(rows, idGetter, valueGetter, direction, output)[targetId] || null;
}

function makeMetricRow(
  text: string,
  rank: number | null,
  displayValue: string,
  statLabel: string,
  category: string,
  rawValue: number,
) {
  return {
    text,
    rank,
    displayValue,
    statLabel,
    category,
    rawValue: roundValue(rawValue, 3),
  };
}

function levelPhrase(rank: number | null, highPhrase = "high", lowPhrase = "low") {
  if (!rank) return "notable";
  if (rank <= 10) return `very ${highPhrase}`;
  if (rank <= 40) return `above average`;
  if (rank <= 60) return "average";
  if (rank <= 90) return `below average`;
  return `very ${lowPhrase}`;
}

function buildTeamMetrics(
  baseRows: JsonRecord[],
  advancedRows: JsonRecord[],
  scoringRows: JsonRecord[],
  miscRows: JsonRecord[],
  opponentRows: JsonRecord[],
  shotRows: JsonRecord[],
  opponentShotRows: JsonRecord[],
) {
  const advancedByTeam = mapBy(advancedRows, "TEAM_ID");
  const scoringByTeam = mapBy(scoringRows, "TEAM_ID");
  const miscByTeam = mapBy(miscRows, "TEAM_ID");
  const opponentByTeam = mapBy(opponentRows, "TEAM_ID");
  const shotByTeam = mapBy(shotRows, "TEAM_ID");
  const opponentShotByTeam = mapBy(opponentShotRows, "TEAM_ID");

  return baseRows.map((base) => {
    const teamId = String(base.TEAM_ID || "");
    const advanced = advancedByTeam[teamId] || {};
    const scoring = scoringByTeam[teamId] || {};
    const misc = miscByTeam[teamId] || {};
    const opponent = opponentByTeam[teamId] || {};
    const shot = shotByTeam[teamId] || {};
    const opponentShot = opponentShotByTeam[teamId] || {};
    const rim = getZone(shot, "Restricted Area");
    const paint = getZone(shot, "In The Paint (Non-RA)");
    const mid = getZone(shot, "Mid-Range");
    const oppRim = getZone(opponentShot, "Restricted Area");
    const oppPaint = getZone(opponentShot, "In The Paint (Non-RA)");
    const oppMid = getZone(opponentShot, "Mid-Range");
    const points = safeNumber(base.PTS, 0);
    const fga = safeNumber(base.FGA, 0);
    const possPerGame = safeRatio(advanced.POSS, base.GP, 1);
    const oppPoints = safeNumber(opponent.OPP_PTS, 0);
    const oppFga = safeNumber(opponent.OPP_FGA, 0);
    const oppFg3m = safeNumber(opponent.OPP_FG3M, 0);

    return {
      teamId,
      gamesPlayed: safeNumber(base.GP, 0),
      teamName: String(base.TEAM_NAME || ""),
      points,
      pace: safeNumber(advanced.PACE, 0),
      offPpp: safeNumber(advanced.OFF_RATING, 0) / 100,
      astPct: normalizePercent(advanced.AST_PCT),
      rebPct: normalizePercent(advanced.REB_PCT),
      orebPct: normalizePercent(advanced.OREB_PCT),
      turnoverPct: normalizePercent(advanced.TM_TOV_PCT),
      pctPts3: normalizePercent(scoring.PCT_PTS_3PT),
      pctPtsRim: safeRatio(safeNumber(rim.fgm, 0) * 2, points),
      pctPtsFt: normalizePercent(scoring.PCT_PTS_FT),
      pctPtsNonRimPaint: safeRatio(safeNumber(paint.fgm, 0) * 2, points),
      pctPtsLong2: safeRatio(safeNumber(mid.fgm, 0) * 2, points),
      ptsOffTov: safeNumber(misc.PTS_OFF_TOV, 0),
      secondChancePts: safeNumber(misc.PTS_2ND_CHANCE, 0),
      fgPct: normalizePercent(base.FG_PCT),
      efgPct: normalizePercent(advanced.EFG_PCT),
      freq3: normalizePercent(scoring.PCT_FGA_3PT),
      fg3Pct: normalizePercent(base.FG3_PCT),
      freqRim: safeRatio(rim.fga, fga),
      fgRimPct: safeNumber(rim.fgPct, 0),
      ftaRate: safeRatio(base.FTA, fga),
      freqNonRimPaint: safeRatio(paint.fga, fga),
      fgNonRimPaint: safeNumber(paint.fgPct, 0),
      freqLong2: safeRatio(mid.fga, fga),
      fgLong2: safeNumber(mid.fgPct, 0),
      oppPoints,
      oppPace: safeNumber(advanced.PACE, 0),
      defPpp: safeNumber(advanced.DEF_RATING, 0) / 100,
      oppAstPct: safeRatio(opponent.OPP_AST, opponent.OPP_FGM),
      oppRebPct: 100 - normalizePercent(advanced.REB_PCT),
      oppOrebPct: 100 - normalizePercent(advanced.DREB_PCT),
      oppTurnoverPct: possPerGame > 0 ? safeRatio(opponent.OPP_TOV, possPerGame) : 0,
      oppPctPts3: safeRatio(oppFg3m * 3, oppPoints),
      oppPctPtsRim: safeRatio(safeNumber(oppRim.fgm, 0) * 2, oppPoints),
      oppPctPtsFt: safeRatio(opponent.OPP_FTM, oppPoints),
      oppPctPtsNonRimPaint: safeRatio(safeNumber(oppPaint.fgm, 0) * 2, oppPoints),
      oppPctPtsLong2: safeRatio(safeNumber(oppMid.fgm, 0) * 2, oppPoints),
      oppPtsOffTov: safeNumber(misc.OPP_PTS_OFF_TOV, 0),
      oppSecondChancePts: safeNumber(misc.OPP_PTS_2ND_CHANCE, 0),
      oppFgPct: normalizePercent(opponent.OPP_FG_PCT),
      oppEfgPct: oppFga > 0 ? ((safeNumber(opponent.OPP_FGM, 0) + 0.5 * oppFg3m) / oppFga) * 100 : 0,
      oppFreq3: safeRatio(opponent.OPP_FG3A, oppFga),
      oppFg3Pct: normalizePercent(opponent.OPP_FG3_PCT),
      oppFreqRim: safeRatio(oppRim.fga, oppFga),
      oppFgRimPct: safeNumber(oppRim.fgPct, 0),
      oppFtaRate: safeRatio(opponent.OPP_FTA, oppFga),
      oppFreqNonRimPaint: safeRatio(oppPaint.fga, oppFga),
      oppFgNonRimPaint: safeNumber(oppPaint.fgPct, 0),
      oppFreqLong2: safeRatio(oppMid.fga, oppFga),
      oppFgLong2: safeNumber(oppMid.fgPct, 0),
    };
  });
}

function teamRank(metrics: ReturnType<typeof buildTeamMetrics>, teamId: string, key: keyof ReturnType<typeof buildTeamMetrics>[number], direction: "asc" | "desc" = "desc") {
  return rankValue(metrics, teamId, (row) => row.teamId, (row) => safeNumber(row[key], 0), direction, "percentile");
}

function buildTeamReport(teamMetrics: ReturnType<typeof buildTeamMetrics>, targetTeamId: string) {
  const target = teamMetrics.find((row) => row.teamId === targetTeamId);
  const team = findTeam(targetTeamId);
  if (!target || !team) throw new Error("Selected team was not found in NBA Stats response.");
  const teamName = team.shortName;
  const nickname = team.nickname;

  return {
    sections: [
      {
        title: "About Team",
        rows: [
          makeMetricRow(`${teamName} is averaging ${formatNumber(target.points, 1)} points per game.`, teamRank(teamMetrics, targetTeamId, "points"), `${formatNumber(target.points, 1)} PPG`, "Scoring", "Scoring", target.points),
          makeMetricRow(`${teamName} is playing at a ${levelPhrase(teamRank(teamMetrics, targetTeamId, "pace"))} pace, averaging ${formatNumber(target.pace, 1)} possessions per game.`, teamRank(teamMetrics, targetTeamId, "pace"), `${formatNumber(target.pace, 1)} PACE`, "Tempo", "Tempo", target.pace),
          makeMetricRow(`${teamName} is generating ${formatNumber(target.offPpp, 2)} points per possession.`, teamRank(teamMetrics, targetTeamId, "offPpp"), `${formatNumber(target.offPpp, 2)} PPP`, "Scoring", "Scoring", target.offPpp),
          makeMetricRow(`${teamName} has a ${formatNumber(target.astPct, 1)} percent assisted field goal rate.`, teamRank(teamMetrics, targetTeamId, "astPct"), `${formatNumber(target.astPct, 1)} AST%`, "Passing", "Passing", target.astPct),
          makeMetricRow(`${teamName} owns a ${formatNumber(target.rebPct, 1)} percent total rebound rate.`, teamRank(teamMetrics, targetTeamId, "rebPct"), `${formatNumber(target.rebPct, 1)} REB%`, "Rebounding", "Rebounding", target.rebPct),
          makeMetricRow(`The ${nickname} recover ${formatNumber(target.orebPct, 1)} percent of their missed shots.`, teamRank(teamMetrics, targetTeamId, "orebPct"), `${formatNumber(target.orebPct, 1)} OREB%`, "Rebounding", "Rebounding", target.orebPct),
          makeMetricRow(`${teamName} turns it over on ${formatNumber(target.turnoverPct, 1)} percent of possessions.`, teamRank(teamMetrics, targetTeamId, "turnoverPct", "asc"), `${formatNumber(target.turnoverPct, 1)} TO%`, "Turnovers", "Turnovers", target.turnoverPct),
        ],
      },
      {
        title: "How They Score Offensively",
        rows: [
          makeMetricRow(`${teamName} gets ${formatNumber(target.pctPts3, 1)} percent of its points from 3-point range.`, teamRank(teamMetrics, targetTeamId, "pctPts3"), `${formatNumber(target.pctPts3, 1)} PTS%`, "3PT", "3PT", target.pctPts3),
          makeMetricRow(`The ${nickname} get ${formatNumber(target.pctPtsRim, 1)} percent of their points at the rim.`, teamRank(teamMetrics, targetTeamId, "pctPtsRim"), `${formatNumber(target.pctPtsRim, 1)} PTS%`, "RIM", "RIM", target.pctPtsRim),
          makeMetricRow(`${teamName} gets ${formatNumber(target.pctPtsFt, 1)} percent of its points from the free throw line.`, teamRank(teamMetrics, targetTeamId, "pctPtsFt"), `${formatNumber(target.pctPtsFt, 1)} PTS%`, "FT Line", "FT Line", target.pctPtsFt),
          makeMetricRow(`${teamName} gets ${formatNumber(target.pctPtsNonRimPaint, 1)} percent of its points from non-rim paint shots.`, teamRank(teamMetrics, targetTeamId, "pctPtsNonRimPaint"), `${formatNumber(target.pctPtsNonRimPaint, 1)} PTS%`, "Non-Rim Paint", "Non-Rim Paint", target.pctPtsNonRimPaint),
          makeMetricRow(`${teamName} gets ${formatNumber(target.pctPtsLong2, 1)} percent of its points from long 2-point shots.`, teamRank(teamMetrics, targetTeamId, "pctPtsLong2"), `${formatNumber(target.pctPtsLong2, 1)} PTS%`, "Long 2", "Long 2", target.pctPtsLong2),
          makeMetricRow(`The ${nickname} average ${formatNumber(target.ptsOffTov, 1)} points per game off turnovers.`, teamRank(teamMetrics, targetTeamId, "ptsOffTov"), `${formatNumber(target.ptsOffTov, 1)} TO-PPG`, "Scoring", "Scoring", target.ptsOffTov),
          makeMetricRow(`${teamName} averages ${formatNumber(target.secondChancePts, 1)} second chance points per game.`, teamRank(teamMetrics, targetTeamId, "secondChancePts"), `${formatNumber(target.secondChancePts, 1)} 2nd-PPG`, "Scoring", "Scoring", target.secondChancePts),
        ],
      },
      {
        title: "How They Play",
        rows: [
          makeMetricRow(`${teamName} is shooting ${formatNumber(target.fgPct, 1)} percent from the field.`, teamRank(teamMetrics, targetTeamId, "fgPct"), `${formatNumber(target.fgPct, 1)} FG%`, "Shooting", "Shooting", target.fgPct),
          makeMetricRow(`${teamName} has a ${formatNumber(target.efgPct, 1)} percent effective field goal percentage.`, teamRank(teamMetrics, targetTeamId, "efgPct"), `${formatNumber(target.efgPct, 1)} EFG%`, "Shooting", "Shooting", target.efgPct),
          makeMetricRow(`${teamName} takes ${formatNumber(target.freq3, 1)} percent of its shots from the 3-point line.`, teamRank(teamMetrics, targetTeamId, "freq3"), `${formatNumber(target.freq3, 1)} FREQ`, "3PT", "3PT", target.freq3),
          makeMetricRow(`The ${nickname} are shooting ${formatNumber(target.fg3Pct, 1)} percent on 3-point field goals.`, teamRank(teamMetrics, targetTeamId, "fg3Pct"), `${formatNumber(target.fg3Pct, 1)} FG%`, "3PT", "3PT", target.fg3Pct),
          makeMetricRow(`${teamName} takes ${formatNumber(target.freqRim, 1)} percent of its shots at the rim.`, teamRank(teamMetrics, targetTeamId, "freqRim"), `${formatNumber(target.freqRim, 1)} FREQ`, "RIM", "RIM", target.freqRim),
          makeMetricRow(`The ${nickname} are shooting ${formatNumber(target.fgRimPct, 1)} percent at the rim.`, teamRank(teamMetrics, targetTeamId, "fgRimPct"), `${formatNumber(target.fgRimPct, 1)} FG%`, "RIM", "RIM", target.fgRimPct),
          makeMetricRow(`${teamName} has a ${formatNumber(target.ftaRate, 1)} free throw attempt rate.`, teamRank(teamMetrics, targetTeamId, "ftaRate"), `${formatNumber(target.ftaRate, 1)} RATE`, "FT Line", "FT Line", target.ftaRate),
          makeMetricRow(`${teamName} takes ${formatNumber(target.freqNonRimPaint, 1)} percent of its shots from non-rim paint areas.`, teamRank(teamMetrics, targetTeamId, "freqNonRimPaint"), `${formatNumber(target.freqNonRimPaint, 1)} FREQ`, "Non-Rim Paint", "Non-Rim Paint", target.freqNonRimPaint),
          makeMetricRow(`The ${nickname} are shooting ${formatNumber(target.fgNonRimPaint, 1)} percent on non-rim paint shots.`, teamRank(teamMetrics, targetTeamId, "fgNonRimPaint"), `${formatNumber(target.fgNonRimPaint, 1)} FG%`, "Non-Rim Paint", "Non-Rim Paint", target.fgNonRimPaint),
          makeMetricRow(`${teamName} takes ${formatNumber(target.freqLong2, 1)} percent of its shots from long 2-point range.`, teamRank(teamMetrics, targetTeamId, "freqLong2"), `${formatNumber(target.freqLong2, 1)} FREQ`, "Long 2", "Long 2", target.freqLong2),
          makeMetricRow(`The ${nickname} are shooting ${formatNumber(target.fgLong2, 1)} percent on long 2-point shots.`, teamRank(teamMetrics, targetTeamId, "fgLong2"), `${formatNumber(target.fgLong2, 1)} FG%`, "Long 2", "Long 2", target.fgLong2),
        ],
      },
    ],
  };
}

function buildOpponentReport(teamMetrics: ReturnType<typeof buildTeamMetrics>, targetTeamId: string) {
  const target = teamMetrics.find((row) => row.teamId === targetTeamId);
  const team = findTeam(targetTeamId);
  if (!target || !team) throw new Error("Selected team was not found in NBA Stats response.");
  const teamName = team.shortName;
  const nickname = team.nickname;

  return {
    sections: [
      {
        title: "About Their Opponents",
        rows: [
          makeMetricRow(`${teamName} is allowing ${formatNumber(target.oppPoints, 1)} points per game.`, teamRank(teamMetrics, targetTeamId, "oppPoints", "asc"), `${formatNumber(target.oppPoints, 1)} PPG`, "Scoring", "Scoring", target.oppPoints),
          makeMetricRow(`Opponents average ${formatNumber(target.oppPace, 1)} possessions per game against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppPace", "asc"), `${formatNumber(target.oppPace, 1)} PACE`, "Tempo", "Tempo", target.oppPace),
          makeMetricRow(`The ${nickname} allow ${formatNumber(target.defPpp, 2)} points per possession.`, teamRank(teamMetrics, targetTeamId, "defPpp", "asc"), `${formatNumber(target.defPpp, 2)} PPP`, "Scoring", "Scoring", target.defPpp),
          makeMetricRow(`${teamName} opponents assist on ${formatNumber(target.oppAstPct, 1)} percent of made field goals.`, teamRank(teamMetrics, targetTeamId, "oppAstPct", "asc"), `${formatNumber(target.oppAstPct, 1)} AST%`, "Passing", "Passing", target.oppAstPct),
          makeMetricRow(`Opponents own a ${formatNumber(target.oppRebPct, 1)} percent total rebound rate against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppRebPct", "asc"), `${formatNumber(target.oppRebPct, 1)} REB%`, "Rebounding", "Rebounding", target.oppRebPct),
          makeMetricRow(`Opponents recover ${formatNumber(target.oppOrebPct, 1)} percent of their missed shots against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppOrebPct", "asc"), `${formatNumber(target.oppOrebPct, 1)} OREB%`, "Rebounding", "Rebounding", target.oppOrebPct),
          makeMetricRow(`${teamName} forces opponents into a ${formatNumber(target.oppTurnoverPct, 1)} percent turnover rate.`, teamRank(teamMetrics, targetTeamId, "oppTurnoverPct"), `${formatNumber(target.oppTurnoverPct, 1)} TO%`, "Turnovers", "Turnovers", target.oppTurnoverPct),
        ],
      },
      {
        title: "Opponent Scoring Summary",
        rows: [
          makeMetricRow(`${teamName} allows ${formatNumber(target.oppPctPts3, 1)} percent of opponent points from 3-point range.`, teamRank(teamMetrics, targetTeamId, "oppPctPts3", "asc"), `${formatNumber(target.oppPctPts3, 1)} PTS%`, "3PT Allowed", "3PT", target.oppPctPts3),
          makeMetricRow(`${teamName} allows ${formatNumber(target.oppPctPtsRim, 1)} percent of opponent points at the rim.`, teamRank(teamMetrics, targetTeamId, "oppPctPtsRim", "asc"), `${formatNumber(target.oppPctPtsRim, 1)} PTS%`, "RIM", "RIM", target.oppPctPtsRim),
          makeMetricRow(`Opponents get ${formatNumber(target.oppPctPtsFt, 1)} percent of their points from the free throw line against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppPctPtsFt", "asc"), `${formatNumber(target.oppPctPtsFt, 1)} PTS%`, "FT Line", "FT Line", target.oppPctPtsFt),
          makeMetricRow(`Opponents get ${formatNumber(target.oppPctPtsNonRimPaint, 1)} percent of their points from non-rim paint shots.`, teamRank(teamMetrics, targetTeamId, "oppPctPtsNonRimPaint", "asc"), `${formatNumber(target.oppPctPtsNonRimPaint, 1)} PTS%`, "Non-Rim Paint", "Non-Rim Paint", target.oppPctPtsNonRimPaint),
          makeMetricRow(`Opponents get ${formatNumber(target.oppPctPtsLong2, 1)} percent of their points from long 2-point shots.`, teamRank(teamMetrics, targetTeamId, "oppPctPtsLong2", "asc"), `${formatNumber(target.oppPctPtsLong2, 1)} PTS%`, "Long 2", "Long 2", target.oppPctPtsLong2),
          makeMetricRow(`Opponents average ${formatNumber(target.oppPtsOffTov, 1)} points off ${nickname} turnovers.`, teamRank(teamMetrics, targetTeamId, "oppPtsOffTov", "asc"), `${formatNumber(target.oppPtsOffTov, 1)} TO-PPG`, "Scoring", "Scoring", target.oppPtsOffTov),
          makeMetricRow(`Opponents average ${formatNumber(target.oppSecondChancePts, 1)} second chance points against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppSecondChancePts", "asc"), `${formatNumber(target.oppSecondChancePts, 1)} 2nd-PPG`, "Scoring", "Scoring", target.oppSecondChancePts),
        ],
      },
      {
        title: "Opponent Shooting Tendencies",
        rows: [
          makeMetricRow(`${teamName} allows opponents to shoot ${formatNumber(target.oppFgPct, 1)} percent from the field.`, teamRank(teamMetrics, targetTeamId, "oppFgPct", "asc"), `${formatNumber(target.oppFgPct, 1)} FG%`, "Shooting", "Shooting", target.oppFgPct),
          makeMetricRow(`Opponents have a ${formatNumber(target.oppEfgPct, 1)} percent effective field goal percentage against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppEfgPct", "asc"), `${formatNumber(target.oppEfgPct, 1)} EFG%`, "Shooting", "Shooting", target.oppEfgPct),
          makeMetricRow(`Opponents take ${formatNumber(target.oppFreq3, 1)} percent of their shots from the 3-point line.`, teamRank(teamMetrics, targetTeamId, "oppFreq3", "asc"), `${formatNumber(target.oppFreq3, 1)} FREQ`, "3PT", "3PT", target.oppFreq3),
          makeMetricRow(`Opponents shoot ${formatNumber(target.oppFg3Pct, 1)} percent from 3-point range against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppFg3Pct", "asc"), `${formatNumber(target.oppFg3Pct, 1)} FG%`, "3PT", "3PT", target.oppFg3Pct),
          makeMetricRow(`${teamName} allows opponents to take ${formatNumber(target.oppFreqRim, 1)} percent of shots at the rim.`, teamRank(teamMetrics, targetTeamId, "oppFreqRim", "asc"), `${formatNumber(target.oppFreqRim, 1)} FREQ`, "RIM", "RIM", target.oppFreqRim),
          makeMetricRow(`Opponents shoot ${formatNumber(target.oppFgRimPct, 1)} percent at the rim against ${teamName}.`, teamRank(teamMetrics, targetTeamId, "oppFgRimPct", "asc"), `${formatNumber(target.oppFgRimPct, 1)} FG%`, "RIM", "RIM", target.oppFgRimPct),
          makeMetricRow(`${teamName} sends opponents to the line at a ${formatNumber(target.oppFtaRate, 1)} free throw attempt rate.`, teamRank(teamMetrics, targetTeamId, "oppFtaRate", "asc"), `${formatNumber(target.oppFtaRate, 1)} RATE`, "FT Line", "FT Line", target.oppFtaRate),
          makeMetricRow(`Opponents take ${formatNumber(target.oppFreqNonRimPaint, 1)} percent of shots from non-rim paint areas.`, teamRank(teamMetrics, targetTeamId, "oppFreqNonRimPaint", "asc"), `${formatNumber(target.oppFreqNonRimPaint, 1)} FREQ`, "Non-Rim Paint", "Non-Rim Paint", target.oppFreqNonRimPaint),
          makeMetricRow(`Opponents shoot ${formatNumber(target.oppFgNonRimPaint, 1)} percent on non-rim paint shots.`, teamRank(teamMetrics, targetTeamId, "oppFgNonRimPaint", "asc"), `${formatNumber(target.oppFgNonRimPaint, 1)} FG%`, "Non-Rim Paint", "Non-Rim Paint", target.oppFgNonRimPaint),
          makeMetricRow(`Opponents take ${formatNumber(target.oppFreqLong2, 1)} percent of shots from long 2-point range.`, teamRank(teamMetrics, targetTeamId, "oppFreqLong2", "asc"), `${formatNumber(target.oppFreqLong2, 1)} FREQ`, "Long 2", "Long 2", target.oppFreqLong2),
          makeMetricRow(`Opponents shoot ${formatNumber(target.oppFgLong2, 1)} percent on long 2-point shots.`, teamRank(teamMetrics, targetTeamId, "oppFgLong2", "asc"), `${formatNumber(target.oppFgLong2, 1)} FG%`, "Long 2", "Long 2", target.oppFgLong2),
        ],
      },
    ],
  };
}

function splitName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : parts[0] || "",
  };
}

function formatMadeAttempt(made: unknown, attempted: unknown) {
  return `${formatNumber(made, 1)}/${formatNumber(attempted, 1)}`;
}

function buildSplitRow(label: string, row: JsonRecord | undefined) {
  if (!row) {
    return {
      label,
      mpg: "-",
      ppg: "-",
      fgmA: "-",
      fgPct: "-",
      threePmA: "-",
      threePct: "-",
      ftmA: "-",
      ftPct: "-",
      off: "-",
      def: "-",
      tot: "-",
      apg: "-",
      to: "-",
      blk: "-",
      stl: "-",
      pf: "-",
    };
  }
  return {
    label,
    mpg: formatNumber(row.MIN, 1),
    ppg: formatNumber(row.PTS, 1),
    fgmA: formatMadeAttempt(row.FGM, row.FGA),
    fgPct: formatPercent(normalizePercent(row.FG_PCT), 1),
    threePmA: formatMadeAttempt(row.FG3M, row.FG3A),
    threePct: formatPercent(normalizePercent(row.FG3_PCT), 1),
    ftmA: formatMadeAttempt(row.FTM, row.FTA),
    ftPct: formatPercent(normalizePercent(row.FT_PCT), 1),
    off: formatNumber(row.OREB, 1),
    def: formatNumber(row.DREB, 1),
    tot: formatNumber(row.REB, 1),
    apg: formatNumber(row.AST, 1),
    to: formatNumber(row.TOV, 1),
    blk: formatNumber(row.BLK, 1),
    stl: formatNumber(row.STL, 1),
    pf: formatNumber(row.PF, 1),
  };
}

function buildPlayerMetrics(
  baseRows: JsonRecord[],
  advancedRows: JsonRecord[],
  usageRows: JsonRecord[],
  scoringRows: JsonRecord[],
  shotRows: JsonRecord[],
  onCourtRows: JsonRecord[],
  offCourtRows: JsonRecord[],
  splitMaps: Record<string, Record<string, JsonRecord>>,
  teamMetrics: ReturnType<typeof buildTeamMetrics>[number],
) {
  const advancedByPlayer = mapBy(advancedRows, "PLAYER_ID");
  const usageByPlayer = mapBy(usageRows, "PLAYER_ID");
  const scoringByPlayer = mapBy(scoringRows, "PLAYER_ID");
  const shotByPlayer = mapBy(shotRows, "PLAYER_ID");
  const onByPlayer = mapBy(onCourtRows, "VS_PLAYER_ID");
  const offByPlayer = mapBy(offCourtRows, "VS_PLAYER_ID");

  return baseRows
    .map((base) => {
      const playerId = String(base.PLAYER_ID || "");
      const playerName = String(base.PLAYER_NAME || "").trim();
      if (!playerId || !playerName) return null;
      const advanced = advancedByPlayer[playerId] || {};
      const usage = usageByPlayer[playerId] || {};
      const scoring = scoringByPlayer[playerId] || {};
      const shot = shotByPlayer[playerId] || {};
      const on = onByPlayer[playerId] || {};
      const off = offByPlayer[playerId] || {};
      const rim = getZone(shot, "Restricted Area");
      const paint = getZone(shot, "In The Paint (Non-RA)");
      const mid = getZone(shot, "Mid-Range");
      const points = safeNumber(base.PTS, 0);
      const fga = safeNumber(base.FGA, 0);
      const playerPoss = safeNumber(advanced.POSS, 0);
      const teamPoss = safeNumber(teamMetrics?.pace, 0) * Math.max(1, safeNumber(base.GP, 0));
      const offensiveImpact = (safeNumber(on.OFF_RATING, 0) - safeNumber(off.OFF_RATING, 0)) / 100;
      const defensiveImpact = (safeNumber(on.DEF_RATING, 0) - safeNumber(off.DEF_RATING, 0)) / 100;
      const names = splitName(playerName);
      return {
        playerId,
        player: {
          playerId,
          name: playerName,
          firstName: names.firstName,
          lastName: names.lastName,
          jersey: String(base.JERSEY_NUM || "").trim(),
          position: "",
          teamId: String(base.TEAM_ID || ""),
          teamAbbreviation: String(base.TEAM_ABBREVIATION || ""),
        },
        sortMinutes: safeNumber(base.MIN, 0),
        cards: [
          { label: "% of Poss", value: `${formatNumber(safeRatio(playerPoss, teamPoss), 1)}%` },
          { label: "Usage %", value: `${formatNumber(normalizePercent(advanced.USG_PCT), 1)}%`, rank: safeNumber(advanced.USG_PCT_RANK, 0) || null },
          { label: "EFG%", value: `${formatNumber(normalizePercent(advanced.EFG_PCT), 1)}%`, rank: safeNumber(advanced.EFG_PCT_RANK, 0) || null },
          { label: "TS%", value: `${formatNumber(normalizePercent(advanced.TS_PCT), 1)}%`, rank: safeNumber(advanced.TS_PCT_RANK, 0) || null },
          { label: "On Court +/-", value: `${formatNumber(safeNumber(on.NET_RATING, 0) / 100, 2)} PPP` },
        ],
        splitRows: [
          buildSplitRow("Overall", splitMaps.overall[playerId] || base),
          buildSplitRow("Conference", splitMaps.conference[playerId]),
          buildSplitRow("Last 5", splitMaps.last5[playerId]),
          buildSplitRow("Wins", splitMaps.wins[playerId]),
          buildSplitRow("Losses", splitMaps.losses[playerId]),
        ],
        metrics: {
          ppg: points,
          pointsShare: normalizePercent(usage.PCT_PTS),
          astShare: normalizePercent(usage.PCT_AST),
          tovShare: normalizePercent(usage.PCT_TOV),
          orebShare: normalizePercent(usage.PCT_OREB),
          drebShare: normalizePercent(usage.PCT_DREB),
          offensiveImpact,
          defensiveImpact,
          fgAstPct: normalizePercent(scoring.PCT_AST_FGM),
          pctPts3: normalizePercent(scoring.PCT_PTS_3PT),
          pctPtsRim: safeRatio(safeNumber(rim.fgm, 0) * 2, points),
          pctPtsFt: normalizePercent(scoring.PCT_PTS_FT),
          pctPtsNonRimPaint: safeRatio(safeNumber(paint.fgm, 0) * 2, points),
          pctPtsLong2: safeRatio(safeNumber(mid.fgm, 0) * 2, points),
          fgPct: normalizePercent(base.FG_PCT),
          fgm: safeNumber(base.FGM, 0),
          fg3Pct: normalizePercent(base.FG3_PCT),
          fg3m: safeNumber(base.FG3M, 0),
          fgRimPct: safeNumber(rim.fgPct, 0),
          fgmRim: safeNumber(rim.fgm, 0),
          ftPct: normalizePercent(base.FT_PCT),
          ftm: safeNumber(base.FTM, 0),
          fgNonRimPaint: safeNumber(paint.fgPct, 0),
          fgmNonRimPaint: safeNumber(paint.fgm, 0),
          fgLong2: safeNumber(mid.fgPct, 0),
          fgmLong2: safeNumber(mid.fgm, 0),
        },
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
    .sort((a, b) => b.sortMinutes - a.sortMinutes);
}

function playerRank(
  players: ReturnType<typeof buildPlayerMetrics>,
  playerId: string,
  metricKey: keyof ReturnType<typeof buildPlayerMetrics>[number]["metrics"],
  direction: "asc" | "desc" = "desc",
) {
  return rankValue(
    players,
    playerId,
    (row) => row.playerId,
    (row) => safeNumber(row.metrics[metricKey], Number.NaN),
    direction,
    "ordinal",
  );
}

function buildPlayerReports(players: ReturnType<typeof buildPlayerMetrics>, team: NonNullable<ReturnType<typeof findTeam>>) {
  return players.map((entry) => {
    const { player, metrics } = entry;
    const lastName = player.lastName || player.name;
    const firstName = player.firstName || player.name;
    return {
      player,
      cards: entry.cards,
      splitRows: entry.splitRows,
      sections: [
        {
          title: "About Player",
          rows: [
            makeMetricRow(`${player.name} averages ${formatNumber(metrics.ppg, 1)} points per game.`, playerRank(players, player.playerId, "ppg"), `${formatNumber(metrics.ppg, 1)} PPG`, "Scoring", "Scoring", metrics.ppg),
            makeMetricRow(`${lastName} is responsible for ${formatNumber(metrics.pointsShare, 1)} percent of ${team.shortName}'s points while on the floor.`, playerRank(players, player.playerId, "pointsShare"), `${formatNumber(metrics.pointsShare, 1)} PTS%`, "Points Share", "Points Share", metrics.pointsShare),
            makeMetricRow(`${lastName} accounts for ${formatNumber(metrics.astShare, 1)} percent of ${team.shortName}'s assists while on the floor.`, playerRank(players, player.playerId, "astShare"), `${formatNumber(metrics.astShare, 1)} AST%`, "Passing", "Passing", metrics.astShare),
            makeMetricRow(`${lastName} accounts for ${formatNumber(metrics.tovShare, 1)} percent of ${team.shortName}'s turnovers while on the floor.`, playerRank(players, player.playerId, "tovShare", "asc"), `${formatNumber(metrics.tovShare, 1)} TO%`, "Turnovers", "Turnovers", metrics.tovShare),
            makeMetricRow(`${lastName} secures ${formatNumber(metrics.orebShare, 1)} percent of available offensive rebounds while on the floor.`, playerRank(players, player.playerId, "orebShare"), `${formatNumber(metrics.orebShare, 1)} OREB%`, "Rebounding", "Rebounding", metrics.orebShare),
            makeMetricRow(`${lastName} secures ${formatNumber(metrics.drebShare, 1)} percent of available defensive rebounds while on the floor.`, playerRank(players, player.playerId, "drebShare"), `${formatNumber(metrics.drebShare, 1)} DREB%`, "Rebounding", "Rebounding", metrics.drebShare),
            makeMetricRow(`${team.shortName}'s offense changes by ${formatNumber(metrics.offensiveImpact, 2)} points per possession with ${lastName} on the floor.`, playerRank(players, player.playerId, "offensiveImpact"), `${formatNumber(metrics.offensiveImpact, 2)} PPP +/-`, "Offensive Impact", "Impact", metrics.offensiveImpact),
            makeMetricRow(`${team.shortName}'s defense changes by ${formatNumber(metrics.defensiveImpact, 2)} points per possession with ${lastName} on the floor.`, playerRank(players, player.playerId, "defensiveImpact", "asc"), `${formatNumber(metrics.defensiveImpact, 2)} PPP +/-`, "Defensive Impact", "Impact", metrics.defensiveImpact),
          ],
        },
        {
          title: "How They Score",
          rows: [
            makeMetricRow(`${lastName} has ${formatNumber(metrics.fgAstPct, 1)} percent of made field goals assisted.`, playerRank(players, player.playerId, "fgAstPct"), `${formatNumber(metrics.fgAstPct, 1)} FGM% AST`, "Creating", "Creating", metrics.fgAstPct),
            makeMetricRow(`${formatNumber(metrics.pctPts3, 1)} percent of ${firstName}'s points come from beyond the arc.`, playerRank(players, player.playerId, "pctPts3"), `${formatNumber(metrics.pctPts3, 1)} PTS%`, "3PT", "3PT", metrics.pctPts3),
            makeMetricRow(`${formatNumber(metrics.pctPtsRim, 1)} percent of ${firstName}'s points come at the rim.`, playerRank(players, player.playerId, "pctPtsRim"), `${formatNumber(metrics.pctPtsRim, 1)} PTS%`, "ATR", "RIM", metrics.pctPtsRim),
            makeMetricRow(`${formatNumber(metrics.pctPtsFt, 1)} percent of ${firstName}'s points come at the free throw line.`, playerRank(players, player.playerId, "pctPtsFt"), `${formatNumber(metrics.pctPtsFt, 1)} PTS%`, "FT Line", "FT Line", metrics.pctPtsFt),
            makeMetricRow(`${formatNumber(metrics.pctPtsNonRimPaint, 1)} percent of ${firstName}'s points come from non-rim paint shots.`, playerRank(players, player.playerId, "pctPtsNonRimPaint"), `${formatNumber(metrics.pctPtsNonRimPaint, 1)} PTS%`, "Non-Rim Paint", "Non-Rim Paint", metrics.pctPtsNonRimPaint),
            makeMetricRow(`${formatNumber(metrics.pctPtsLong2, 1)} percent of ${firstName}'s points come from long 2-point shots.`, playerRank(players, player.playerId, "pctPtsLong2"), `${formatNumber(metrics.pctPtsLong2, 1)} PTS%`, "Long 2", "Long 2", metrics.pctPtsLong2),
          ],
        },
        {
          title: "Shooting Efficiency",
          rows: [
            makeMetricRow(`${lastName} is shooting ${formatNumber(metrics.fgPct, 1)} percent from the field, making ${formatNumber(metrics.fgm, 1)} per game.`, playerRank(players, player.playerId, "fgPct"), `${formatNumber(metrics.fgPct, 1)} FG%`, "Shooting", "Shooting", metrics.fgPct),
            makeMetricRow(`${lastName} is shooting ${formatNumber(metrics.fg3Pct, 1)} percent from three, making ${formatNumber(metrics.fg3m, 1)} per game.`, playerRank(players, player.playerId, "fg3Pct"), `${formatNumber(metrics.fg3Pct, 1)} 3FG%`, "3PT", "3PT", metrics.fg3Pct),
            makeMetricRow(`${lastName} is shooting ${formatNumber(metrics.fgRimPct, 1)} percent at the rim, making ${formatNumber(metrics.fgmRim, 1)} per game.`, playerRank(players, player.playerId, "fgRimPct"), `${formatNumber(metrics.fgRimPct, 1)} FG%`, "ATR", "RIM", metrics.fgRimPct),
            makeMetricRow(`${lastName} is shooting ${formatNumber(metrics.ftPct, 1)} percent at the line, making ${formatNumber(metrics.ftm, 1)} per game.`, playerRank(players, player.playerId, "ftPct"), `${formatNumber(metrics.ftPct, 1)} FT%`, "FT Line", "FT Line", metrics.ftPct),
            makeMetricRow(`${lastName} is shooting ${formatNumber(metrics.fgNonRimPaint, 1)} percent from non-rim paint, making ${formatNumber(metrics.fgmNonRimPaint, 1)} per game.`, playerRank(players, player.playerId, "fgNonRimPaint"), `${formatNumber(metrics.fgNonRimPaint, 1)} FG%`, "Non-Rim Paint", "Non-Rim Paint", metrics.fgNonRimPaint),
            makeMetricRow(`${lastName} is shooting ${formatNumber(metrics.fgLong2, 1)} percent on long 2s, making ${formatNumber(metrics.fgmLong2, 1)} per game.`, playerRank(players, player.playerId, "fgLong2"), `${formatNumber(metrics.fgLong2, 1)} FG%`, "Long 2", "Long 2", metrics.fgLong2),
          ],
        },
      ],
    };
  });
}

async function buildAnalyticsReport(body: JsonRecord) {
  const teamId = String(body.teamId || "1610612764").trim();
  const team = findTeam(teamId);
  if (!team) throw new Error("Select a valid NBA team.");
  const season = String(body.season || currentReportSeason()).trim();
  if (!isValidSeason(season)) throw new Error("Select a valid NBA season.");
  const seasonType = normalizeReportSeasonType(body.seasonType);
  const seasonTypes = reportSeasonTypes(seasonType);
  const lastNGames = normalizeLastNGames(body.lastNGames);
  const common = { Season: season, SeasonType: seasonTypes[0], LastNGames: String(lastNGames) };
  const fetchReportStats = (endpoint: string, params: Record<string, string>) =>
    fetchNbaStatsForSeasonTypes(endpoint, params, seasonTypes);

  const [
    teamBasePayload,
    teamAdvancedPayload,
    teamScoringPayload,
    teamMiscPayload,
    opponentPayload,
    teamShotPayload,
    opponentShotPayload,
    playerBasePayload,
    playerAdvancedPayload,
    playerUsagePayload,
    playerScoringPayload,
    playerShotPayload,
    onOffPayload,
    playerConferencePayload,
    playerLast5Payload,
    playerWinsPayload,
    playerLossesPayload,
  ] = await Promise.all([
    fetchReportStats("leaguedashteamstats", buildStatsParams({ ...common, MeasureType: "Base", TeamID: "0" })),
    fetchReportStats("leaguedashteamstats", buildStatsParams({ ...common, MeasureType: "Advanced", TeamID: "0" })),
    fetchReportStats("leaguedashteamstats", buildStatsParams({ ...common, MeasureType: "Scoring", TeamID: "0" })),
    fetchReportStats("leaguedashteamstats", buildStatsParams({ ...common, MeasureType: "Misc", TeamID: "0" })),
    fetchReportStats("leaguedashteamstats", buildStatsParams({ ...common, MeasureType: "Opponent", TeamID: "0" })),
    fetchReportStats("leaguedashteamshotlocations", buildShotLocationParams({ ...common, MeasureType: "Base", TeamID: "0" })),
    fetchReportStats("leaguedashteamshotlocations", buildShotLocationParams({ ...common, MeasureType: "Opponent", TeamID: "0" })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Base", TeamID: teamId })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Advanced", TeamID: teamId })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Usage", TeamID: teamId })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Scoring", TeamID: teamId })),
    fetchReportStats("leaguedashplayershotlocations", buildShotLocationParams({ ...common, MeasureType: "Base", TeamID: teamId })),
    fetchReportStats("teamplayeronoffdetails", buildStatsParams({ ...common, MeasureType: "Advanced", TeamID: teamId, PerMode: "Per100Possessions", Rank: "N" })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Base", TeamID: teamId, VsConference: team.conference })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Base", TeamID: teamId, LastNGames: String(lastNGames === 0 ? 5 : Math.min(5, lastNGames)) })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Base", TeamID: teamId, Outcome: "W" })),
    fetchReportStats("leaguedashplayerstats", buildStatsParams({ ...common, MeasureType: "Base", TeamID: teamId, Outcome: "L" })),
  ]);

  const teamBaseRows = mapRows(findResultSet(teamBasePayload, "LeagueDashTeamStats"));
  const teamAdvancedRows = mapRows(findResultSet(teamAdvancedPayload, "LeagueDashTeamStats"));
  const teamScoringRows = mapRows(findResultSet(teamScoringPayload, "LeagueDashTeamStats"));
  const teamMiscRows = mapRows(findResultSet(teamMiscPayload, "LeagueDashTeamStats"));
  const opponentRows = mapRows(findResultSet(opponentPayload, "LeagueDashTeamStats"));
  const teamShotRows = mapShotLocationRows(teamShotPayload);
  const opponentShotRows = mapShotLocationRows(opponentShotPayload);
  const teamMetrics = buildTeamMetrics(teamBaseRows, teamAdvancedRows, teamScoringRows, teamMiscRows, opponentRows, teamShotRows, opponentShotRows);
  const targetTeamMetrics = teamMetrics.find((row) => row.teamId === teamId);
  if (!targetTeamMetrics) throw new Error("NBA Stats returned no team data for this selection.");

  const onOffSets = Array.isArray(onOffPayload.resultSets) ? onOffPayload.resultSets as JsonRecord[] : [];
  const onCourtRows = mapRows(onOffSets.find((set) => String(set.name || "") === "PlayersOnCourtTeamPlayerOnOffDetails"));
  const offCourtRows = mapRows(onOffSets.find((set) => String(set.name || "") === "PlayersOffCourtTeamPlayerOnOffDetails"));
  const splitMaps = {
    overall: mapBy(mapRows(findResultSet(playerBasePayload, "LeagueDashPlayerStats")), "PLAYER_ID"),
    conference: mapBy(mapRows(findResultSet(playerConferencePayload, "LeagueDashPlayerStats")), "PLAYER_ID"),
    last5: mapBy(mapRows(findResultSet(playerLast5Payload, "LeagueDashPlayerStats")), "PLAYER_ID"),
    wins: mapBy(mapRows(findResultSet(playerWinsPayload, "LeagueDashPlayerStats")), "PLAYER_ID"),
    losses: mapBy(mapRows(findResultSet(playerLossesPayload, "LeagueDashPlayerStats")), "PLAYER_ID"),
  };
  const playerBaseRows = Object.values(splitMaps.overall);
  const playerMetrics = buildPlayerMetrics(
    playerBaseRows,
    mapRows(findResultSet(playerAdvancedPayload, "LeagueDashPlayerStats")),
    mapRows(findResultSet(playerUsagePayload, "LeagueDashPlayerStats")),
    mapRows(findResultSet(playerScoringPayload, "LeagueDashPlayerStats")),
    mapShotLocationRows(playerShotPayload),
    onCourtRows,
    offCourtRows,
    splitMaps,
    targetTeamMetrics,
  );

  return {
    generatedAt: new Date().toISOString(),
    source: "NBA Stats public endpoints",
    excludedSections: ["Situational Points Per Possession"],
    selection: {
      teamId,
      season,
      seasonType,
      lastNGames,
      gamesUsed: targetTeamMetrics.gamesPlayed,
      rangeLabel: `${season} ${seasonType} · ${lastNGamesLabel(lastNGames, targetTeamMetrics.gamesPlayed)}`,
    },
    team,
    teamReport: buildTeamReport(teamMetrics, teamId),
    opponentReport: buildOpponentReport(teamMetrics, teamId),
    playerReports: buildPlayerReports(playerMetrics, team),
    notes: [
      "Situational points per possession is intentionally excluded until Synergy access is available.",
      "Free throw line frequency is approximated with free throw attempt rate from public NBA Stats.",
      "Player team ranks are computed within the selected team and game window.",
    ],
  };
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body = await req.json().catch(() => ({})) as JsonRecord;
    const report = await buildAnalyticsReport(body);
    return jsonResponse(200, report, {
      "Cache-Control": "public, max-age=300",
    });
  } catch (error) {
    console.error("Unable to build NBA analytics report.", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to build NBA analytics report.",
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export const __test__ = {
  buildRankMap,
  currentReportSeason,
  formatNumber,
  lastNGamesLabel,
  mergeStatsPayloads,
  normalizeLastNGames,
  normalizePercent,
  normalizeReportSeasonType,
};
