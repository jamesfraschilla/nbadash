#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const execFileAsync = promisify(execFile);

const ROLLUP_CACHES = [
  "nba_pgr_import_rollups_cache",
  "nba_pgr_overview_rollups_cache",
  "nba_pgr_accuracy_rollups_cache",
];

async function runSql(sql) {
  await execFileAsync("npx", ["supabase", "db", "query", "--linked", sql], {
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function refreshView(view) {
  const startedAt = Date.now();
  await runSql(`refresh materialized view public.${view};`);
  return Date.now() - startedAt;
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
  await assertOutsideWizardsGameWindow("PGR rollup refresh");
  const startedAt = Date.now();
  for (const view of ROLLUP_CACHES) {
    process.stdout.write(`Refreshing ${view}... `);
    const viewStartedAt = Date.now();
    try {
      const durationMs = await refreshView(view);
      await recordRefresh({ view, durationMs, status: "success" });
      process.stdout.write(`${(durationMs / 1000).toFixed(1)}s\n`);
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
  console.log(`Refreshed ${ROLLUP_CACHES.length} PGR rollup caches in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
