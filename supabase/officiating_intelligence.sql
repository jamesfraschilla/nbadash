create extension if not exists pgcrypto;

create or replace function public.nba_officiating_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.nba_official_game_assignments (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  season_type text not null,
  game_id text not null,
  game_date date,
  home_team text,
  away_team text,
  official_id text,
  official_name text not null,
  jersey_number text,
  role_key text,
  assignment_order integer,
  is_alternate boolean not null default false,
  source text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists nba_official_game_assignments_game_official_idx
on public.nba_official_game_assignments (
  game_id,
  lower(official_name),
  coalesce(role_key, '')
);

create index if not exists nba_official_game_assignments_season_idx
on public.nba_official_game_assignments (season, season_type);

create index if not exists nba_official_game_assignments_date_idx
on public.nba_official_game_assignments (game_date);

create index if not exists nba_official_game_assignments_official_idx
on public.nba_official_game_assignments (official_id, lower(official_name));

drop trigger if exists nba_official_game_assignments_set_updated_at on public.nba_official_game_assignments;
create trigger nba_official_game_assignments_set_updated_at
before update on public.nba_official_game_assignments
for each row
execute function public.nba_officiating_set_updated_at();

create table if not exists public.nba_official_call_events (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  season_type text not null,
  game_id text not null,
  game_date date,
  home_team text,
  away_team text,
  period integer,
  game_clock text,
  action_number integer,
  order_number integer,
  action_type text,
  sub_type text,
  descriptor text,
  description text not null,
  official_token text,
  official_id text,
  official_name text,
  team_id text,
  team_tricode text,
  player_id text,
  player_name text,
  primary_category text,
  secondary_category text,
  charged_team text,
  benefiting_team text,
  confidence numeric,
  confidence_reason text,
  area text,
  area_detail text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.nba_official_call_events
add column if not exists area text;

alter table public.nba_official_call_events
add column if not exists area_detail text;

update public.nba_official_call_events
set
  area = coalesce(nullif(area, ''), nullif(source_payload->>'area', '')),
  area_detail = coalesce(nullif(area_detail, ''), nullif(source_payload->>'areaDetail', ''), nullif(source_payload->>'area_detail', ''))
where
  (coalesce(area, '') = '' and coalesce(source_payload->>'area', '') <> '')
  or (coalesce(area_detail, '') = '' and (coalesce(source_payload->>'areaDetail', '') <> '' or coalesce(source_payload->>'area_detail', '') <> ''));

create unique index if not exists nba_official_call_events_game_action_idx
on public.nba_official_call_events (game_id, action_number)
where action_number is not null;

create unique index if not exists nba_official_call_events_game_clock_desc_idx
on public.nba_official_call_events (game_id, period, game_clock, md5(description))
where action_number is null;

create index if not exists nba_official_call_events_season_idx
on public.nba_official_call_events (season, season_type);

create index if not exists nba_official_call_events_date_idx
on public.nba_official_call_events (game_date);

create index if not exists nba_official_call_events_official_idx
on public.nba_official_call_events (official_id, lower(official_name));

create index if not exists nba_official_call_events_season_official_date_idx
on public.nba_official_call_events (
  season,
  coalesce(nullif(official_id, ''), official_name),
  game_date desc
);

create index if not exists nba_official_call_events_team_idx
on public.nba_official_call_events (team_tricode, charged_team, benefiting_team);

create index if not exists nba_official_call_events_charged_team_date_idx
on public.nba_official_call_events (season, charged_team, game_date desc);

create index if not exists nba_official_call_events_benefiting_team_date_idx
on public.nba_official_call_events (season, benefiting_team, game_date desc);

create index if not exists nba_official_call_events_category_idx
on public.nba_official_call_events (primary_category, secondary_category);

create index if not exists nba_official_call_events_season_player_category_idx
on public.nba_official_call_events (season, player_id, secondary_category)
where coalesce(player_id, '') <> '';

create index if not exists nba_official_call_events_season_official_secondary_idx
on public.nba_official_call_events (season, official_id, secondary_category)
where coalesce(official_id, '') <> '';

create index if not exists nba_official_call_events_season_secondary_idx
on public.nba_official_call_events (season, secondary_category);

drop trigger if exists nba_official_call_events_set_updated_at on public.nba_official_call_events;
create trigger nba_official_call_events_set_updated_at
before update on public.nba_official_call_events
for each row
execute function public.nba_officiating_set_updated_at();

create table if not exists public.nba_coach_challenge_events (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  season_type text not null,
  game_id text,
  game_date date,
  round text,
  series text,
  home_team text,
  away_team text,
  challenging_team text,
  period integer,
  game_clock text,
  challenge_type text,
  initial_call text,
  call_ruling text,
  ruling_outcome text,
  challenge_outcome text,
  video_url text,
  crew_chief_id text,
  crew_chief_name text,
  whistling_official_id text,
  whistling_official_name text,
  matched_action_number integer,
  matched_call_event_id uuid references public.nba_official_call_events(id) on delete set null,
  match_confidence numeric,
  match_reason text,
  challenge_sub_type text,
  review_status text not null default 'auto',
  source text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.nba_coach_challenge_events
add column if not exists challenge_sub_type text;

create unique index if not exists nba_coach_challenge_events_game_clock_team_idx
on public.nba_coach_challenge_events (
  coalesce(game_id, ''),
  coalesce(challenging_team, ''),
  coalesce(period, -1),
  coalesce(game_clock, ''),
  coalesce(source, '')
);

create index if not exists nba_coach_challenge_events_season_idx
on public.nba_coach_challenge_events (season, season_type);

create index if not exists nba_coach_challenge_events_date_idx
on public.nba_coach_challenge_events (game_date);

create index if not exists nba_coach_challenge_events_team_idx
on public.nba_coach_challenge_events (challenging_team);

create index if not exists nba_coach_challenge_events_season_team_date_idx
on public.nba_coach_challenge_events (season, challenging_team, game_date desc);

create index if not exists nba_coach_challenge_events_season_whistle_date_idx
on public.nba_coach_challenge_events (
  season,
  coalesce(nullif(whistling_official_id, ''), whistling_official_name),
  game_date desc
);

create index if not exists nba_coach_challenge_events_season_crew_date_idx
on public.nba_coach_challenge_events (
  season,
  coalesce(nullif(crew_chief_id, ''), crew_chief_name),
  game_date desc
);

create index if not exists nba_coach_challenge_events_official_idx
on public.nba_coach_challenge_events (crew_chief_id, whistling_official_id);

create index if not exists nba_coach_challenge_events_outcome_idx
on public.nba_coach_challenge_events (challenge_outcome, challenge_type);

create index if not exists nba_coach_challenge_events_matched_call_idx
on public.nba_coach_challenge_events (matched_call_event_id);

drop trigger if exists nba_coach_challenge_events_set_updated_at on public.nba_coach_challenge_events;
create trigger nba_coach_challenge_events_set_updated_at
before update on public.nba_coach_challenge_events
for each row
execute function public.nba_officiating_set_updated_at();

create table if not exists public.nba_officiating_event_reviews (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_event_id uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz not null default timezone('utc', now()),
  review_status text not null,
  corrected_official_id text,
  corrected_official_name text,
  corrected_primary_category text,
  corrected_secondary_category text,
  corrected_charged_team text,
  corrected_benefiting_team text,
  corrected_challenge_outcome text,
  notes text,
  matcher_version text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists nba_officiating_event_reviews_source_idx
on public.nba_officiating_event_reviews (source_table, source_event_id);

create index if not exists nba_officiating_event_reviews_status_idx
on public.nba_officiating_event_reviews (review_status, reviewed_at);

create table if not exists public.nba_challenge_context_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.nba_challenge_context_event_tags (
  challenge_event_id uuid not null references public.nba_coach_challenge_events(id) on delete cascade,
  tag_id uuid not null references public.nba_challenge_context_tags(id) on delete cascade,
  tagged_by uuid,
  tagged_at timestamptz not null default timezone('utc', now()),
  primary key (challenge_event_id, tag_id)
);

create index if not exists nba_challenge_context_event_tags_tag_idx
on public.nba_challenge_context_event_tags (tag_id, challenge_event_id);

insert into public.nba_challenge_context_tags (label)
values
  ('Block/Charge'),
  ('Leg Kick'),
  ('High 5'),
  ('Off-Arm'),
  ('Proximate'),
  ('Moving Screen')
on conflict (label) do nothing;

create table if not exists public.nba_officiating_cache_refreshes (
  cache_name text primary key,
  refreshed_at timestamptz not null default timezone('utc', now()),
  duration_ms integer,
  row_count integer,
  status text not null default 'success',
  error_message text
);


alter table public.nba_official_game_assignments enable row level security;
alter table public.nba_official_call_events enable row level security;
alter table public.nba_coach_challenge_events enable row level security;
alter table public.nba_officiating_event_reviews enable row level security;
alter table public.nba_challenge_context_tags enable row level security;
alter table public.nba_challenge_context_event_tags enable row level security;

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

drop policy if exists nba_officiating_event_reviews_insert_authenticated on public.nba_officiating_event_reviews;
create policy nba_officiating_event_reviews_insert_authenticated
on public.nba_officiating_event_reviews
for insert
to authenticated
with check (auth.uid() = reviewed_by);

drop policy if exists nba_officiating_event_reviews_update_owner on public.nba_officiating_event_reviews;
create policy nba_officiating_event_reviews_update_owner
on public.nba_officiating_event_reviews
for update
to authenticated
using (auth.uid() = reviewed_by)
with check (auth.uid() = reviewed_by);

drop policy if exists nba_challenge_context_tags_select_public on public.nba_challenge_context_tags;
drop policy if exists nba_challenge_context_tags_select_authenticated on public.nba_challenge_context_tags;
create policy nba_challenge_context_tags_select_authenticated
on public.nba_challenge_context_tags
for select
to authenticated
using (true);

drop policy if exists nba_challenge_context_tags_insert_authenticated on public.nba_challenge_context_tags;
create policy nba_challenge_context_tags_insert_authenticated
on public.nba_challenge_context_tags
for insert
to authenticated
with check (created_by is null or auth.uid() = created_by);

drop policy if exists nba_challenge_context_event_tags_select_public on public.nba_challenge_context_event_tags;
drop policy if exists nba_challenge_context_event_tags_select_authenticated on public.nba_challenge_context_event_tags;
create policy nba_challenge_context_event_tags_select_authenticated
on public.nba_challenge_context_event_tags
for select
to authenticated
using (true);

drop policy if exists nba_challenge_context_event_tags_insert_authenticated on public.nba_challenge_context_event_tags;
create policy nba_challenge_context_event_tags_insert_authenticated
on public.nba_challenge_context_event_tags
for insert
to authenticated
with check (tagged_by is null or auth.uid() = tagged_by);

drop policy if exists nba_challenge_context_event_tags_delete_authenticated on public.nba_challenge_context_event_tags;
create policy nba_challenge_context_event_tags_delete_authenticated
on public.nba_challenge_context_event_tags
for delete
to authenticated
using (true);

create or replace function public.nba_save_challenge_context_tags(
  p_challenge_event_id uuid,
  p_selected_tag_ids uuid[] default '{}'::uuid[],
  p_new_tag_labels text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_label text;
  selected_ids uuid[] := '{}'::uuid[];
  sibling_event_ids uuid[] := '{}'::uuid[];
begin
  if p_challenge_event_id is null then
    raise exception 'Missing challenge event id.';
  end if;

  select coalesce(array_agg(sibling.id order by sibling.id), '{}'::uuid[])
  into sibling_event_ids
  from public.nba_coach_challenge_events target
  join public.nba_coach_challenge_events sibling
    on coalesce(sibling.season, '') = coalesce(target.season, '')
   and coalesce(sibling.game_id, '') = coalesce(target.game_id, '')
   and coalesce(sibling.game_date::text, '') = coalesce(target.game_date::text, '')
   and coalesce(sibling.home_team, '') = coalesce(target.home_team, '')
   and coalesce(sibling.away_team, '') = coalesce(target.away_team, '')
   and coalesce(sibling.challenging_team, '') = coalesce(target.challenging_team, '')
   and coalesce(sibling.period, -1) = coalesce(target.period, -1)
   and coalesce(sibling.game_clock, '') = coalesce(target.game_clock, '')
  where target.id = p_challenge_event_id;

  if coalesce(array_length(sibling_event_ids, 1), 0) = 0 then
    raise exception 'Challenge event % does not exist.', p_challenge_event_id;
  end if;

  for clean_label in
    select distinct regexp_replace(btrim(label), '\s+', ' ', 'g')
    from unnest(coalesce(p_new_tag_labels, '{}'::text[])) as label
    where btrim(label) <> ''
  loop
    insert into public.nba_challenge_context_tags (label, created_by)
    values (clean_label, current_user_id)
    on conflict (label) do nothing;
  end loop;

  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into selected_ids
  from public.nba_challenge_context_tags
  where id = any(coalesce(p_selected_tag_ids, '{}'::uuid[]))
     or label in (
       select distinct regexp_replace(btrim(label), '\s+', ' ', 'g')
       from unnest(coalesce(p_new_tag_labels, '{}'::text[])) as label
       where btrim(label) <> ''
     );

  delete from public.nba_challenge_context_event_tags
  where challenge_event_id = any(sibling_event_ids);

  insert into public.nba_challenge_context_event_tags (challenge_event_id, tag_id, tagged_by)
  select sibling_event_id, tag_id, current_user_id
  from unnest(sibling_event_ids) as sibling_event_id
  cross join unnest(selected_ids) as tag_id
  on conflict (challenge_event_id, tag_id) do nothing;

  return jsonb_build_object(
    'challengeEventIds',
    coalesce(to_jsonb(sibling_event_ids), '[]'::jsonb),
    'options',
    coalesce((
      select jsonb_agg(jsonb_build_object('id', id::text, 'label', label) order by label)
      from public.nba_challenge_context_tags
    ), '[]'::jsonb),
    'selected',
    coalesce((
      select jsonb_agg(jsonb_build_object('id', id::text, 'label', label) order by label)
      from public.nba_challenge_context_tags
      where id = any(selected_ids)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.nba_save_challenge_context_tags(uuid, uuid[], text[]) from anon;
grant execute on function public.nba_save_challenge_context_tags(uuid, uuid[], text[]) to authenticated;

insert into public.nba_challenge_context_event_tags (challenge_event_id, tag_id, tagged_by, tagged_at)
select distinct
  sibling.id as challenge_event_id,
  existing.tag_id,
  existing.tagged_by,
  existing.tagged_at
from public.nba_challenge_context_event_tags existing
join public.nba_coach_challenge_events tagged
  on tagged.id = existing.challenge_event_id
join public.nba_coach_challenge_events sibling
  on coalesce(sibling.season, '') = coalesce(tagged.season, '')
 and coalesce(sibling.game_id, '') = coalesce(tagged.game_id, '')
 and coalesce(sibling.game_date::text, '') = coalesce(tagged.game_date::text, '')
 and coalesce(sibling.home_team, '') = coalesce(tagged.home_team, '')
 and coalesce(sibling.away_team, '') = coalesce(tagged.away_team, '')
 and coalesce(sibling.challenging_team, '') = coalesce(tagged.challenging_team, '')
 and coalesce(sibling.period, -1) = coalesce(tagged.period, -1)
 and coalesce(sibling.game_clock, '') = coalesce(tagged.game_clock, '')
on conflict (challenge_event_id, tag_id) do nothing;


drop materialized view if exists public.nba_authoritative_coach_challenge_events_cache;

create or replace view public.nba_authoritative_coach_challenge_events as
select
  id,
  season,
  season_type,
  game_id,
  game_date,
  round,
  series,
  home_team,
  away_team,
  challenging_team,
  period,
  game_clock,
  challenge_type,
  initial_call,
  call_ruling,
  ruling_outcome,
  challenge_outcome,
  video_url,
  crew_chief_id,
  crew_chief_name,
  whistling_official_id,
  whistling_official_name,
  matched_action_number,
  matched_call_event_id,
  match_confidence,
  match_reason,
  review_status,
  source,
  source_payload,
  created_at,
  updated_at,
  authoritative_rank,
  challenge_sub_type
from (
  select
    challenges.*,
    row_number() over (
      partition by
        coalesce(game_id, ''),
        coalesce(game_date::text, ''),
        coalesce(home_team, ''),
        coalesce(away_team, ''),
        coalesce(challenging_team, ''),
        coalesce(period, -1),
        coalesce(game_clock, '')
      order by
        case
          when source = 'nba_official_challenge_pdf' then 3
          when source = 'play_by_play' then 2
          else 1
        end desc,
        created_at desc,
        id desc
    ) as authoritative_rank
  from public.nba_coach_challenge_events challenges
  left join (
    select season, max(game_date) as latest_pdf_game_date
    from public.nba_coach_challenge_events
    where source = 'nba_official_challenge_pdf'
    group by season
  ) pdf_coverage using (season)
  where
    challenges.source = 'nba_official_challenge_pdf'
    or pdf_coverage.latest_pdf_game_date is null
    or challenges.game_date > pdf_coverage.latest_pdf_game_date
) ranked
where authoritative_rank = 1;

drop materialized view if exists public.nba_authoritative_coach_challenge_events_cache;
create materialized view public.nba_authoritative_coach_challenge_events_cache as
select * from public.nba_authoritative_coach_challenge_events
with data;

create unique index if not exists nba_authoritative_coach_challenge_events_cache_id
on public.nba_authoritative_coach_challenge_events_cache (id);

create index if not exists nba_authoritative_coach_challenge_events_cache_season_date
on public.nba_authoritative_coach_challenge_events_cache (season, game_date desc);

create index if not exists nba_authoritative_coach_challenge_events_cache_team
on public.nba_authoritative_coach_challenge_events_cache (season, challenging_team, game_date desc);

create index if not exists nba_authoritative_coach_challenge_events_cache_whistle
on public.nba_authoritative_coach_challenge_events_cache (
  season,
  coalesce(nullif(whistling_official_id, ''), whistling_official_name),
  game_date desc
);

create index if not exists nba_authoritative_coach_challenge_events_cache_crew
on public.nba_authoritative_coach_challenge_events_cache (
  season,
  coalesce(nullif(crew_chief_id, ''), crew_chief_name),
  game_date desc
);

create or replace function public.nba_is_official_violation_call(
  primary_category text,
  secondary_category text,
  descriptor text,
  sub_type text
)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') as primary_key,
      regexp_replace(lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')), '[^a-z0-9]', '', 'g') as category_key
  )
  select case
    when category_key like '%shotclock%' then false
    when primary_key in ('violation', 'turnover') then true
    when category_key like any (array[
      '%3second%',
      '%outofbounds%',
      '%badpass%',
      '%lostball%',
      '%5second%',
      '%8second%',
      '%10secondfreethrow%',
      '%doubledribble%',
      '%discontinueddribble%',
      '%palming%',
      '%backcourt%',
      '%goaltending%',
      '%kickedball%',
      '%punchedball%',
      '%illegalassist%',
      '%jumpball%',
      '%inbound%',
      '%lane%'
    ]) then true
    else false
  end
  from normalized;
$$;

create or replace view public.nba_official_call_rollups as
select
  season,
  season_type,
  official_id,
  official_name,
  count(*)::integer as call_events,
  count(distinct game_id)::integer as games,
  count(*) filter (where primary_category = 'foul')::integer as fouls,
  count(*) filter (
    where public.nba_is_official_violation_call(primary_category, secondary_category, descriptor, sub_type)
  )::integer as violations,
  count(*) filter (
    where (
      regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') = 'technical'
      or regexp_replace(lower(coalesce(secondary_category, '') || ' ' || coalesce(descriptor, '') || ' ' || coalesce(sub_type, '')), '[^a-z0-9]', '', 'g') like '%technical%'
    )
    and not (
      regexp_replace(lower(coalesce(secondary_category, '') || ' ' || coalesce(descriptor, '') || ' ' || coalesce(sub_type, '')), '[^a-z0-9]', '', 'g')
      like any (array[
        '%defensive3second%',
        '%delaytechnical%',
        '%floppingtechnical%',
        '%rimhangingtechnical%',
        '%nonunsportsmanliketechnical%',
        '%excesstimeouttechnical%',
        '%toomanyplayerstechnical%'
      ])
    )
  )::integer as technicals,
  case
    when count(distinct game_id) > 0 then count(*) filter (where primary_category = 'foul')::numeric / count(distinct game_id)
    else 0
  end as fouls_per_game,
  case
    when count(distinct game_id) > 0 then count(*) filter (
      where public.nba_is_official_violation_call(primary_category, secondary_category, descriptor, sub_type)
    )::numeric / count(distinct game_id)
    else 0
  end as violations_per_game
from public.nba_official_call_events
where coalesce(official_name, '') <> ''
  and lower(coalesce(season_type, '')) <> 'preseason'
group by season, season_type, official_id, official_name;

create or replace function public.nba_normalized_official_call_category(
  primary_category text,
  secondary_category text,
  descriptor text,
  sub_type text,
  area text default '',
  area_detail text default ''
)
returns text
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') as primary_key,
      regexp_replace(lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')), '[^a-z0-9]', '', 'g') as category_key,
      regexp_replace(lower(coalesce(area, '') || ' ' || coalesce(area_detail, '')), '[^a-z0-9]', '', 'g') as area_key
  )
  select case
    when category_key like '%defensive3second%' then 'Defensive 3 Second Violation'
    when primary_key in ('turnover', 'violation') and category_key like '%3secondviolation%' then 'Offensive 3 Second Violation'
    when category_key like '%outofbounds%' then 'Out Of Bounds'
    when primary_key = 'turnover' and category_key like '%badpass%' then 'Out Of Bounds'
    when primary_key = 'turnover' and category_key like '%lostball%' then 'Out Of Bounds'
    when primary_key = 'turnover' and category_key like '%shotclock%' then 'Shot Clock Violation'
    when primary_key = 'turnover' and category_key like '%5secondviolation%' then '5 Second Violation'
    when primary_key = 'turnover' and category_key like '%8secondviolation%' then '8 Second Violation'
    when primary_key = 'turnover' and category_key like '%10secondfreethrowshooter%' then '10 Second Free Throw Violation'
    when primary_key = 'turnover' and category_key like '%doubledribble%' then 'Double Dribble'
    when primary_key = 'turnover' and category_key like '%discontinueddribble%' then 'Palming'
    when primary_key = 'turnover' and category_key like '%palming%' then 'Palming'
    when primary_key = 'turnover' and category_key like '%backcourt%' then 'Backcourt'
    when category_key like '%offensivegoaltending%' then 'Offensive Goaltending'
    when category_key like '%defensivegoaltending%' then 'Defensive Goaltending'
    when category_key like '%kickedball%' then 'Kicked Ball'
    when category_key like '%punchedball%' then 'Punched Ball'
    when category_key like '%illegalassist%' then 'Illegal Assist'
    when category_key like '%jumpball%' then 'Jump Ball'
    when category_key like '%inbound%' then 'Inbound'
    when category_key like '%lane%' then 'Lane'
    when category_key like '%toomanyplayerstechnical%' then 'Too Many Players'
    when category_key like '%delaytechnical%' or category_key like '%delay%' or category_key like '%excesstimeouttechnical%' then 'Delay Of Game'
    when category_key like '%floppingtechnical%' then 'Flopping Technical'
    when category_key like '%rimhangingtechnical%' then 'Rim Hanging Technical'
    when category_key like '%nonunsportsmanliketechnical%' then 'Non Unsportsmanlike Technical'
    when primary_key = 'technical' or category_key like '%technical%' then 'Technical Foul'
    when primary_key = 'foul' and category_key like '%shooting%' and area_key like '%restricted%' then 'Restricted Area Shooting Foul'
    when primary_key = 'foul' and category_key like '%shooting%' and (
      area_key like '%3pt%'
      or area_key like '%3point%'
      or area_key like '%threepoint%'
      or area_key like '%corner3%'
      or area_key like '%abovethebreak3%'
    ) then '3-Pt Shooting Foul'
    when primary_key = 'foul' and category_key like '%shooting%' then 'Shooting Foul'
    when primary_key = 'foul' and category_key like '%looseball%' then 'Loose Ball Foul'
    when primary_key = 'foul' and category_key like '%flagranttype1%' then 'Flagrant Type 1 Foul'
    when primary_key = 'foul' and category_key like '%flagranttype2%' then 'Flagrant Type 2 Foul'
    when primary_key = 'foul' and category_key like '%awayfromplay%' then 'Away From Play Foul'
    when primary_key = 'foul' and category_key like '%transitiontake%' then 'Transition Take Foul'
    when primary_key = 'foul' and (category_key like '%personaltake%' or category_key = 'take') then 'Take Foul'
    when primary_key = 'foul' and (category_key like '%offensive%' or category_key like '%charge%' or category_key like '%offtheball%') then 'Offensive Foul'
    when primary_key = 'foul' and category_key like '%clearpath%' then 'Clear Path Foul'
    when primary_key = 'foul' and category_key like '%flagrant%' then 'Flagrant Foul'
    when primary_key = 'foul' and category_key like '%doublepersonal%' then 'Double Personal Foul'
    when primary_key = 'foul' and category_key like '%personal%' then 'Foul on Floor'
    when primary_key = 'foul' then 'Foul on Floor'
    when primary_key = 'violation' then initcap(replace(coalesce(nullif(secondary_category, ''), nullif(descriptor, ''), nullif(sub_type, ''), 'Violation'), '_', ' '))
    else initcap(replace(coalesce(nullif(secondary_category, ''), nullif(primary_category, ''), 'Unknown'), '_', ' '))
  end
  from normalized;
$$;

create or replace function public.nba_is_likely_moving_screen_call(
  primary_category text,
  secondary_category text,
  descriptor text,
  sub_type text,
  area text default '',
  area_detail text default ''
)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') as primary_key,
      regexp_replace(lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')), '[^a-z0-9]', '', 'g') as category_key,
      regexp_replace(lower(coalesce(area, '') || ' ' || coalesce(area_detail, '')), '[^a-z0-9]', '', 'g') as area_key
  )
  select primary_key = 'foul'
    and category_key like '%offensive%'
    and category_key not like '%charge%'
    and category_key not like '%transitiontake%'
    and category_key not like '%clearpath%'
    and category_key not like '%personaltake%'
    and category_key not like '%flagrant%'
    and category_key not like '%awayfromplay%'
    and category_key not like '%looseball%'
    and category_key not like '%doublepersonal%'
    and (
      (
        category_key like '%offtheballoffensive%'
        and area_key not like '%restricted%'
        and area_key not like '%paint%'
        and area_key not like '%08center%'
      )
      or (
        area_key like any (array[
          '%3pt%',
          '%3point%',
          '%threepoint%',
          '%corner3%',
          '%abovethebreak%',
          '%midrange%',
          '%1624%',
          '%24plus%'
        ])
      )
    )
  from normalized;
$$;

create or replace function public.nba_is_ra_charge_call(
  primary_category text,
  secondary_category text,
  descriptor text,
  sub_type text,
  area text default '',
  area_detail text default ''
)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') as primary_key,
      regexp_replace(lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')), '[^a-z0-9]', '', 'g') as category_key,
      regexp_replace(lower(coalesce(area, '') || ' ' || coalesce(area_detail, '')), '[^a-z0-9]', '', 'g') as area_key
  )
  select primary_key = 'foul'
    and category_key like '%charge%'
    and category_key not like '%offtheball%'
    and category_key not like '%looseball%'
    and category_key not like '%transitiontake%'
    and category_key not like '%clearpath%'
    and category_key not like '%personaltake%'
    and category_key not like '%flagrant%'
    and category_key not like '%awayfromplay%'
    and category_key not like '%doublepersonal%'
    and (
      area_key like '%restricted%'
      or area_key like '%paint%'
      or area_key like '%08center%'
    )
  from normalized;
$$;

create or replace function public.nba_is_defensive_rim_paint_foul_call(
  primary_category text,
  secondary_category text,
  descriptor text,
  sub_type text,
  area text default '',
  area_detail text default ''
)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') as primary_key,
      regexp_replace(lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')), '[^a-z0-9]', '', 'g') as category_key,
      regexp_replace(lower(coalesce(area, '') || ' ' || coalesce(area_detail, '')), '[^a-z0-9]', '', 'g') as area_key
  )
  select primary_key = 'foul'
    and (category_key like '%shooting%' or category_key like '%personal%')
    and category_key not like '%offensive%'
    and category_key not like '%charge%'
    and category_key not like '%offtheball%'
    and category_key not like '%looseball%'
    and category_key not like '%transitiontake%'
    and category_key not like '%clearpath%'
    and category_key not like '%personaltake%'
    and category_key not like '%flagrant%'
    and category_key not like '%awayfromplay%'
    and category_key not like '%doublepersonal%'
    and (
      area_key like '%restricted%'
      or area_key like '%paint%'
      or area_key like '%08center%'
    )
  from normalized;
$$;

update public.nba_coach_challenge_events challenges
set challenge_sub_type = case
  when public.nba_normalized_official_call_category(
    calls.primary_category,
    calls.secondary_category,
    calls.descriptor,
    calls.sub_type,
    calls.area,
    calls.area_detail
  ) = 'Restricted Area Shooting Foul' then 'Restricted Area'
  when public.nba_normalized_official_call_category(
    calls.primary_category,
    calls.secondary_category,
    calls.descriptor,
    calls.sub_type,
    calls.area,
    calls.area_detail
  ) = '3-Pt Shooting Foul' then '3-Pt'
  when public.nba_normalized_official_call_category(
    calls.primary_category,
    calls.secondary_category,
    calls.descriptor,
    calls.sub_type,
    calls.area,
    calls.area_detail
  ) = 'Offensive Foul'
    and regexp_replace(lower(coalesce(calls.area, '') || ' ' || coalesce(calls.area_detail, '')), '[^a-z0-9]', '', 'g') like any (array[
      '%3pt%',
      '%3point%',
      '%threepoint%',
      '%corner3%',
      '%abovethebreak3%'
    ])
    then '3-Pt'
  else null
end
from public.nba_official_call_events calls
where challenges.matched_call_event_id = calls.id
  and coalesce(challenges.challenge_sub_type, '') = '';

create or replace view public.nba_official_call_category_rollups as
with official_games as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    count(distinct game_id)::integer as games
  from (
    select season, official_id, official_name, game_id
    from public.nba_official_game_assignments
    where coalesce(official_id, official_name, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
      and is_alternate = false
    union
    select season, official_id, official_name, game_id
    from public.nba_official_call_events
    where coalesce(official_id, official_name, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) source
  group by season, coalesce(nullif(official_id, ''), official_name)
),
categorized_calls as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    max(nullif(official_id, '')) over (partition by season, coalesce(nullif(official_id, ''), official_name)) as official_id,
    max(official_name) over (partition by season, coalesce(nullif(official_id, ''), official_name)) as official_name,
    game_id,
    public.nba_normalized_official_call_category(primary_category, secondary_category, descriptor, sub_type, area, area_detail) as category
  from public.nba_official_call_events calls
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
base_category_counts as (
  select
    season,
    official_key,
    max(official_id) as official_id,
    max(official_name) as official_name,
    category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from categorized_calls
  group by season, official_key, category
),
moving_screen_counts as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    max(nullif(official_id, '')) as official_id,
    max(official_name) as official_name,
    'Moving Screens'::text as category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from public.nba_official_call_events calls
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
    and public.nba_is_likely_moving_screen_call(primary_category, secondary_category, descriptor, sub_type, area, area_detail)
  group by season, coalesce(nullif(official_id, ''), official_name)
),
paint_rim_charge_counts as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    max(nullif(official_id, '')) as official_id,
    max(official_name) as official_name,
    'Paint/Rim Charge Fouls'::text as category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from public.nba_official_call_events calls
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
    and public.nba_is_ra_charge_call(primary_category, secondary_category, descriptor, sub_type, area, area_detail)
  group by season, coalesce(nullif(official_id, ''), official_name)
),
category_counts as (
  select * from base_category_counts
  union all
  select * from moving_screen_counts
  union all
  select * from paint_rim_charge_counts
),
rated_counts as (
select
  category_counts.*,
  coalesce(official_games.games, category_counts.category_games, 0)::integer as games,
  case
    when coalesce(official_games.games, category_counts.category_games, 0) > 0
      then category_counts.calls::numeric / coalesce(official_games.games, category_counts.category_games)
    else 0
  end as calls_per_game
from category_counts
left join official_games using (season, official_key)
)
select
  season,
  official_key,
  official_id,
  official_name,
  category,
  calls,
  games,
  calls_per_game,
  dense_rank() over (partition by season, category order by calls_per_game desc, calls desc, official_name asc)::integer as category_rank
from rated_counts;

create materialized view if not exists public.nba_official_call_category_rollups_cache as
select * from public.nba_official_call_category_rollups
with data;

create unique index if not exists nba_official_call_category_rollups_cache_key
on public.nba_official_call_category_rollups_cache (season, official_key, category);

create index if not exists nba_official_call_category_rollups_cache_lookup
on public.nba_official_call_category_rollups_cache (season, official_key, calls_per_game desc);

create or replace view public.nba_team_call_category_rollups as
with team_games as (
  select season, team, count(distinct game_id)::integer as games
  from (
    select season, away_team as team, game_id
    from public.nba_official_call_events
    where coalesce(away_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, home_team as team, game_id
    from public.nba_official_call_events
    where coalesce(home_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, coalesce(charged_team, team_tricode) as team, game_id
    from public.nba_official_call_events
    where coalesce(charged_team, team_tricode, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, benefiting_team as team, game_id
    from public.nba_official_call_events
    where coalesce(benefiting_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) games_source
  group by season, team
),
categorized_calls as (
  select
    season,
    coalesce(charged_team, team_tricode, benefiting_team) as team,
    game_id,
    public.nba_normalized_official_call_category(primary_category, secondary_category, descriptor, sub_type, area, area_detail) as category
  from public.nba_official_call_events calls
  where coalesce(charged_team, team_tricode, benefiting_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
base_category_counts as (
  select
    season,
    team,
    category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from categorized_calls
  group by season, team, category
),
moving_screen_counts as (
  select
    season,
    coalesce(charged_team, team_tricode, benefiting_team) as team,
    'Moving Screens'::text as category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from public.nba_official_call_events calls
  where coalesce(charged_team, team_tricode, benefiting_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
    and public.nba_is_likely_moving_screen_call(primary_category, secondary_category, descriptor, sub_type, area, area_detail)
  group by season, coalesce(charged_team, team_tricode, benefiting_team)
),
paint_rim_charge_counts as (
  select
    season,
    coalesce(charged_team, team_tricode, benefiting_team) as team,
    'Paint/Rim Charge Fouls'::text as category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from public.nba_official_call_events calls
  where coalesce(charged_team, team_tricode, benefiting_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
    and public.nba_is_ra_charge_call(primary_category, secondary_category, descriptor, sub_type, area, area_detail)
  group by season, coalesce(charged_team, team_tricode, benefiting_team)
),
category_counts as (
  select * from base_category_counts
  union all
  select * from moving_screen_counts
  union all
  select * from paint_rim_charge_counts
),
rated_counts as (
select
  category_counts.*,
  coalesce(team_games.games, category_counts.category_games, 0)::integer as games,
  case
    when coalesce(team_games.games, category_counts.category_games, 0) > 0
      then category_counts.calls::numeric / coalesce(team_games.games, category_counts.category_games)
    else 0
  end as calls_per_game
from category_counts
left join team_games using (season, team)
)
select
  *,
  dense_rank() over (partition by season, category order by calls_per_game desc, calls desc, team asc)::integer as category_rank
from rated_counts;

create materialized view if not exists public.nba_team_call_category_rollups_cache as
select * from public.nba_team_call_category_rollups
with data;

create unique index if not exists nba_team_call_category_rollups_cache_key
on public.nba_team_call_category_rollups_cache (season, team, category);

create index if not exists nba_team_call_category_rollups_cache_lookup
on public.nba_team_call_category_rollups_cache (season, team, calls_per_game desc);

create or replace view public.nba_team_official_net_call_rollups as
with official_team_games as (
  select
    season,
    official_key,
    max(official_id) as official_id,
    max(official_name) as official_name,
    team,
    count(distinct game_id)::integer as games
  from (
    select
      season,
      coalesce(nullif(official_id, ''), official_name) as official_key,
      nullif(official_id, '') as official_id,
      official_name,
      away_team as team,
      game_id
    from public.nba_official_game_assignments
    where is_alternate = false
      and coalesce(official_id, official_name, '') <> ''
      and coalesce(away_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select
      season,
      coalesce(nullif(official_id, ''), official_name) as official_key,
      nullif(official_id, '') as official_id,
      official_name,
      home_team as team,
      game_id
    from public.nba_official_game_assignments
    where is_alternate = false
      and coalesce(official_id, official_name, '') <> ''
      and coalesce(home_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select
      season,
      coalesce(nullif(official_id, ''), official_name) as official_key,
      nullif(official_id, '') as official_id,
      official_name,
      away_team as team,
      game_id
    from public.nba_official_call_events
    where coalesce(official_id, official_name, '') <> ''
      and coalesce(away_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select
      season,
      coalesce(nullif(official_id, ''), official_name) as official_key,
      nullif(official_id, '') as official_id,
      official_name,
      home_team as team,
      game_id
    from public.nba_official_call_events
    where coalesce(official_id, official_name, '') <> ''
      and coalesce(home_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) games_source
  group by season, official_key, team
),
net_calls as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    max(nullif(official_id, '')) as official_id,
    max(official_name) as official_name,
    team,
    sum(net_value)::integer as net_calls_for
  from (
    select
      season,
      official_id,
      official_name,
      coalesce(charged_team, team_tricode) as team,
      -1 as net_value
    from public.nba_official_call_events
    where coalesce(official_id, official_name, '') <> ''
      and coalesce(charged_team, team_tricode, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union all
    select
      season,
      official_id,
      official_name,
      benefiting_team as team,
      1 as net_value
    from public.nba_official_call_events
    where coalesce(official_id, official_name, '') <> ''
      and coalesce(benefiting_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) call_source
  group by season, coalesce(nullif(official_id, ''), official_name), team
)
select
  games.season,
  games.official_key,
  coalesce(games.official_id, calls.official_id) as official_id,
  coalesce(games.official_name, calls.official_name) as official_name,
  games.team,
  games.games,
  coalesce(calls.net_calls_for, 0)::integer as net_calls_for,
  case
    when games.games > 0 then coalesce(calls.net_calls_for, 0)::numeric / games.games
    else 0
  end as net_calls_for_per_game
from official_team_games games
left join net_calls calls using (season, official_key, team);

create materialized view if not exists public.nba_team_official_net_call_rollups_cache as
select * from public.nba_team_official_net_call_rollups
with data;

create unique index if not exists nba_team_official_net_call_rollups_cache_key
on public.nba_team_official_net_call_rollups_cache (season, official_key, team);

create index if not exists nba_team_official_net_call_rollups_cache_team_lookup
on public.nba_team_official_net_call_rollups_cache (season, team, net_calls_for_per_game desc);

create index if not exists nba_team_official_net_call_rollups_cache_official_lookup
on public.nba_team_official_net_call_rollups_cache (season, official_key, team);

create or replace view public.nba_team_officiating_rollups as
select
  season,
  season_type,
  coalesce(charged_team, team_tricode) as team,
  count(*)::integer as calls_against,
  count(distinct game_id)::integer as games
from public.nba_official_call_events
where coalesce(charged_team, team_tricode, '') <> ''
  and lower(coalesce(season_type, '')) <> 'preseason'
group by season, season_type, coalesce(charged_team, team_tricode);

create or replace view public.nba_officiating_overview_rollups as
with challenge_counts as (
  select
    season,
    count(*)::integer as challenges,
    count(*) filter (where challenge_outcome = 'successful')::integer as successful_challenges
  from public.nba_authoritative_coach_challenge_events
  where lower(coalesce(season_type, '')) <> 'preseason'
  group by season
),
call_counts as (
  select
    season,
    count(*)::integer as call_events,
    count(distinct coalesce(official_id, official_name))::integer as officials,
    count(distinct coalesce(charged_team, team_tricode, benefiting_team))::integer as call_teams
  from public.nba_official_call_events
  where lower(coalesce(season_type, '')) <> 'preseason'
  group by season
),
assignment_counts as (
  select
    season,
    count(distinct coalesce(official_id, official_name))::integer as assignment_officials
  from public.nba_official_game_assignments
  where is_alternate = false
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season
),
team_counts as (
  select season, count(distinct team)::integer as teams
  from (
    select season, coalesce(charged_team, team_tricode) as team
    from public.nba_official_call_events
    where coalesce(charged_team, team_tricode, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, challenging_team as team
    from public.nba_authoritative_coach_challenge_events
    where coalesce(challenging_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) source
  group by season
)
select
  coalesce(calls.season, challenges.season, assignments.season, teams.season) as season,
  coalesce(calls.call_events, 0)::integer as call_events,
  coalesce(challenges.challenges, 0)::integer as challenges,
  coalesce(challenges.successful_challenges, 0)::integer as successful_challenges,
  case
    when coalesce(challenges.challenges, 0) > 0
      then coalesce(challenges.successful_challenges, 0)::numeric / challenges.challenges
    else 0
  end as challenge_rate,
  greatest(coalesce(calls.officials, 0), coalesce(assignments.assignment_officials, 0))::integer as officials,
  coalesce(teams.teams, 0)::integer as teams
from call_counts calls
full join challenge_counts challenges using (season)
full join assignment_counts assignments on assignments.season = coalesce(calls.season, challenges.season)
full join team_counts teams on teams.season = coalesce(calls.season, challenges.season, assignments.season);

create or replace view public.nba_official_profiles as
with official_keys as (
  select season, coalesce(nullif(official_id, ''), official_name) as official_key
  from public.nba_official_game_assignments
  where coalesce(official_id, official_name, '') <> ''
    and is_alternate = false
    and lower(coalesce(season_type, '')) <> 'preseason'
  union
  select season, coalesce(nullif(official_id, ''), official_name) as official_key
  from public.nba_official_call_events
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  union
  select season, coalesce(nullif(crew_chief_id, ''), crew_chief_name) as official_key
  from public.nba_authoritative_coach_challenge_events
  where coalesce(crew_chief_id, crew_chief_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  union
  select season, coalesce(nullif(whistling_official_id, ''), whistling_official_name) as official_key
  from public.nba_authoritative_coach_challenge_events
  where coalesce(whistling_official_id, whistling_official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
official_games as (
  select
    season,
    official_key,
    count(distinct game_id)::integer as games
  from (
    select season, coalesce(nullif(official_id, ''), official_name) as official_key, game_id
    from public.nba_official_game_assignments
    where coalesce(official_id, official_name, '') <> ''
      and is_alternate = false
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, coalesce(nullif(official_id, ''), official_name) as official_key, game_id
    from public.nba_official_call_events
    where coalesce(official_id, official_name, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) participating_games
  group by season, official_key
),
assignment_rollups as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    max(nullif(official_id, '')) as official_id,
    max(official_name) as official_name,
    max(nullif(jersey_number, '')) as jersey_number,
    count(distinct game_id)::integer as assigned_games
  from public.nba_official_game_assignments
  where coalesce(official_id, official_name, '') <> ''
    and is_alternate = false
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, coalesce(nullif(official_id, ''), official_name)
),
call_rollups as (
  select
    season,
    coalesce(nullif(official_id, ''), official_name) as official_key,
    max(nullif(official_id, '')) as official_id,
    max(official_name) as official_name,
    count(*)::integer as calls,
    count(distinct game_id)::integer as call_games,
    count(*) filter (where primary_category = 'foul')::integer as fouls,
    count(*) filter (
      where public.nba_is_official_violation_call(primary_category, secondary_category, descriptor, sub_type)
    )::integer as violations,
    count(*) filter (
      where (
        regexp_replace(lower(coalesce(primary_category, '')), '[^a-z0-9]', '', 'g') = 'technical'
        or regexp_replace(lower(coalesce(secondary_category, '') || ' ' || coalesce(descriptor, '') || ' ' || coalesce(sub_type, '')), '[^a-z0-9]', '', 'g') like '%technical%'
      )
      and not (
        regexp_replace(lower(coalesce(secondary_category, '') || ' ' || coalesce(descriptor, '') || ' ' || coalesce(sub_type, '')), '[^a-z0-9]', '', 'g')
        like any (array[
          '%defensive3second%',
          '%delaytechnical%',
          '%floppingtechnical%',
          '%rimhangingtechnical%',
          '%nonunsportsmanliketechnical%',
          '%excesstimeouttechnical%',
          '%toomanyplayerstechnical%'
        ])
      )
    )::integer as technicals
  from public.nba_official_call_events
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, coalesce(nullif(official_id, ''), official_name)
),
whistle_challenge_rollups as (
  select
    season,
    coalesce(nullif(whistling_official_id, ''), whistling_official_name) as official_key,
    count(*)::integer as whistle_challenges,
    count(*) filter (where challenge_outcome = 'successful')::integer as successful_whistle_challenges
  from public.nba_authoritative_coach_challenge_events
  where coalesce(whistling_official_id, whistling_official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, coalesce(nullif(whistling_official_id, ''), whistling_official_name)
),
crew_challenge_rollups as (
  select
    season,
    coalesce(nullif(crew_chief_id, ''), crew_chief_name) as official_key,
    count(*)::integer as crew_chief_challenges,
    count(*) filter (where challenge_outcome = 'successful')::integer as successful_crew_chief_challenges
  from public.nba_authoritative_coach_challenge_events
  where coalesce(crew_chief_id, crew_chief_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, coalesce(nullif(crew_chief_id, ''), crew_chief_name)
),
participating_official_games as (
  select season, game_id, coalesce(nullif(official_id, ''), official_name) as official_key
  from public.nba_official_game_assignments
  where coalesce(official_id, official_name, '') <> ''
    and is_alternate = false
    and lower(coalesce(season_type, '')) <> 'preseason'
  union
  select season, game_id, coalesce(nullif(official_id, ''), official_name) as official_key
  from public.nba_official_call_events
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
crew_member_challenge_rollups as (
  select
    participating.season,
    participating.official_key,
    count(distinct challenges.id)::integer as crew_challenges,
    count(distinct challenges.id) filter (where challenges.challenge_outcome = 'successful')::integer as successful_crew_challenges
  from participating_official_games participating
  join public.nba_authoritative_coach_challenge_events challenges
    on challenges.season = participating.season
    and challenges.game_id = participating.game_id
  where lower(coalesce(challenges.season_type, '')) <> 'preseason'
  group by participating.season, participating.official_key
),
unique_challenge_rollups as (
  select season, official_key, count(*)::integer as challenges, sum(successful)::integer as successful_challenges
  from (
    select distinct
      season,
      id,
      official_key,
      case when challenge_outcome = 'successful' then 1 else 0 end as successful
    from (
      select id, season, challenge_outcome, coalesce(nullif(crew_chief_id, ''), crew_chief_name) as official_key
      from public.nba_authoritative_coach_challenge_events
      where coalesce(crew_chief_id, crew_chief_name, '') <> ''
        and lower(coalesce(season_type, '')) <> 'preseason'
      union all
      select id, season, challenge_outcome, coalesce(nullif(whistling_official_id, ''), whistling_official_name) as official_key
      from public.nba_authoritative_coach_challenge_events
      where coalesce(whistling_official_id, whistling_official_name, '') <> ''
        and lower(coalesce(season_type, '')) <> 'preseason'
    ) challenge_officials
  ) unique_challenges
  group by season, official_key
)
select
  keys.season,
  keys.official_key as id,
  coalesce(assignments.official_id, calls.official_id, keys.official_key) as official_id,
  coalesce(assignments.official_name, calls.official_name, keys.official_key) as name,
  assignments.jersey_number,
  coalesce(official_games.games, 0)::integer as games,
  coalesce(calls.calls, 0)::integer as calls,
  case
    when coalesce(official_games.games, 0) > 0
      then coalesce(calls.calls, 0)::numeric / official_games.games
    else 0
  end as calls_per_game,
  coalesce(calls.fouls, 0)::integer as fouls,
  coalesce(calls.violations, 0)::integer as violations,
  coalesce(calls.technicals, 0)::integer as technicals,
  coalesce(unique_challenges.challenges, 0)::integer as challenges,
  coalesce(unique_challenges.successful_challenges, 0)::integer as successful_challenges,
  coalesce(whistle_challenges.whistle_challenges, 0)::integer as whistle_challenges,
  coalesce(whistle_challenges.successful_whistle_challenges, 0)::integer as successful_whistle_challenges,
  case
    when coalesce(whistle_challenges.whistle_challenges, 0) > 0
      then coalesce(whistle_challenges.successful_whistle_challenges, 0)::numeric / whistle_challenges.whistle_challenges
    else 0
  end as whistle_challenge_rate,
  coalesce(crew_challenges.crew_chief_challenges, 0)::integer as crew_chief_challenges,
  coalesce(crew_challenges.successful_crew_chief_challenges, 0)::integer as successful_crew_chief_challenges,
  case
    when coalesce(crew_challenges.crew_chief_challenges, 0) > 0
      then coalesce(crew_challenges.successful_crew_chief_challenges, 0)::numeric / crew_challenges.crew_chief_challenges
    else 0
  end as crew_chief_challenge_rate,
  case
    when coalesce(official_games.games, 0) > 0
      then coalesce(calls.fouls, 0)::numeric / official_games.games
    else 0
  end as fouls_per_game,
  case
    when coalesce(official_games.games, 0) > 0
      then coalesce(calls.violations, 0)::numeric / official_games.games
    else 0
  end as violations_per_game,
  coalesce(crew_member_challenges.crew_challenges, 0)::integer as crew_challenges,
  coalesce(crew_member_challenges.successful_crew_challenges, 0)::integer as successful_crew_challenges,
  case
    when coalesce(crew_member_challenges.crew_challenges, 0) > 0
      then coalesce(crew_member_challenges.successful_crew_challenges, 0)::numeric / crew_member_challenges.crew_challenges
    else 0
  end as crew_challenge_rate
from official_keys keys
left join official_games using (season, official_key)
left join assignment_rollups assignments using (season, official_key)
left join call_rollups calls using (season, official_key)
left join whistle_challenge_rollups whistle_challenges using (season, official_key)
left join crew_challenge_rollups crew_challenges using (season, official_key)
left join crew_member_challenge_rollups crew_member_challenges using (season, official_key)
left join unique_challenge_rollups unique_challenges using (season, official_key);

create or replace view public.nba_team_profiles as
with teams as (
  select season, coalesce(charged_team, team_tricode) as team
  from public.nba_official_call_events
  where coalesce(charged_team, team_tricode, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  union
  select season, benefiting_team as team
  from public.nba_official_call_events
  where coalesce(benefiting_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  union
  select season, challenging_team as team
  from public.nba_authoritative_coach_challenge_events
  where coalesce(challenging_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
calls_against as (
  select
    season,
    coalesce(charged_team, team_tricode) as team,
    count(*)::integer as calls_against
  from public.nba_official_call_events
  where coalesce(charged_team, team_tricode, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, coalesce(charged_team, team_tricode)
),
calls_for as (
  select
    season,
    benefiting_team as team,
    count(*)::integer as calls_for
  from public.nba_official_call_events
  where coalesce(benefiting_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, benefiting_team
),
team_games as (
  select season, team, count(distinct game_id)::integer as games
  from (
    select season, away_team as team, game_id
    from public.nba_official_call_events
    where coalesce(away_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, home_team as team, game_id
    from public.nba_official_call_events
    where coalesce(home_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, coalesce(charged_team, team_tricode) as team, game_id
    from public.nba_official_call_events
    where coalesce(charged_team, team_tricode, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
    union
    select season, benefiting_team as team, game_id
    from public.nba_official_call_events
    where coalesce(benefiting_team, '') <> ''
      and lower(coalesce(season_type, '')) <> 'preseason'
  ) games_source
  group by season, team
),
challenge_rollups as (
  select
    season,
    challenging_team as team,
    count(*)::integer as challenges,
    count(*) filter (where challenge_outcome = 'successful')::integer as successful_challenges
  from public.nba_authoritative_coach_challenge_events
  where coalesce(challenging_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
  group by season, challenging_team
)
select
  teams.season,
  teams.team,
  coalesce(calls_against.calls_against, 0)::integer as calls_against,
  coalesce(calls_for.calls_for, 0)::integer as calls_for,
  coalesce(challenges.challenges, 0)::integer as challenges,
  coalesce(challenges.successful_challenges, 0)::integer as successful_challenges,
  case
    when coalesce(challenges.challenges, 0) > 0
      then coalesce(challenges.successful_challenges, 0)::numeric / challenges.challenges
    else 0
  end as challenge_rate,
  coalesce(team_games.games, 0)::integer as games,
  case
    when coalesce(team_games.games, 0) > 0
      then (coalesce(calls_for.calls_for, 0) - coalesce(calls_against.calls_against, 0))::numeric / team_games.games
    else 0
  end as net_calls_for
from teams
left join calls_against using (season, team)
left join calls_for using (season, team)
left join team_games using (season, team)
left join challenge_rollups challenges using (season, team);

create materialized view if not exists public.nba_officiating_overview_rollups_cache as
select * from public.nba_officiating_overview_rollups
with data;

create unique index if not exists nba_officiating_overview_rollups_cache_key
on public.nba_officiating_overview_rollups_cache (season);

drop materialized view if exists public.nba_official_profiles_cache;
create materialized view public.nba_official_profiles_cache as
select * from public.nba_official_profiles
with data;

create unique index if not exists nba_official_profiles_cache_key
on public.nba_official_profiles_cache (season, id);

create index if not exists nba_official_profiles_cache_calls_lookup
on public.nba_official_profiles_cache (season, calls_per_game desc);

create materialized view if not exists public.nba_team_profiles_cache as
select * from public.nba_team_profiles
with data;

create unique index if not exists nba_team_profiles_cache_key
on public.nba_team_profiles_cache (season, team);

create index if not exists nba_team_profiles_cache_challenge_lookup
on public.nba_team_profiles_cache (season, challenge_rate desc);

drop function if exists public.refresh_nba_officiating_rollup_caches();
