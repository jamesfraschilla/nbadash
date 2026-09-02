import { fetchGamesMetadataByIds } from "./api.js";
import { supabase } from "./supabaseClient.js";

const WIZARDS_TEAM_ID = "1610612764";
const WIZARDS_TRICODE = "WAS";
const INCORRECT_CALL_CODES = ["NI", "BCA", "WPA", "SFA", "PFA", "TTFE"];
const ASSESSMENT_ERROR_CODES = ["BCA", "WPA", "SFA", "PFA", "TTFE"];
const POTENTIAL_INFRACTION_CODES = ["PI", "PII"];
const PGR_IMPORT_ROLLUP_COLUMNS = "id,season,game_id,game_date,home_team,away_team,filename,file_hash,worksheet_name,status,row_count,possession_count,event_count,warnings,errors,imported_at,infractions,judgment_calls,calls,no_calls,infraction_rate,call_rate";
const PGR_OVERVIEW_ROLLUP_COLUMNS = "season,games,evaluations,events,possessions,infractions,judgment_calls,calls,no_calls,infraction_rate,call_rate";
const PGR_ACCURACY_ROLLUP_COLUMNS = "season,scope,evaluations,calls,no_calls,called_no_infraction,called_assessment_error,missed_infractions,missed_potential_infractions";

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

export async function fetchPgrInsightsData({ season = "2025-26" } = {}) {
  const [overviewResult, importsResult, accuracyResult, filterOptionsResult] = await Promise.all([
    selectPreferredTable("nba_pgr_overview_rollups_cache", "nba_pgr_overview_rollups", (query) => query.select(PGR_OVERVIEW_ROLLUP_COLUMNS).eq("season", season).limit(1)),
    selectPreferredTable("nba_pgr_import_rollups_cache", "nba_pgr_import_rollups", (query) => query.select(PGR_IMPORT_ROLLUP_COLUMNS).eq("season", season).order("game_date", { ascending: false }).limit(100)),
    safeSelectTable("nba_pgr_accuracy_rollups_cache", (query) => query.select(PGR_ACCURACY_ROLLUP_COLUMNS).eq("season", season)),
    fetchPgrSmartInsightsFilterOptions({ season }).catch(() => ({ unavailable: true })),
  ]);

  const overviewRow = overviewResult.data[0] || {};
  const imports = importsResult.data;
  const filterOptions = filterOptionsResult.unavailable ? null : filterOptionsResult.filterOptions;
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
      opponents: filterOptions?.opponents || uniqueValues(imports, (row) => {
        const homeTeam = normalizeTeam(row.home_team);
        const awayTeam = normalizeTeam(row.away_team);
        return homeTeam === WIZARDS_TRICODE ? awayTeam : homeTeam;
      }),
      homeRoad: filterOptions?.homeRoad || ["Home", "Road"],
      crewChiefs: filterOptions?.crewChiefs || [],
      whistlingOfficials: filterOptions?.whistlingOfficials || [],
      infractionTypes: filterOptions?.infractionTypes || [],
    },
    grouped: {
      byOpponent: [],
      byInfractionType: [],
      byCrewChief: [],
      byWhistle: [],
    },
  };
}

export async function fetchPgrSmartInsightsFilterOptions({ season = "2025-26" } = {}) {
  if (!supabase) return { unavailable: true, filterOptions: {} };
  const { data, error } = await supabase.rpc("nba_pgr_smart_filter_options", { p_season: season });
  if (error) return { unavailable: true, filterOptions: {} };
  return {
    unavailable: false,
    filterOptions: {
      opponents: asArray(data?.opponents),
      homeRoad: asArray(data?.homeRoad),
      crewChiefs: asArray(data?.crewChiefs),
      whistlingOfficials: asArray(data?.whistlingOfficials),
      infractionTypes: asArray(data?.infractionTypes),
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
