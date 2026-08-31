import { fetchGamesMetadataByIds } from "./api.js";
import { supabase } from "./supabaseClient.js";

const WIZARDS_TEAM_ID = "1610612764";
const WIZARDS_TRICODE = "WAS";
const PGR_ROW_LIMIT = 150000;
const SUPABASE_PAGE_SIZE = 1000;
const INCORRECT_CALL_CODES = ["NI", "BCA", "WPA", "SFA", "PFA", "TTFE"];
const ASSESSMENT_ERROR_CODES = ["BCA", "WPA", "SFA", "PFA", "TTFE"];
const POTENTIAL_INFRACTION_CODES = ["PI", "PII"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeRate(numerator, denominator) {
  const total = Number(denominator) || 0;
  return total > 0 ? (Number(numerator) || 0) / total : 0;
}

function isMissingTableError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
}

async function selectTable(table, queryBuilder, fallback = []) {
  if (!supabase) return { data: fallback, unavailable: true };
  const { data, error } = await queryBuilder(supabase.from(table));
  if (error) {
    if (isMissingTableError(error)) return { data: fallback, unavailable: true };
    throw error;
  }
  return { data: asArray(data), unavailable: false };
}

async function selectPreferredTable(preferredTable, fallbackTable, queryBuilder, options = {}) {
  const { allowFallback = false, fallback = [] } = options;
  const preferredResult = await selectTable(preferredTable, queryBuilder, fallback);
  if (!preferredResult.unavailable) return preferredResult;
  if (!allowFallback) return preferredResult;
  return selectTable(fallbackTable, queryBuilder, fallback);
}

async function safeSelectTable(table, queryBuilder, fallback = []) {
  try {
    return await selectTable(table, queryBuilder, fallback);
  } catch (error) {
    return { data: fallback, unavailable: false, loadError: error };
  }
}

async function selectPagedTable(table, queryBuilder, { maxRows = PGR_ROW_LIMIT } = {}) {
  if (!supabase) return { data: [], unavailable: true };
  const rows = [];
  for (let from = 0; from < maxRows; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, maxRows - 1);
    const { data, error } = await queryBuilder(supabase.from(table)).range(from, to);
    if (error) {
      if (isMissingTableError(error)) return { data: [], unavailable: true };
      throw error;
    }
    const page = asArray(data);
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }
  return { data: rows, unavailable: false };
}

function normalizeTeam(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "WASHINGTON" || text === "WASHINGTON WIZARDS" || text === "WIZARDS") return WIZARDS_TRICODE;
  return text;
}

function teamTricode(team) {
  return String(team?.teamTricode || team?.teamAbbreviation || team?.triCode || "").trim().toUpperCase();
}

function teamId(team) {
  return String(team?.teamId || team?.id || "").trim();
}

function normalizeGameMetadata(gameId, game) {
  const homeTeam = game?.homeTeam || {};
  const awayTeam = game?.awayTeam || {};
  const home = teamTricode(homeTeam);
  const away = teamTricode(awayTeam);
  const isWizardsGame = home === WIZARDS_TRICODE
    || away === WIZARDS_TRICODE
    || teamId(homeTeam) === WIZARDS_TEAM_ID
    || teamId(awayTeam) === WIZARDS_TEAM_ID;
  return {
    game_id: String(game?.gameId || gameId || "").trim(),
    game_date: String(game?.gameDate || game?.gameEt || "").slice(0, 10),
    home_team: home,
    away_team: away,
    matchup: [away, home].filter(Boolean).join(" @ "),
    season_type: String(game?.seasonType || "").trim(),
    is_wizards_game: isWizardsGame,
    source_payload: game || {},
  };
}

export async function resolvePgrGameMetadata(gameId) {
  const cleanGameId = String(gameId || "").trim();
  if (!cleanGameId) return null;
  const games = await fetchGamesMetadataByIds([cleanGameId]);
  return normalizeGameMetadata(cleanGameId, games?.[cleanGameId] || null);
}

function payloadForImport(report, { filename, fileHash, season, game, mode = "create" }) {
  return {
    mode,
    schema_version: report.schema_version,
    filename,
    file_hash: fileHash,
    worksheet_name: report.worksheet_name,
    season,
    game_id: report.game_id,
    game,
    row_count: report.row_count,
    event_count: report.event_count,
    possession_count: report.possession_count,
    warnings: report.warnings,
    errors: report.errors,
    source_payload: report.source_payload,
    possessions: report.possessions,
    events: report.events,
    evaluations: report.evaluations,
  };
}

export async function importPgrReport(report, { filename, fileHash, season, game, mode = "create" } = {}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!game?.is_wizards_game) throw new Error("PGR imports are restricted to Washington Wizards games.");
  if (String(report?.game_id || game?.game_id || "").startsWith("001") || String(game?.season_type || "").trim().toLowerCase() === "preseason") {
    throw new Error("PGR imports exclude preseason games.");
  }
  if (report.errors?.length) throw new Error(report.errors.join(" "));
  const { data, error } = await supabase.rpc("nba_import_pgr_report", {
    report_payload: payloadForImport(report, { filename, fileHash, season, game, mode }),
  });
  if (error) throw error;
  return data;
}

function toImportRow(row) {
  return {
    id: row.id,
    season: row.season,
    gameId: row.game_id,
    gameDate: row.game_date,
    matchup: [row.away_team, row.home_team].filter(Boolean).join(" @ "),
    filename: row.filename,
    status: row.status,
    rows: Number(row.row_count) || 0,
    possessions: Number(row.possession_count) || 0,
    events: Number(row.event_count) || 0,
    infractions: Number(row.infractions) || 0,
    calls: Number(row.calls) || 0,
    noCalls: Number(row.no_calls) || 0,
    infractionRate: Number(row.infraction_rate) || 0,
    callRate: Number(row.call_rate) || 0,
    warnings: asArray(row.warnings),
    errors: asArray(row.errors),
    importedAt: row.imported_at,
  };
}

function distributionRows(rows, labelKey) {
  return asArray(rows)
    .map((row) => ({
      label: row[labelKey] || row.player_action_label || "Unknown",
      code: row.player_action_code || "",
      evaluations: Number(row.evaluations) || 0,
      events: Number(row.events) || 0,
      calls: Number(row.calls) || 0,
      noCalls: Number(row.no_calls) || 0,
      callRate: Number(row.call_rate) || safeRate(row.calls, row.evaluations),
      infractions: Number(row.infractions) || 0,
      infractionRate: Number(row.infraction_rate) || safeRate(row.infractions, row.evaluations),
    }))
    .sort((left, right) => right.evaluations - left.evaluations || left.label.localeCompare(right.label));
}

function isInfraction(row) {
  return row.player_action_code === "INF" || String(row.infraction_rating_name || "").toLowerCase() === "infraction";
}

function isPotentialInfraction(row) {
  return POTENTIAL_INFRACTION_CODES.includes(row.player_action_code)
    || String(row.infraction_rating_name || "").trim().toLowerCase() === "judgment - lean infraction";
}

function isAssessmentError(row) {
  return ASSESSMENT_ERROR_CODES.includes(row.player_action_code)
    || String(row.infraction_rating_name || "").toLowerCase().includes("assessment");
}

function isNoInfraction(row) {
  return row.player_action_code === "NI"
    || String(row.infraction_rating_name || "").toLowerCase() === "no infraction";
}

function pgrDecision(row) {
  const called = row.call_or_no_call === "C";
  if (called && (isNoInfraction(row) || isAssessmentError(row))) return "incorrect_call";
  if (!called && (isInfraction(row) || isPotentialInfraction(row))) return "incorrect_non_call";
  if (called) return "correct_call";
  return "correct_non_call";
}

function pgrImpactSide(row) {
  const playerTeam = normalizeTeam(row.player_team);
  const opponentTeam = normalizeTeam(row.opponent_team);
  if (playerTeam === WIZARDS_TRICODE) return "wizards_against";
  if (opponentTeam === WIZARDS_TRICODE) return "wizards_for";
  return "neutral";
}

function buildPgrContextRows({ evaluations, imports, assignments, calls }) {
  const importsByGame = new Map(imports.map((row) => [String(row.game_id || ""), row]));
  const crewByGame = new Map();
  assignments.forEach((row) => {
    const role = String(row.role_key || "").toLowerCase();
    const order = Number(row.assignment_order) || 0;
    const current = crewByGame.get(row.game_id);
    if (!current || role === "crewchief" || role === "crew_chief" || order === 1) {
      crewByGame.set(row.game_id, row);
    }
  });
  const callsByGameEvent = new Map();
  calls.forEach((row) => {
    const actionNumber = Number(row.action_number) || 0;
    const keys = [
      `${row.game_id || ""}|${actionNumber}`,
      `${row.game_id || ""}|${actionNumber + 100000}`,
    ];
    keys.forEach((key) => {
      if (row.official_name && !callsByGameEvent.has(key)) callsByGameEvent.set(key, row);
    });
  });

  return evaluations.map((row) => {
    const game = importsByGame.get(row.game_id) || row.nba_pgr_imports || {};
    const callEvent = callsByGameEvent.get(`${row.game_id}|${Number(row.event_id) || row.event_id}`) || {};
    const crewChief = crewByGame.get(row.game_id) || {};
    const homeTeam = normalizeTeam(game.home_team);
    const awayTeam = normalizeTeam(game.away_team);
    const opponent = homeTeam === WIZARDS_TRICODE ? awayTeam : homeTeam;
    const decision = pgrDecision(row);
    const impactSide = pgrImpactSide(row);
    return {
      id: row.id,
      season: row.season,
      gameId: row.game_id,
      gameDate: game.game_date || "",
      matchup: [awayTeam, homeTeam].filter(Boolean).join(" @ "),
      opponent,
      homeRoad: homeTeam === WIZARDS_TRICODE ? "Home" : "Road",
      period: Number(row.period) || null,
      periodName: row.period_name,
      clock: row.game_clock,
      eventId: row.event_id,
      callType: row.call_type_name || "",
      playType: row.play_type_name || "",
      infractionType: row.infraction_type_name || "Unknown",
      playerName: row.player_name || "",
      playerTeam: normalizeTeam(row.player_team),
      opponentName: row.opponent_name || "",
      opponentTeam: normalizeTeam(row.opponent_team),
      actionCode: row.player_action_code || "",
      actionLabel: row.player_action_label || row.player_action_code || "Unknown",
      rating: row.infraction_rating_name || "",
      callOrNoCall: row.call_or_no_call || "",
      decision,
      impactSide,
      videoUrl: row.video_url || "",
      crewChiefName: crewChief.official_name || "",
      whistlingOfficialName: callEvent.official_name || "",
      whistlingOfficialId: callEvent.official_id || "",
      matchedCallConfidence: Number(callEvent.confidence) || 0,
    };
  });
}

function emptyAccuracy() {
  return {
    total: 0,
    correctCalls: 0,
    incorrectCalls: 0,
    correctNonCalls: 0,
    incorrectNonCalls: 0,
    calledNoInfraction: 0,
    calledAssessmentError: 0,
    missedInfractions: 0,
    missedPotentialInfractions: 0,
    accuracy: 0,
  };
}

export function summarizePgrAccuracy(rows) {
  const summary = {
    all: emptyAccuracy(),
    wizardsFor: emptyAccuracy(),
    wizardsAgainst: emptyAccuracy(),
  };
  const add = (bucket, row) => {
    bucket.total += 1;
    if (row.decision === "correct_call") bucket.correctCalls += 1;
    if (row.decision === "incorrect_call") bucket.incorrectCalls += 1;
    if (row.decision === "correct_non_call") bucket.correctNonCalls += 1;
    if (row.decision === "incorrect_non_call") bucket.incorrectNonCalls += 1;
    if (row.callOrNoCall === "C" && isNoInfraction({ player_action_code: row.actionCode, infraction_rating_name: row.rating })) bucket.calledNoInfraction += 1;
    if (row.callOrNoCall === "C" && isAssessmentError({ player_action_code: row.actionCode, infraction_rating_name: row.rating })) bucket.calledAssessmentError += 1;
    if (row.callOrNoCall === "NC" && isInfraction({ player_action_code: row.actionCode, infraction_rating_name: row.rating })) bucket.missedInfractions += 1;
    if (row.callOrNoCall === "NC" && isPotentialInfraction({ player_action_code: row.actionCode, infraction_rating_name: row.rating })) bucket.missedPotentialInfractions += 1;
  };
  rows.forEach((row) => {
    add(summary.all, row);
    if (row.impactSide === "wizards_for") add(summary.wizardsFor, row);
    if (row.impactSide === "wizards_against") add(summary.wizardsAgainst, row);
  });
  Object.values(summary).forEach((bucket) => {
    const correct = bucket.correctCalls + bucket.correctNonCalls;
    bucket.accuracy = safeRate(correct, bucket.total);
  });
  return summary;
}

function groupRows(rows, selector) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = selector(row) || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([label, groupRows]) => ({
    label,
    ...summarizePgrAccuracy(groupRows).all,
  })).sort((left, right) => right.incorrectCalls + right.incorrectNonCalls - (left.incorrectCalls + left.incorrectNonCalls)
    || right.total - left.total
    || left.label.localeCompare(right.label));
}

function uniqueValues(rows, selector) {
  return [...new Set(rows.map(selector).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
}

function inflateAccuracyBucket({
  total = 0,
  calls = 0,
  noCalls = 0,
  calledNoInfraction = 0,
  calledAssessmentError = 0,
  missedInfractions = 0,
  missedPotentialInfractions = 0,
}) {
  const incorrectCalls = calledNoInfraction + calledAssessmentError;
  const incorrectNonCalls = missedInfractions + missedPotentialInfractions;
  const bucket = {
    total,
    correctCalls: Math.max(0, calls - incorrectCalls),
    incorrectCalls,
    correctNonCalls: Math.max(0, noCalls - incorrectNonCalls),
    incorrectNonCalls,
    calledNoInfraction,
    calledAssessmentError,
    missedInfractions,
    missedPotentialInfractions,
    accuracy: 0,
  };
  bucket.accuracy = safeRate(bucket.correctCalls + bucket.correctNonCalls, bucket.total);
  return bucket;
}

function accuracyFromRows(rows) {
  const byScope = new Map(asArray(rows).map((row) => [row.scope, row]));
  const bucket = (scope) => {
    const row = byScope.get(scope) || {};
    return inflateAccuracyBucket({
      total: Number(row.evaluations) || 0,
      calls: Number(row.calls) || 0,
      noCalls: Number(row.no_calls) || 0,
      calledNoInfraction: Number(row.called_no_infraction) || 0,
      calledAssessmentError: Number(row.called_assessment_error) || 0,
      missedInfractions: Number(row.missed_infractions) || 0,
      missedPotentialInfractions: Number(row.missed_potential_infractions) || 0,
    });
  };
  return {
    all: bucket("all"),
    wizardsFor: bucket("wizards_for"),
    wizardsAgainst: bucket("wizards_against"),
  };
}

async function fetchPgrContextRows(season, imports) {
  const gameIds = uniqueValues(imports, (row) => row.game_id)
    .filter((gameId) => !String(gameId).startsWith("001"));
  if (!gameIds.length) {
    return { unavailable: false, rows: [] };
  }
  const [evaluationsResult, assignmentsResult, callsResult] = await Promise.all([
    selectPagedTable("nba_pgr_evaluations", (query) => query
      .select("id,season,game_id,pos_id,event_id,rating_seq_no,period,period_name,game_clock,call_type_name,play_type_name,infraction_type_name,player_name,player_team,opponent_name,opponent_team,player_action_code,player_action_label,infraction_rating_name,call_or_no_call,call_or_no_call_label,video_url")
      .eq("season", season)
      .in("game_id", gameIds)
      .order("game_id", { ascending: false }), { maxRows: PGR_ROW_LIMIT }),
    selectPagedTable("nba_official_game_assignments", (query) => query
      .select("game_id,official_id,official_name,role_key,assignment_order")
      .eq("season", season)
      .not("season_type", "ilike", "Preseason")
      .in("game_id", gameIds), { maxRows: 1000 }),
    selectPagedTable("nba_official_call_events", (query) => query
      .select("game_id,action_number,official_id,official_name,confidence")
      .eq("season", season)
      .not("season_type", "ilike", "Preseason")
      .in("game_id", gameIds), { maxRows: 10000 }),
  ]);
  return {
    unavailable: evaluationsResult.unavailable,
    rows: buildPgrContextRows({
      evaluations: evaluationsResult.data,
      imports,
      assignments: assignmentsResult.data || [],
      calls: callsResult.data || [],
    }),
  };
}

export async function fetchPgrInsightsData({ season = "2025-26" } = {}) {
  const [overviewResult, importsResult, accuracyResult] = await Promise.all([
    selectPreferredTable("nba_pgr_overview_rollups_cache", "nba_pgr_overview_rollups", (query) => query.select("*").eq("season", season).limit(1)),
    selectPreferredTable("nba_pgr_import_rollups_cache", "nba_pgr_import_rollups", (query) => query.select("*").eq("season", season).order("game_date", { ascending: false }).limit(100)),
    safeSelectTable("nba_pgr_accuracy_rollups_cache", (query) => query.select("*").eq("season", season)),
  ]);

  const overviewRow = overviewResult.data[0] || {};
  const imports = importsResult.data;
  return {
    unavailable: overviewResult.unavailable || importsResult.unavailable,
    loadWarnings: [accuracyResult.loadError]
      .filter(Boolean)
      .map((error) => error.message || "A PGR summary query timed out."),
    overview: {
      games: Number(overviewRow.games) || 0,
      evaluations: Number(overviewRow.evaluations) || 0,
      events: Number(overviewRow.events) || 0,
      possessions: Number(overviewRow.possessions) || 0,
      infractions: Number(overviewRow.infractions) || 0,
      judgmentCalls: Number(overviewRow.judgment_calls) || 0,
      calls: Number(overviewRow.calls) || 0,
      noCalls: Number(overviewRow.no_calls) || 0,
      infractionRate: Number(overviewRow.infraction_rate) || 0,
      callRate: Number(overviewRow.call_rate) || 0,
    },
    imports: importsResult.data.map(toImportRow),
    assessmentDistribution: [],
    infractionDistribution: [],
    evaluations: [],
    accuracy: accuracyFromRows(accuracyResult.data),
    filterOptions: {
      opponents: uniqueValues(imports, (row) => {
        const homeTeam = normalizeTeam(row.home_team);
        const awayTeam = normalizeTeam(row.away_team);
        return homeTeam === WIZARDS_TRICODE ? awayTeam : homeTeam;
      }),
      homeRoad: ["Home", "Road"],
      crewChiefs: [],
      whistlingOfficials: [],
      infractionTypes: [],
    },
    grouped: {
      byOpponent: [],
      byInfractionType: [],
      byCrewChief: [],
      byWhistle: [],
    },
  };
}

export async function fetchPgrSmartInsightsRows({ season = "2025-26" } = {}) {
  const importsResult = await selectPreferredTable("nba_pgr_import_rollups_cache", "nba_pgr_import_rollups", (query) => query
    .select("*")
    .eq("season", season)
    .order("game_date", { ascending: false })
    .limit(100));
  const contextResult = await fetchPgrContextRows(season, importsResult.data);
  const rows = contextResult.rows;
  return {
    unavailable: importsResult.unavailable || contextResult.unavailable,
    evaluations: rows,
    filterOptions: {
      opponents: uniqueValues(rows, (row) => row.opponent),
      homeRoad: uniqueValues(rows, (row) => row.homeRoad),
      crewChiefs: uniqueValues(rows, (row) => row.crewChiefName),
      whistlingOfficials: uniqueValues(rows, (row) => row.whistlingOfficialName),
      infractionTypes: uniqueValues(rows, (row) => row.infractionType),
    },
    grouped: {
      byOpponent: groupRows(rows, (row) => row.opponent),
      byInfractionType: groupRows(rows, (row) => row.infractionType),
      byCrewChief: groupRows(rows, (row) => row.crewChiefName),
      byWhistle: groupRows(rows, (row) => row.whistlingOfficialName),
    },
  };
}

function normalizeSmartInsightBucket(bucket = {}) {
  const total = Number(bucket.total) || 0;
  const correctCalls = Number(bucket.correctCalls) || 0;
  const incorrectCalls = Number(bucket.incorrectCalls) || 0;
  const correctNonCalls = Number(bucket.correctNonCalls) || 0;
  const incorrectNonCalls = Number(bucket.incorrectNonCalls) || 0;
  return {
    total,
    correctCalls,
    incorrectCalls,
    correctNonCalls,
    incorrectNonCalls,
    calledNoInfraction: Number(bucket.calledNoInfraction) || 0,
    calledAssessmentError: Number(bucket.calledAssessmentError) || 0,
    missedInfractions: Number(bucket.missedInfractions) || 0,
    missedPotentialInfractions: Number(bucket.missedPotentialInfractions) || 0,
    accuracy: Number(bucket.accuracy) || safeRate(correctCalls + correctNonCalls, total),
  };
}

function normalizeSmartInsightGroups(groups = {}) {
  return Object.fromEntries(["topInfractionTypes", "topOpponents", "topCrewChiefs", "topWhistles"].map((key) => [
    key,
    asArray(groups[key]).map((row) => ({
      ...normalizeSmartInsightBucket(row),
      label: String(row?.label || "Unknown"),
    })),
  ]));
}

export async function fetchPgrSmartInsightsReport({ season = "2025-26", filters = {} } = {}) {
  if (!supabase) return { unavailable: true };
  const { data, error } = await supabase.rpc("nba_pgr_smart_insights", {
    filters: {
      season,
      previous_games: filters.previousGames || "",
      start_date: filters.startDate || "",
      end_date: filters.endDate || "",
      opponent: filters.opponent || "",
      home_road: filters.homeRoad || "",
      crew_chief: filters.crewChief || "",
      whistling_official: filters.whistlingOfficial || "",
    },
  });
  if (error) throw error;
  const accuracy = data?.accuracy || {};
  return {
    unavailable: false,
    totalFiltered: Number(data?.totalFiltered) || 0,
    accuracy: {
      all: normalizeSmartInsightBucket(accuracy.all),
      wizardsFor: normalizeSmartInsightBucket(accuracy.wizards_for || accuracy.wizardsFor),
      wizardsAgainst: normalizeSmartInsightBucket(accuracy.wizards_against || accuracy.wizardsAgainst),
    },
    groups: normalizeSmartInsightGroups(data?.groups || {}),
    filterOptions: {
      opponents: asArray(data?.filterOptions?.opponents),
      homeRoad: asArray(data?.filterOptions?.homeRoad),
      crewChiefs: asArray(data?.filterOptions?.crewChiefs),
      whistlingOfficials: asArray(data?.filterOptions?.whistlingOfficials),
      infractionTypes: asArray(data?.filterOptions?.infractionTypes),
    },
  };
}
