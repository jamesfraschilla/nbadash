import { supabase } from "./supabaseClient.js";
import { CALL_CATEGORY_GROUPS, isCountedTechnicalEvent, normalizeOfficialCallCategory } from "./officiatingCategoryNormalization.js";

const DEFAULT_SEASON = "2025-26";
const CUMULATIVE_SEASON = "2024-Present";
const CUMULATIVE_SEASONS = ["2024-25", "2025-26", "2026-27"];
const SUPABASE_PAGE_SIZE = 1000;
const CALL_EVENT_LIMIT = 10000;
const CHALLENGE_LIMIT = 10000;
const ASSIGNMENT_LIMIT = 10000;
const PROFILE_LIMIT = 500;
const PROFILE_DETAIL_LIMIT = 10000;
const CONTEXT_TAG_PAGE_SIZE = 100;
const EXCLUDED_STAT_SEASON_TYPES = new Set(["preseason"]);
const CONTEXT_TAG_COLUMNS = "id,label";
const PROFILE_ROLLUP_COLUMNS = "season,id,official_id,name,jersey_number,games,calls,calls_per_game,fouls,fouls_per_game,violations,violations_per_game,technicals,challenges,successful_challenges,whistle_challenges,successful_whistle_challenges,whistle_challenge_rate,crew_chief_challenges,successful_crew_chief_challenges,crew_chief_challenge_rate,crew_challenges,successful_crew_challenges,crew_challenge_rate";
const TEAM_ROLLUP_COLUMNS = "season,team,team_id,games,calls_against,calls_for,net_calls_for,challenges,successful_challenges,challenge_rate";
const OVERVIEW_ROLLUP_COLUMNS = "season,call_events,challenges,successful_challenges,challenge_rate,officials,teams";
const TEAM_OFFICIAL_NET_COLUMNS = "season,team,official_key,official_id,official_name,net_calls_for,net_calls_for_per_game,games";
const CATEGORY_ROLLUP_COLUMNS = "season,official_id,official_name,team,category,calls,calls_per_game,category_rank";
const ASSIGNMENT_COLUMNS = "season,season_type,game_id,game_date,home_team,away_team,official_id,official_name,jersey_number,role_key,assignment_order,is_alternate";
const CHALLENGE_COLUMNS = "id,season,season_type,game_id,game_date,round,series,home_team,away_team,challenging_team,period,game_clock,challenge_type,initial_call,call_ruling,ruling_outcome,challenge_outcome,video_url,crew_chief_id,crew_chief_name,whistling_official_id,whistling_official_name,matched_action_number,matched_call_event_id,match_confidence,match_reason,challenge_sub_type,review_status,source";
const CALL_EVENT_COLUMNS = "id,season,season_type,game_id,game_date,home_team,away_team,period,game_clock,action_number,order_number,action_type,sub_type,descriptor,description,official_token,official_id,official_name,team_id,team_tricode,player_id,player_name,primary_category,secondary_category,charged_team,benefiting_team,confidence,confidence_reason,area,area_detail";
const OFFICIAL_REPORT_CATEGORY_DEFINITIONS = [
  ["Offensive 3 Second Violation", "Defensive 3 Second Violation"],
];
const NBA_TEAM_ID_BY_TRICODE = {
  ATL: "1610612737",
  BOS: "1610612738",
  BKN: "1610612751",
  CHA: "1610612766",
  CHI: "1610612741",
  CLE: "1610612739",
  DAL: "1610612742",
  DEN: "1610612743",
  DET: "1610612765",
  GSW: "1610612744",
  HOU: "1610612745",
  IND: "1610612754",
  LAC: "1610612746",
  LAL: "1610612747",
  MEM: "1610612763",
  MIA: "1610612748",
  MIL: "1610612749",
  MIN: "1610612750",
  NOP: "1610612740",
  NYK: "1610612752",
  OKC: "1610612760",
  ORL: "1610612753",
  PHI: "1610612755",
  PHX: "1610612756",
  POR: "1610612757",
  SAC: "1610612758",
  SAS: "1610612759",
  TOR: "1610612761",
  UTA: "1610612762",
  WAS: "1610612764",
};
const NBA_TEAM_CODES = Object.keys(NBA_TEAM_ID_BY_TRICODE);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percentileFromRank(rank, populationSize) {
  const numericRank = Number(rank) || 0;
  const total = Number(populationSize) || 0;
  if (!numericRank || total <= 1) return null;
  return Math.max(1, Math.min(100, Math.round(((total - numericRank) / (total - 1)) * 99 + 1)));
}

function seasonValues(season) {
  return season === CUMULATIVE_SEASON ? CUMULATIVE_SEASONS : [season || DEFAULT_SEASON];
}

function applySeasonFilter(query, season) {
  const values = seasonValues(season);
  return values.length === 1 ? query.eq("season", values[0]) : query.in("season", values);
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isIncludedStatEvent(row) {
  return !EXCLUDED_STAT_SEASON_TYPES.has(normalizeStatus(row?.season_type || row?.seasonType));
}

export function specificCallCategory(event) {
  return normalizeOfficialCallCategory(event);
}

function teamIdForTricode(team) {
  return NBA_TEAM_ID_BY_TRICODE[String(team || "").trim().toUpperCase()] || "";
}

function emptyTeamNetMap() {
  return Object.fromEntries(NBA_TEAM_CODES.map((team) => [team, 0]));
}

function addMapValue(map, key, delta) {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) return;
  map[cleanKey] = (Number(map[cleanKey]) || 0) + delta;
}

function formatRankedCategoryMap(categoryTotals, games) {
  return Object.fromEntries(Object.entries(categoryTotals || {}).map(([category, count]) => [
    category,
    { value: safeRate(Number(count) || 0, games), rank: null, percentile: null },
  ]));
}

function categoryRollupsToMap(rows) {
  return Object.fromEntries(asArray(rows).map((row) => [
    String(row.category || "Unknown").trim(),
    {
      value: Number(row.calls_per_game) || 0,
      rank: null,
      percentile: null,
    },
  ]));
}

function officialTeamNetRollupsToTeamMap(rows) {
  const map = emptyTeamNetMap();
  asArray(rows).forEach((row) => {
    const team = String(row.team || "").trim();
    if (!team) return;
    map[team] = Number(row.net_calls_for_per_game) || 0;
  });
  return map;
}

function teamOfficialNetRollupsToOfficialMap(rows) {
  return Object.fromEntries(asArray(rows)
    .filter((row) => String(row.official_name || row.official_key || "").trim())
    .map((row) => [
      String(row.official_name || row.official_key).trim(),
      Number(row.net_calls_for_per_game) || 0,
    ]));
}

function aggregateOfficialTeamNetRollupsToTeamMap(rows) {
  const totals = new Map(NBA_TEAM_CODES.map((team) => [team, { net: 0, games: 0 }]));
  asArray(rows).forEach((row) => {
    const team = String(row.team || "").trim();
    if (!team) return;
    if (!totals.has(team)) totals.set(team, { net: 0, games: 0 });
    const total = totals.get(team);
    total.net += Number(row.net_calls_for) || 0;
    total.games += Number(row.games) || 0;
  });
  return Object.fromEntries([...totals.entries()].map(([team, total]) => [team, safeRate(total.net, total.games)]));
}

function aggregateTeamOfficialNetRollupsToOfficialMap(rows) {
  const totals = new Map();
  asArray(rows).forEach((row) => {
    const official = String(row.official_name || row.official_key || "").trim();
    if (!official) return;
    if (!totals.has(official)) totals.set(official, { net: 0, games: 0 });
    const total = totals.get(official);
    total.net += Number(row.net_calls_for) || 0;
    total.games += Number(row.games) || 0;
  });
  return Object.fromEntries([...totals.entries()].map(([official, total]) => [official, safeRate(total.net, total.games)]));
}

function aggregateCategoryRollupsToMap(rows, denominator) {
  const totals = new Map();
  asArray(rows).forEach((row) => {
    const category = String(row.category || "Unknown").trim();
    if (!totals.has(category)) totals.set(category, { calls: 0 });
    const total = totals.get(category);
    total.calls += Number(row.calls) || 0;
  });
  return Object.fromEntries([...totals.entries()].map(([category, total]) => [
    category,
    {
      value: safeRate(total.calls, denominator),
      rank: null,
      percentile: null,
    },
  ]));
}

function officialRollupKey(row) {
  return String(row.official_id || row.id || row.name || row.official_name || "Unknown").trim();
}

function officialCategoryRollupKey(row) {
  return String(row.official_id || row.official_name || "Unknown").trim();
}

function normalizedEntityKey(value) {
  return String(value || "").trim().toLowerCase();
}

function officialProfileCanonicalKey(row) {
  return normalizedEntityKey(row.official_id || row.id || row.name || row.official_name || "Unknown");
}

function officialAliasCandidates(row) {
  return [
    row.official_id,
    row.id,
    row.name,
    row.official_name,
  ].map(normalizedEntityKey).filter(Boolean);
}

function buildOfficialAliasMap(profileRows) {
  const aliasToCanonical = new Map();
  asArray(profileRows).forEach((row) => {
    const canonical = officialProfileCanonicalKey(row);
    if (!canonical) return;
    officialAliasCandidates(row).forEach((alias) => {
      aliasToCanonical.set(alias, canonical);
    });
  });
  return aliasToCanonical;
}

function canonicalOfficialCategoryKey(row, aliasToCanonical) {
  const candidates = [
    row.official_id,
    row.official_name,
    row.id,
    row.name,
  ].map(normalizedEntityKey).filter(Boolean);
  return candidates.map((candidate) => aliasToCanonical.get(candidate)).find(Boolean) || candidates[0] || "unknown";
}

function categoryRankGroupKey(labels = []) {
  return [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function displayCategoryRankDefinitions() {
  const definitions = new Map();
  const addDefinition = (labels = []) => {
    const normalizedLabels = [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))];
    const key = categoryRankGroupKey(normalizedLabels);
    if (key) definitions.set(key, normalizedLabels);
    normalizedLabels.forEach((label) => {
      definitions.set(label, [label]);
    });
  };
  CALL_CATEGORY_GROUPS.forEach((group) => {
    addDefinition(group.types.flatMap((type) => type.labels || []));
    group.types.forEach((type) => {
      addDefinition(type.labels);
      (type.subTypes || []).forEach((subType) => addDefinition(subType.labels));
    });
  });
  OFFICIAL_REPORT_CATEGORY_DEFINITIONS.forEach(addDefinition);
  return [...definitions.entries()].map(([key, labels]) => ({ key, labels }));
}

export function attachDisplayCategoryMetrics(categoryMapsByEntity) {
  const definitions = displayCategoryRankDefinitions();
  if (!definitions.length) return categoryMapsByEntity;
  definitions.forEach((definition) => {
    [...categoryMapsByEntity.entries()]
      .map(([entityKey, categoryMap]) => ({
        entityKey,
        value: definition.labels.reduce((total, label) => total + (Number(categoryMap?.[label]?.value) || 0), 0),
      }))
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value || String(left.entityKey).localeCompare(String(right.entityKey)))
      .forEach((row, index, rows) => {
        const categoryMap = categoryMapsByEntity.get(row.entityKey);
        if (!categoryMap) return;
        if (!categoryMap.__displayRanks) {
          categoryMap.__displayRanks = {};
        }
        if (!categoryMap.__displayPercentiles) {
          categoryMap.__displayPercentiles = {};
        }
        categoryMap.__displayRanks[definition.key] = index + 1;
        const percentile = percentileFromRank(index + 1, rows.length);
        categoryMap.__displayPercentiles[definition.key] = percentile;
        if (definition.labels.length === 1 && categoryMap[definition.labels[0]]) {
          categoryMap[definition.labels[0]].rank = index + 1;
          categoryMap[definition.labels[0]].percentile = percentile;
        }
      });
  });
  return categoryMapsByEntity;
}

function aggregateOfficialCategoryRollups(rows, profileRows) {
  const gamesByKey = new Map();
  const aliasToCanonical = buildOfficialAliasMap(profileRows);
  const profileAliasesByCanonical = new Map();
  asArray(profileRows).forEach((row) => {
    const games = Number(row.games) || 0;
    const canonical = officialProfileCanonicalKey(row);
    if (!canonical) return;
    gamesByKey.set(canonical, games);
    if (!profileAliasesByCanonical.has(canonical)) profileAliasesByCanonical.set(canonical, new Set());
    officialAliasCandidates(row).forEach((alias) => {
      profileAliasesByCanonical.get(canonical).add(alias);
      gamesByKey.set(alias, games);
    });
  });

  const totals = new Map();
  asArray(rows).forEach((row) => {
    const officialKey = canonicalOfficialCategoryKey(row, aliasToCanonical);
    const category = String(row.category || "Unknown").trim();
    if (!officialKey || !category) return;
    const key = `${officialKey}|${category}`;
    if (!totals.has(key)) {
      const aliases = new Set(profileAliasesByCanonical.get(officialKey) || []);
      [
        row.official_id,
        row.official_name,
        row.id,
        row.name,
      ].map(normalizedEntityKey).filter(Boolean).forEach((alias) => aliases.add(alias));
      totals.set(key, {
        officialKey,
        aliases: [...aliases],
        category,
        calls: 0,
        games: gamesByKey.get(officialKey) || 0,
      });
    }
    totals.get(key).calls += Number(row.calls) || 0;
  });

  const byOfficial = new Map();
  [...totals.values()].forEach((row) => {
    row.value = safeRate(row.calls, row.games);
    if (!byOfficial.has(row.officialKey)) byOfficial.set(row.officialKey, {});
    byOfficial.get(row.officialKey)[row.category] = { value: row.value, rank: null, percentile: null };
  });

  const categories = new Set([...totals.values()].map((row) => row.category));
  categories.forEach((category) => {
    [...totals.values()]
      .filter((row) => row.category === category)
      .sort((left, right) => right.value - left.value)
      .forEach((row, index, rows) => {
        const map = byOfficial.get(row.officialKey);
        if (map?.[category]) {
          map[category].rank = index + 1;
          map[category].percentile = percentileFromRank(index + 1, rows.length);
        }
      });
  });
  attachDisplayCategoryMetrics(byOfficial);

  [...totals.values()].forEach((row) => {
    const source = byOfficial.get(row.officialKey);
    if (!source) return;
    row.aliases.forEach((alias) => {
      if (!byOfficial.has(alias)) byOfficial.set(alias, source);
    });
  });

  return byOfficial;
}

function teamCategoryRollupsToMaps(rows, teamRows) {
  const gamesByTeam = new Map();
  asArray(teamRows).forEach((row) => {
    const team = String(row.team || "").trim();
    if (team) gamesByTeam.set(team.toLowerCase(), Number(row.games) || 0);
  });

  const totals = new Map();
  asArray(rows).forEach((row) => {
    const team = String(row.team || "").trim();
    const category = String(row.category || "Unknown").trim();
    if (!team || !category) return;
    const key = `${team.toLowerCase()}|${category}`;
    if (!totals.has(key)) {
      totals.set(key, {
        team,
        category,
        calls: 0,
        games: gamesByTeam.get(team.toLowerCase()) || 0,
      });
    }
    totals.get(key).calls += Number(row.calls) || 0;
  });

  const byTeam = new Map();
  [...totals.values()].forEach((row) => {
    row.value = safeRate(row.calls, row.games);
    const teamKey = row.team.toLowerCase();
    if (!byTeam.has(teamKey)) byTeam.set(teamKey, {});
    byTeam.get(teamKey)[row.category] = { value: row.value, rank: null, percentile: null };
  });

  const categories = new Set([...totals.values()].map((row) => row.category));
  categories.forEach((category) => {
    [...totals.values()]
      .filter((row) => row.category === category)
      .sort((left, right) => right.value - left.value)
      .forEach((row, index, rows) => {
        const map = byTeam.get(row.team.toLowerCase());
        if (map?.[category]) {
          map[category].rank = index + 1;
          map[category].percentile = percentileFromRank(index + 1, rows.length);
        }
      });
  });
  return attachDisplayCategoryMetrics(byTeam);
}

function hasCategoryMapRows(map) {
  return Object.keys(map || {}).length > 0;
}

function categoriesPerGameFromTotals(categoryTotals, games, existingCategories = {}) {
  const denominator = Number(games) || 0;
  return Object.fromEntries(Object.entries(categoryTotals || {}).map(([category, count]) => [
    category,
    {
      value: safeRate(Number(count) || 0, denominator),
      rank: existingCategories?.[category]?.rank || null,
      percentile: existingCategories?.[category]?.percentile || null,
    },
  ]));
}

function mergeCategoryValuesWithRanks(valueMap = {}, rankMap = {}) {
  const merged = {};
  const keys = new Set([
    ...Object.keys(valueMap || {}),
    ...Object.keys(rankMap || {}),
  ]);
  keys.forEach((key) => {
    const valueRow = valueMap?.[key];
    const rankRow = rankMap?.[key];
    const value = typeof valueRow === "object" && valueRow !== null ? Number(valueRow.value) || 0 : Number(valueRow) || 0;
    const rank = typeof rankRow === "object" && rankRow !== null ? Number(rankRow.rank) || null : null;
    const percentile = typeof rankRow === "object" && rankRow !== null ? Number(rankRow.percentile) || null : null;
    merged[key] = { value, rank, percentile };
  });
  return merged;
}

function withContextTagFields(row, tags = []) {
  return {
    ...row,
    context_tags: tags,
    contextTags: tags,
  };
}

async function fetchChallengeContextRows(challengeIds = []) {
  const ids = [...new Set(asArray(challengeIds).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!supabase || !ids.length) return [];
  const rows = [];
  for (let index = 0; index < ids.length; index += CONTEXT_TAG_PAGE_SIZE) {
    const chunk = ids.slice(index, index + CONTEXT_TAG_PAGE_SIZE);
    const { data, error } = await supabase
      .from("nba_challenge_context_event_tags")
      .select("challenge_event_id, tag_id")
      .in("challenge_event_id", chunk);
    if (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
    rows.push(...asArray(data));
  }
  return rows;
}

async function attachChallengeContextTags(rows) {
  const challengeRows = asArray(rows);
  if (!supabase || !challengeRows.length) return challengeRows.map((row) => withContextTagFields(row, []));
  const [tagsResult, eventTagRows] = await Promise.all([
    selectTable("nba_challenge_context_tags", (query) => query.select(CONTEXT_TAG_COLUMNS).order("label", { ascending: true }), { maxRows: 500 })
      .catch(() => ({ data: [], unavailable: true })),
    fetchChallengeContextRows(challengeRows.map((row) => row.id)).catch(() => []),
  ]);
  const tagById = new Map(asArray(tagsResult.data).map((tag) => [String(tag.id), tag]));
  const labelsByEventId = new Map();
  eventTagRows.forEach((row) => {
    const eventId = String(row.challenge_event_id || "").trim();
    const tag = tagById.get(String(row.tag_id || ""));
    if (!eventId || !tag) return;
    if (!labelsByEventId.has(eventId)) labelsByEventId.set(eventId, []);
    labelsByEventId.get(eventId).push({ id: tag.id, label: tag.label });
  });
  labelsByEventId.forEach((labels) => {
    labels.sort((left, right) => String(left.label).localeCompare(String(right.label)));
  });
  return challengeRows.map((row) => withContextTagFields(row, labelsByEventId.get(String(row.id)) || []));
}

function clockSeconds(value) {
  const text = String(value || "").trim();
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(text);
  if (iso) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  const mmss = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  return NaN;
}

function normalizedClockKey(value) {
  const seconds = clockSeconds(value);
  return Number.isFinite(seconds) ? String(Math.round(seconds * 10) / 10) : String(value || "").trim();
}

function challengeIdentity(event) {
  return [
    String(event.game_id || "").trim(),
    String(event.challenging_team || "").trim(),
    String(event.period ?? "").trim(),
    normalizedClockKey(event.game_clock),
  ].join("|");
}

function challengeSourceRank(event) {
  if (event.source === "nba_official_challenge_pdf") return 3;
  if (event.source === "play_by_play") return 2;
  return 1;
}

export function preferAuthoritativeChallengeEvents(challengeEvents) {
  const byIdentity = new Map();
  asArray(challengeEvents).forEach((event) => {
    const identity = challengeIdentity(event);
    const existing = byIdentity.get(identity);
    if (!existing || challengeSourceRank(event) > challengeSourceRank(existing)) {
      byIdentity.set(identity, event);
    }
  });
  return [...byIdentity.values()].sort((left, right) => {
    const dateCompare = String(right.game_date || "").localeCompare(String(left.game_date || ""));
    if (dateCompare !== 0) return dateCompare;
    const gameCompare = String(right.game_id || "").localeCompare(String(left.game_id || ""));
    if (gameCompare !== 0) return gameCompare;
    return (Number(right.period) || 0) - (Number(left.period) || 0);
  });
}

function isMissingTableError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
}

function isTransientQueryError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "57014" || message.includes("statement timeout") || message.includes("canceling statement");
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function selectTable(table, queryBuilder, { maxRows = SUPABASE_PAGE_SIZE } = {}) {
  if (!supabase) return { data: [], unavailable: true };
  const rows = [];
  for (let from = 0; from < maxRows; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, maxRows - 1);
    let data = null;
    let error = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const query = queryBuilder(supabase.from(table)).range(from, to);
      ({ data, error } = await query);
      if (!error || !isTransientQueryError(error) || attempt === 1) break;
      await delay(350);
    }
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

async function selectPreferredTable(preferredTable, fallbackTable, queryBuilder, options = {}) {
  const { allowFallback = false, ...selectOptions } = options;
  const preferredResult = await selectTable(preferredTable, queryBuilder, selectOptions);
  if (!preferredResult.unavailable) return preferredResult;
  if (!allowFallback) return preferredResult;
  return selectTable(fallbackTable, queryBuilder, selectOptions);
}

function getOfficialKey(row) {
  return String(row.official_id || row.official_name || row.crew_chief_name || row.whistling_official_name || "Unknown").trim();
}

function getTeamLabel(row) {
  return String(row.team_tricode || row.challenging_team || row.charged_team || row.benefiting_team || "Unknown").trim();
}

function toOfficialProfileFromRollup(row) {
  const games = Number(row.games) || 0;
  const fouls = Number(row.fouls) || 0;
  const violations = Number(row.violations) || 0;
  return {
    id: String(row.id || row.official_id || row.name || "Unknown").trim(),
    officialId: String(row.official_id || "").trim(),
    name: String(row.name || row.official_name || row.id || "Unknown").trim(),
    jerseyNumber: String(row.jersey_number || "").trim(),
    games,
    calls: Number(row.calls) || 0,
    callsPerGame: Number(row.calls_per_game) || 0,
    fouls,
    foulsPerGame: Number(row.fouls_per_game) || safeRate(fouls, games),
    violations,
    violationsPerGame: Number(row.violations_per_game) || safeRate(violations, games),
    technicals: Number(row.technicals) || 0,
    challenges: Number(row.challenges) || 0,
    successfulChallenges: Number(row.successful_challenges) || 0,
    challengeRate: safeRate(Number(row.successful_challenges) || 0, Number(row.challenges) || 0),
    whistleChallenges: Number(row.whistle_challenges) || 0,
    successfulWhistleChallenges: Number(row.successful_whistle_challenges) || 0,
    whistleChallengeRate: Number(row.whistle_challenge_rate) || 0,
    crewChiefChallenges: Number(row.crew_chief_challenges) || 0,
    successfulCrewChiefChallenges: Number(row.successful_crew_chief_challenges) || 0,
    crewChiefChallengeRate: Number(row.crew_chief_challenge_rate) || 0,
    crewChallenges: Number(row.crew_challenges) || 0,
    successfulCrewChallenges: Number(row.successful_crew_challenges) || 0,
    crewChallengeRate: Number(row.crew_challenge_rate) || 0,
    callsByTeam: {},
    callsByCategory: {},
    schedule: [],
    recentCalls: [],
    challengeLog: [],
  };
}

function toTeamProfileFromRollup(row) {
  const team = String(row.team || "Unknown").trim();
  const callsAgainst = Number(row.calls_against) || 0;
  const callsFor = Number(row.calls_for) || 0;
  const games = Number(row.games) || 0;
  return {
    team,
    teamId: String(row.team_id || teamIdForTricode(team)),
    games,
    callsAgainst,
    callsFor,
    netCallsFor: Number(row.net_calls_for) || safeRate(callsFor - callsAgainst, games),
    challenges: Number(row.challenges) || 0,
    successfulChallenges: Number(row.successful_challenges) || 0,
    challengeRate: Number(row.challenge_rate) || 0,
    callsByOfficial: {},
    callsByCategory: {},
    challengeLog: [],
    recentCalls: [],
  };
}

function aggregateOfficialRollups(rows) {
  const byOfficial = new Map();
  asArray(rows).forEach((row) => {
    const key = officialRollupKey(row);
    if (!key) return;
    if (!byOfficial.has(key)) {
      byOfficial.set(key, {
        id: key,
        official_id: String(row.official_id || "").trim(),
        name: String(row.name || row.official_name || key).trim(),
        jersey_number: String(row.jersey_number || "").trim(),
        games: 0,
        calls: 0,
        fouls: 0,
        violations: 0,
        technicals: 0,
        challenges: 0,
        successful_challenges: 0,
        whistle_challenges: 0,
        successful_whistle_challenges: 0,
        crew_chief_challenges: 0,
        successful_crew_chief_challenges: 0,
        crew_challenges: 0,
        successful_crew_challenges: 0,
      });
    }
    const target = byOfficial.get(key);
    target.official_id = target.official_id || String(row.official_id || "").trim();
    target.name = String(row.name || row.official_name || target.name || key).trim();
    target.jersey_number = target.jersey_number || String(row.jersey_number || "").trim();
    target.games += Number(row.games) || 0;
    target.calls += Number(row.calls) || 0;
    target.fouls += Number(row.fouls) || 0;
    target.violations += Number(row.violations) || 0;
    target.technicals += Number(row.technicals) || 0;
    target.challenges += Number(row.challenges) || 0;
    target.successful_challenges += Number(row.successful_challenges) || 0;
    target.whistle_challenges += Number(row.whistle_challenges) || 0;
    target.successful_whistle_challenges += Number(row.successful_whistle_challenges) || 0;
    target.crew_chief_challenges += Number(row.crew_chief_challenges) || 0;
    target.successful_crew_chief_challenges += Number(row.successful_crew_chief_challenges) || 0;
    target.crew_challenges += Number(row.crew_challenges) || 0;
    target.successful_crew_challenges += Number(row.successful_crew_challenges) || 0;
  });
  return [...byOfficial.values()].map((row) => ({
    ...row,
    calls_per_game: safeRate(row.calls, row.games),
    fouls_per_game: safeRate(row.fouls, row.games),
    violations_per_game: safeRate(row.violations, row.games),
    whistle_challenge_rate: safeRate(row.successful_whistle_challenges, row.whistle_challenges),
    crew_chief_challenge_rate: safeRate(row.successful_crew_chief_challenges, row.crew_chief_challenges),
    crew_challenge_rate: safeRate(row.successful_crew_challenges, row.crew_challenges),
  }));
}

function aggregateTeamRollups(rows) {
  const byTeam = new Map();
  asArray(rows).forEach((row) => {
    const team = String(row.team || "Unknown").trim();
    if (!team) return;
    if (!byTeam.has(team)) {
      byTeam.set(team, {
        team,
        team_id: String(row.team_id || teamIdForTricode(team)),
        games: 0,
        calls_against: 0,
        calls_for: 0,
        challenges: 0,
        successful_challenges: 0,
      });
    }
    const target = byTeam.get(team);
    target.team_id = target.team_id || String(row.team_id || teamIdForTricode(team));
    target.games += Number(row.games) || 0;
    target.calls_against += Number(row.calls_against) || 0;
    target.calls_for += Number(row.calls_for) || 0;
    target.challenges += Number(row.challenges) || 0;
    target.successful_challenges += Number(row.successful_challenges) || 0;
  });
  return [...byTeam.values()].map((row) => ({
    ...row,
    net_calls_for: safeRate(row.calls_for - row.calls_against, row.games),
    challenge_rate: safeRate(row.successful_challenges, row.challenges),
  }));
}

function aggregateOverviewRollups(rows, officialRows = [], teamRows = []) {
  const totals = asArray(rows).reduce((acc, row) => ({
    call_events: acc.call_events + (Number(row.call_events) || 0),
    challenges: acc.challenges + (Number(row.challenges) || 0),
    successful_challenges: acc.successful_challenges + (Number(row.successful_challenges) || 0),
  }), { call_events: 0, challenges: 0, successful_challenges: 0 });
  return {
    ...totals,
    challenge_rate: safeRate(totals.successful_challenges, totals.challenges),
    officials: new Set(asArray(officialRows).map((row) => String(row.id || row.official_id || row.name || "").trim()).filter(Boolean)).size,
    teams: new Set(asArray(teamRows).map((row) => String(row.team || "").trim()).filter(Boolean)).size,
  };
}

function mergeProfileDetails(profiles, detailProfiles) {
  const detailById = new Map();
  const detailByName = new Map();
  detailProfiles.forEach((profile) => {
    detailById.set(String(profile.officialId || profile.id || "").trim(), profile);
    detailByName.set(String(profile.name || "").trim().toLowerCase(), profile);
  });

  return profiles.map((profile) => {
    const detail = detailById.get(String(profile.officialId || profile.id || "").trim())
      || detailByName.get(String(profile.name || "").trim().toLowerCase());
    return detail ? {
      ...profile,
      jerseyNumber: profile.jerseyNumber || detail.jerseyNumber,
      callsByTeam: detail.callsByTeam,
      callsByCategory: detail.callsByCategory,
      schedule: detail.schedule,
      recentCalls: detail.recentCalls,
      challengeLog: detail.challengeLog,
    } : profile;
  });
}

function mergeTeamDetails(profiles, detailProfiles) {
  const detailByTeam = new Map(detailProfiles.map((profile) => [String(profile.team || "").trim().toLowerCase(), profile]));
  return profiles.map((profile) => {
    const detail = detailByTeam.get(String(profile.team || "").trim().toLowerCase());
    return detail ? {
      ...profile,
      callsByOfficial: detail.callsByOfficial,
      callsByCategory: detail.callsByCategory,
      challengeLog: detail.challengeLog,
      recentCalls: detail.recentCalls,
    } : profile;
  });
}

function applyOfficialProfileDetails(profile, callEvents, challengeEvents, assignments, categoryRollups = []) {
  const [detail] = buildOfficialProfiles(callEvents, challengeEvents, assignments).filter((row) => (
    String(row.officialId || row.id || "").trim() === String(profile.officialId || profile.id || "").trim()
    || String(row.name || "").trim().toLowerCase() === String(profile.name || "").trim().toLowerCase()
  ));
  if (!detail) return profile;
  return {
    ...profile,
    callsByTeam: detail.callsByTeam,
    callsByCategory: categoryRollups.length ? categoryRollupsToMap(categoryRollups) : detail.callsByCategory,
    schedule: detail.schedule,
    recentCalls: detail.recentCalls,
    challengeLog: detail.challengeLog,
  };
}

function applyTeamProfileDetails(profile, callEvents, challengeEvents, categoryRollups = []) {
  const [detail] = buildTeamProfiles(callEvents, challengeEvents).filter((row) => (
    String(row.team || "").trim().toLowerCase() === String(profile.team || "").trim().toLowerCase()
  ));
  if (!detail) return profile;
  return {
    ...profile,
    callsByOfficial: detail.callsByOfficial,
    callsByCategory: categoryRollups.length
      ? categoryRollupsToMap(categoryRollups)
      : categoriesPerGameFromTotals(detail.callsByCategory, profile.games || detail.games, profile.callsByCategory),
    challengeLog: detail.challengeLog,
    recentCalls: detail.recentCalls,
  };
}

export function buildOfficialProfiles(callEvents, challengeEvents, assignments) {
  const statCallEvents = asArray(callEvents).filter(isIncludedStatEvent);
  const statChallengeEvents = asArray(challengeEvents).filter(isIncludedStatEvent);
  const statAssignments = asArray(assignments).filter(isIncludedStatEvent);
  const profiles = new Map();
  const ensure = (key, seed = {}) => {
    const id = String(key || "Unknown").trim() || "Unknown";
    if (!profiles.has(id)) {
      profiles.set(id, {
        id,
        officialId: String(seed.official_id || seed.officialId || "").trim(),
        name: String(seed.official_name || seed.officialName || seed.crew_chief_name || seed.whistling_official_name || id).trim(),
        jerseyNumber: String(seed.jersey_number || seed.jerseyNumber || "").trim(),
        games: new Set(),
        calls: 0,
        fouls: 0,
        violations: 0,
        technicals: 0,
        challenges: 0,
        successfulChallenges: 0,
        whistleChallenges: 0,
        successfulWhistleChallenges: 0,
        crewChiefChallenges: 0,
        successfulCrewChiefChallenges: 0,
        crewChallenges: 0,
        successfulCrewChallenges: 0,
        callsByTeam: emptyTeamNetMap(),
        teamGames: Object.fromEntries(NBA_TEAM_CODES.map((team) => [team, new Set()])),
        callsByCategory: {},
        schedule: [],
        recentCalls: [],
        challengeLog: [],
      });
    }
    return profiles.get(id);
  };

  statAssignments.filter((assignment) => !assignment.is_alternate).forEach((assignment) => {
    const profile = ensure(getOfficialKey(assignment), assignment);
    if (assignment.game_id) profile.games.add(assignment.game_id);
    [assignment.away_team, assignment.home_team].filter(Boolean).forEach((team) => {
      const teamKey = String(team).trim();
      if (!profile.teamGames[teamKey]) profile.teamGames[teamKey] = new Set();
      profile.teamGames[teamKey].add(assignment.game_id);
    });
    profile.schedule.push(assignment);
  });

  statCallEvents.forEach((event) => {
    const profile = ensure(getOfficialKey(event), event);
    if (event.game_id) profile.games.add(event.game_id);
    profile.calls += 1;
    const category = normalizeStatus(event.primary_category);
    const categoryLabel = specificCallCategory(event);
    if (category === "foul") profile.fouls += 1;
    else if (category === "violation") profile.violations += 1;
    if (isCountedTechnicalEvent(event)) profile.technicals += 1;
    const chargedTeam = String(event.charged_team || event.team_tricode || "").trim();
    const benefitingTeam = String(event.benefiting_team || "").trim();
    addMapValue(profile.callsByTeam, chargedTeam, -1);
    addMapValue(profile.callsByTeam, benefitingTeam, 1);
    [chargedTeam, benefitingTeam, event.away_team, event.home_team].filter(Boolean).forEach((team) => {
      const teamKey = String(team).trim();
      if (!profile.teamGames[teamKey]) profile.teamGames[teamKey] = new Set();
      if (event.game_id) profile.teamGames[teamKey].add(event.game_id);
    });
    profile.callsByCategory[categoryLabel] = (profile.callsByCategory[categoryLabel] || 0) + 1;
    profile.recentCalls.push(event);
  });

  const assignmentsByGame = new Map();
  statAssignments.filter((assignment) => !assignment.is_alternate).forEach((assignment) => {
    const gameId = String(assignment.game_id || "").trim();
    if (!gameId) return;
    if (!assignmentsByGame.has(gameId)) assignmentsByGame.set(gameId, []);
    assignmentsByGame.get(gameId).push(assignment);
  });

  statChallengeEvents.forEach((event) => {
    const successful = normalizeStatus(event.challenge_outcome) === "successful";
    const profileRoles = new Map();
    asArray(assignmentsByGame.get(String(event.game_id || "").trim())).forEach((assignment) => {
      const name = String(assignment.official_name || "").trim();
      if (!name) return;
      const profileKey = String(assignment.official_id || name).trim();
      const profile = ensure(profileKey, assignment);
      if (event.game_id) profile.games.add(event.game_id);
      profile.crewChallenges += 1;
      if (successful) profile.successfulCrewChallenges += 1;
      profileRoles.set(profileKey, "crew");
    });
    [
      ["crew_chief_name", "crew_chief_id", "crewChief"],
      ["whistling_official_name", "whistling_official_id", "whistle"],
    ].forEach(([nameKey, idKey, role]) => {
      const name = String(event[nameKey] || "").trim();
      if (!name) return;
      const profileKey = String(event[idKey] || name).trim();
      const profile = ensure(profileKey, {
        official_id: event[idKey],
        official_name: name,
      });
      if (event.game_id) profile.games.add(event.game_id);
      if (role === "whistle") {
        profile.whistleChallenges += 1;
        if (successful) profile.successfulWhistleChallenges += 1;
      } else {
        profile.crewChiefChallenges += 1;
        if (successful) profile.successfulCrewChiefChallenges += 1;
      }
      const existingRole = profileRoles.get(profileKey);
      profileRoles.set(profileKey, existingRole === "whistle" || role === "whistle" ? "whistle" : role === "crewChief" ? "crewChief" : "crew");
    });
    profileRoles.forEach((role, profileKey) => {
      const profile = profiles.get(profileKey);
      if (!profile) return;
      profile.challenges += 1;
      if (successful) profile.successfulChallenges += 1;
      profile.challengeLog.push({ ...event, profileChallengeRole: role });
    });
  });

  const rows = [...profiles.values()]
    .map((profile) => {
      const games = profile.games.size;
      const callsByTeam = Object.fromEntries(NBA_TEAM_CODES.map((team) => [
        team,
        safeRate(Number(profile.callsByTeam[team]) || 0, profile.teamGames[team]?.size || games),
      ]));
      return {
        ...profile,
        games,
        callsByTeam,
        foulsPerGame: safeRate(profile.fouls, games),
        violationsPerGame: safeRate(profile.violations, games),
        callsByCategory: formatRankedCategoryMap(profile.callsByCategory, games),
        callsPerGame: safeRate(profile.calls, games),
        challengeRate: safeRate(profile.successfulChallenges, profile.challenges),
        whistleChallengeRate: safeRate(profile.successfulWhistleChallenges, profile.whistleChallenges),
        crewChiefChallengeRate: safeRate(profile.successfulCrewChiefChallenges, profile.crewChiefChallenges),
        crewChallengeRate: safeRate(profile.successfulCrewChallenges, profile.crewChallenges),
        schedule: profile.schedule
          .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || ""))),
        recentCalls: profile.recentCalls
          .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
          .slice(0, 20),
        challengeLog: profile.challengeLog
          .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || ""))),
      };
    })
    .sort((a, b) => b.calls - a.calls || b.challenges - a.challenges || a.name.localeCompare(b.name));

  return addCategoryRanks(addRanks(rows, [
    ["callsRank", "calls"],
    ["callsPerGameRank", "callsPerGame"],
    ["foulsPerGameRank", "foulsPerGame"],
    ["violationsPerGameRank", "violationsPerGame"],
    ["challengeRateRank", "challengeRate"],
    ["whistleChallengeRateRank", "whistleChallengeRate"],
    ["crewChiefChallengeRateRank", "crewChiefChallengeRate"],
    ["crewChallengeRateRank", "crewChallengeRate"],
  ]));
}

export function buildTeamProfiles(callEvents, challengeEvents) {
  const statCallEvents = asArray(callEvents).filter(isIncludedStatEvent);
  const statChallengeEvents = asArray(challengeEvents).filter(isIncludedStatEvent);
  const teams = new Map();
  const ensure = (team) => {
    const key = String(team || "Unknown").trim() || "Unknown";
    if (!teams.has(key)) {
      teams.set(key, {
        team: key,
        teamId: teamIdForTricode(key),
        games: new Set(),
        callsAgainst: 0,
        callsFor: 0,
        challenges: 0,
        successfulChallenges: 0,
        callsByOfficial: {},
        officialGames: {},
        callsByCategory: {},
        challengeLog: [],
        recentCalls: [],
      });
    }
    return teams.get(key);
  };

  statCallEvents.forEach((event) => {
    const chargedTeam = String(event.charged_team || event.team_tricode || "").trim();
    const benefitingTeam = String(event.benefiting_team || "").trim();
    if (chargedTeam) ensure(chargedTeam).callsAgainst += 1;
    if (benefitingTeam) ensure(benefitingTeam).callsFor += 1;
    [chargedTeam, benefitingTeam, event.away_team, event.home_team].filter(Boolean).forEach((team) => {
      if (event.game_id) ensure(team).games.add(event.game_id);
    });
    [chargedTeam, benefitingTeam].filter(Boolean).forEach((team) => {
      const profile = ensure(team);
      const official = String(event.official_name || "Unknown").trim();
      const category = specificCallCategory(event);
      addMapValue(profile.callsByOfficial, official, team === chargedTeam ? -1 : 1);
      if (!profile.officialGames[official]) profile.officialGames[official] = new Set();
      if (event.game_id) profile.officialGames[official].add(event.game_id);
      profile.callsByCategory[category] = (profile.callsByCategory[category] || 0) + 1;
      profile.recentCalls.push(event);
    });
  });

  statChallengeEvents.forEach((event) => {
    const team = ensure(event.challenging_team);
    team.challenges += 1;
    if (normalizeStatus(event.challenge_outcome) === "successful") team.successfulChallenges += 1;
    team.challengeLog.push(event);
  });

  const rows = [...teams.values()]
    .map((team) => {
      const games = team.games.size;
      const callsByOfficial = Object.fromEntries(Object.entries(team.callsByOfficial)
        .map(([official, net]) => [official, safeRate(Number(net) || 0, team.officialGames[official]?.size || games)]));
      return {
        ...team,
        games,
        callsByOfficial,
        callsByCategory: formatRankedCategoryMap(team.callsByCategory, games),
        netCallsFor: safeRate(team.callsFor - team.callsAgainst, games),
        challengeRate: safeRate(team.successfulChallenges, team.challenges),
        challengeLog: team.challengeLog
          .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || ""))),
        recentCalls: team.recentCalls
          .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
          .slice(0, 20),
      };
    })
    .sort((a, b) => b.challenges - a.challenges || b.netCallsFor - a.netCallsFor || a.team.localeCompare(b.team));

  return addCategoryRanks(addRanks(rows, [
    ["netCallsForRank", "netCallsFor"],
    ["challengeRateRank", "challengeRate"],
    ["challengesRank", "challenges"],
  ]));
}

function addRanks(rows, fields) {
  fields.forEach(([rankKey, valueKey]) => {
    [...rows]
      .sort((left, right) => Number(right[valueKey] || 0) - Number(left[valueKey] || 0))
      .forEach((row, index) => {
        row[rankKey] = index + 1;
      });
  });
  return rows;
}

function addCategoryRanks(rows) {
  const categories = new Set();
  rows.forEach((row) => {
    Object.keys(row.callsByCategory || {}).forEach((category) => categories.add(category));
  });
  categories.forEach((category) => {
    [...rows]
      .sort((left, right) => Number(right.callsByCategory?.[category]?.value || 0) - Number(left.callsByCategory?.[category]?.value || 0))
      .forEach((row, index, rankedRows) => {
        if (row.callsByCategory?.[category]) {
          row.callsByCategory[category].rank = index + 1;
          row.callsByCategory[category].percentile = percentileFromRank(index + 1, rankedRows.length);
        }
      });
  });
  return rows;
}

export async function fetchOfficialProfileDetails({ season = DEFAULT_SEASON, profile } = {}) {
  const officialId = String(profile?.officialId || profile?.official_id || profile?.id || "").trim();
  const officialName = String(profile?.name || profile?.official_name || "").trim();
  if (!officialId && !officialName) return profile;
  const cumulative = season === CUMULATIVE_SEASON;

  const challengeQuery = (query) => query
    .select(CHALLENGE_COLUMNS)
    .in("season", seasonValues(season))
    .not("season_type", "ilike", "Preseason")
    .order("game_date", { ascending: false });
  const teamNetQuery = (query) => {
    let next = applySeasonFilter(query.select(TEAM_OFFICIAL_NET_COLUMNS), season);
    if (officialId && officialName) {
      next = next.or(`official_key.eq.${officialId},official_id.eq.${officialId},official_name.eq.${officialName}`);
    } else if (officialId) {
      next = next.or(`official_key.eq.${officialId},official_id.eq.${officialId}`);
    } else {
      next = next.eq("official_name", officialName);
    }
    return next.order("team", { ascending: true });
  };
  const assignmentQuery = (query) => {
    let next = applySeasonFilter(query.select(ASSIGNMENT_COLUMNS), season).not("season_type", "ilike", "Preseason");
    if (officialId && officialName) {
      next = next.or(`official_id.eq.${officialId},official_name.eq.${officialName}`);
    } else if (officialId) {
      next = next.eq("official_id", officialId);
    } else {
      next = next.eq("official_name", officialName);
    }
    return next.order("game_date", { ascending: false });
  };
  const callEventQuery = (query) => {
    let next = applySeasonFilter(query.select(CALL_EVENT_COLUMNS), season).not("season_type", "ilike", "Preseason");
    if (officialId && officialName) {
      next = next.or(`official_id.eq.${officialId},official_name.eq.${officialName}`);
    } else if (officialId) {
      next = next.eq("official_id", officialId);
    } else {
      next = next.eq("official_name", officialName);
    }
    return next.order("game_date", { ascending: false });
  };
  const categoryQuery = (query) => {
    let next = applySeasonFilter(query.select(CATEGORY_ROLLUP_COLUMNS), season);
    if (officialId && officialName) {
      next = next.or(`official_id.eq.${officialId},official_name.eq.${officialName}`);
    } else if (officialId) {
      next = next.eq("official_id", officialId);
    } else {
      next = next.eq("official_name", officialName);
    }
    return next.order("calls_per_game", { ascending: false });
  };
  const profileQuery = (query) => applySeasonFilter(query.select(PROFILE_ROLLUP_COLUMNS), season);
  const categoryPopulationQuery = (query) => applySeasonFilter(query.select(CATEGORY_ROLLUP_COLUMNS), season);
  const [profileResult, teamNetResult, challengeEventsResult, assignmentsResult, callEventsResult, categoryRollupsResult, categoryPopulationResult] = await Promise.all([
    selectPreferredTable("nba_official_profiles_cache", "nba_official_profiles", profileQuery, { maxRows: PROFILE_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_team_official_net_call_rollups_cache", "nba_team_official_net_call_rollups", teamNetQuery, { maxRows: 100 })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", challengeQuery, { maxRows: PROFILE_DETAIL_LIMIT }),
    selectTable("nba_official_game_assignments", assignmentQuery, { maxRows: PROFILE_DETAIL_LIMIT }),
    selectTable("nba_official_call_events", callEventQuery, { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_official_call_category_rollups_cache", "nba_official_call_category_rollups", categoryQuery, { maxRows: 200 })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_official_call_category_rollups_cache", "nba_official_call_category_rollups", categoryPopulationQuery, { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
  ]);

  if (challengeEventsResult.unavailable || assignmentsResult.unavailable) return profile;
  const challengeRowsWithTags = await attachChallengeContextTags(preferAuthoritativeChallengeEvents(challengeEventsResult.data));
  const baseProfileRows = profileResult.unavailable
    ? []
    : (cumulative ? aggregateOfficialRollups(profileResult.data) : profileResult.data);
  const categoryPopulation = !categoryPopulationResult.unavailable && categoryPopulationResult.data?.length
    ? aggregateOfficialCategoryRollups(categoryPopulationResult.data, baseProfileRows)
    : new Map();
  const rankedBaseProfiles = addRanks(baseProfileRows.map(toOfficialProfileFromRollup), [
    ["callsRank", "calls"],
    ["callsPerGameRank", "callsPerGame"],
    ["foulsPerGameRank", "foulsPerGame"],
    ["violationsPerGameRank", "violationsPerGame"],
    ["challengeRateRank", "challengeRate"],
    ["whistleChallengeRateRank", "whistleChallengeRate"],
    ["crewChiefChallengeRateRank", "crewChiefChallengeRate"],
    ["crewChallengeRateRank", "crewChallengeRate"],
  ]);
  const baseProfile = rankedBaseProfiles.find((row) => (
    String(row.officialId || row.id || "").trim() === officialId
    || String(row.name || "").trim().toLowerCase() === officialName.toLowerCase()
  )) || profile;
  const detail = applyOfficialProfileDetails(
    baseProfile,
    callEventsResult.unavailable ? [] : callEventsResult.data,
    challengeRowsWithTags,
    assignmentsResult.data,
    []
  );
  const populationCategoryMap = categoryPopulation.get(String(baseProfile.officialId || baseProfile.id || "").trim().toLowerCase())
    || categoryPopulation.get(String(baseProfile.name || "").trim().toLowerCase())
    || {};
  const fallbackCategoryMap = categoryRollupsResult.unavailable || !categoryRollupsResult.data?.length
    ? (hasCategoryMapRows(detail.callsByCategory) ? detail.callsByCategory : profile.callsByCategory)
    : cumulative ? aggregateCategoryRollupsToMap(categoryRollupsResult.data, detail.games) : categoryRollupsToMap(categoryRollupsResult.data);
  return {
    ...detail,
    callsByTeam: teamNetResult.unavailable
      ? detail.callsByTeam
      : cumulative ? aggregateOfficialTeamNetRollupsToTeamMap(teamNetResult.data) : officialTeamNetRollupsToTeamMap(teamNetResult.data),
    callsByCategory: hasCategoryMapRows(populationCategoryMap)
      ? populationCategoryMap
      : fallbackCategoryMap,
  };
}

export async function fetchTeamProfileDetails({ season = DEFAULT_SEASON, profile } = {}) {
  const team = String(profile?.team || "").trim();
  if (!team) return profile;
  const cumulative = season === CUMULATIVE_SEASON;
  const categoryRollupQuery = (query) => applySeasonFilter(query.select(CATEGORY_ROLLUP_COLUMNS), season)
    .eq("team", team)
    .order("calls_per_game", { ascending: false });
  const categoryPopulationQuery = (query) => applySeasonFilter(query.select(CATEGORY_ROLLUP_COLUMNS), season);
  const teamOfficialQuery = (query) => applySeasonFilter(query.select(TEAM_OFFICIAL_NET_COLUMNS), season)
    .eq("team", team)
    .order("net_calls_for_per_game", { ascending: false });
  const callEventQuery = (query) => applySeasonFilter(query.select(CALL_EVENT_COLUMNS), season)
    .not("season_type", "ilike", "Preseason")
    .or(`charged_team.eq.${team},benefiting_team.eq.${team}`)
    .order("game_date", { ascending: false });
  const profileQuery = (query) => applySeasonFilter(query.select(TEAM_ROLLUP_COLUMNS), season);
  const [profileResult, teamOfficialResult, challengeEventsResult, callEventsResult, categoryRollupsResult, categoryPopulationResult] = await Promise.all([
    selectPreferredTable("nba_team_profiles_cache", "nba_team_profiles", profileQuery, { maxRows: PROFILE_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_team_official_net_call_rollups_cache", "nba_team_official_net_call_rollups", teamOfficialQuery, { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", (query) => query
      .select(CHALLENGE_COLUMNS)
      .in("season", seasonValues(season))
      .not("season_type", "ilike", "Preseason")
      .eq("challenging_team", team)
      .order("game_date", { ascending: false }), { maxRows: PROFILE_DETAIL_LIMIT }),
    selectTable("nba_official_call_events", callEventQuery, { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_team_call_category_rollups_cache", "nba_team_call_category_rollups", categoryRollupQuery, { maxRows: 200 })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_team_call_category_rollups_cache", "nba_team_call_category_rollups", categoryPopulationQuery, { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
  ]);

  if (challengeEventsResult.unavailable) return profile;
  const challengeLog = await attachChallengeContextTags(preferAuthoritativeChallengeEvents(challengeEventsResult.data));
  const baseProfileRows = profileResult.unavailable
    ? []
    : (cumulative ? aggregateTeamRollups(profileResult.data) : profileResult.data);
  const categoryPopulation = !categoryPopulationResult.unavailable && categoryPopulationResult.data?.length
    ? teamCategoryRollupsToMaps(categoryPopulationResult.data, baseProfileRows)
    : new Map();
  const rankedBaseProfiles = addRanks(baseProfileRows.map(toTeamProfileFromRollup), [
    ["netCallsForRank", "netCallsFor"],
    ["challengeRateRank", "challengeRate"],
    ["challengesRank", "challenges"],
  ]);
  const baseProfile = rankedBaseProfiles.find((row) => (
    String(row.team || "").trim().toLowerCase() === team.toLowerCase()
  )) || profile;
  const detailProfile = callEventsResult.unavailable
    ? baseProfile
    : applyTeamProfileDetails(baseProfile, callEventsResult.data, [], []);
  const populationCategoryMap = categoryPopulation.get(team.toLowerCase()) || {};
  const fallbackCategoryMap = categoryRollupsResult.unavailable || !categoryRollupsResult.data?.length
    ? (hasCategoryMapRows(baseProfile.callsByCategory) ? baseProfile.callsByCategory : profile.callsByCategory)
    : cumulative ? aggregateCategoryRollupsToMap(categoryRollupsResult.data, baseProfile.games) : categoryRollupsToMap(categoryRollupsResult.data);
  return {
    ...detailProfile,
    callsByOfficial: teamOfficialResult.unavailable
      ? baseProfile.callsByOfficial
      : cumulative ? aggregateTeamOfficialNetRollupsToOfficialMap(teamOfficialResult.data) : teamOfficialNetRollupsToOfficialMap(teamOfficialResult.data),
    callsByCategory: hasCategoryMapRows(populationCategoryMap)
      ? populationCategoryMap
      : fallbackCategoryMap,
    challengeLog,
  };
}

function buildOverview(callEvents, challengeEvents, assignments) {
  const statCallEvents = asArray(callEvents).filter(isIncludedStatEvent);
  const statChallengeEvents = asArray(challengeEvents).filter(isIncludedStatEvent);
  const statAssignments = asArray(assignments).filter(isIncludedStatEvent);
  const successfulChallenges = statChallengeEvents.filter((event) => normalizeStatus(event.challenge_outcome) === "successful").length;
  return {
    callEvents: statCallEvents.length,
    challenges: statChallengeEvents.length,
    successfulChallenges,
    challengeRate: safeRate(successfulChallenges, statChallengeEvents.length),
    officials: new Set(statAssignments.map(getOfficialKey).filter(Boolean)).size,
    teams: new Set([
      ...statCallEvents.map(getTeamLabel),
      ...statChallengeEvents.map((event) => event.challenging_team),
    ].filter(Boolean)).size,
  };
}

export async function fetchOfficiatingDashboardData({ season = DEFAULT_SEASON, includeChallengeLog = false } = {}) {
  const cumulative = season === CUMULATIVE_SEASON;
  const [
    overviewResult,
    officialRollupsResult,
    teamRollupsResult,
    officialCategoryRollupsResult,
    teamCategoryRollupsResult,
  ] = await Promise.all([
    selectPreferredTable("nba_officiating_overview_rollups_cache", "nba_officiating_overview_rollups", (query) => applySeasonFilter(query
      .select(OVERVIEW_ROLLUP_COLUMNS), season), { maxRows: 5 }),
    selectPreferredTable("nba_official_profiles_cache", "nba_official_profiles", (query) => applySeasonFilter(query
      .select(PROFILE_ROLLUP_COLUMNS), season), { maxRows: PROFILE_LIMIT }),
    selectPreferredTable("nba_team_profiles_cache", "nba_team_profiles", (query) => applySeasonFilter(query
      .select(TEAM_ROLLUP_COLUMNS), season), { maxRows: PROFILE_LIMIT }),
    selectPreferredTable("nba_official_call_category_rollups_cache", "nba_official_call_category_rollups", (query) => applySeasonFilter(query
      .select(CATEGORY_ROLLUP_COLUMNS), season), { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_team_call_category_rollups_cache", "nba_team_call_category_rollups", (query) => applySeasonFilter(query
      .select(CATEGORY_ROLLUP_COLUMNS), season), { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
  ]);

  const hasProfileRollups = !officialRollupsResult.unavailable && !teamRollupsResult.unavailable;
  const shouldLoadChallengeEvents = includeChallengeLog || !hasProfileRollups || overviewResult.unavailable;
  const challengeEventsResult = shouldLoadChallengeEvents
    ? await selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", (query) => query
      .select(CHALLENGE_COLUMNS)
      .in("season", seasonValues(season))
      .order("game_date", { ascending: false }), { maxRows: CHALLENGE_LIMIT })
    : { data: [], unavailable: false };

  const challengeEvents = await attachChallengeContextTags(preferAuthoritativeChallengeEvents(challengeEventsResult.data));
  let callEvents = [];
  let assignments = [];
  let detailOfficialProfiles = [];
  let detailTeamProfiles = [];

  if (!hasProfileRollups || overviewResult.unavailable) {
    const [callEventsResult, assignmentsResult] = await Promise.all([
      selectTable("nba_official_call_events", (query) => query
        .select(CALL_EVENT_COLUMNS)
        .in("season", seasonValues(season))
        .not("season_type", "ilike", "Preseason")
        .order("game_date", { ascending: false }), { maxRows: CALL_EVENT_LIMIT }),
      selectTable("nba_official_game_assignments", (query) => query
        .select(ASSIGNMENT_COLUMNS)
        .in("season", seasonValues(season))
        .not("season_type", "ilike", "Preseason")
        .order("game_date", { ascending: false }), { maxRows: ASSIGNMENT_LIMIT }),
    ]);
    callEvents = callEventsResult.data;
    assignments = assignmentsResult.data;
    detailOfficialProfiles = buildOfficialProfiles(callEvents, challengeEvents, assignments);
    detailTeamProfiles = buildTeamProfiles(callEvents, challengeEvents);
  }

  const officialRollupRows = cumulative ? aggregateOfficialRollups(officialRollupsResult.data) : officialRollupsResult.data;
  const teamRollupRows = cumulative ? aggregateTeamRollups(teamRollupsResult.data) : teamRollupsResult.data;
  const officialCategoryPopulation = !officialCategoryRollupsResult.unavailable && officialCategoryRollupsResult.data?.length
    ? aggregateOfficialCategoryRollups(officialCategoryRollupsResult.data, officialRollupRows)
    : new Map();
  const teamCategoryPopulation = !teamCategoryRollupsResult.unavailable && teamCategoryRollupsResult.data?.length
    ? teamCategoryRollupsToMaps(teamCategoryRollupsResult.data, teamRollupRows)
    : new Map();
  const rollupOfficialProfiles = officialRollupsResult.unavailable
    ? []
    : addRanks(officialRollupRows.map(toOfficialProfileFromRollup), [
      ["callsRank", "calls"],
      ["callsPerGameRank", "callsPerGame"],
      ["foulsPerGameRank", "foulsPerGame"],
      ["violationsPerGameRank", "violationsPerGame"],
      ["challengeRateRank", "challengeRate"],
      ["whistleChallengeRateRank", "whistleChallengeRate"],
      ["crewChiefChallengeRateRank", "crewChiefChallengeRate"],
      ["crewChallengeRateRank", "crewChallengeRate"],
    ]).map((profile) => ({
      ...profile,
      callsByCategory: officialCategoryPopulation.get(String(profile.officialId || profile.id || "").trim().toLowerCase())
        || officialCategoryPopulation.get(String(profile.name || "").trim().toLowerCase())
        || profile.callsByCategory,
    })).sort((a, b) => b.calls - a.calls || b.challenges - a.challenges || a.name.localeCompare(b.name));
  const rollupTeamProfiles = teamRollupsResult.unavailable
    ? []
    : addRanks(teamRollupRows.map(toTeamProfileFromRollup), [
      ["netCallsForRank", "netCallsFor"],
      ["challengeRateRank", "challengeRate"],
      ["challengesRank", "challenges"],
    ]).map((profile) => ({
      ...profile,
      callsByCategory: teamCategoryPopulation.get(String(profile.team || "").trim().toLowerCase()) || profile.callsByCategory,
    })).sort((a, b) => b.challenges - a.challenges || b.netCallsFor - a.netCallsFor || a.team.localeCompare(b.team));
  const overviewRow = cumulative ? aggregateOverviewRollups(overviewResult.data, officialRollupRows, teamRollupRows) : overviewResult.data[0];
  const overview = overviewResult.unavailable || !overviewRow
    ? buildOverview(callEvents, challengeEvents, assignments)
    : {
      callEvents: Number(overviewRow.call_events) || 0,
      challenges: Number(overviewRow.challenges) || 0,
      successfulChallenges: Number(overviewRow.successful_challenges) || 0,
      challengeRate: Number(overviewRow.challenge_rate) || 0,
      officials: Number(overviewRow.officials) || 0,
      teams: Number(overviewRow.teams) || 0,
    };

  return {
    season,
    unavailable: challengeEventsResult.unavailable || (!hasProfileRollups && !detailOfficialProfiles.length),
    overview,
    officialProfiles: rollupOfficialProfiles.length
      ? mergeProfileDetails(rollupOfficialProfiles, detailOfficialProfiles)
      : detailOfficialProfiles,
    teamProfiles: rollupTeamProfiles.length
      ? mergeTeamDetails(rollupTeamProfiles, detailTeamProfiles)
      : detailTeamProfiles,
    challengeLog: challengeEvents,
    recentCallEvents: callEvents.slice(0, 50),
  };
}

export async function fetchOfficiatingChallengeLog({ season = DEFAULT_SEASON } = {}) {
  const result = await selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", (query) => query
    .select(CHALLENGE_COLUMNS)
    .in("season", seasonValues(season))
    .order("game_date", { ascending: false }), { maxRows: CHALLENGE_LIMIT });
  return attachChallengeContextTags(preferAuthoritativeChallengeEvents(result.data));
}

export async function fetchChallengeContextTagOptions() {
  const result = await selectTable("nba_challenge_context_tags", (query) => query
    .select(CONTEXT_TAG_COLUMNS)
    .order("label", { ascending: true }), { maxRows: 500 });
  return asArray(result.data).map((tag) => ({
    id: String(tag.id || "").trim(),
    label: String(tag.label || "").trim(),
  })).filter((tag) => tag.id && tag.label);
}

function normalizeContextTagRows(rows) {
  return asArray(rows).map((tag) => ({
    id: String(tag.id || "").trim(),
    label: String(tag.label || "").trim(),
  })).filter((tag) => tag.id && tag.label);
}

function normalizeIdRows(rows) {
  return asArray(rows).map((id) => String(id || "").trim()).filter(Boolean);
}

export async function saveChallengeContextTags({ challengeEventId, selectedTagIds = [], newTagLabels = [] } = {}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const eventId = String(challengeEventId || "").trim();
  if (!eventId) throw new Error("Missing challenge event id.");
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || null;
  const cleanNewLabels = [...new Set(asArray(newTagLabels)
    .map((label) => String(label || "").replace(/\s+/g, " ").trim())
    .filter(Boolean))];
  const selectedIdsFromPayload = asArray(selectedTagIds).map((id) => String(id || "").trim()).filter(Boolean);
  const rpcResult = await supabase.rpc("nba_save_challenge_context_tags", {
    p_challenge_event_id: eventId,
    p_selected_tag_ids: selectedIdsFromPayload,
    p_new_tag_labels: cleanNewLabels,
  });
  if (!rpcResult.error) {
    return {
      challengeEventIds: normalizeIdRows(rpcResult.data?.challengeEventIds || rpcResult.data?.challenge_event_ids),
      options: normalizeContextTagRows(rpcResult.data?.options),
      selected: normalizeContextTagRows(rpcResult.data?.selected),
    };
  }
  if (!isMissingTableError(rpcResult.error) && rpcResult.error?.code !== "PGRST202") {
    throw rpcResult.error;
  }

  let createdTags = [];
  if (cleanNewLabels.length) {
    const { data, error } = await supabase
      .from("nba_challenge_context_tags")
      .upsert(cleanNewLabels.map((label) => ({
        label,
        created_by: userId,
      })), { onConflict: "label" })
      .select(CONTEXT_TAG_COLUMNS);
    if (error) throw error;
    createdTags = asArray(data);
  }
  const selectedIds = [
    ...new Set([
      ...selectedIdsFromPayload,
      ...createdTags.map((tag) => String(tag.id || "").trim()).filter(Boolean),
    ]),
  ];
  const deleteResult = await supabase
    .from("nba_challenge_context_event_tags")
    .delete()
    .eq("challenge_event_id", eventId);
  if (deleteResult.error) throw deleteResult.error;
  if (selectedIds.length) {
    const { error } = await supabase
      .from("nba_challenge_context_event_tags")
      .insert(selectedIds.map((tagId) => ({
        challenge_event_id: eventId,
        tag_id: tagId,
        tagged_by: userId,
      })));
    if (error) throw error;
  }
  const options = await fetchChallengeContextTagOptions();
  const selected = options.filter((tag) => selectedIds.includes(tag.id));
  return { challengeEventIds: [eventId], options, selected };
}
