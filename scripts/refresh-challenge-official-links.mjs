#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { enrichChallengeEventsWithOfficials } from "../src/officiatingChallengeMatcher.js";

const DEFAULT_SEASON = "2025-26";
const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 250;

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

function cleanText(value) {
  return String(value || "").trim();
}

function rowChanged(before, after) {
  return [
    "crew_chief_id",
    "crew_chief_name",
    "whistling_official_id",
    "whistling_official_name",
    "matched_action_number",
    "matched_call_event_id",
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
    await Promise.all(chunk.map(async (row) => {
      const updateRow = toUpdateRow(row);
      const { id, ...payload } = updateRow;
      const { error } = await supabase
        .from("nba_coach_challenge_events")
        .update(payload)
        .eq("id", id);
      if (error) throw new Error(`Failed updating challenge row ${id}: ${error.message}`);
    }));
    updated += chunk.length;
  }
  return updated;
}

async function main() {
  await assertOutsideWizardsGameWindow("challenge official-link refresh");
  await loadLocalEnv();
  const supabase = createSupabaseClient();
  const season = readArg("season") || DEFAULT_SEASON;
  const apply = hasFlag("apply");

  const [challenges, calls, assignments] = await Promise.all([
    selectAll(supabase, "nba_coach_challenge_events", (query) => query
      .select("*")
      .eq("season", season)
      .eq("source", "nba_official_challenge_pdf")
      .order("game_date", { ascending: true })),
    selectAll(supabase, "nba_official_call_events", (query) => query
      .select("id,season,game_id,period,game_clock,action_number,action_type,primary_category,secondary_category,sub_type,descriptor,description,official_id,official_name,charged_team")
      .eq("season", season)
      .order("game_id", { ascending: true })
      .order("action_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })),
    selectAll(supabase, "nba_official_game_assignments", (query) => query
      .select("*")
      .eq("season", season)
      .order("game_id", { ascending: true })
      .order("assignment_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })),
  ]);

  const enriched = enrichChallengeEventsWithOfficials(challenges, calls, assignments);
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
