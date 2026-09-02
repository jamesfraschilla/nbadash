-- Apply after supabase/officiating_intelligence.sql.
-- Keeps Officiating/PGR browser reads authenticated and avoids loading PGR raw
-- evaluation rows just to populate Smart Insights filter menus.

drop policy if exists nba_official_game_assignments_select_public on public.nba_official_game_assignments;
drop policy if exists nba_official_game_assignments_select_authenticated on public.nba_official_game_assignments;
create policy nba_official_game_assignments_select_authenticated
on public.nba_official_game_assignments
for select
to authenticated
using (true);

drop policy if exists nba_official_call_events_select_public on public.nba_official_call_events;
drop policy if exists nba_official_call_events_select_authenticated on public.nba_official_call_events;
create policy nba_official_call_events_select_authenticated
on public.nba_official_call_events
for select
to authenticated
using (true);

drop policy if exists nba_coach_challenge_events_select_public on public.nba_coach_challenge_events;
drop policy if exists nba_coach_challenge_events_select_authenticated on public.nba_coach_challenge_events;
create policy nba_coach_challenge_events_select_authenticated
on public.nba_coach_challenge_events
for select
to authenticated
using (true);

drop policy if exists nba_officiating_event_reviews_select_public on public.nba_officiating_event_reviews;
drop policy if exists nba_officiating_event_reviews_select_authenticated on public.nba_officiating_event_reviews;
create policy nba_officiating_event_reviews_select_authenticated
on public.nba_officiating_event_reviews
for select
to authenticated
using (true);

drop policy if exists nba_challenge_context_tags_select_public on public.nba_challenge_context_tags;
drop policy if exists nba_challenge_context_tags_select_authenticated on public.nba_challenge_context_tags;
create policy nba_challenge_context_tags_select_authenticated
on public.nba_challenge_context_tags
for select
to authenticated
using (true);

drop policy if exists nba_challenge_context_event_tags_select_public on public.nba_challenge_context_event_tags;
drop policy if exists nba_challenge_context_event_tags_select_authenticated on public.nba_challenge_context_event_tags;
create policy nba_challenge_context_event_tags_select_authenticated
on public.nba_challenge_context_event_tags
for select
to authenticated
using (true);

drop policy if exists nba_pgr_imports_select_public on public.nba_pgr_imports;
drop policy if exists nba_pgr_imports_select_authenticated on public.nba_pgr_imports;
create policy nba_pgr_imports_select_authenticated
on public.nba_pgr_imports
for select
to authenticated
using (true);

drop policy if exists nba_pgr_possessions_select_public on public.nba_pgr_possessions;
drop policy if exists nba_pgr_possessions_select_authenticated on public.nba_pgr_possessions;
create policy nba_pgr_possessions_select_authenticated
on public.nba_pgr_possessions
for select
to authenticated
using (true);

drop policy if exists nba_pgr_events_select_public on public.nba_pgr_events;
drop policy if exists nba_pgr_events_select_authenticated on public.nba_pgr_events;
create policy nba_pgr_events_select_authenticated
on public.nba_pgr_events
for select
to authenticated
using (true);

drop policy if exists nba_pgr_evaluations_select_public on public.nba_pgr_evaluations;
drop policy if exists nba_pgr_evaluations_select_authenticated on public.nba_pgr_evaluations;
create policy nba_pgr_evaluations_select_authenticated
on public.nba_pgr_evaluations
for select
to authenticated
using (true);

revoke execute on function public.nba_save_challenge_context_tags(uuid, uuid[], text[]) from anon;
grant execute on function public.nba_save_challenge_context_tags(uuid, uuid[], text[]) to authenticated;

revoke all on function public.nba_pgr_smart_insights(jsonb) from public;
grant execute on function public.nba_pgr_smart_insights(jsonb) to authenticated;

create or replace function public.nba_pgr_smart_filter_options(p_season text default '2025-26')
returns jsonb
language sql
stable
as $$
with imports as (
  select
    game_id,
    upper(home_team) as home_team,
    upper(away_team) as away_team
  from public.nba_pgr_imports
  where season = coalesce(nullif(p_season, ''), '2025-26')
    and game_id not like '001%'
),
games as (
  select game_id from imports
),
crew_chiefs as (
  select distinct official_name
  from public.nba_official_game_assignments
  where season = coalesce(nullif(p_season, ''), '2025-26')
    and game_id in (select game_id from games)
    and is_alternate = false
    and lower(coalesce(season_type, '')) <> 'preseason'
    and (
      lower(coalesce(role_key, '')) in ('crewchief', 'crew_chief')
      or coalesce(assignment_order, 0) = 1
    )
    and coalesce(official_name, '') <> ''
),
whistles as (
  select distinct official_name
  from public.nba_official_call_events
  where season = coalesce(nullif(p_season, ''), '2025-26')
    and game_id in (select game_id from games)
    and lower(coalesce(season_type, '')) <> 'preseason'
    and coalesce(official_name, '') <> ''
),
infractions as (
  select distinct infraction_type_name
  from public.nba_pgr_evaluations
  where season = coalesce(nullif(p_season, ''), '2025-26')
    and game_id in (select game_id from games)
    and coalesce(infraction_type_name, '') <> ''
)
select jsonb_build_object(
  'opponents', coalesce((
    select jsonb_agg(opponent order by opponent)
    from (
      select distinct case when home_team = 'WAS' then away_team else home_team end as opponent
      from imports
      where coalesce(home_team, '') <> '' and coalesce(away_team, '') <> ''
    ) options
  ), '[]'::jsonb),
  'homeRoad', coalesce((
    select jsonb_agg(home_road order by home_road)
    from (
      select distinct case when home_team = 'WAS' then 'Home' else 'Road' end as home_road
      from imports
    ) options
  ), '[]'::jsonb),
  'crewChiefs', coalesce((select jsonb_agg(official_name order by official_name) from crew_chiefs), '[]'::jsonb),
  'whistlingOfficials', coalesce((select jsonb_agg(official_name order by official_name) from whistles), '[]'::jsonb),
  'infractionTypes', coalesce((select jsonb_agg(infraction_type_name order by infraction_type_name) from infractions), '[]'::jsonb)
);
$$;

revoke all on function public.nba_pgr_smart_filter_options(text) from public;
grant execute on function public.nba_pgr_smart_filter_options(text) to authenticated;
