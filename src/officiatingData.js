import { supabase } from "./supabaseClient.js";

const DEFAULT_SEASON = "2025-26";
const CALL_EVENT_LIMIT = 3000;
const CHALLENGE_LIMIT = 1000;
const ASSIGNMENT_LIMIT = 1200;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isMissingTableError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
}

async function selectTable(table, queryBuilder) {
  if (!supabase) return { data: [], unavailable: true };
  const query = queryBuilder(supabase.from(table));
  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return { data: [], unavailable: true };
    throw error;
  }
  return { data: asArray(data), unavailable: false };
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
      });
    }
    return profiles.get(id);
  };

  assignments.forEach((assignment) => {
    const profile = ensure(getOfficialKey(assignment), assignment);
    if (assignment.game_id) profile.games.add(assignment.game_id);
  });

  callEvents.forEach((event) => {
    const profile = ensure(getOfficialKey(event), event);
    if (event.game_id) profile.games.add(event.game_id);
    profile.calls += 1;
    const category = normalizeStatus(event.primary_category);
    if (category === "foul") profile.fouls += 1;
    else if (category === "violation") profile.violations += 1;
    else if (category === "technical") profile.technicals += 1;
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
    });
  });

  return [...profiles.values()]
    .map((profile) => ({
      ...profile,
      games: profile.games.size,
      challengeRate: safeRate(profile.successfulChallenges, profile.challenges),
    }))
    .sort((a, b) => b.calls - a.calls || b.challenges - a.challenges || a.name.localeCompare(b.name));
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
      });
    }
    return teams.get(key);
  };

  callEvents.forEach((event) => {
    const chargedTeam = String(event.charged_team || event.team_tricode || "").trim();
    const benefitingTeam = String(event.benefiting_team || "").trim();
    if (chargedTeam) ensure(chargedTeam).callsAgainst += 1;
    if (benefitingTeam) ensure(benefitingTeam).callsFor += 1;
  });

  challengeEvents.forEach((event) => {
    const team = ensure(event.challenging_team);
    team.challenges += 1;
    if (normalizeStatus(event.challenge_outcome) === "successful") team.successfulChallenges += 1;
  });

  return [...teams.values()]
    .map((team) => ({
      ...team,
      challengeRate: safeRate(team.successfulChallenges, team.challenges),
    }))
    .sort((a, b) => b.challenges - a.challenges || b.callsAgainst - a.callsAgainst || a.team.localeCompare(b.team));
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
      .order("game_date", { ascending: false })
      .limit(CALL_EVENT_LIMIT)),
    selectTable("nba_coach_challenge_events", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_date", { ascending: false })
      .limit(CHALLENGE_LIMIT)),
    selectTable("nba_official_game_assignments", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_date", { ascending: false })
      .limit(ASSIGNMENT_LIMIT)),
  ]);

  const callEvents = callEventsResult.data;
  const challengeEvents = challengeEventsResult.data;
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
