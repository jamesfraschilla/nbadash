import { supabase } from "./supabaseClient.js";

const DEFAULT_SEASON = "2025-26";
const SUPABASE_PAGE_SIZE = 1000;
const CALL_EVENT_LIMIT = 5000;
const CHALLENGE_LIMIT = 2000;
const ASSIGNMENT_LIMIT = 2000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
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

async function selectTable(table, queryBuilder, { maxRows = SUPABASE_PAGE_SIZE } = {}) {
  if (!supabase) return { data: [], unavailable: true };
  const rows = [];
  for (let from = 0; from < maxRows; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, maxRows - 1);
    const query = queryBuilder(supabase.from(table)).range(from, to);
    const { data, error } = await query;
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

function getOfficialKey(row) {
  return String(row.official_id || row.official_name || row.crew_chief_name || row.whistling_official_name || "Unknown").trim();
}

function getTeamLabel(row) {
  return String(row.team_tricode || row.challenging_team || row.charged_team || row.benefiting_team || "Unknown").trim();
}

function buildOfficialProfiles(callEvents, challengeEvents, assignments) {
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
        callsByTeam: {},
        callsByCategory: {},
        schedule: [],
        recentCalls: [],
        challengeLog: [],
      });
    }
    return profiles.get(id);
  };

  assignments.forEach((assignment) => {
    const profile = ensure(getOfficialKey(assignment), assignment);
    if (assignment.game_id) profile.games.add(assignment.game_id);
    profile.schedule.push(assignment);
  });

  callEvents.forEach((event) => {
    const profile = ensure(getOfficialKey(event), event);
    if (event.game_id) profile.games.add(event.game_id);
    profile.calls += 1;
    const category = normalizeStatus(event.primary_category);
    if (category === "foul") profile.fouls += 1;
    else if (category === "violation") profile.violations += 1;
    else if (category === "technical") profile.technicals += 1;
    const team = String(event.charged_team || event.team_tricode || "Unknown").trim();
    profile.callsByTeam[team] = (profile.callsByTeam[team] || 0) + 1;
    profile.callsByCategory[category || "unknown"] = (profile.callsByCategory[category || "unknown"] || 0) + 1;
    profile.recentCalls.push(event);
  });

  challengeEvents.forEach((event) => {
    [
      ["crew_chief_name", "crew_chief_id"],
      ["whistling_official_name", "whistling_official_id"],
    ].forEach(([nameKey, idKey]) => {
      const name = String(event[nameKey] || "").trim();
      if (!name) return;
      const profile = ensure(String(event[idKey] || name).trim(), {
        official_id: event[idKey],
        official_name: name,
      });
      if (event.game_id) profile.games.add(event.game_id);
      profile.challenges += 1;
      if (normalizeStatus(event.challenge_outcome) === "successful") profile.successfulChallenges += 1;
      profile.challengeLog.push(event);
    });
  });

  const rows = [...profiles.values()]
    .map((profile) => ({
      ...profile,
      games: profile.games.size,
      callsPerGame: safeRate(profile.calls, profile.games.size),
      challengeRate: safeRate(profile.successfulChallenges, profile.challenges),
      schedule: profile.schedule
        .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
        .slice(0, 20),
      recentCalls: profile.recentCalls
        .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
        .slice(0, 20),
      challengeLog: profile.challengeLog
        .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
        .slice(0, 20),
    }))
    .sort((a, b) => b.calls - a.calls || b.challenges - a.challenges || a.name.localeCompare(b.name));

  return addRanks(rows, [
    ["callsRank", "calls"],
    ["callsPerGameRank", "callsPerGame"],
    ["challengeRateRank", "challengeRate"],
  ]);
}

function buildTeamProfiles(callEvents, challengeEvents) {
  const teams = new Map();
  const ensure = (team) => {
    const key = String(team || "Unknown").trim() || "Unknown";
    if (!teams.has(key)) {
      teams.set(key, {
        team: key,
        callsAgainst: 0,
        callsFor: 0,
        challenges: 0,
        successfulChallenges: 0,
        callsByOfficial: {},
        callsByCategory: {},
        challengeLog: [],
        recentCalls: [],
      });
    }
    return teams.get(key);
  };

  callEvents.forEach((event) => {
    const chargedTeam = String(event.charged_team || event.team_tricode || "").trim();
    const benefitingTeam = String(event.benefiting_team || "").trim();
    if (chargedTeam) ensure(chargedTeam).callsAgainst += 1;
    if (benefitingTeam) ensure(benefitingTeam).callsFor += 1;
    [chargedTeam, benefitingTeam].filter(Boolean).forEach((team) => {
      const profile = ensure(team);
      const official = String(event.official_name || "Unknown").trim();
      const category = normalizeStatus(event.primary_category) || "unknown";
      profile.callsByOfficial[official] = (profile.callsByOfficial[official] || 0) + 1;
      profile.callsByCategory[category] = (profile.callsByCategory[category] || 0) + 1;
      profile.recentCalls.push(event);
    });
  });

  challengeEvents.forEach((event) => {
    const team = ensure(event.challenging_team);
    team.challenges += 1;
    if (normalizeStatus(event.challenge_outcome) === "successful") team.successfulChallenges += 1;
    team.challengeLog.push(event);
  });

  const rows = [...teams.values()]
    .map((team) => ({
      ...team,
      challengeRate: safeRate(team.successfulChallenges, team.challenges),
      challengeLog: team.challengeLog
        .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
        .slice(0, 40),
      recentCalls: team.recentCalls
        .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
        .slice(0, 20),
    }))
    .sort((a, b) => b.challenges - a.challenges || b.callsAgainst - a.callsAgainst || a.team.localeCompare(b.team));

  return addRanks(rows, [
    ["callsAgainstRank", "callsAgainst"],
    ["challengeRateRank", "challengeRate"],
    ["challengesRank", "challenges"],
  ]);
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

function buildOverview(callEvents, challengeEvents, assignments) {
  const successfulChallenges = challengeEvents.filter((event) => normalizeStatus(event.challenge_outcome) === "successful").length;
  return {
    callEvents: callEvents.length,
    challenges: challengeEvents.length,
    successfulChallenges,
    challengeRate: safeRate(successfulChallenges, challengeEvents.length),
    officials: new Set(assignments.map(getOfficialKey).filter(Boolean)).size,
    teams: new Set([
      ...callEvents.map(getTeamLabel),
      ...challengeEvents.map((event) => event.challenging_team),
    ].filter(Boolean)).size,
  };
}

export async function fetchOfficiatingDashboardData({ season = DEFAULT_SEASON } = {}) {
  const [callEventsResult, challengeEventsResult, assignmentsResult] = await Promise.all([
    selectTable("nba_official_call_events", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_date", { ascending: false }), { maxRows: CALL_EVENT_LIMIT }),
    selectTable("nba_coach_challenge_events", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_date", { ascending: false }), { maxRows: CHALLENGE_LIMIT }),
    selectTable("nba_official_game_assignments", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_date", { ascending: false }), { maxRows: ASSIGNMENT_LIMIT }),
  ]);

  const callEvents = callEventsResult.data;
  const challengeEvents = preferAuthoritativeChallengeEvents(challengeEventsResult.data);
  const assignments = assignmentsResult.data;

  return {
    season,
    unavailable: callEventsResult.unavailable || challengeEventsResult.unavailable || assignmentsResult.unavailable,
    overview: buildOverview(callEvents, challengeEvents, assignments),
    officialProfiles: buildOfficialProfiles(callEvents, challengeEvents, assignments),
    teamProfiles: buildTeamProfiles(callEvents, challengeEvents),
    challengeLog: challengeEvents,
    recentCallEvents: callEvents.slice(0, 50),
  };
}
