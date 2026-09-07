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

      with raw_shooting as (
        select season, count(*)::integer as raw_shooting_fouls
        from public.nba_official_call_events
        where lower(coalesce(season_type, '')) <> 'preseason'
          and primary_category = 'foul'
          and secondary_category = 'shooting_personal'
        group by season
      ),
      normalized_shooting as (
        select season, coalesce(sum(calls), 0)::integer as normalized_shooting_fouls
        from public.nba_official_call_category_rollups_cache
        where category in ('Shooting Foul', 'Restricted Area Shooting Foul', '3-Pt Shooting Foul')
        group by season
      )
      select
        coalesce(raw_shooting.season, normalized_shooting.season) as season,
        coalesce(raw_shooting_fouls, 0) as raw_shooting_fouls,
        coalesce(normalized_shooting_fouls, 0) as normalized_shooting_fouls,
        coalesce(raw_shooting_fouls, 0) - coalesce(normalized_shooting_fouls, 0) as delta,
        case
          when coalesce(raw_shooting_fouls, 0) = coalesce(normalized_shooting_fouls, 0) then 'ok'
          else 'mismatch'
        end as status
      from raw_shooting
      full join normalized_shooting using (season)
      order by season;
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
