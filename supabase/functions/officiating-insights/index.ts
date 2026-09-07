import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildOfficiatingInsightCandidates,
  normalizeInsightSelection,
  selectDeterministicInsights,
  type ChallengeEvent,
  type InsightCandidate,
  type OfficialCallEvent,
  type OfficialGameFact,
  type OfficialPlayerCallEvent,
  type OfficialSelection,
  type PlayerGameFact,
  type TeamGameFact,
  type TeamSelection,
} from "../_shared/officiatingInsights.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = Deno.env.get("OPENAI_ANALYSIS_MODEL") || "gpt-4.1-mini";
const ALLOWED_SEASONS = new Set(["2024-25", "2025-26", "2026-27"]);
const PAGE_SIZE = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Supabase function secrets are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireAdmin(client: ReturnType<typeof getAdminClient>, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user?.id) return false;
  const { data: profile } = await client.from("profiles").select("role,status").eq("id", userData.user.id).maybeSingle();
  return profile?.role === "admin" && profile?.status === "active";
}

async function fetchAllRows<T>(client: ReturnType<typeof getAdminClient>, table: string, seasons: string[], columns: string) {
  const rows: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .in("season", seasons)
      .eq("completeness_status", "complete")
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchTechnicalCallRows(
  client: ReturnType<typeof getAdminClient>,
  seasons: string[],
) {
  const rows: OfficialPlayerCallEvent[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client
      .from("nba_official_call_events")
      .select("id,season,season_type,game_id,game_date,official_id,official_name,player_id,player_name,primary_category,secondary_category,sub_type,descriptor,description")
      .in("season", seasons)
      .not("season_type", "ilike", "Preseason")
      .in("secondary_category", ["technical", "double_technical"])
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`nba_official_call_events: ${error.message}`);
    const page = (data || []) as OfficialPlayerCallEvent[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchSelectedOfficialCallRows(
  client: ReturnType<typeof getAdminClient>,
  seasons: string[],
  officials: OfficialSelection[],
) {
  const officialIds = officials.map((official) => String(official.id || "").trim()).filter(Boolean);
  if (!officialIds.length) return [];
  const rows: OfficialCallEvent[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client
      .from("nba_official_call_events")
      .select("id,season,season_type,game_id,game_date,home_team,away_team,period,official_id,official_name,player_id,player_name,primary_category,secondary_category,sub_type,descriptor,description,charged_team,benefiting_team")
      .in("season", seasons)
      .not("season_type", "ilike", "Preseason")
      .in("official_id", officialIds)
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`nba_official_call_events selected officials: ${error.message}`);
    const page = (data || []) as OfficialCallEvent[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchChallengeRows(
  client: ReturnType<typeof getAdminClient>,
  seasons: string[],
) {
  const rows: ChallengeEvent[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client
      .from("nba_authoritative_coach_challenge_events_cache")
      .select("id,season,season_type,game_id,game_date,home_team,away_team,challenging_team,challenge_type,challenge_outcome,crew_chief_id,crew_chief_name,whistling_official_id,whistling_official_name")
      .in("season", seasons)
      .not("season_type", "ilike", "Preseason")
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`nba_authoritative_coach_challenge_events_cache: ${error.message}`);
    const page = (data || []) as ChallengeEvent[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchSelectedTeamPlayerFactRows(
  client: ReturnType<typeof getAdminClient>,
  seasons: string[],
  teams: TeamSelection[],
) {
  const teamCodes = teams.map((team) => String(team.team || "").trim().toUpperCase()).filter(Boolean);
  if (!teamCodes.length) return [];
  const rows: PlayerGameFact[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client
      .from("nba_player_game_facts")
      .select("season,season_type,game_id,game_date,team,opponent,player_id,player_name,minutes,points,three_pointers_attempted,free_throws_attempted,personal_fouls,technical_fouls,points_in_paint,completeness_status")
      .in("season", seasons)
      .eq("completeness_status", "complete")
      .not("season_type", "ilike", "Preseason")
      .in("team", teamCodes)
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`nba_player_game_facts selected teams: ${error.message}`);
    const page = (data || []) as PlayerGameFact[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function extractResponseText(payload: Record<string, unknown>) {
  const outputText = String(payload.output_text || "").trim();
  if (outputText) return outputText;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.flatMap((item) => {
    const content = Array.isArray((item as Record<string, unknown>)?.content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    return content.map((part) => String(part?.text || "").trim()).filter(Boolean);
  }).join("\n");
}

async function selectWithOpenAI(candidates: InsightCandidate[], officials: OfficialSelection[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey || !candidates.length) return null;
  const candidatePayload = candidates.map(({ id, officialId, family, tags, text, score, evidence }) => ({
    id,
    officialId,
    family,
    tags: tags || [],
    text,
    score,
    confidence: evidence.confidence,
    sampleSize: evidence.sampleSize,
    comparisonSampleSize: evidence.comparisonSampleSize,
    scope: evidence.scope,
    unit: evidence.unit,
  }));
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["profiles", "crewCandidateIds"],
    properties: {
      profiles: {
        type: "array",
        minItems: officials.length,
        maxItems: officials.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["officialId", "candidateIds"],
          properties: {
            officialId: { type: "string" },
            candidateIds: { type: "array", minItems: 0, maxItems: 4, items: { type: "string" } },
          },
        },
      },
      crewCandidateIds: { type: "array", minItems: 0, maxItems: 3, items: { type: "string" } },
    },
  };
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      instructions: "Select the most decision-useful officiating insight candidates. Never rewrite, combine, or calculate claims. Return only candidate IDs. Prefer high-confidence, matchup-specific, diverse evidence; do not fill space with weak claims. Favor only extreme percentile intersections: 90th percentile or higher, or 10th percentile or lower. Team and selected-player trends must remain within the candidate's stated current-season scope; referee tendencies may use the full 2024-present scope when the candidate says so. Avoid selecting two candidates that repeat the same tendency for different teams when a consolidated candidate is available. Prioritize actionable matchup context, recent changes, player-specific outliers, and true crew-level facts. When a verified player-specific outlier has medium or high confidence, prefer it over a generic team-history item with similar score. Select two to four per official when at least two verified candidates exist, otherwise select every available verified candidate. Select up to three diverse crew candidates.",
      input: JSON.stringify({ officials, candidates: candidatePayload }),
      text: { format: { type: "json_schema", name: "officiating_insight_selection", strict: true, schema } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI selection failed (${response.status}).`);
  const payload = await response.json() as Record<string, unknown>;
  const parsed = JSON.parse(extractResponseText(payload));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const validOfficialIds = new Set(officials.map((official) => official.id || official.name));
  const profiles = (Array.isArray(parsed.profiles) ? parsed.profiles : []).map((profile: Record<string, unknown>) => {
    const officialId = String(profile.officialId || "");
    if (!validOfficialIds.has(officialId)) return null;
    const insights = (Array.isArray(profile.candidateIds) ? profile.candidateIds : [])
      .map((id) => candidateById.get(String(id)))
      .filter((candidate): candidate is InsightCandidate => Boolean(candidate) && candidate?.officialId === officialId)
      .slice(0, 4);
    const selectedIds = new Set(insights.map((candidate) => candidate.id));
    const supplemental = candidates
      .filter((candidate) => candidate.officialId === officialId && !selectedIds.has(candidate.id))
      .sort((a, b) => b.score - a.score);
    while (insights.length < 2 && supplemental.length) insights.push(supplemental.shift() as InsightCandidate);
    return { officialId, insights };
  }).filter(Boolean);
  if (profiles.length !== officials.length) return null;
  const crewInsights = (Array.isArray(parsed.crewCandidateIds) ? parsed.crewCandidateIds : [])
    .map((id) => candidateById.get(String(id)))
    .filter((candidate): candidate is InsightCandidate => Boolean(candidate) && candidate?.family === "crew")
    .slice(0, 3);
  return { profiles, crewInsight: crewInsights[0] || null, crewInsights };
}

function candidateCountsByFamily(candidates: InsightCandidate[]) {
  return candidates.reduce((counts, candidate) => {
    counts[candidate.family] = (counts[candidate.family] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

function normalizeSelections(body: Record<string, unknown>) {
  const officials = (Array.isArray(body.officials) ? body.officials : []).map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { id: String(row.id || "").trim(), name: String(row.name || "").trim(), role: String(row.role || "").trim() };
  }).filter((row) => row.id && row.name);
  const teams = (Array.isArray(body.teams) ? body.teams : []).map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { team: String(row.team || "").trim().toUpperCase(), label: String(row.label || "").trim() };
  }).filter((row) => row.team);
  const seasons = (Array.isArray(body.seasons) ? body.seasons : ["2024-25", "2025-26"])
    .map((value) => String(value || "").trim()).filter((value) => ALLOWED_SEASONS.has(value));
  return { officials, teams, seasons: [...new Set(seasons)] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });
  try {
    const client = getAdminClient();
    if (!await requireAdmin(client, req)) return jsonResponse(403, { error: "Admin access required." });
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { officials, teams, seasons } = normalizeSelections(body);
    if (officials.length !== 3 || new Set(officials.map((row) => row.id)).size !== 3) {
      return jsonResponse(400, { error: "Select three unique officials." });
    }
    if (teams.length !== 2 || new Set(teams.map((row) => row.team)).size !== 2) {
      return jsonResponse(400, { error: "Select two unique teams." });
    }
    if (!seasons.length) return jsonResponse(400, { error: "Select at least one supported season." });

    const [officialFacts, teamFacts, playerTechnicalCalls, selectedOfficialCalls, challengeRows, selectedTeamPlayerFacts] = await Promise.all([
      fetchAllRows<OfficialGameFact>(client, "nba_official_game_facts", seasons, "season,season_type,game_id,game_date,home_team,away_team,official_id,official_name,role_key,is_alternate,calls,fouls,violations,technicals,category_counts,team_net_calls,completeness_status"),
      fetchAllRows<TeamGameFact>(client, "nba_team_game_facts", seasons, "season,season_type,game_id,game_date,team,opponent,home_away,won,points,opponent_points,possessions_estimate,field_goals_attempted,three_pointers_attempted,free_throws_attempted,rebounds_offensive,turnovers,personal_fouls,technical_fouls,points_in_paint,points_fast_break,points_second_chance,completeness_status"),
      fetchTechnicalCallRows(client, seasons),
      fetchSelectedOfficialCallRows(client, seasons, officials as OfficialSelection[]),
      fetchChallengeRows(client, seasons),
      fetchSelectedTeamPlayerFactRows(client, seasons, teams as TeamSelection[]),
    ]);
    if (!officialFacts.length || !teamFacts.length) {
      return jsonResponse(409, { error: "Insight facts have not been backfilled for the selected seasons.", code: "FACTS_UNAVAILABLE" });
    }
    const evidence = buildOfficiatingInsightCandidates({
      officialGameFacts: officialFacts,
      teamGameFacts: teamFacts,
      officials: officials as OfficialSelection[],
      teams: teams as TeamSelection[],
      playerCallEvents: playerTechnicalCalls,
      playerGameFacts: selectedTeamPlayerFacts,
      officialCallEvents: selectedOfficialCalls,
      challengeEvents: challengeRows,
      officialCategoryPercentiles: body.officialCategoryPercentiles && typeof body.officialCategoryPercentiles === "object"
        ? body.officialCategoryPercentiles as Record<string, Record<string, number | null>>
        : {},
      asOfDate: String(body.asOfDate || "").trim() || undefined,
    });
    let selection = normalizeInsightSelection(
      selectDeterministicInsights(evidence.candidates, officials as OfficialSelection[]),
      evidence.candidates,
      officials as OfficialSelection[],
    );
    let source = "deterministic";
    let warning = "";
    if (body.useAi !== false) {
      try {
        const aiSelection = await selectWithOpenAI(evidence.candidates, officials as OfficialSelection[]);
        if (aiSelection) {
          selection = normalizeInsightSelection(aiSelection, evidence.candidates, officials as OfficialSelection[]);
          source = "openai-selection";
        } else {
          warning = "OpenAI selection was unavailable; deterministic selection used.";
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : "OpenAI selection failed; deterministic selection used.";
      }
    }
    return jsonResponse(200, {
      ...selection,
      candidates: evidence.candidates,
      candidateCounts: candidateCountsByFamily(evidence.candidates),
      coverage: evidence.coverage,
      selectedTeams: evidence.selectedTeams,
      source,
      warning,
      persisted: false,
    });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Unable to generate insights." });
  }
});
