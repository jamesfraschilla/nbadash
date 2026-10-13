-- Avoid filtering the coalesced season of a full-joined historical view.
-- Bound every overview aggregate before scanning, using the challenge cache
-- refreshed immediately before this step. Existing RPC signature/security and
-- all other cache branches remain unchanged. No source or user data changes.
begin;
create or replace function public.refresh_nba_officiating_cache_for_season(target_season text, target_cache text)
returns integer
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

  case target_cache
    when 'nba_official_call_category_rollups_cache' then
      delete from public.nba_official_call_category_rollups_cache where season = target_season;
      insert into public.nba_official_call_category_rollups_cache select * from public.nba_official_call_category_rollups where season = target_season;
    when 'nba_authoritative_coach_challenge_events_cache' then
      delete from public.nba_authoritative_coach_challenge_events_cache where season = target_season;
      insert into public.nba_authoritative_coach_challenge_events_cache select * from public.nba_authoritative_coach_challenge_events where season = target_season;
    when 'nba_team_call_category_rollups_cache' then
      delete from public.nba_team_call_category_rollups_cache where season = target_season;
      insert into public.nba_team_call_category_rollups_cache select * from public.nba_team_call_category_rollups where season = target_season;
    when 'nba_team_official_net_call_rollups_cache' then
      delete from public.nba_team_official_net_call_rollups_cache where season = target_season;
      insert into public.nba_team_official_net_call_rollups_cache select * from public.nba_team_official_net_call_rollups where season = target_season;
    when 'nba_officiating_overview_rollups_cache' then
      delete from public.nba_officiating_overview_rollups_cache where season = target_season;
      insert into public.nba_officiating_overview_rollups_cache
      with calls as (
        select count(*)::integer as call_events,
          count(distinct coalesce(official_id, official_name))::integer as officials
        from public.nba_official_call_events
        where season = target_season and lower(coalesce(season_type, '')) <> 'preseason'
      ), challenges as (
        select count(*)::integer as challenges,
          count(*) filter (where challenge_outcome = 'successful')::integer as successful_challenges
        from public.nba_authoritative_coach_challenge_events_cache
        where season = target_season and lower(coalesce(season_type, '')) <> 'preseason'
      ), assignments as (
        select count(distinct coalesce(official_id, official_name))::integer as officials
        from public.nba_official_game_assignments
        where season = target_season and not is_alternate and lower(coalesce(season_type, '')) <> 'preseason'
      ), teams as (
        select count(distinct team)::integer as teams from (
          select coalesce(charged_team, team_tricode) as team from public.nba_official_call_events
          where season = target_season and coalesce(charged_team, team_tricode, '') <> ''
            and lower(coalesce(season_type, '')) <> 'preseason'
          union
          select challenging_team as team from public.nba_authoritative_coach_challenge_events_cache
          where season = target_season and coalesce(challenging_team, '') <> ''
            and lower(coalesce(season_type, '')) <> 'preseason'
        ) t
      )
      select target_season, calls.call_events, challenges.challenges, challenges.successful_challenges,
        case when challenges.challenges > 0 then challenges.successful_challenges::numeric / challenges.challenges else 0 end,
        greatest(calls.officials, assignments.officials), teams.teams
      from calls cross join challenges cross join assignments cross join teams
      where calls.call_events > 0 or challenges.challenges > 0 or assignments.officials > 0 or teams.teams > 0;
    when 'nba_official_profiles_cache' then
      delete from public.nba_official_profiles_cache where season = target_season;
      insert into public.nba_official_profiles_cache select * from public.nba_official_profiles where season = target_season;
    when 'nba_team_profiles_cache' then
      delete from public.nba_team_profiles_cache where season = target_season;
      insert into public.nba_team_profiles_cache select * from public.nba_team_profiles where season = target_season;
    else
      raise exception 'Unsupported officiating cache: %', target_cache;
  end case;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.refresh_nba_officiating_cache_for_season(text, text) from public, anon, authenticated;
grant execute on function public.refresh_nba_officiating_cache_for_season(text, text) to service_role;
commit;
