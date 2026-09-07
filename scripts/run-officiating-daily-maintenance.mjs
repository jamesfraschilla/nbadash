#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const CURRENT_SEASON = "2026-27";
const SEASON_START = Date.parse("2026-10-03T00:00:00-04:00");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) return;
    process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  });
}

function easternHour() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
}

async function latestUpdatedAt(supabase, table) {
  const { data, error } = await supabase
    .from(table)
    .select("updated_at")
    .eq("season", CURRENT_SEASON)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed checking ${table}: ${error.message}`);
  return data?.[0]?.updated_at ? Date.parse(data[0].updated_at) : 0;
}

async function exactCount(supabase, table, buildQuery) {
  const { count, error } = await buildQuery(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) throw new Error(`Failed auditing ${table}: ${error.message}`);
  return count || 0;
}

async function shootingFoulIntegrityMismatch(supabase) {
  const [rawShootingFouls, rollupRows] = await Promise.all([
    exactCount(supabase, "nba_official_call_events", (query) => query
      .eq("season", CURRENT_SEASON)
      .or("season_type.is.null,season_type.not.ilike.Preseason")
      .eq("primary_category", "foul")
      .eq("secondary_category", "shooting_personal")),
    supabase
      .from("nba_official_call_category_rollups_cache")
      .select("category,calls")
      .eq("season", CURRENT_SEASON)
      .in("category", ["Shooting Foul", "Restricted Area Shooting Foul", "3-Pt Shooting Foul"]),
  ]);
  if (rollupRows.error) {
    throw new Error(`Failed auditing shooting foul rollups: ${rollupRows.error.message}`);
  }

  const normalizedShootingFouls = (rollupRows.data || [])
    .reduce((sum, row) => sum + (Number(row.calls) || 0), 0);
  return {
    rawShootingFouls,
    normalizedShootingFouls,
    mismatch: rawShootingFouls !== normalizedShootingFouls,
  };
}

async function main() {
  await loadEnvFile(path.join(process.cwd(), ".env"));
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
  if (!hasFlag("force-time") && easternHour() !== 5) {
    console.log("Skipping: daily officiating maintenance only runs during the 5:00 AM America/New_York hour.");
    return;
  }
  if (!hasFlag("force-season") && Date.now() < SEASON_START) {
    console.log(`Skipping: ${CURRENT_SEASON} maintenance starts October 3, 2026.`);
    return;
  }
  await assertOutsideWizardsGameWindow("daily officiating maintenance");

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: cacheRows, error: cacheError } = await supabase
    .from("nba_officiating_cache_refreshes")
    .select("refreshed_at,status")
    .eq("cache_name", `season:${CURRENT_SEASON}`)
    .limit(1);
  if (cacheError) throw new Error(`Failed checking cache status: ${cacheError.message}`);
  const cacheTime = cacheRows?.[0]?.status === "success" ? Date.parse(cacheRows[0].refreshed_at) : 0;
  const sourceTimes = await Promise.all([
    latestUpdatedAt(supabase, "nba_official_call_events"),
    latestUpdatedAt(supabase, "nba_official_game_assignments"),
    latestUpdatedAt(supabase, "nba_coach_challenge_events"),
  ]);
  const sourceTime = Math.max(...sourceTimes);
  let refreshed = false;
  if (sourceTime > cacheTime) {
    const startedAt = Date.now();
    const { error } = await supabase.rpc("refresh_nba_officiating_rollup_caches_for_season", {
      target_season: CURRENT_SEASON,
    });
    if (error) throw new Error(`Season cache refresh failed: ${error.message}`);
    const { error: recordError } = await supabase
      .from("nba_officiating_cache_refreshes")
      .upsert({
        cache_name: `season:${CURRENT_SEASON}`,
        refreshed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        row_count: 0,
        status: "success",
        error_message: null,
      }, { onConflict: "cache_name" });
    if (recordError) throw new Error(`Failed recording cache refresh: ${recordError.message}`);
    refreshed = true;
  }

  const [badAlternates, missingCallOfficials, missingChallengeCrew, shootingFoulIntegrity] = await Promise.all([
    exactCount(supabase, "nba_official_game_assignments", (query) => query
      .eq("season", CURRENT_SEASON)
      .gte("assignment_order", 4)
      .eq("is_alternate", false)),
    exactCount(supabase, "nba_official_call_events", (query) => query
      .eq("season", CURRENT_SEASON)
      .not("season_type", "ilike", "Preseason")
      .is("official_id", null)
      .is("official_name", null)),
    exactCount(supabase, "nba_coach_challenge_events", (query) => query
      .eq("season", CURRENT_SEASON)
      .not("season_type", "ilike", "Preseason")
      .is("crew_chief_id", null)
      .is("crew_chief_name", null)),
    shootingFoulIntegrityMismatch(supabase),
  ]);

  const audit = { season: CURRENT_SEASON, refreshed, badAlternates, missingCallOfficials, missingChallengeCrew, shootingFoulIntegrity };
  console.log(JSON.stringify(audit, null, 2));
  if (badAlternates || missingCallOfficials || missingChallengeCrew || shootingFoulIntegrity.mismatch) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
