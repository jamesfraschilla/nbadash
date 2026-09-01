#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { enrichChallengeEventsWithOfficials } from "../src/officiatingChallengeMatcher.js";
import { proximateAutoTagChallengeIds } from "../src/officiatingChallengeContextRules.js";

const DEFAULT_SEASON = "2025-26";
const PAGE_SIZE = 1000;
const GAME_ID_CHUNK_SIZE = 50;
const LIVE_CONTEXT_CONCURRENCY = 4;
const UPDATE_BATCH_SIZE = 25;

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  });
}

async function loadLocalEnv() {
  await loadEnvFile(path.join(process.cwd(), ".env"));
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
}

function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function selectAll(supabase, table, buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = buildQuery(supabase.from(table)).range(from, to);
    const { data, error } = await query;
    if (error) throw new Error(`Failed loading ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function selectForGameChunks(supabase, table, gameIds, buildQuery) {
  const rows = [];
  for (const gameIdChunk of chunkArray(gameIds, GAME_ID_CHUNK_SIZE)) {
    rows.push(...await selectAll(supabase, table, (query) => buildQuery(query).in("game_id", gameIdChunk)));
  }
  return rows;
}

function cleanText(value) {
  return String(value || "").trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://www.nba.com/",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function isFoulChallenge(row) {
  return `${row.challenge_type || ""} ${row.initial_call || ""}`.toLowerCase().includes("foul");
}

async function loadLiveLocationContextForGame(gameId) {
  try {
    const payload = await fetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${encodeURIComponent(gameId)}.json`);
    const actions = Array.isArray(payload?.game?.actions) ? payload.game.actions : [];
    return actions
      .filter((action) => ["2pt", "3pt"].includes(cleanText(action.actionType).toLowerCase()))
      .filter((action) => cleanText(action.area || action.areaDetail))
      .map((action) => ({
        game_id: gameId,
        period: action.period,
        game_clock: action.clock,
        action_number: action.actionNumber,
        order_number: action.orderNumber,
        action_type: action.actionType,
        sub_type: action.subType,
        descriptor: action.descriptor,
        description: action.description,
        area: action.area,
        area_detail: action.areaDetail,
        source_payload: {
          area: action.area,
          areaDetail: action.areaDetail,
          xLegacy: action.xLegacy,
          yLegacy: action.yLegacy,
          x: action.x,
          y: action.y,
          side: action.side,
          ingestSource: "cdnnba_live_context",
        },
      }));
  } catch (error) {
    console.warn(`Skipping live location context for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function loadLiveLocationContext(gameIds) {
  const uniqueGameIds = [...new Set(gameIds.filter(Boolean))];
  const rows = [];
  for (let index = 0; index < uniqueGameIds.length; index += LIVE_CONTEXT_CONCURRENCY) {
    const chunk = uniqueGameIds.slice(index, index + LIVE_CONTEXT_CONCURRENCY);
    const chunkRows = await Promise.all(chunk.map(loadLiveLocationContextForGame));
    rows.push(...chunkRows.flat());
    process.stdout.write(`Loaded live location context ${Math.min(index + chunk.length, uniqueGameIds.length)}/${uniqueGameIds.length}\r`);
  }
  if (uniqueGameIds.length) process.stdout.write("\n");
  return rows;
}

function rowChanged(before, after) {
  return [
    "crew_chief_id",
    "crew_chief_name",
    "whistling_official_id",
    "whistling_official_name",
    "matched_action_number",
    "matched_call_event_id",
    "challenge_sub_type",
    "match_confidence",
    "match_reason",
    "review_status",
  ].some((key) => cleanText(before[key]) !== cleanText(after[key]));
}

function toUpdateRow(row) {
  return {
    id: row.id,
    crew_chief_id: row.crew_chief_id,
    crew_chief_name: row.crew_chief_name,
    whistling_official_id: row.whistling_official_id,
    whistling_official_name: row.whistling_official_name,
    matched_action_number: row.matched_action_number,
    matched_call_event_id: row.matched_call_event_id,
    challenge_sub_type: row.challenge_sub_type,
    match_confidence: row.match_confidence,
    match_reason: row.match_reason,
    review_status: row.review_status,
    source_payload: row.source_payload,
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function applyUpdates(supabase, rows) {
  let updated = 0;
  for (const chunk of chunkArray(rows, UPDATE_BATCH_SIZE)) {
    for (const row of chunk) {
      const updateRow = toUpdateRow(row);
      const { id, ...payload } = updateRow;
      const { error } = await supabase
        .from("nba_coach_challenge_events")
        .update(payload)
        .eq("id", id);
      if (error) throw new Error(`Failed updating challenge row ${id}: ${error.message}`);
    }
    updated += chunk.length;
    process.stdout.write(`Updated ${updated}/${rows.length}\r`);
  }
  if (rows.length) process.stdout.write("\n");
  return updated;
}

async function ensureContextTag(supabase, label) {
  const { data: existingRows, error: selectError } = await supabase
    .from("nba_challenge_context_tags")
    .select("id,label")
    .eq("label", label)
    .limit(1);
  if (selectError) throw new Error(`Failed loading context tag ${label}: ${selectError.message}`);
  if (existingRows?.[0]?.id) return existingRows[0];

  const { data, error } = await supabase
    .from("nba_challenge_context_tags")
    .insert({ label })
    .select("id,label")
    .single();
  if (error) throw new Error(`Failed creating context tag ${label}: ${error.message}`);
  return data;
}

async function applyAutoProximateTags(supabase, challenges, calls) {
  const challengeIds = proximateAutoTagChallengeIds(challenges, calls);
  if (!challengeIds.length) return { eligible: 0, inserted: 0 };

  const tag = await ensureContextTag(supabase, "Proximate");
  const { data: existingRows, error: existingError } = await supabase
    .from("nba_challenge_context_event_tags")
    .select("challenge_event_id")
    .eq("tag_id", tag.id)
    .in("challenge_event_id", challengeIds);
  if (existingError) throw new Error(`Failed loading existing Proximate event tags: ${existingError.message}`);

  const existingIds = new Set((existingRows || []).map((row) => cleanText(row.challenge_event_id)));
  const rowsToInsert = challengeIds
    .filter((challengeId) => !existingIds.has(challengeId))
    .map((challengeId) => ({
      challenge_event_id: challengeId,
      tag_id: tag.id,
    }));
  if (!rowsToInsert.length) return { eligible: challengeIds.length, inserted: 0 };

  const { error } = await supabase
    .from("nba_challenge_context_event_tags")
    .insert(rowsToInsert);
  if (error) throw new Error(`Failed applying automatic Proximate tags: ${error.message}`);
  return { eligible: challengeIds.length, inserted: rowsToInsert.length };
}

async function main() {
  await assertOutsideWizardsGameWindow("challenge official-link refresh");
  await loadLocalEnv();
  const supabase = createSupabaseClient();
  const season = readArg("season") || DEFAULT_SEASON;
  const apply = hasFlag("apply");

  const challenges = await selectAll(supabase, "nba_coach_challenge_events", (query) => query
    .select("*")
    .eq("season", season)
    .eq("source", "nba_official_challenge_pdf")
    .order("game_date", { ascending: true }));
  const challengeGameIds = [...new Set(challenges.map((row) => row.game_id).filter(Boolean))];
  const [calls, assignments] = await Promise.all([
    selectForGameChunks(supabase, "nba_official_call_events", challengeGameIds, (query) => query
      .select("id,season,game_id,period,game_clock,action_number,action_type,primary_category,secondary_category,sub_type,descriptor,description,official_id,official_name,charged_team,area,area_detail,source_payload")
      .eq("season", season)
      .order("action_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })),
    selectForGameChunks(supabase, "nba_official_game_assignments", challengeGameIds, (query) => query
      .select("*")
      .eq("season", season)
      .order("assignment_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })),
  ]);

  const contextGameIds = challenges
    .filter((row) => isFoulChallenge(row))
    .filter((row) => !cleanText(row.matched_call_event_id || row.matchedCallEventId))
    .map((row) => row.game_id);
  const contextActions = await loadLiveLocationContext(contextGameIds);

  const enriched = enrichChallengeEventsWithOfficials(challenges, calls, assignments, { contextActions });
  const changedRows = enriched.filter((row, index) => rowChanged(challenges[index], row));
  const summary = {
    season,
    mode: apply ? "apply" : "dry-run",
    challenges: challenges.length,
    calls: calls.length,
    assignments: assignments.length,
    changedRows: changedRows.length,
    withWhistleBefore: challenges.filter((row) => cleanText(row.whistling_official_name)).length,
    withWhistleAfter: enriched.filter((row) => cleanText(row.whistling_official_name)).length,
    withCrewChiefBefore: challenges.filter((row) => cleanText(row.crew_chief_name)).length,
    withCrewChiefAfter: enriched.filter((row) => cleanText(row.crew_chief_name)).length,
    linkedCallBefore: challenges.filter((row) => cleanText(row.matched_call_event_id)).length,
    linkedCallAfter: enriched.filter((row) => cleanText(row.matched_call_event_id)).length,
    needsReviewAfter: enriched.filter((row) => row.review_status === "needs_review").length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (apply && changedRows.length) {
    const updated = await applyUpdates(supabase, changedRows);
    console.log(`Updated ${updated} challenge rows.`);
  } else if (!apply) {
    console.log("Dry run only. Re-run with --apply to write challenge official links.");
  }

  const autoProximateTags = apply
    ? await applyAutoProximateTags(supabase, enriched, calls)
    : { eligible: proximateAutoTagChallengeIds(enriched, calls).length, inserted: 0 };
  console.log(JSON.stringify({ autoProximateTags }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
