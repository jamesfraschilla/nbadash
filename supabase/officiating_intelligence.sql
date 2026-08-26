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
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create index if not exists nba_official_call_events_team_idx
on public.nba_official_call_events (team_tricode, charged_team, benefiting_team);

create index if not exists nba_official_call_events_category_idx
on public.nba_official_call_events (primary_category, secondary_category);

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
  review_status text not null default 'auto',
  source text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create index if not exists nba_coach_challenge_events_official_idx
on public.nba_coach_challenge_events (crew_chief_id, whistling_official_id);

create index if not exists nba_coach_challenge_events_outcome_idx
on public.nba_coach_challenge_events (challenge_outcome, challenge_type);

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

alter table public.nba_official_game_assignments enable row level security;
alter table public.nba_official_call_events enable row level security;
alter table public.nba_coach_challenge_events enable row level security;
alter table public.nba_officiating_event_reviews enable row level security;

drop policy if exists nba_official_game_assignments_select_public on public.nba_official_game_assignments;
create policy nba_official_game_assignments_select_public
on public.nba_official_game_assignments
for select
using (true);

drop policy if exists nba_official_call_events_select_public on public.nba_official_call_events;
create policy nba_official_call_events_select_public
on public.nba_official_call_events
for select
using (true);

drop policy if exists nba_coach_challenge_events_select_public on public.nba_coach_challenge_events;
create policy nba_coach_challenge_events_select_public
on public.nba_coach_challenge_events
for select
using (true);

drop policy if exists nba_officiating_event_reviews_select_public on public.nba_officiating_event_reviews;
create policy nba_officiating_event_reviews_select_public
on public.nba_officiating_event_reviews
for select
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

create or replace view public.nba_official_call_rollups as
select
  season,
  season_type,
  official_id,
  official_name,
  count(*)::integer as call_events,
  count(distinct game_id)::integer as games,
  count(*) filter (where primary_category = 'foul')::integer as fouls,
  count(*) filter (where primary_category = 'violation')::integer as violations,
  count(*) filter (where primary_category = 'technical')::integer as technicals
from public.nba_official_call_events
where coalesce(official_name, '') <> ''
group by season, season_type, official_id, official_name;

create or replace view public.nba_team_officiating_rollups as
select
  season,
  season_type,
  coalesce(charged_team, team_tricode) as team,
  count(*)::integer as calls_against,
  count(distinct game_id)::integer as games
from public.nba_official_call_events
where coalesce(charged_team, team_tricode, '') <> ''
group by season, season_type, coalesce(charged_team, team_tricode);
