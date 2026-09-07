-- Non-destructive database storage audit.
-- Run in Supabase SQL Editor to identify the tables, indexes, and JSON columns
-- using the most space before deleting or rewriting anything.

-- 1) Biggest public tables, including indexes.
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

-- 2) Biggest indexes.
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

-- 3) Dead tuple / vacuum candidates.
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

-- 4) Known JSON-heavy columns. These are often the fastest safe savings.
select 'nba_official_game_assignments.source_payload' as item, count(*) as rows, pg_size_pretty(coalesce(sum(pg_column_size(source_payload)), 0)::bigint) as approx_size from public.nba_official_game_assignments
union all
select 'nba_official_call_events.source_payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(source_payload)), 0)::bigint) from public.nba_official_call_events
union all
select 'nba_coach_challenge_events.source_payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(source_payload)), 0)::bigint) from public.nba_coach_challenge_events
union all
select 'nba_pgr_imports.summary_payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(summary_payload)), 0)::bigint) from public.nba_pgr_imports
union all
select 'nba_pgr_imports.source_payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(source_payload)), 0)::bigint) from public.nba_pgr_imports
union all
select 'nba_pgr_possessions.source_payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(source_payload)), 0)::bigint) from public.nba_pgr_possessions
union all
select 'nba_pgr_events.source_payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(source_payload)), 0)::bigint) from public.nba_pgr_events
union all
select 'nba_pgr_evaluations.raw_row', count(*), pg_size_pretty(coalesce(sum(pg_column_size(raw_row)), 0)::bigint) from public.nba_pgr_evaluations
union all
select 'nba_official_game_facts.category_counts', count(*), pg_size_pretty(coalesce(sum(pg_column_size(category_counts)), 0)::bigint) from public.nba_official_game_facts
union all
select 'nba_official_game_facts.team_net_calls', count(*), pg_size_pretty(coalesce(sum(pg_column_size(team_net_calls)), 0)::bigint) from public.nba_official_game_facts
union all
select 'nba_officiating_insight_reports.payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(payload)), 0)::bigint) from public.nba_officiating_insight_reports
union all
select 'user_notes.source_meta', count(*), pg_size_pretty(coalesce(sum(pg_column_size(source_meta)), 0)::bigint) from public.user_notes
union all
select 'user_note_versions.snapshot', count(*), pg_size_pretty(coalesce(sum(pg_column_size(snapshot)), 0)::bigint) from public.user_note_versions
union all
select 'user_drawings.strokes', count(*), pg_size_pretty(coalesce(sum(pg_column_size(strokes)), 0)::bigint) from public.user_drawings
union all
select 'user_drawing_versions.snapshot', count(*), pg_size_pretty(coalesce(sum(pg_column_size(snapshot)), 0)::bigint) from public.user_drawing_versions
union all
select 'user_tool_records.payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(payload)), 0)::bigint) from public.user_tool_records
union all
select 'audit_logs.detail', count(*), pg_size_pretty(coalesce(sum(pg_column_size(detail)), 0)::bigint) from public.audit_logs
union all
select 'game_analysis_segments.result', count(*), pg_size_pretty(coalesce(sum(pg_column_size(result)), 0)::bigint) from public.game_analysis_segments
union all
select 'game_live_state.payload', count(*), pg_size_pretty(coalesce(sum(pg_column_size(payload)), 0)::bigint) from public.game_live_state
union all
select 'game_live_state.diagnostics', count(*), pg_size_pretty(coalesce(sum(pg_column_size(diagnostics)), 0)::bigint) from public.game_live_state
order by approx_size desc;

-- 5) Season/type distribution for major imported tables.
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
union all
select 'nba_pgr_imports', season, null::text as season_type, count(*) from public.nba_pgr_imports group by season
union all
select 'nba_pgr_possessions', season, null::text, count(*) from public.nba_pgr_possessions group by season
union all
select 'nba_pgr_events', season, null::text, count(*) from public.nba_pgr_events group by season
union all
select 'nba_pgr_evaluations', season, null::text, count(*) from public.nba_pgr_evaluations group by season
order by table_name, season, season_type;

-- 6) Storage objects are not Postgres rows, but this checks whether exported
-- artifacts or images are accumulating in storage buckets.
select
  bucket_id,
  count(*) as object_count,
  pg_size_pretty(coalesce(sum(metadata->>'size')::bigint, 0)) as total_object_size
from storage.objects
group by bucket_id
order by coalesce(sum(metadata->>'size')::bigint, 0) desc;
