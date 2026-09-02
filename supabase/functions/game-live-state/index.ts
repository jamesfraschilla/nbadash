import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const TABLE = "game_live_state";
const REQUEST_TIMEOUT_MS = 10_000;
const READ_TIMEOUT_MS = 2_500;
const WRITE_TIMEOUT_MS = 3_500;
const SNAPSHOT_COLUMNS = "game_id,league,season_year,game_status,game_status_text,game_date,source,source_signature,source_updated_at,normalized_at,updated_at,created_at,payload,diagnostics";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

function responseWithHeaders(status: number, body: BodyInit | null, extraHeaders: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(status: number, payload: JsonRecord) {
  return responseWithHeaders(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=15",
  });
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decodeJwtClaims(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const payload = token.split(".")[1] || "";
  if (!payload) return null;
  try {
    const padded = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JsonRecord;
  } catch {
    return null;
  }
}

function isAuthenticatedRequest(req: Request) {
  const claims = decodeJwtClaims(req);
  const appMetadata = (claims?.app_metadata && typeof claims.app_metadata === "object"
    ? claims.app_metadata
    : {}) as JsonRecord;
  const role = String(claims?.role || appMetadata.role || "");
  return role === "authenticated" || role === "service_role";
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compactTeam(team: unknown) {
  const record = (team && typeof team === "object" ? team : {}) as JsonRecord;
  const teamId = safeText(record.teamId);
  return {
    teamId,
    tricode: safeText(record.teamTricode || record.tricode || record.teamAbbreviation),
    city: safeText(record.teamCity || record.city),
    name: safeText(record.teamName || record.name),
    score: safeNullableNumber(record.score),
  };
}

function inferLeague(game: JsonRecord, awayTeam: ReturnType<typeof compactTeam>, homeTeam: ReturnType<typeof compactTeam>) {
  const seasonType = safeText(game.seasonType).toLowerCase();
  if (seasonType.includes("summer")) return "summer";
  const teamIds = [awayTeam.teamId, homeTeam.teamId]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (teamIds.some((teamId) => teamId >= 1612700000 && teamId < 1612710000)) return "gleague";
  if (teamIds.some((teamId) => teamId >= 1610612700 && teamId < 1610612800)) return "nba";
  return "unknown";
}

function countPlayers(boxScoreTeam: unknown) {
  const record = (boxScoreTeam && typeof boxScoreTeam === "object" ? boxScoreTeam : {}) as JsonRecord;
  return Array.isArray(record.players) ? record.players.length : 0;
}

function countMinutesStints(minutesData: unknown) {
  const record = (minutesData && typeof minutesData === "object" ? minutesData : {}) as JsonRecord;
  const periods = Array.isArray(record.periods) ? record.periods : [];
  return periods.reduce((sum, period) => {
    const periodRecord = (period && typeof period === "object" ? period : {}) as JsonRecord;
    return sum + (Array.isArray(periodRecord.stints) ? periodRecord.stints.length : 0);
  }, 0);
}

function latestActionIso(actions: unknown[]) {
  const timestamps = actions
    .map((action) => {
      const record = (action && typeof action === "object" ? action : {}) as JsonRecord;
      return Date.parse(safeText(record.timeActual));
    })
    .filter((timestamp) => Number.isFinite(timestamp));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function buildDiagnostics({
  game,
  actions,
  boxScorePlayerCount,
  minutesPeriodCount,
  minutesStintCount,
}: {
  game: JsonRecord;
  actions: unknown[];
  boxScorePlayerCount: number;
  minutesPeriodCount: number;
  minutesStintCount: number;
}) {
  const warnings: string[] = [];
  const gameStatus = Number(game.gameStatus || 0);
  if (gameStatus >= 2 && actions.length === 0) {
    warnings.push("No play-by-play actions were available for an active or completed game.");
  }
  if (gameStatus >= 2 && boxScorePlayerCount === 0) {
    warnings.push("No box-score players were available for an active or completed game.");
  }
  if (gameStatus >= 2 && minutesPeriodCount === 0) {
    warnings.push("No minutes/lineup data was available for an active or completed game.");
  }
  if (minutesPeriodCount > 0 && minutesStintCount === 0) {
    warnings.push("Minutes payload contained periods but no lineup stints.");
  }
  return {
    warnings,
    quality: warnings.length ? "warning" : "ok",
  };
}

function buildSignatureInput(payload: JsonRecord) {
  const teams = (payload.teams && typeof payload.teams === "object" ? payload.teams : {}) as JsonRecord;
  const away = (teams.away && typeof teams.away === "object" ? teams.away : {}) as JsonRecord;
  const home = (teams.home && typeof teams.home === "object" ? teams.home : {}) as JsonRecord;
  const counts = (payload.counts && typeof payload.counts === "object" ? payload.counts : {}) as JsonRecord;
  return {
    gameId: payload.gameId,
    gameStatus: payload.gameStatus,
    gameStatusText: payload.gameStatusText,
    gameClock: payload.gameClock,
    period: payload.period,
    awayScore: away.score,
    homeScore: home.score,
    playByPlayActions: counts.playByPlayActions,
    boxScorePlayers: counts.boxScorePlayers,
    minutesPeriods: counts.minutesPeriods,
    minutesStints: counts.minutesStints,
  };
}

async function sha256Hex(value: unknown) {
  const input = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function normalizeGameLiveState(gameId: string, gameInput: unknown, minutesInput: unknown = null) {
  const game = (gameInput && typeof gameInput === "object" ? gameInput : {}) as JsonRecord;
  const boxScore = (game.boxScore && typeof game.boxScore === "object" ? game.boxScore : {}) as JsonRecord;
  const awayBox = (boxScore.away && typeof boxScore.away === "object" ? boxScore.away : {}) as JsonRecord;
  const homeBox = (boxScore.home && typeof boxScore.home === "object" ? boxScore.home : {}) as JsonRecord;
  const actions = Array.isArray(game.playByPlayActions) ? game.playByPlayActions : [];
  const minutes = (minutesInput && typeof minutesInput === "object" ? minutesInput : {}) as JsonRecord;
  const minutesPeriods = Array.isArray(minutes.periods) ? minutes.periods : [];
  const awayTeam = compactTeam(game.awayTeam);
  const homeTeam = compactTeam(game.homeTeam);
  const boxScorePlayerCount = countPlayers(awayBox) + countPlayers(homeBox);
  const minutesStintCount = countMinutesStints(minutesInput);
  const diagnostics = buildDiagnostics({
    game,
    actions,
    boxScorePlayerCount,
    minutesPeriodCount: minutesPeriods.length,
    minutesStintCount,
  }) as JsonRecord;
  const payload = {
    version: 1,
    gameId,
    league: inferLeague(game, awayTeam, homeTeam),
    seasonYear: safeText(game.seasonYear || game.season),
    seasonType: safeText(game.seasonType),
    gameStatus: safeNullableNumber(game.gameStatus),
    gameStatusText: safeText(game.gameStatusText),
    gameClock: safeText(game.gameClock),
    period: safeNullableNumber(game.period),
    gameDate: safeText(game.gameDate || game.gameDateUTC || game.gameTimeUTC),
    teams: {
      away: awayTeam,
      home: homeTeam,
    },
    counts: {
      playByPlayActions: actions.length,
      boxScorePlayers: boxScorePlayerCount,
      awayBoxScorePlayers: countPlayers(awayBox),
      homeBoxScorePlayers: countPlayers(homeBox),
      minutesPeriods: minutesPeriods.length,
      minutesStints: minutesStintCount,
    },
    availability: {
      playByPlay: actions.length > 0,
      boxScore: boxScorePlayerCount > 0,
      minutes: minutesPeriods.length > 0,
      timeouts: Boolean(game.timeouts),
      challenges: Boolean(game.challenges),
    },
    diagnostics,
  };
  const sourceUpdatedAt = latestActionIso(actions);
  const sourceSignature = await sha256Hex(buildSignatureInput(payload));
  return {
    gameId,
    league: payload.league,
    seasonYear: payload.seasonYear || null,
    gameStatus: typeof payload.gameStatus === "number" ? payload.gameStatus : null,
    gameStatusText: payload.gameStatusText || null,
    gameDate: payload.gameDate || null,
    source: "dashboard-api",
    sourceSignature,
    sourceUpdatedAt,
    normalizedAt: new Date().toISOString(),
    payload,
    diagnostics,
  };
}

function rowToSnapshot(row: JsonRecord | null) {
  if (!row) return null;
  return {
    gameId: row.game_id,
    league: row.league,
    seasonYear: row.season_year,
    gameStatus: row.game_status,
    gameStatusText: row.game_status_text,
    gameDate: row.game_date,
    source: row.source,
    sourceSignature: row.source_signature,
    sourceUpdatedAt: row.source_updated_at,
    normalizedAt: row.normalized_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    payload: row.payload,
    diagnostics: row.diagnostics,
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function fetchGameBundle(gameId: string, includeMinutes: boolean) {
  const game = await fetchJson(`${API_BASE}/games/${encodeURIComponent(gameId)}`);
  let minutesData: unknown = null;
  let minutesError = "";
  if (includeMinutes) {
    try {
      minutesData = await fetchJson(`${API_BASE}/games/${encodeURIComponent(gameId)}/minutes`);
    } catch (error) {
      minutesError = error instanceof Error ? error.message : "Unable to load minutes.";
    }
  }
  return { game, minutesData, minutesError };
}

async function readSnapshot(admin: SupabaseAdminClient, gameId: string) {
  const { data, error } = await admin
    .from(TABLE)
    .select(SNAPSHOT_COLUMNS)
    .eq("game_id", gameId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();
  if (error) throw error;
  return rowToSnapshot(data as JsonRecord | null);
}

async function upsertSnapshot(admin: SupabaseAdminClient, normalized: Awaited<ReturnType<typeof normalizeGameLiveState>>) {
  const existing = await readSnapshot(admin, normalized.gameId).catch(() => null);
  if (existing?.sourceSignature === normalized.sourceSignature) {
    return { snapshot: existing, changed: false };
  }

  const { data, error } = await admin
    .from(TABLE)
    .upsert({
      game_id: normalized.gameId,
      league: normalized.league,
      season_year: normalized.seasonYear,
      game_status: normalized.gameStatus,
      game_status_text: normalized.gameStatusText,
      game_date: normalized.gameDate,
      source: normalized.source,
      source_signature: normalized.sourceSignature,
      source_updated_at: normalized.sourceUpdatedAt,
      normalized_at: normalized.normalizedAt,
      payload: normalized.payload,
      diagnostics: normalized.diagnostics,
    }, { onConflict: "game_id" })
    .select(SNAPSHOT_COLUMNS)
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
    .single();
  if (error) throw error;
  return { snapshot: rowToSnapshot(data as JsonRecord), changed: true };
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!isAuthenticatedRequest(req)) return jsonResponse(401, { error: "Authentication required." });

  try {
    const admin = getAdminClient();
    if (!admin) return jsonResponse(500, { error: "Supabase service role is not configured." });

    const body = await req.json().catch(() => ({})) as JsonRecord;
    const operation = safeText(body.operation || "get") || "get";
    const gameId = safeText(body.gameId);
    if (!/^\d{5,20}$/.test(gameId)) {
      return jsonResponse(400, { error: "A valid numeric gameId is required." });
    }

    if (operation === "get") {
      return jsonResponse(200, { snapshot: await readSnapshot(admin, gameId) });
    }

    if (operation !== "upsert" && operation !== "refresh") {
      return jsonResponse(400, { error: "Unsupported operation." });
    }

    let game = body.game;
    let minutesData = body.minutesData;
    let minutesError = "";
    if (!game || operation === "refresh") {
      const bundle = await fetchGameBundle(gameId, true);
      game = bundle.game;
      minutesData = bundle.minutesData;
      minutesError = bundle.minutesError;
    }

    const normalized = await normalizeGameLiveState(gameId, game, minutesData);
    if (minutesError) {
      normalized.diagnostics = {
        ...(normalized.diagnostics || {}),
        minutesError,
      };
    }
    const result = await upsertSnapshot(admin, normalized);
    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to process game live state.",
    });
  }
}

export const __test__ = {
  buildDiagnostics,
  buildSignatureInput,
  compactTeam,
  inferLeague,
  normalizeGameLiveState,
};

if (import.meta.main) {
  Deno.serve(handleRequest);
}
