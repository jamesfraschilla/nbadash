import {
  fetchCurrentGLeagueRosters,
  fetchCurrentNbaRosters,
  fetchGamesByDate,
} from "./api.js";
import {
  PLAYER_HEADSHOT_BUCKET,
  loadRemotePlayerHeadshotState,
} from "./playerHeadshotOverrides.js";
import { fetchRemotePregamePlayers } from "./pregamePlayers.js";
import { supabase } from "./supabaseClient.js";
import { formatDateInputInTimeZone } from "./utils.js";

const WASHINGTON_SUMMER_SCOPE = "washington_summer";

function ok(detail) {
  return { status: "ok", detail };
}

function warning(detail) {
  return { status: "warning", detail };
}

async function runCheck(id, label, fn) {
  try {
    const result = await fn();
    return {
      id,
      label,
      status: result?.status || "ok",
      detail: result?.detail || "",
    };
  } catch (error) {
    return {
      id,
      label,
      status: "error",
      detail: error?.message || "Check failed.",
    };
  }
}

function countRosterTeams(payload) {
  return Object.values(payload?.teams || {})
    .filter((team) => Array.isArray(team?.players) && team.players.length > 0)
    .length;
}

export async function runOperationalHealthChecks(userId) {
  const todayEt = formatDateInputInTimeZone(new Date(), "America/New_York");
  return Promise.all([
    runCheck("supabase-client", "Supabase client", async () => {
      if (!supabase) throw new Error("Supabase env vars are missing from the deployed bundle.");
      return ok("Configured.");
    }),
    runCheck("auth-session", "Signed-in session", async () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data?.session?.access_token) throw new Error("No active access token.");
      return ok("Access token available.");
    }),
    runCheck("date-feed", "CloudFront game feed", async () => {
      const games = await fetchGamesByDate(todayEt);
      return ok(`${Array.isArray(games) ? games.length : 0} games returned for ${todayEt}.`);
    }),
    runCheck("nba-rosters", "NBA roster function", async () => {
      const payload = await fetchCurrentNbaRosters();
      const teamCount = countRosterTeams(payload);
      if (!teamCount) return warning("Function responded, but no populated rosters were returned.");
      return ok(`${teamCount} populated teams.`);
    }),
    runCheck("gleague-rosters", "G League roster function", async () => {
      const payload = await fetchCurrentGLeagueRosters();
      const teamCount = countRosterTeams(payload);
      if (!teamCount) return warning("Function responded, but no populated rosters were returned.");
      return ok(`${teamCount} populated teams.`);
    }),
    runCheck("player-headshot-bucket", "Player headshot bucket", async () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.storage.from(PLAYER_HEADSHOT_BUCKET).list("", { limit: 1 });
      if (error) throw error;
      return ok(`${PLAYER_HEADSHOT_BUCKET} is readable.`);
    }),
    runCheck("player-headshot-state", "Shared headshot state", async () => {
      const records = await loadRemotePlayerHeadshotState(userId);
      const count = records && typeof records === "object" ? Object.keys(records).length : 0;
      return ok(`${count} shared player headshot overrides.`);
    }),
    runCheck("summer-roster-state", "Summer roster state", async () => {
      const payload = await fetchRemotePregamePlayers(WASHINGTON_SUMMER_SCOPE);
      const count = Array.isArray(payload?.players) ? payload.players.length : 0;
      if (!count) return warning("Summer roster state is readable, but no players were returned.");
      return ok(`${count} Summer League roster players.`);
    }),
  ]);
}
