create materialized view if not exists public.nba_pgr_import_rollups_cache as
select * from public.nba_pgr_import_rollups
with data;

create unique index if not exists nba_pgr_import_rollups_cache_key
on public.nba_pgr_import_rollups_cache (id);

create index if not exists nba_pgr_import_rollups_cache_season_date
on public.nba_pgr_import_rollups_cache (season, game_date desc);

create materialized view if not exists public.nba_pgr_overview_rollups_cache as
select * from public.nba_pgr_overview_rollups
with data;

create unique index if not exists nba_pgr_overview_rollups_cache_key
on public.nba_pgr_overview_rollups_cache (season);

create materialized view if not exists public.nba_pgr_accuracy_rollups_cache as
select * from public.nba_pgr_accuracy_rollups
with data;

create unique index if not exists nba_pgr_accuracy_rollups_cache_key
on public.nba_pgr_accuracy_rollups_cache (season, scope);
