-- Converts high-traffic officiating rollup caches from full materialized views
-- into season-refreshable physical tables. Apply before adding additional
-- historical seasons so a backfill can refresh only the affected season.

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_official_call_category_rollups_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_official_call_category_rollups_cache';
  end if;
end $$;
create table if not exists public.nba_official_call_category_rollups_cache
(like public.nba_official_call_category_rollups including defaults);

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_authoritative_coach_challenge_events_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_authoritative_coach_challenge_events_cache';
  end if;
end $$;
create table if not exists public.nba_authoritative_coach_challenge_events_cache
(like public.nba_authoritative_coach_challenge_events including defaults);

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_team_call_category_rollups_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_team_call_category_rollups_cache';
  end if;
end $$;
create table if not exists public.nba_team_call_category_rollups_cache
(like public.nba_team_call_category_rollups including defaults);

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_team_official_net_call_rollups_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_team_official_net_call_rollups_cache';
  end if;
end $$;
create table if not exists public.nba_team_official_net_call_rollups_cache
(like public.nba_team_official_net_call_rollups including defaults);

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_officiating_overview_rollups_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_officiating_overview_rollups_cache';
  end if;
end $$;
create table if not exists public.nba_officiating_overview_rollups_cache
(like public.nba_officiating_overview_rollups including defaults);

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_official_profiles_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_official_profiles_cache';
  end if;
end $$;
create table if not exists public.nba_official_profiles_cache
(like public.nba_official_profiles including defaults);

do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'nba_team_profiles_cache'
      and relkind = 'm'
  ) then
    execute 'drop materialized view public.nba_team_profiles_cache';
  end if;
end $$;
create table if not exists public.nba_team_profiles_cache
(like public.nba_team_profiles including defaults);

create unique index if not exists nba_official_call_category_rollups_cache_key
on public.nba_official_call_category_rollups_cache (season, official_key, category);

create index if not exists nba_official_call_category_rollups_cache_lookup
on public.nba_official_call_category_rollups_cache (season, official_key, calls_per_game desc);

create unique index if not exists nba_authoritative_coach_challenge_events_cache_id
on public.nba_authoritative_coach_challenge_events_cache (id);

create index if not exists nba_authoritative_coach_challenge_events_cache_season_date
on public.nba_authoritative_coach_challenge_events_cache (season, game_date desc);

create index if not exists nba_authoritative_coach_challenge_events_cache_team
on public.nba_authoritative_coach_challenge_events_cache (season, challenging_team, game_date desc);

create index if not exists nba_authoritative_coach_challenge_events_cache_whistle
on public.nba_authoritative_coach_challenge_events_cache (
  season,
  whistling_official_id,
  game_date desc
);

create index if not exists nba_authoritative_coach_challenge_events_cache_crew
on public.nba_authoritative_coach_challenge_events_cache (
  season,
  crew_chief_id,
  game_date desc
);

create unique index if not exists nba_team_call_category_rollups_cache_key
on public.nba_team_call_category_rollups_cache (season, team, category);

create index if not exists nba_team_call_category_rollups_cache_lookup
on public.nba_team_call_category_rollups_cache (season, team, calls_per_game desc);

create unique index if not exists nba_team_official_net_call_rollups_cache_key
on public.nba_team_official_net_call_rollups_cache (season, official_key, team);

create index if not exists nba_team_official_net_call_rollups_cache_team_lookup
on public.nba_team_official_net_call_rollups_cache (season, team, net_calls_for_per_game desc);

create index if not exists nba_team_official_net_call_rollups_cache_official_lookup
on public.nba_team_official_net_call_rollups_cache (season, official_key, team);

create unique index if not exists nba_officiating_overview_rollups_cache_key
on public.nba_officiating_overview_rollups_cache (season);

create unique index if not exists nba_official_profiles_cache_key
on public.nba_official_profiles_cache (season, id);

create index if not exists nba_official_profiles_cache_calls_lookup
on public.nba_official_profiles_cache (season, calls_per_game desc);

create unique index if not exists nba_team_profiles_cache_key
on public.nba_team_profiles_cache (season, team);

create index if not exists nba_team_profiles_cache_challenge_lookup
on public.nba_team_profiles_cache (season, challenge_rate desc);

create or replace function public.refresh_nba_officiating_rollup_caches_for_season(target_season text)
returns table(cache_name text, row_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  if coalesce(nullif(target_season, ''), '') = '' then
    raise exception 'target_season is required';
  end if;

  delete from public.nba_official_call_category_rollups_cache where season = target_season;
  insert into public.nba_official_call_category_rollups_cache
  select * from public.nba_official_call_category_rollups where season = target_season;
  cache_name := 'nba_official_call_category_rollups_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;

  delete from public.nba_authoritative_coach_challenge_events_cache where season = target_season;
  insert into public.nba_authoritative_coach_challenge_events_cache
  select * from public.nba_authoritative_coach_challenge_events where season = target_season;
  cache_name := 'nba_authoritative_coach_challenge_events_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;

  delete from public.nba_team_call_category_rollups_cache where season = target_season;
  insert into public.nba_team_call_category_rollups_cache
  select * from public.nba_team_call_category_rollups where season = target_season;
  cache_name := 'nba_team_call_category_rollups_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;

  delete from public.nba_team_official_net_call_rollups_cache where season = target_season;
  insert into public.nba_team_official_net_call_rollups_cache
  select * from public.nba_team_official_net_call_rollups where season = target_season;
  cache_name := 'nba_team_official_net_call_rollups_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;

  delete from public.nba_officiating_overview_rollups_cache where season = target_season;
  insert into public.nba_officiating_overview_rollups_cache
  select * from public.nba_officiating_overview_rollups where season = target_season;
  cache_name := 'nba_officiating_overview_rollups_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;

  delete from public.nba_official_profiles_cache where season = target_season;
  insert into public.nba_official_profiles_cache
  select * from public.nba_official_profiles where season = target_season;
  cache_name := 'nba_official_profiles_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;

  delete from public.nba_team_profiles_cache where season = target_season;
  insert into public.nba_team_profiles_cache
  select * from public.nba_team_profiles where season = target_season;
  cache_name := 'nba_team_profiles_cache';
  get diagnostics affected_rows = row_count;
  row_count := affected_rows;
  return next;
end;
$$;
