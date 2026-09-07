#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const execFileAsync = promisify(execFile);
const CACHE_NAMES = [
  "nba_authoritative_coach_challenge_events_cache",
  "nba_official_call_category_rollups_cache",
  "nba_team_call_category_rollups_cache",
  "nba_team_official_net_call_rollups_cache",
  "nba_officiating_overview_rollups_cache",
  "nba_official_profiles_cache",
  "nba_team_profiles_cache",
];

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

async function runSql(sql) {
  return execFileAsync("npx", ["supabase", "db", "query", "--linked", sql], {
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function recordRefreshJob({ cacheName, durationMs, status, errorMessage = "" }) {
  const safeName = cacheName.replace(/'/g, "''");
  const safeError = errorMessage.replace(/'/g, "''");
  await runSql(`
    insert into public.nba_officiating_cache_refreshes
      (cache_name, refreshed_at, duration_ms, row_count, status, error_message)
    values
      ('${safeName}', timezone('utc', now()), ${durationMs}, 0, '${status}', ${safeError ? `'${safeError}'` : "null"})
    on conflict (cache_name) do update set
      refreshed_at = excluded.refreshed_at,
      duration_ms = excluded.duration_ms,
      row_count = excluded.row_count,
      status = excluded.status,
      error_message = excluded.error_message;
  `);
}

async function main() {
  await assertOutsideWizardsGameWindow("officiating rollup refresh");
  const season = readArg("season");
  if (!season) {
    throw new Error("--season is required. Officiating caches must only be refreshed for the affected season.");
  }

  const safeSeason = season.replace(/'/g, "''");
  const startedAt = Date.now();
  process.stdout.write(`Refreshing officiating rollup caches for ${season}... `);
  try {
    const outputs = [];
    for (const cacheName of CACHE_NAMES) {
      const { stdout } = await runSql(
        `select public.refresh_nba_officiating_cache_for_season('${safeSeason}', '${cacheName}') as row_count;`
      );
      outputs.push(stdout.trim());
    }
    const durationMs = Date.now() - startedAt;
    await recordRefreshJob({ cacheName: `season:${season}`, durationMs, status: "success" });
    process.stdout.write(`${(durationMs / 1000).toFixed(1)}s\n`);
    outputs.filter(Boolean).forEach((output) => console.log(output));
  } catch (error) {
    await recordRefreshJob({
      cacheName: `season:${season}`,
      durationMs: Date.now() - startedAt,
      status: "failed",
      errorMessage: error.message || String(error),
    }).catch(() => {});
    throw new Error(
      `Season-scoped refresh failed. Apply supabase/officiating_season_scoped_rollup_caches.sql first. ${error.message || error}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
