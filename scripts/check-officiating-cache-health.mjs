#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const { stdout } = await execFileAsync("npx", [
    "supabase",
    "db",
    "query",
    "--linked",
    `
      select
        cache_name,
        refreshed_at,
        round(duration_ms::numeric / 1000, 1) as duration_seconds,
        row_count,
        status,
        error_message
      from public.nba_officiating_cache_refreshes
      order by cache_name;
    `,
  ], {
    maxBuffer: 1024 * 1024 * 8,
  });
  process.stdout.write(stdout);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
