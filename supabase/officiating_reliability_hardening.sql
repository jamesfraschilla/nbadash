begin;

revoke all on function public.refresh_nba_officiating_rollup_caches_for_season(text) from public;
revoke all on function public.refresh_nba_officiating_rollup_caches_for_season(text) from anon;
revoke all on function public.refresh_nba_officiating_rollup_caches_for_season(text) from authenticated;
grant execute on function public.refresh_nba_officiating_rollup_caches_for_season(text) to service_role;

update public.nba_official_game_assignments
set
  is_alternate = true,
  role_key = 'alternate'
where assignment_order >= 4
  and (is_alternate = false or coalesce(role_key, '') <> 'alternate');

update public.nba_official_game_assignments
set
  official_id = case official_id
    when '11629177' then '1629177'
    when '196295108' then '1629171'
    else official_id
  end,
  official_name = case official_id
    when '11629177' then 'Biniam Maru'
    when '196295108' then 'Agon Abazi'
    else official_name
  end,
  jersey_number = case official_id
    when '11629177' then '94'
    else jersey_number
  end
where official_id in ('11629177', '196295108');

update public.nba_official_call_events
set
  official_id = case official_id
    when '11629177' then '1629177'
    when '196295108' then '1629171'
    else official_id
  end,
  official_name = case official_id
    when '11629177' then 'Biniam Maru'
    when '196295108' then 'Agon Abazi'
    else official_name
  end
where official_id in ('11629177', '196295108');

update public.nba_coach_challenge_events
set
  whistling_official_id = case whistling_official_id
    when '11629177' then '1629177'
    when '196295108' then '1629171'
    else whistling_official_id
  end,
  whistling_official_name = case whistling_official_id
    when '11629177' then 'Biniam Maru'
    when '196295108' then 'Agon Abazi'
    else whistling_official_name
  end,
  crew_chief_id = case crew_chief_id
    when '11629177' then '1629177'
    when '196295108' then '1629171'
    else crew_chief_id
  end,
  crew_chief_name = case crew_chief_id
    when '11629177' then 'Biniam Maru'
    when '196295108' then 'Agon Abazi'
    else crew_chief_name
  end
where whistling_official_id in ('11629177', '196295108')
   or crew_chief_id in ('11629177', '196295108');

create index if not exists nba_official_assignments_profile_lookup
on public.nba_official_game_assignments (season, official_id, game_date desc)
where is_alternate = false and lower(coalesce(season_type, '')) <> 'preseason';

create index if not exists nba_challenges_whistle_profile_lookup
on public.nba_coach_challenge_events (season, whistling_official_id, game_date desc)
where lower(coalesce(season_type, '')) <> 'preseason';

create index if not exists nba_challenges_crew_chief_profile_lookup
on public.nba_coach_challenge_events (season, crew_chief_id, game_date desc)
where lower(coalesce(season_type, '')) <> 'preseason';

create index if not exists nba_official_calls_challenge_match_lookup
on public.nba_official_call_events (season, game_id, period, game_clock);

create index if not exists nba_official_calls_season_updated_lookup
on public.nba_official_call_events (season, updated_at desc);

create index if not exists nba_official_assignments_season_updated_lookup
on public.nba_official_game_assignments (season, updated_at desc);

create index if not exists nba_challenges_season_updated_lookup
on public.nba_coach_challenge_events (season, updated_at desc);

create or replace function public.nba_challenge_context_tags_for_events(challenge_ids uuid[])
returns table(challenge_event_id uuid, tag_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select event_tags.challenge_event_id, event_tags.tag_id
  from public.nba_challenge_context_event_tags event_tags
  where event_tags.challenge_event_id = any(challenge_ids);
$$;

grant execute on function public.nba_challenge_context_tags_for_events(uuid[]) to anon, authenticated, service_role;

commit;
