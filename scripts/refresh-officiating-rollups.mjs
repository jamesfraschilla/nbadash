#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const execFileAsync = promisify(execFile);

const ROLLUP_CACHES = [
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

async function refreshView(view) {
  const startedAt = Date.now();
  await execFileAsync("npx", [
    "supabase",
    "db",
    "query",
    "--linked",
    `refresh materialized view public.${view};`,
  ], {
    maxBuffer: 1024 * 1024 * 8,
  });
  return ((Date.now() - startedAt) / 1000).toFixed(1);
}

async function runSql(sql) {
  await execFileAsync("npx", ["supabase", "db", "query", "--linked", sql], {
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function refreshSeason(season) {
  const safeSeason = season.replace(/'/g, "''");
  const { stdout } = await execFileAsync("npx", [
    "supabase",
    "db",
    "query",
    "--linked",
    `select * from public.refresh_nba_officiating_rollup_caches_for_season('${safeSeason}');`,
  ], {
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout;
}

async function recordRefresh({ view, durationMs, status, errorMessage = "" }) {
  const safeView = view.replace(/'/g, "''");
  const safeError = errorMessage.replace(/'/g, "''");
  await runSql(`
    insert into public.nba_officiating_cache_refreshes
      (cache_name, refreshed_at, duration_ms, row_count, status, error_message)
    values
      ('${safeView}', timezone('utc', now()), ${durationMs}, (select count(*)::integer from public.${view}), '${status}', ${safeError ? `'${safeError}'` : "null"})
    on conflict (cache_name) do update set
      refreshed_at = excluded.refreshed_at,
      duration_ms = excluded.duration_ms,
      row_count = excluded.row_count,
      status = excluded.status,
      error_message = excluded.error_message;
  `);
}

async function recordRefreshJob({ cacheName, durationMs, rowCount = 0, status, errorMessage = "" }) {
  const safeName = cacheName.replace(/'/g, "''");
  const safeError = errorMessage.replace(/'/g, "''");
  await runSql(`
    insert into public.nba_officiating_cache_refreshes
      (cache_name, refreshed_at, duration_ms, row_count, status, error_message)
    values
      ('${safeName}', timezone('utc', now()), ${durationMs}, ${rowCount}, '${status}', ${safeError ? `'${safeError}'` : "null"})
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
  const startedAt = Date.now();
  if (season) {
    process.stdout.write(`Refreshing officiating rollup caches for ${season}... `);
    const viewStartedAt = Date.now();
    try {
      const stdout = await refreshSeason(season);
      const durationMs = Date.now() - viewStartedAt;
      await recordRefreshJob({
        cacheName: `season:${season}`,
        durationMs,
        status: "success",
      });
      process.stdout.write(`${(durationMs / 1000).toFixed(1)}s\n`);
      if (stdout.trim()) console.log(stdout.trim());
      return;
    } catch (error) {
      await recordRefreshJob({
        cacheName: `season:${season}`,
        durationMs: Date.now() - viewStartedAt,
        status: "failed",
        errorMessage: error.message || String(error),
      }).catch(() => {});
      throw new Error(
        `Season-scoped refresh failed. Apply supabase/officiating_season_scoped_rollup_caches.sql first. ${error.message || error}`
      );
    }
  }
  for (const view of ROLLUP_CACHES) {
    process.stdout.write(`Refreshing ${view}... `);
    const viewStartedAt = Date.now();
    try {
      const seconds = await refreshView(view);
      await recordRefresh({
        view,
        durationMs: Date.now() - viewStartedAt,
        status: "success",
      });
      process.stdout.write(`${seconds}s\n`);
    } catch (error) {
      await recordRefresh({
        view,
        durationMs: Date.now() - viewStartedAt,
        status: "failed",
        errorMessage: error.message || String(error),
      }).catch(() => {});
      throw error;
    }
  }
  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Refreshed ${ROLLUP_CACHES.length} officiating rollup caches in ${totalSeconds}s.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
