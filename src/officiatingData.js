import { supabase } from "./supabaseClient.js";

const DEFAULT_SEASON = "2025-26";
const SUPABASE_PAGE_SIZE = 1000;
const CALL_EVENT_LIMIT = 5000;
const CHALLENGE_LIMIT = 5000;
const ASSIGNMENT_LIMIT = 2000;
const PROFILE_LIMIT = 500;
const PROFILE_DETAIL_LIMIT = 5000;
const EXCLUDED_STAT_SEASON_TYPES = new Set(["preseason"]);
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

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isIncludedStatEvent(row) {
  return !EXCLUDED_STAT_SEASON_TYPES.has(normalizeStatus(row?.season_type || row?.seasonType));
}

function titleCaseCategory(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanCategoryPart(value) {
  const cleaned = String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return {
    awayfromplay: "away from play",
    "awayfrom play": "away from play",
    clearpath: "clear path",
    defense3second: "defense 3 second",
    defensive3second: "defense 3 second",
    defensivethreesecond: "defense 3 second",
    "3secondviolation": "3 second violation",
    threesecondviolation: "3 second violation",
    jumpball: "jump ball",
    lostball: "lost ball",
    flagranttype1: "flagrant type 1",
    flagranttype2: "flagrant type 2",
    doubletechnical: "double technical",
    delaytechnical: "delay technical",
    floppingtechnical: "flopping technical",
    nonunsportsmanliketechnical: "non unsportsmanlike technical",
    looseball: "loose ball",
    personaltake: "personal take",
    transitiontake: "transition take",
  }[cleaned.replace(/[^a-z0-9]+/g, "")] || cleaned;
}

function isCountedTechnicalCategory(value) {
  const category = cleanCategoryPart(value);
  return category === "technical" || category === "double technical";
}

function isCountedTechnicalEvent(event) {
  return cleanCategoryPart(event.primary_category) === "technical" || isCountedTechnicalCategory(event.secondary_category);
}

function normalizedFoulCategory(parts) {
  const uniqueParts = [...new Set(parts.filter(Boolean).filter((part) => part !== "foul"))];
  const partSet = new Set(uniqueParts);
  if (partSet.has("defense 3 second")) return "Defensive 3 Second Violation";
  if (partSet.has("delay technical") || partSet.has("delay")) return "Delay Of Game";
  if (partSet.has("flopping technical")) return "Flopping Technical";
  if (partSet.has("non unsportsmanlike technical")) return "Non Unsportsmanlike Technical";
  if (uniqueParts.some(isCountedTechnicalCategory)) return "Technical Foul";
  if (partSet.has("shooting")) return "Shooting Foul";
  if (partSet.has("loose ball")) return "Loose Ball Foul";
  if (partSet.has("flagrant type 1")) return "Flagrant Type 1 Foul";
  if (partSet.has("flagrant type 2")) return "Flagrant Type 2 Foul";
  if (partSet.has("away from play")) return "Away From Play Foul";
  if (partSet.has("transition take")) return "Transition Take Foul";
  if (partSet.has("personal take") || partSet.has("take")) return "Take Foul";
  if (partSet.has("offensive")) return "Offensive Foul";
  if (partSet.has("clear path")) return "Clear Path Foul";
  if (partSet.has("flagrant")) return "Flagrant Foul";
  if (uniqueParts.length === 1 && uniqueParts[0] === "personal") return "Foul on Floor";
  const visibleParts = uniqueParts.filter((part) => part !== "personal");
  return visibleParts.length ? titleCaseCategory(`${visibleParts.join(" ")} foul`) : "Foul on Floor";
}

export function specificCallCategory(event) {
  const primary = cleanCategoryPart(event.primary_category);
  const secondary = cleanCategoryPart(event.secondary_category);
  const descriptor = cleanCategoryPart(event.descriptor);
  const subType = cleanCategoryPart(event.sub_type);
  const description = String(event.description || "");

  if (primary === "violation") {
    const violationMatch = /violation:\s*([^()]+)/i.exec(description);
    const violation = cleanCategoryPart(violationMatch?.[1] || secondary || descriptor || subType);
    if (violation === "3 second violation") return "Offensive 3 Second Violation";
    if (violation === "defense 3 second") return "Defensive 3 Second Violation";
    return violation ? titleCaseCategory(violation) : "Violation";
  }

  if (primary === "foul" || primary === "technical") {
    if (primary === "technical") return "Technical Foul";
    return normalizedFoulCategory([secondary, descriptor, subType]);
  }

  if (primary === "jump ball") return "Jump Ball";

  if (primary === "turnover") {
    const turnover = cleanCategoryPart(secondary || descriptor || subType);
    if (turnover === "3 second violation") return "Offensive 3 Second Violation";
    if (turnover === "lost ball") return "Out Of Bounds";
    if (turnover === "bad pass") return "Out Of Bounds";
    if (turnover === "step out of bounds") return "Out Of Bounds";
    if (turnover === "jump ball") return "Jump Ball";
  }

  if (secondary && secondary !== primary) return titleCaseCategory(secondary);
  if (primary) return titleCaseCategory(primary);
  return "Unknown";
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
    { value: safeRate(Number(count) || 0, games), rank: null },
  ]));
}

function categoryRollupsToMap(rows) {
  return Object.fromEntries(asArray(rows).map((row) => [
    String(row.category || "Unknown").trim(),
    {
      value: Number(row.calls_per_game) || 0,
      rank: Number(row.category_rank) || null,
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

function categoriesPerGameFromTotals(categoryTotals, games, existingCategories = {}) {
  const denominator = Number(games) || 0;
  return Object.fromEntries(Object.entries(categoryTotals || {}).map(([category, count]) => [
    category,
    {
      value: safeRate(Number(count) || 0, denominator),
      rank: existingCategories?.[category]?.rank || null,
    },
  ]));
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

  statChallengeEvents.forEach((event) => {
    const successful = normalizeStatus(event.challenge_outcome) === "successful";
    const profileRoles = new Map();
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
      profileRoles.set(profileKey, existingRole === "whistle" || role === "whistle" ? "whistle" : "crewChief");
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
    ["challengeRateRank", "challengeRate"],
    ["whistleChallengeRateRank", "whistleChallengeRate"],
    ["crewChiefChallengeRateRank", "crewChiefChallengeRate"],
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
      .forEach((row, index) => {
        if (row.callsByCategory?.[category]) row.callsByCategory[category].rank = index + 1;
      });
  });
  return rows;
}

export async function fetchOfficialProfileDetails({ season = DEFAULT_SEASON, profile } = {}) {
  const officialId = String(profile?.officialId || profile?.official_id || profile?.id || "").trim();
  const officialName = String(profile?.name || profile?.official_name || "").trim();
  if (!officialId && !officialName) return profile;

  const challengeQuery = (query) => {
    let next = query.select("*").eq("season", season).not("season_type", "ilike", "Preseason");
    if (officialId && officialName) {
      next = next.or([
        `crew_chief_id.eq.${officialId}`,
        `whistling_official_id.eq.${officialId}`,
        `crew_chief_name.eq.${officialName}`,
        `whistling_official_name.eq.${officialName}`,
      ].join(","));
    } else if (officialId) {
      next = next.or(`crew_chief_id.eq.${officialId},whistling_official_id.eq.${officialId}`);
    } else {
      next = next.or(`crew_chief_name.eq.${officialName},whistling_official_name.eq.${officialName}`);
    }
    return next.order("game_date", { ascending: false });
  };
  const teamNetQuery = (query) => {
    let next = query.select("*").eq("season", season);
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
    let next = query.select("*").eq("season", season).not("season_type", "ilike", "Preseason");
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
    let next = query.select("*").eq("season", season);
    if (officialId && officialName) {
      next = next.or(`official_id.eq.${officialId},official_name.eq.${officialName}`);
    } else if (officialId) {
      next = next.eq("official_id", officialId);
    } else {
      next = next.eq("official_name", officialName);
    }
    return next.order("calls_per_game", { ascending: false });
  };
  const [teamNetResult, challengeEventsResult, assignmentsResult, categoryRollupsResult] = await Promise.all([
    selectPreferredTable("nba_team_official_net_call_rollups_cache", "nba_team_official_net_call_rollups", teamNetQuery, { maxRows: 100 })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", challengeQuery, { maxRows: PROFILE_DETAIL_LIMIT }),
    selectTable("nba_official_game_assignments", assignmentQuery, { maxRows: PROFILE_DETAIL_LIMIT }),
    selectPreferredTable("nba_official_call_category_rollups_cache", "nba_official_call_category_rollups", categoryQuery, { maxRows: 200 })
      .catch(() => ({ data: [], unavailable: true })),
  ]);

  if (challengeEventsResult.unavailable || assignmentsResult.unavailable) return profile;
  const detail = applyOfficialProfileDetails(
    profile,
    [],
    preferAuthoritativeChallengeEvents(challengeEventsResult.data),
    assignmentsResult.data,
    []
  );
  return {
    ...detail,
    callsByTeam: teamNetResult.unavailable ? detail.callsByTeam : officialTeamNetRollupsToTeamMap(teamNetResult.data),
    callsByCategory: categoryRollupsResult.unavailable ? detail.callsByCategory : categoryRollupsToMap(categoryRollupsResult.data),
  };
}

export async function fetchTeamProfileDetails({ season = DEFAULT_SEASON, profile } = {}) {
  const team = String(profile?.team || "").trim();
  if (!team) return profile;
  const categoryRollupQuery = (query) => query
    .select("*")
    .eq("season", season)
    .eq("team", team)
    .order("calls_per_game", { ascending: false });
  const teamOfficialQuery = (query) => query
    .select("*")
    .eq("season", season)
    .eq("team", team)
    .order("net_calls_for_per_game", { ascending: false });
  const [teamOfficialResult, challengeEventsResult, categoryRollupsResult] = await Promise.all([
    selectPreferredTable("nba_team_official_net_call_rollups_cache", "nba_team_official_net_call_rollups", teamOfficialQuery, { maxRows: PROFILE_DETAIL_LIMIT })
      .catch(() => ({ data: [], unavailable: true })),
    selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", (query) => query
      .select("*")
      .eq("season", season)
      .not("season_type", "ilike", "Preseason")
      .eq("challenging_team", team)
      .order("game_date", { ascending: false }), { maxRows: PROFILE_DETAIL_LIMIT }),
    selectPreferredTable("nba_team_call_category_rollups_cache", "nba_team_call_category_rollups", categoryRollupQuery, { maxRows: 200 })
      .catch(() => ({ data: [], unavailable: true })),
  ]);

  if (challengeEventsResult.unavailable) return profile;
  const challengeLog = preferAuthoritativeChallengeEvents(challengeEventsResult.data);
  return {
    ...profile,
    callsByOfficial: teamOfficialResult.unavailable ? profile.callsByOfficial : teamOfficialNetRollupsToOfficialMap(teamOfficialResult.data),
    callsByCategory: categoryRollupsResult.unavailable ? profile.callsByCategory : categoryRollupsToMap(categoryRollupsResult.data),
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
  const [
    overviewResult,
    officialRollupsResult,
    teamRollupsResult,
  ] = await Promise.all([
    selectPreferredTable("nba_officiating_overview_rollups_cache", "nba_officiating_overview_rollups", (query) => query
      .select("*")
      .eq("season", season), { maxRows: 5 }),
    selectPreferredTable("nba_official_profiles_cache", "nba_official_profiles", (query) => query
      .select("*")
      .eq("season", season), { maxRows: PROFILE_LIMIT }),
    selectPreferredTable("nba_team_profiles_cache", "nba_team_profiles", (query) => query
      .select("*")
      .eq("season", season), { maxRows: PROFILE_LIMIT }),
  ]);

  const hasProfileRollups = !officialRollupsResult.unavailable && !teamRollupsResult.unavailable;
  const shouldLoadChallengeEvents = includeChallengeLog || !hasProfileRollups || overviewResult.unavailable;
  const challengeEventsResult = shouldLoadChallengeEvents
    ? await selectPreferredTable("nba_authoritative_coach_challenge_events_cache", "nba_authoritative_coach_challenge_events", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_date", { ascending: false }), { maxRows: CHALLENGE_LIMIT })
    : { data: [], unavailable: false };

  const challengeEvents = preferAuthoritativeChallengeEvents(challengeEventsResult.data);
  let callEvents = [];
  let assignments = [];
  let detailOfficialProfiles = [];
  let detailTeamProfiles = [];

  if (!hasProfileRollups || overviewResult.unavailable) {
    const [callEventsResult, assignmentsResult] = await Promise.all([
      selectTable("nba_official_call_events", (query) => query
        .select("*")
        .eq("season", season)
        .not("season_type", "ilike", "Preseason")
        .order("game_date", { ascending: false }), { maxRows: CALL_EVENT_LIMIT }),
      selectTable("nba_official_game_assignments", (query) => query
        .select("*")
        .eq("season", season)
        .not("season_type", "ilike", "Preseason")
        .order("game_date", { ascending: false }), { maxRows: ASSIGNMENT_LIMIT }),
    ]);
    callEvents = callEventsResult.data;
    assignments = assignmentsResult.data;
    detailOfficialProfiles = buildOfficialProfiles(callEvents, challengeEvents, assignments);
    detailTeamProfiles = buildTeamProfiles(callEvents, challengeEvents);
  }

  const rollupOfficialProfiles = officialRollupsResult.unavailable
    ? []
    : addRanks(officialRollupsResult.data.map(toOfficialProfileFromRollup), [
      ["callsRank", "calls"],
      ["callsPerGameRank", "callsPerGame"],
      ["challengeRateRank", "challengeRate"],
      ["whistleChallengeRateRank", "whistleChallengeRate"],
      ["crewChiefChallengeRateRank", "crewChiefChallengeRate"],
    ]).sort((a, b) => b.calls - a.calls || b.challenges - a.challenges || a.name.localeCompare(b.name));
  const rollupTeamProfiles = teamRollupsResult.unavailable
    ? []
    : addRanks(teamRollupsResult.data.map(toTeamProfileFromRollup), [
      ["netCallsForRank", "netCallsFor"],
      ["challengeRateRank", "challengeRate"],
      ["challengesRank", "challenges"],
    ]).sort((a, b) => b.challenges - a.challenges || b.netCallsFor - a.netCallsFor || a.team.localeCompare(b.team));
  const overviewRow = overviewResult.data[0];
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
    .select("*")
    .eq("season", season)
    .order("game_date", { ascending: false }), { maxRows: CHALLENGE_LIMIT });
  return preferAuthoritativeChallengeEvents(result.data);
}
