-- Non-destructive database storage audit.
-- Run in Supabase SQL Editor to identify the tables, indexes, and JSON columns
-- using the most space before deleting or rewriting anything.

-- 1) Current database size. Record this value before and after any cleanup.
select
  current_database() as database_name,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_database_size(current_database()) as database_bytes;

-- 2) Retired PGR objects and their current footprints. An empty result means
-- the cleanup has already removed every object named by remove_pgr_insights.sql.
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    when 'i' then 'index'
    when 'S' then 'sequence'
    else c.relkind::text
  end as object_type,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_total_relation_size(c.oid) as total_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'nba_pgr_%'
order by total_bytes desc, object_name;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'nba_pgr_%'
order by function_name, arguments;

-- 3) Biggest public tables, including indexes.
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  n_dead_tup as estimated_dead_rows,
  pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as table_size,
  pg_size_pretty(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as index_size,
  pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as total_size,
  pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) as total_bytes
from pg_stat_user_tables
where schemaname = 'public'
order by total_bytes desc
limit 40;

-- 4) Biggest indexes.
select
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  pg_relation_size(indexrelid) as index_bytes
from pg_stat_user_indexes
where schemaname = 'public'
order by index_bytes desc
limit 40;

-- 5) Dead tuple / vacuum candidates.
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  n_dead_tup as estimated_dead_rows,
  round((n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0)) * 100, 1) as estimated_dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
where schemaname = 'public'
order by n_dead_tup desc
limit 40;

-- 6) Known JSON-heavy columns. These are often the fastest safe savings.
-- Keep the byte count numeric until the final projection so ordering is accurate.
with json_sizes as (
select 'nba_official_game_assignments.source_payload' as item, count(*) as rows, coalesce(sum(pg_column_size(source_payload)), 0)::bigint as approx_bytes from public.nba_official_game_assignments
union all
select 'nba_official_call_events.source_payload', count(*), coalesce(sum(pg_column_size(source_payload)), 0)::bigint from public.nba_official_call_events
union all
select 'nba_coach_challenge_events.source_payload', count(*), coalesce(sum(pg_column_size(source_payload)), 0)::bigint from public.nba_coach_challenge_events
union all
select 'nba_official_game_facts.category_counts', count(*), coalesce(sum(pg_column_size(category_counts)), 0)::bigint from public.nba_official_game_facts
union all
select 'nba_official_game_facts.team_net_calls', count(*), coalesce(sum(pg_column_size(team_net_calls)), 0)::bigint from public.nba_official_game_facts
union all
select 'nba_officiating_insight_reports.payload', count(*), coalesce(sum(pg_column_size(payload)), 0)::bigint from public.nba_officiating_insight_reports
union all
select 'user_notes.source_meta', count(*), coalesce(sum(pg_column_size(source_meta)), 0)::bigint from public.user_notes
union all
select 'user_note_versions.snapshot', count(*), coalesce(sum(pg_column_size(snapshot)), 0)::bigint from public.user_note_versions
union all
select 'user_drawings.strokes', count(*), coalesce(sum(pg_column_size(strokes)), 0)::bigint from public.user_drawings
union all
select 'user_drawing_versions.snapshot', count(*), coalesce(sum(pg_column_size(snapshot)), 0)::bigint from public.user_drawing_versions
union all
select 'user_tool_records.payload', count(*), coalesce(sum(pg_column_size(payload)), 0)::bigint from public.user_tool_records
union all
select 'audit_logs.detail', count(*), coalesce(sum(pg_column_size(detail)), 0)::bigint from public.audit_logs
union all
select 'game_analysis_segments.result', count(*), coalesce(sum(pg_column_size(result)), 0)::bigint from public.game_analysis_segments
union all
select 'game_live_state.payload', count(*), coalesce(sum(pg_column_size(payload)), 0)::bigint from public.game_live_state
union all
select 'game_live_state.diagnostics', count(*), coalesce(sum(pg_column_size(diagnostics)), 0)::bigint from public.game_live_state
)
select item, rows, pg_size_pretty(approx_bytes) as approx_size, approx_bytes
from json_sizes
order by approx_bytes desc;

-- 7) Season/type distribution for major imported tables.
select 'nba_official_game_assignments' as table_name, season, season_type, count(*) as rows from public.nba_official_game_assignments group by season, season_type
union all
select 'nba_official_call_events', season, season_type, count(*) from public.nba_official_call_events group by season, season_type
union all
select 'nba_coach_challenge_events', season, season_type, count(*) from public.nba_coach_challenge_events group by season, season_type
union all
select 'nba_team_game_facts', season, season_type, count(*) from public.nba_team_game_facts group by season, season_type
union all
select 'nba_player_game_facts', season, season_type, count(*) from public.nba_player_game_facts group by season, season_type
union all
select 'nba_official_game_facts', season, season_type, count(*) from public.nba_official_game_facts group by season, season_type
order by table_name, season, season_type;

-- 8) Storage objects are not Postgres rows, but this checks whether exported
-- artifacts or images are accumulating in storage buckets.
select
  bucket_id,
  count(*) as object_count,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as total_object_size,
  coalesce(sum((metadata->>'size')::bigint), 0) as total_object_bytes
from storage.objects
group by bucket_id
order by total_object_bytes desc;
