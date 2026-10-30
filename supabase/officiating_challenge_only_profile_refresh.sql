-- Challenge corrections do not require recomputing historical foul/call rates.
-- Update only derived challenge columns, with the same definitions as the full
-- profile views. Source calls, participation flags, and user content are untouched.
begin;
create or replace function public.refresh_nba_challenge_profile_caches_for_season(target_season text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare official_rows integer; team_rows integer; overview_rows integer;
begin
  if coalesce(target_season, '') = '' then raise exception 'Season required'; end if;
  if target_season not in ('2024-25', '2025-26') then
    raise exception 'Historical participant coverage must be verified for this season';
  end if;
  with challenges as materialized (
    select * from public.nba_authoritative_coach_challenge_events_cache
    where season = target_season and lower(coalesce(season_type, '')) <> 'preseason'
  ), participating as materialized (
    select game_id, coalesce(nullif(official_id, ''), official_name) as official_key
    from public.nba_official_game_assignments
    where season = target_season and not is_alternate and lower(coalesce(season_type, '')) <> 'preseason'
    -- Verified against distinct raw-call participants for both historical
    -- seasons: zero call-only members are absent from active assignments.
    -- Do not rescan the large call table for every challenge-only refresh.
  ), links as (
    select id, challenge_outcome, coalesce(nullif(whistling_official_id, ''), whistling_official_name) as official_key,
      true as whistle, false as chief, false as crew from challenges
    union all
    select id, challenge_outcome, coalesce(nullif(crew_chief_id, ''), crew_chief_name), false, true, false from challenges
    union all
    select c.id, c.challenge_outcome, p.official_key, false, false, true
    from challenges c join participating p using (game_id)
  ), counts as materialized (
    select official_key,
      count(distinct id) filter (where whistle or chief)::integer as n,
      count(distinct id) filter (where (whistle or chief) and challenge_outcome = 'successful')::integer as s,
      count(distinct id) filter (where whistle)::integer as wn,
      count(distinct id) filter (where whistle and challenge_outcome = 'successful')::integer as ws,
      count(distinct id) filter (where chief)::integer as hn,
      count(distinct id) filter (where chief and challenge_outcome = 'successful')::integer as hs,
      count(distinct id) filter (where crew)::integer as cn,
      count(distinct id) filter (where crew and challenge_outcome = 'successful')::integer as cs
    from links where coalesce(official_key, '') <> '' group by official_key
  ), totals as (
    select p.id, coalesce(c.n,0) n, coalesce(c.s,0) s, coalesce(c.wn,0) wn, coalesce(c.ws,0) ws,
      coalesce(c.hn,0) hn, coalesce(c.hs,0) hs, coalesce(c.cn,0) cn, coalesce(c.cs,0) cs
    from public.nba_official_profiles_cache p left join counts c on c.official_key = p.id
    where p.season = target_season
  )
  update public.nba_official_profiles_cache p set
    challenges = t.n, successful_challenges = t.s,
    whistle_challenges = t.wn, successful_whistle_challenges = t.ws,
    whistle_challenge_rate = case when t.wn > 0 then t.ws::numeric/t.wn else 0 end,
    crew_chief_challenges = t.hn, successful_crew_chief_challenges = t.hs,
    crew_chief_challenge_rate = case when t.hn > 0 then t.hs::numeric/t.hn else 0 end,
    crew_challenges = t.cn, successful_crew_challenges = t.cs,
    crew_challenge_rate = case when t.cn > 0 then t.cs::numeric/t.cn else 0 end
  from totals t where p.season = target_season and p.id = t.id;
  get diagnostics official_rows = row_count;

  with counts as (
    select challenging_team, count(*)::integer n,
      count(*) filter (where challenge_outcome = 'successful')::integer s
    from public.nba_authoritative_coach_challenge_events_cache
    where season = target_season and lower(coalesce(season_type, '')) <> 'preseason'
    group by challenging_team
  ), totals as (
    select p.team, coalesce(c.n,0) n, coalesce(c.s,0) s
    from public.nba_team_profiles_cache p left join counts c on c.challenging_team = p.team
    where p.season = target_season
  ) update public.nba_team_profiles_cache p set challenges = t.n, successful_challenges = t.s,
    challenge_rate = case when t.n > 0 then t.s::numeric/t.n else 0 end
    from totals t where p.season = target_season and p.team = t.team;
  get diagnostics team_rows = row_count;

  with totals as (
    select count(*)::integer n, count(*) filter (where challenge_outcome = 'successful')::integer s
    from public.nba_authoritative_coach_challenge_events_cache
    where season = target_season and lower(coalesce(season_type, '')) <> 'preseason'
  ) update public.nba_officiating_overview_rollups_cache p set challenges = t.n,
    successful_challenges = t.s, challenge_rate = case when t.n > 0 then t.s::numeric/t.n else 0 end
    from totals t where p.season = target_season;
  get diagnostics overview_rows = row_count;
  return jsonb_build_object('officials',official_rows,'teams',team_rows,'overview',overview_rows);
end;
$$;
revoke all on function public.refresh_nba_challenge_profile_caches_for_season(text) from public, anon, authenticated;
grant execute on function public.refresh_nba_challenge_profile_caches_for_season(text) to service_role;
-- Reuse the existing API signature: no API-schema reload is needed for a
-- newly added cache target. All other refresh branches remain byte-for-byte.
do $dispatch$
declare definition text;
begin
  select pg_get_functiondef('public.refresh_nba_officiating_cache_for_season(text,text)'::regprocedure) into definition;
  if position('when ''challenge-profile-columns''' in definition) = 0 then
    if definition !~* 'case\s+target_cache' then raise exception 'Unrecognized refresh dispatcher'; end if;
    definition := regexp_replace(definition, 'case\s+target_cache',
      'case target_cache when ''challenge-profile-columns'' then perform public.refresh_nba_challenge_profile_caches_for_season(target_season); select count(*) into affected_rows from public.nba_official_profiles_cache where season = target_season; return affected_rows;', 'i');
    execute definition;
  end if;
end;
$dispatch$;
commit;
