#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

async function main() {
  const startedAt = Date.now();
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
