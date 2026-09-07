import { supabase } from "./supabaseClient.js";

export const NBA_TEAM_OPTIONS = [
  ["ATL", "Atlanta Hawks"], ["BOS", "Boston Celtics"], ["BKN", "Brooklyn Nets"],
  ["CHA", "Charlotte Hornets"], ["CHI", "Chicago Bulls"], ["CLE", "Cleveland Cavaliers"],
  ["DAL", "Dallas Mavericks"], ["DEN", "Denver Nuggets"], ["DET", "Detroit Pistons"],
  ["GSW", "Golden State Warriors"], ["HOU", "Houston Rockets"], ["IND", "Indiana Pacers"],
  ["LAC", "LA Clippers"], ["LAL", "Los Angeles Lakers"], ["MEM", "Memphis Grizzlies"],
  ["MIA", "Miami Heat"], ["MIL", "Milwaukee Bucks"], ["MIN", "Minnesota Timberwolves"],
  ["NOP", "New Orleans Pelicans"], ["NYK", "New York Knicks"], ["OKC", "Oklahoma City Thunder"],
  ["ORL", "Orlando Magic"], ["PHI", "Philadelphia 76ers"], ["PHX", "Phoenix Suns"],
  ["POR", "Portland Trail Blazers"], ["SAC", "Sacramento Kings"], ["SAS", "San Antonio Spurs"],
  ["TOR", "Toronto Raptors"], ["UTA", "Utah Jazz"], ["WAS", "Washington Wizards"],
].map(([team, label]) => ({ team, label }));

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function fetchOfficiatingInsightSimulatorOptions() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nba_official_profiles_cache")
    .select("season,official_id,name,jersey_number,games")
    .in("season", ["2024-25", "2025-26", "2026-27"])
    .order("name", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  const byId = new Map();
  (data || []).forEach((row) => {
    const id = String(row.official_id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name) return;
    const current = byId.get(id) || { id, name, jerseyNumber: row.jersey_number || "", games: 0 };
    current.games += Number(row.games) || 0;
    if (!current.jerseyNumber && row.jersey_number) current.jerseyNumber = row.jersey_number;
    byId.set(id, current);
  });
  return {
    officials: [...byId.values()].sort((left, right) => left.name.localeCompare(right.name)),
    teams: NBA_TEAM_OPTIONS,
  };
}

export async function requestOfficiatingInsightSimulation({
  officials,
  teams,
  useAi = true,
  asOfDate = "",
  officialCategoryPercentiles = {},
}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("officiating-insights", {
    body: {
      officials,
      teams,
      seasons: ["2024-25", "2025-26", "2026-27"],
      asOfDate: asOfDate || undefined,
      officialCategoryPercentiles,
      useAi,
      mode: "simulator",
    },
  });
  if (error) {
    let message = error.message || "Unable to generate officiating insights.";
    try {
      const payload = await error.context?.json?.();
      if (payload?.error) message = payload.error;
    } catch {
      // Keep the function error when the response body cannot be read.
    }
    throw new Error(message);
  }
  return data;
}

export async function submitOfficiatingInsightFeedback({
  candidate,
  verdict,
  note = "",
  context = {},
}) {
  const client = requireSupabase();
  const candidateId = String(candidate?.id || "").trim();
  const rating = String(verdict || "").trim();
  if (!candidateId || !rating) throw new Error("Feedback requires an insight and verdict.");
  const { error } = await client.from("nba_officiating_insight_feedback").insert({
    candidate_id: candidateId,
    family: candidate?.family || null,
    official_id: candidate?.officialId || null,
    verdict: rating,
    note: String(note || "").trim() || null,
    insight_text: candidate?.text || null,
    evidence: candidate?.evidence || {},
    context,
  });
  if (error) throw new Error(error.message);
}
