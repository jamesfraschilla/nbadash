begin;

-- Preserve call-verified appearances for the rare games whose assignment feed
-- is missing completely.
with missing_game_officials as (
  select
    calls.season,
    max(calls.season_type) as season_type,
    calls.game_id,
    min(calls.game_date) as game_date,
    max(calls.home_team) as home_team,
    max(calls.away_team) as away_team,
    calls.official_id,
    calls.official_name,
    row_number() over (
      partition by calls.season, calls.game_id
      order by coalesce(calls.official_id, calls.official_name)
    ) as assignment_order
  from public.nba_official_call_events calls
  where lower(coalesce(calls.season_type, '')) <> 'preseason'
    and coalesce(calls.official_id, calls.official_name, '') <> ''
    and not exists (
      select 1
      from public.nba_official_game_assignments assignments
      where assignments.season = calls.season
        and assignments.game_id = calls.game_id
    )
  group by calls.season, calls.game_id, calls.official_id, calls.official_name
)
insert into public.nba_official_game_assignments (
  season, season_type, game_id, game_date, home_team, away_team,
  official_id, official_name, jersey_number, role_key, assignment_order,
  is_alternate, source, source_payload
)
select
  missing.season,
  missing.season_type,
  missing.game_id,
  missing.game_date,
  missing.home_team,
  missing.away_team,
  missing.official_id,
  missing.official_name,
  identity.jersey_number,
  case when missing.assignment_order = 1 then 'crewChief' else '' end,
  missing.assignment_order,
  false,
  'reconstructed_from_calls',
  jsonb_build_object('repair', 'officiating_stat_accuracy')
from missing_game_officials missing
left join lateral (
  select assignments.jersey_number
  from public.nba_official_game_assignments assignments
  where assignments.official_id = missing.official_id
    and coalesce(assignments.jersey_number, '') <> ''
  order by assignments.game_date desc nulls last
  limit 1
) identity on true;

-- A listed alternate who records calls participated in the game. Keep every
-- participant active and fill any remaining crew slots in assignment order.
with assignment_evidence as (
  select
    assignments.id,
    assignments.season,
    assignments.game_id,
    assignments.assignment_order,
    exists (
      select 1
      from public.nba_official_call_events calls
      where calls.season = assignments.season
        and calls.game_id = assignments.game_id
        and (
          nullif(calls.official_id, '') = nullif(assignments.official_id, '')
          or lower(calls.official_name) = lower(assignments.official_name)
        )
    ) as made_call,
    count(*) over (partition by assignments.season, assignments.game_id) as listed_officials
  from public.nba_official_game_assignments assignments
  where lower(coalesce(assignments.season_type, '')) <> 'preseason'
),
ranked as (
  select
    *,
    row_number() over (
      partition by season, game_id
      order by made_call desc, assignment_order asc, id asc
    ) as participation_rank
  from assignment_evidence
),
resolved as (
  select
    id,
    not (made_call or participation_rank <= least(3, listed_officials)) as is_alternate
  from ranked
)
update public.nba_official_game_assignments assignments
set
  is_alternate = resolved.is_alternate,
  role_key = case
    when resolved.is_alternate then 'alternate'
    when assignments.role_key = 'alternate' then ''
    else assignments.role_key
  end
from resolved
where assignments.id = resolved.id
  and (
    assignments.is_alternate is distinct from resolved.is_alternate
    or (resolved.is_alternate and coalesce(assignments.role_key, '') <> 'alternate')
    or (not resolved.is_alternate and assignments.role_key = 'alternate')
  );

-- Archive timestamps are UTC and frequently cross midnight. Assignment dates
-- are the Eastern schedule dates used everywhere else in the report.
with assignment_dates as (
  select season, game_id, min(game_date) as game_date
  from public.nba_official_game_assignments
  where lower(coalesce(season_type, '')) <> 'preseason'
    and game_date is not null
  group by season, game_id
)
update public.nba_official_call_events calls
set game_date = assignment_dates.game_date
from assignment_dates
where calls.season = assignment_dates.season
  and calls.game_id = assignment_dates.game_id
  and calls.game_date is distinct from assignment_dates.game_date;

commit;
