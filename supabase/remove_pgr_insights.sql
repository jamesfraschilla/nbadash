-- Permanently retire PGR Insights and remove its database footprint.
-- The original Excel workbooks are archived outside Supabase.

begin;

drop materialized view if exists public.nba_pgr_accuracy_rollups_cache;
drop materialized view if exists public.nba_pgr_overview_rollups_cache;
drop materialized view if exists public.nba_pgr_import_rollups_cache;

drop view if exists public.nba_pgr_assessment_distribution;
drop view if exists public.nba_pgr_infraction_type_distribution;
drop view if exists public.nba_pgr_accuracy_rollups;
drop view if exists public.nba_pgr_overview_rollups;
drop view if exists public.nba_pgr_import_rollups;

drop function if exists public.nba_pgr_smart_filter_options(text);
drop function if exists public.nba_pgr_smart_insights(jsonb);
drop function if exists public.nba_import_pgr_report(jsonb);
drop function if exists public.nba_pgr_build_summary_payload(jsonb);

drop table if exists public.nba_pgr_evaluations;
drop table if exists public.nba_pgr_events;
drop table if exists public.nba_pgr_possessions;
drop table if exists public.nba_pgr_imports;

delete from public.nba_officiating_cache_refreshes
where cache_name like 'nba_pgr_%';

commit;

notify pgrst, 'reload schema';
