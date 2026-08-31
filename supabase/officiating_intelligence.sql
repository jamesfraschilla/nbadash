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

create table if not exists public.nba_officiating_cache_refreshes (
  cache_name text primary key,
  refreshed_at timestamptz not null default timezone('utc', now()),
  duration_ms integer,
  row_count integer,
  status text not null default 'success',
  error_message text
);

create table if not exists public.nba_pgr_imports (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  game_id text not null,
  game_date date,
  home_team text,
  away_team text,
  filename text not null,
  file_hash text not null,
  worksheet_name text,
  status text not null default 'imported',
  row_count integer not null default 0,
  possession_count integer not null default 0,
  event_count integer not null default 0,
  summary_payload jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  schema_version text not null default 'pgr-v1',
  source_payload jsonb not null default '{}'::jsonb,
  imported_by uuid,
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists nba_pgr_imports_file_hash_idx
on public.nba_pgr_imports (file_hash);

create index if not exists nba_pgr_imports_season_idx
on public.nba_pgr_imports (season, game_date desc);

create index if not exists nba_pgr_imports_game_idx
on public.nba_pgr_imports (game_id);

alter table public.nba_pgr_imports
add column if not exists summary_payload jsonb not null default '{}'::jsonb;

drop trigger if exists nba_pgr_imports_set_updated_at on public.nba_pgr_imports;
create trigger nba_pgr_imports_set_updated_at
before update on public.nba_pgr_imports
for each row
execute function public.nba_officiating_set_updated_at();

create table if not exists public.nba_pgr_possessions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.nba_pgr_imports(id) on delete cascade,
  season text not null,
  game_id text not null,
  pos_id text not null,
  period_name text,
  first_game_clock text,
  last_game_clock text,
  evaluation_count integer not null default 0,
  event_count integer not null default 0,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists nba_pgr_possessions_import_pos_idx
on public.nba_pgr_possessions (import_id, pos_id);

create index if not exists nba_pgr_possessions_game_idx
on public.nba_pgr_possessions (game_id, pos_id);

drop trigger if exists nba_pgr_possessions_set_updated_at on public.nba_pgr_possessions;
create trigger nba_pgr_possessions_set_updated_at
before update on public.nba_pgr_possessions
for each row
execute function public.nba_officiating_set_updated_at();

create table if not exists public.nba_pgr_events (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.nba_pgr_imports(id) on delete cascade,
  season text not null,
  game_id text not null,
  pos_id text not null,
  event_id text not null,
  period_name text,
  period integer,
  game_clock text,
  call_type_name text,
  play_type_name text,
  video_url text,
  evaluation_count integer not null default 0,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists nba_pgr_events_import_event_idx
on public.nba_pgr_events (import_id, event_id);

create index if not exists nba_pgr_events_game_clock_idx
on public.nba_pgr_events (game_id, period, game_clock);

drop trigger if exists nba_pgr_events_set_updated_at on public.nba_pgr_events;
create trigger nba_pgr_events_set_updated_at
before update on public.nba_pgr_events
for each row
execute function public.nba_officiating_set_updated_at();

create table if not exists public.nba_pgr_evaluations (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.nba_pgr_imports(id) on delete cascade,
  season text not null,
  game_id text not null,
  pos_id text not null,
  event_id text not null,
  rating_seq_no integer not null,
  period_name text,
  period integer,
  game_clock text,
  call_type_name text,
  play_type_name text,
  infraction_type_name text,
  player_name text,
  player_team text,
  opponent_name text,
  opponent_team text,
  player_action_code text,
  player_action_label text,
  infraction_rating_name text,
  call_or_no_call text,
  call_or_no_call_label text,
  call_comment text,
  plr_comment text,
  ogr_flag boolean,
  ptiw_flag boolean,
  video_url text,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists nba_pgr_evaluations_natural_key_idx
on public.nba_pgr_evaluations (game_id, pos_id, event_id, rating_seq_no);

create index if not exists nba_pgr_evaluations_import_idx
on public.nba_pgr_evaluations (import_id);

create index if not exists nba_pgr_evaluations_dimensions_idx
on public.nba_pgr_evaluations (season, period, player_action_code, infraction_type_name, call_or_no_call);

create index if not exists nba_pgr_evaluations_player_idx
on public.nba_pgr_evaluations (season, player_name, opponent_name);

drop trigger if exists nba_pgr_evaluations_set_updated_at on public.nba_pgr_evaluations;
create trigger nba_pgr_evaluations_set_updated_at
before update on public.nba_pgr_evaluations
for each row
execute function public.nba_officiating_set_updated_at();

alter table public.nba_official_game_assignments enable row level security;
alter table public.nba_official_call_events enable row level security;
alter table public.nba_coach_challenge_events enable row level security;
alter table public.nba_officiating_event_reviews enable row level security;
alter table public.nba_pgr_imports enable row level security;
alter table public.nba_pgr_possessions enable row level security;
alter table public.nba_pgr_events enable row level security;
alter table public.nba_pgr_evaluations enable row level security;

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

drop policy if exists nba_pgr_imports_select_public on public.nba_pgr_imports;
create policy nba_pgr_imports_select_public
on public.nba_pgr_imports
for select
using (true);

drop policy if exists nba_pgr_possessions_select_public on public.nba_pgr_possessions;
create policy nba_pgr_possessions_select_public
on public.nba_pgr_possessions
for select
using (true);

drop policy if exists nba_pgr_events_select_public on public.nba_pgr_events;
create policy nba_pgr_events_select_public
on public.nba_pgr_events
for select
using (true);

drop policy if exists nba_pgr_evaluations_select_public on public.nba_pgr_evaluations;
create policy nba_pgr_evaluations_select_public
on public.nba_pgr_evaluations
for select
using (true);

create or replace function public.nba_pgr_build_summary_payload(evaluations jsonb)
returns jsonb
language sql
stable
as $$
with rows as (
  select
    coalesce(evaluation->>'player_action_code', '') as player_action_code,
    coalesce(evaluation->>'call_or_no_call', '') as call_or_no_call,
    upper(coalesce(evaluation->>'player_team', '')) as player_team,
    upper(coalesce(evaluation->>'opponent_team', '')) as opponent_team
  from jsonb_array_elements(coalesce(evaluations, '[]'::jsonb)) as evaluation
),
scoped as (
  select
    scope,
    player_action_code,
    call_or_no_call
  from rows
  cross join lateral (
    values
      ('all'::text),
      (case when opponent_team in ('WAS', 'WASHINGTON', 'WASHINGTON WIZARDS', 'WIZARDS') then 'wizards_for' end),
      (case when player_team in ('WAS', 'WASHINGTON', 'WASHINGTON WIZARDS', 'WIZARDS') then 'wizards_against' end)
  ) as scopes(scope)
  where scopes.scope is not null
),
rollups as (
  select
    scope,
    jsonb_build_object(
      'evaluations', count(*)::integer,
      'infractions', count(*) filter (where player_action_code = 'INF')::integer,
      'judgment_calls', count(*) filter (where player_action_code in ('PI', 'PII'))::integer,
      'calls', count(*) filter (where call_or_no_call = 'C')::integer,
      'no_calls', count(*) filter (where call_or_no_call = 'NC')::integer,
      'called_no_infraction', count(*) filter (
        where call_or_no_call = 'C'
          and player_action_code = 'NI'
      )::integer,
      'called_assessment_error', count(*) filter (
        where call_or_no_call = 'C'
          and player_action_code in ('BCA', 'WPA', 'SFA', 'PFA', 'TTFE')
      )::integer,
      'missed_infractions', count(*) filter (
        where call_or_no_call = 'NC'
          and player_action_code = 'INF'
      )::integer,
      'missed_potential_infractions', count(*) filter (
        where call_or_no_call = 'NC'
          and player_action_code in ('PI', 'PII')
      )::integer
    ) as payload
  from scoped
  group by scope
)
select coalesce(jsonb_object_agg(scope, payload), '{}'::jsonb)
from rollups;
$$;

create or replace function public.nba_import_pgr_report(report_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  import_row public.nba_pgr_imports%rowtype;
  existing_import public.nba_pgr_imports%rowtype;
  current_user_id uuid := auth.uid();
  request_role text := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''), '');
  mode text := coalesce(nullif(report_payload->>'mode', ''), 'create');
  game_id_value text := report_payload->>'game_id';
  is_wizards_game boolean := coalesce((report_payload->'game'->>'is_wizards_game')::boolean, false);
begin
  if current_user_id is null and request_role <> 'service_role' then
    raise exception 'Authentication is required to import PGR reports.';
  end if;

  if coalesce(game_id_value, '') = '' then
    raise exception 'PGR import payload is missing game_id.';
  end if;

  if not is_wizards_game then
    raise exception 'PGR imports are restricted to Washington Wizards games.';
  end if;

  if game_id_value like '001%' or lower(coalesce(report_payload->'game'->>'season_type', '')) = 'preseason' then
    raise exception 'PGR imports exclude preseason games.';
  end if;

  select * into existing_import
  from public.nba_pgr_imports
  where file_hash = report_payload->>'file_hash'
  limit 1;

  if existing_import.id is not null and mode <> 'replace' then
    return jsonb_build_object(
      'status', 'duplicate',
      'import_id', existing_import.id,
      'game_id', existing_import.game_id,
      'message', 'This exact PGR workbook has already been imported.'
    );
  end if;

  if mode = 'replace' then
    delete from public.nba_pgr_imports
    where game_id = game_id_value;
  end if;

  insert into public.nba_pgr_imports (
    season,
    game_id,
    game_date,
    home_team,
    away_team,
    filename,
    file_hash,
    worksheet_name,
    status,
    row_count,
    possession_count,
    event_count,
    summary_payload,
    warnings,
    errors,
    schema_version,
    source_payload,
    imported_by
  )
  values (
    report_payload->>'season',
    game_id_value,
    nullif(report_payload->'game'->>'game_date', '')::date,
    report_payload->'game'->>'home_team',
    report_payload->'game'->>'away_team',
    report_payload->>'filename',
    report_payload->>'file_hash',
    report_payload->>'worksheet_name',
    'imported',
    coalesce((report_payload->>'row_count')::integer, 0),
    coalesce((report_payload->>'possession_count')::integer, 0),
    coalesce((report_payload->>'event_count')::integer, 0),
    public.nba_pgr_build_summary_payload(report_payload->'evaluations'),
    coalesce(report_payload->'warnings', '[]'::jsonb),
    coalesce(report_payload->'errors', '[]'::jsonb),
    coalesce(nullif(report_payload->>'schema_version', ''), 'pgr-v1'),
    coalesce(report_payload->'source_payload', '{}'::jsonb),
    current_user_id
  )
  returning * into import_row;

  insert into public.nba_pgr_possessions (
    import_id, season, game_id, pos_id, period_name, first_game_clock, last_game_clock,
    evaluation_count, event_count, source_payload
  )
  select
    import_row.id,
    import_row.season,
    import_row.game_id,
    pos_id,
    period_name,
    first_game_clock,
    last_game_clock,
    coalesce(evaluation_count, 0),
    coalesce(event_count, 0),
    coalesce(source_payload, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(report_payload->'possessions', '[]'::jsonb)) as possession_rows(
    pos_id text,
    period_name text,
    first_game_clock text,
    last_game_clock text,
    evaluation_count integer,
    event_count integer,
    source_payload jsonb
  );

  insert into public.nba_pgr_events (
    import_id, season, game_id, pos_id, event_id, period_name, period, game_clock,
    call_type_name, play_type_name, video_url, evaluation_count, source_payload
  )
  select
    import_row.id,
    import_row.season,
    import_row.game_id,
    pos_id,
    event_id,
    period_name,
    period,
    game_clock,
    call_type_name,
    play_type_name,
    video_url,
    coalesce(evaluation_count, 0),
    coalesce(source_payload, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(report_payload->'events', '[]'::jsonb)) as event_rows(
    pos_id text,
    event_id text,
    period_name text,
    period integer,
    game_clock text,
    call_type_name text,
    play_type_name text,
    video_url text,
    evaluation_count integer,
    source_payload jsonb
  );

  insert into public.nba_pgr_evaluations (
    import_id, season, game_id, pos_id, event_id, rating_seq_no, period_name, period, game_clock,
    call_type_name, play_type_name, infraction_type_name, player_name, player_team,
    opponent_name, opponent_team, player_action_code, player_action_label,
    infraction_rating_name, call_or_no_call, call_or_no_call_label, call_comment,
    plr_comment, ogr_flag, ptiw_flag, video_url, raw_row
  )
  select
    import_row.id,
    import_row.season,
    import_row.game_id,
    pos_id,
    event_id,
    rating_seq_no,
    period_name,
    period,
    game_clock,
    call_type_name,
    play_type_name,
    infraction_type_name,
    player_name,
    player_team,
    opponent_name,
    opponent_team,
    player_action_code,
    player_action_label,
    infraction_rating_name,
    call_or_no_call,
    call_or_no_call_label,
    call_comment,
    plr_comment,
    ogr_flag,
    ptiw_flag,
    video_url,
    coalesce(raw_row, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(report_payload->'evaluations', '[]'::jsonb)) as evaluation_rows(
    pos_id text,
    event_id text,
    rating_seq_no integer,
    period_name text,
    period integer,
    game_clock text,
    call_type_name text,
    play_type_name text,
    infraction_type_name text,
    player_name text,
    player_team text,
    opponent_name text,
    opponent_team text,
    player_action_code text,
    player_action_label text,
    infraction_rating_name text,
    call_or_no_call text,
    call_or_no_call_label text,
    call_comment text,
    plr_comment text,
    ogr_flag boolean,
    ptiw_flag boolean,
    video_url text,
    raw_row jsonb
  );

  return jsonb_build_object(
    'status', 'imported',
    'import_id', import_row.id,
    'game_id', import_row.game_id,
    'row_count', import_row.row_count,
    'event_count', import_row.event_count,
    'possession_count', import_row.possession_count
  );
end;
$$;

create or replace view public.nba_authoritative_coach_challenge_events as
select *
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

create materialized view if not exists public.nba_authoritative_coach_challenge_events_cache as
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
  count(*) filter (where primary_category = 'technical')::integer as technicals,
  case
    when count(distinct game_id) > 0 then count(*) filter (where primary_category = 'foul')::numeric / count(distinct game_id)
    else 0
  end as fouls_per_game,
  case
    when count(distinct game_id) > 0 then count(*) filter (where primary_category = 'violation')::numeric / count(distinct game_id)
    else 0
  end as violations_per_game
from public.nba_official_call_events
where coalesce(official_name, '') <> ''
  and lower(coalesce(season_type, '')) <> 'preseason'
group by season, season_type, official_id, official_name;

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
    case
      when category_key like '%defensive3second%' then 'Defensive 3 Second Violation'
      when primary_category in ('turnover', 'violation') and category_key like '%3secondviolation%' then 'Offensive 3 Second Violation'
      when primary_category = 'out_of_bounds' or category_key like '%outofbounds%' then 'Out Of Bounds'
      when primary_category = 'turnover' and category_key like '%badpass%' then 'Out Of Bounds'
      when primary_category = 'turnover' and category_key like '%lostball%' then 'Out Of Bounds'
      when primary_category = 'jump_ball' or category_key like '%jumpball%' then 'Jump Ball'
      when primary_category = 'technical' or secondary_category = 'technical' then 'Technical Foul'
      when primary_category = 'foul' and category_key like '%shooting%' then 'Shooting Foul'
      when primary_category = 'foul' and category_key like '%looseball%' then 'Loose Ball Foul'
      when primary_category = 'foul' and category_key like '%flagranttype1%' then 'Flagrant Type 1 Foul'
      when primary_category = 'foul' and category_key like '%flagranttype2%' then 'Flagrant Type 2 Foul'
      when primary_category = 'foul' and category_key like '%awayfromplay%' then 'Away From Play Foul'
      when primary_category = 'foul' and category_key like '%transitiontake%' then 'Transition Take Foul'
      when primary_category = 'foul' and (category_key like '%personaltake%' or category_key = 'take') then 'Take Foul'
      when primary_category = 'foul' and category_key like '%offensive%' then 'Offensive Foul'
      when primary_category = 'foul' and category_key like '%clearpath%' then 'Clear Path Foul'
      when primary_category = 'foul' and category_key like '%flagrant%' then 'Flagrant Foul'
      when primary_category = 'foul' and category_key like '%personal%' then 'Foul on Floor'
      when primary_category = 'foul' then 'Foul on Floor'
      when primary_category = 'violation' then initcap(replace(coalesce(nullif(secondary_category, ''), nullif(descriptor, ''), nullif(sub_type, ''), 'Violation'), '_', ' '))
      else initcap(replace(coalesce(nullif(secondary_category, ''), nullif(primary_category, ''), 'Unknown'), '_', ' '))
    end as category
  from (
    select
      *,
      regexp_replace(
        lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')),
        '[^a-z0-9]',
        '',
        'g'
      ) as category_key
    from public.nba_official_call_events
  ) calls
  where coalesce(official_id, official_name, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
category_counts as (
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
    case
      when category_key like '%defensive3second%' then 'Defensive 3 Second Violation'
      when primary_category in ('turnover', 'violation') and category_key like '%3secondviolation%' then 'Offensive 3 Second Violation'
      when primary_category = 'out_of_bounds' or category_key like '%outofbounds%' then 'Out Of Bounds'
      when primary_category = 'turnover' and category_key like '%badpass%' then 'Out Of Bounds'
      when primary_category = 'turnover' and category_key like '%lostball%' then 'Out Of Bounds'
      when primary_category = 'jump_ball' or category_key like '%jumpball%' then 'Jump Ball'
      when primary_category = 'technical' or secondary_category = 'technical' then 'Technical Foul'
      when primary_category = 'foul' and category_key like '%shooting%' then 'Shooting Foul'
      when primary_category = 'foul' and category_key like '%looseball%' then 'Loose Ball Foul'
      when primary_category = 'foul' and category_key like '%flagranttype1%' then 'Flagrant Type 1 Foul'
      when primary_category = 'foul' and category_key like '%flagranttype2%' then 'Flagrant Type 2 Foul'
      when primary_category = 'foul' and category_key like '%awayfromplay%' then 'Away From Play Foul'
      when primary_category = 'foul' and category_key like '%transitiontake%' then 'Transition Take Foul'
      when primary_category = 'foul' and (category_key like '%personaltake%' or category_key = 'take') then 'Take Foul'
      when primary_category = 'foul' and category_key like '%offensive%' then 'Offensive Foul'
      when primary_category = 'foul' and category_key like '%clearpath%' then 'Clear Path Foul'
      when primary_category = 'foul' and category_key like '%flagrant%' then 'Flagrant Foul'
      when primary_category = 'foul' and category_key like '%personal%' then 'Foul on Floor'
      when primary_category = 'foul' then 'Foul on Floor'
      when primary_category = 'violation' then initcap(replace(coalesce(nullif(secondary_category, ''), nullif(descriptor, ''), nullif(sub_type, ''), 'Violation'), '_', ' '))
      else initcap(replace(coalesce(nullif(secondary_category, ''), nullif(primary_category, ''), 'Unknown'), '_', ' '))
    end as category
  from (
    select
      *,
      regexp_replace(
        lower(coalesce(descriptor, '') || ' ' || coalesce(sub_type, '') || ' ' || coalesce(secondary_category, '')),
        '[^a-z0-9]',
        '',
        'g'
      ) as category_key
    from public.nba_official_call_events
  ) calls
  where coalesce(charged_team, team_tricode, benefiting_team, '') <> ''
    and lower(coalesce(season_type, '')) <> 'preseason'
),
category_counts as (
  select
    season,
    team,
    category,
    count(*)::integer as calls,
    count(distinct game_id)::integer as category_games
  from categorized_calls
  group by season, team, category
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
    count(*) filter (where primary_category = 'violation')::integer as violations,
    count(*) filter (where primary_category = 'technical')::integer as technicals
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
  greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0))::integer as games,
  coalesce(calls.calls, 0)::integer as calls,
  case
    when greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0)) > 0
      then coalesce(calls.calls, 0)::numeric / greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0))
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
    when greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0)) > 0
      then coalesce(calls.fouls, 0)::numeric / greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0))
    else 0
  end as fouls_per_game,
  case
    when greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0)) > 0
      then coalesce(calls.violations, 0)::numeric / greatest(coalesce(assignments.assigned_games, 0), coalesce(calls.call_games, 0))
    else 0
  end as violations_per_game
from official_keys keys
left join assignment_rollups assignments using (season, official_key)
left join call_rollups calls using (season, official_key)
left join whistle_challenge_rollups whistle_challenges using (season, official_key)
left join crew_challenge_rollups crew_challenges using (season, official_key)
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

create materialized view if not exists public.nba_official_profiles_cache as
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

create or replace view public.nba_pgr_import_rollups as
select
  imports.id,
  imports.season,
  imports.game_id,
  imports.game_date,
  imports.home_team,
  imports.away_team,
  imports.filename,
  imports.file_hash,
  imports.worksheet_name,
  imports.status,
  imports.row_count,
  imports.possession_count,
  imports.event_count,
  imports.warnings,
  imports.errors,
  imports.imported_at,
  coalesce((imports.summary_payload->'all'->>'infractions')::integer, 0) as infractions,
  coalesce((imports.summary_payload->'all'->>'judgment_calls')::integer, 0) as judgment_calls,
  coalesce((imports.summary_payload->'all'->>'calls')::integer, 0) as calls,
  coalesce((imports.summary_payload->'all'->>'no_calls')::integer, 0) as no_calls,
  case
    when imports.row_count > 0 then coalesce((imports.summary_payload->'all'->>'infractions')::numeric, 0) / imports.row_count
    else 0
  end as infraction_rate,
  case
    when imports.row_count > 0 then coalesce((imports.summary_payload->'all'->>'calls')::numeric, 0) / imports.row_count
    else 0
  end as call_rate
from public.nba_pgr_imports imports
where imports.game_id not like '001%';

create or replace view public.nba_pgr_overview_rollups as
select
  season,
  count(distinct game_id)::integer as games,
  sum(row_count)::integer as evaluations,
  sum(event_count)::integer as events,
  sum(possession_count)::integer as possessions,
  sum(coalesce((summary_payload->'all'->>'infractions')::integer, 0))::integer as infractions,
  sum(coalesce((summary_payload->'all'->>'judgment_calls')::integer, 0))::integer as judgment_calls,
  sum(coalesce((summary_payload->'all'->>'calls')::integer, 0))::integer as calls,
  sum(coalesce((summary_payload->'all'->>'no_calls')::integer, 0))::integer as no_calls,
  case
    when sum(row_count) > 0 then sum(coalesce((summary_payload->'all'->>'infractions')::numeric, 0)) / sum(row_count)
    else 0
  end as infraction_rate,
  case
    when sum(row_count) > 0 then sum(coalesce((summary_payload->'all'->>'calls')::numeric, 0)) / sum(row_count)
    else 0
  end as call_rate
from public.nba_pgr_imports
where game_id not like '001%'
group by season;

create or replace view public.nba_pgr_accuracy_rollups as
with scopes(scope) as (
  values ('all'::text), ('wizards_for'::text), ('wizards_against'::text)
),
scoped as (
  select
    imports.season,
    scopes.scope,
    coalesce((imports.summary_payload->scopes.scope->>'evaluations')::integer, 0) as evaluations,
    coalesce((imports.summary_payload->scopes.scope->>'calls')::integer, 0) as calls,
    coalesce((imports.summary_payload->scopes.scope->>'no_calls')::integer, 0) as no_calls,
    coalesce((imports.summary_payload->scopes.scope->>'called_no_infraction')::integer, 0) as called_no_infraction,
    coalesce((imports.summary_payload->scopes.scope->>'called_assessment_error')::integer, 0) as called_assessment_error,
    coalesce((imports.summary_payload->scopes.scope->>'missed_infractions')::integer, 0) as missed_infractions,
    coalesce((imports.summary_payload->scopes.scope->>'missed_potential_infractions')::integer, 0) as missed_potential_infractions
  from public.nba_pgr_imports imports
  cross join scopes
  where imports.game_id not like '001%'
)
select
  season,
  scope,
  sum(evaluations)::integer as evaluations,
  sum(calls)::integer as calls,
  sum(no_calls)::integer as no_calls,
  sum(called_no_infraction)::integer as called_no_infraction,
  sum(called_assessment_error)::integer as called_assessment_error,
  sum(missed_infractions)::integer as missed_infractions,
  sum(missed_potential_infractions)::integer as missed_potential_infractions
from scoped
group by season, scope;

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

create or replace view public.nba_pgr_assessment_distribution as
select
  season,
  player_action_code,
  max(player_action_label) as player_action_label,
  count(*)::integer as evaluations,
  count(distinct game_id || ':' || event_id)::integer as events,
  count(*) filter (where call_or_no_call = 'C')::integer as calls,
  count(*) filter (where call_or_no_call = 'NC')::integer as no_calls,
  case
    when count(*) > 0 then count(*) filter (where call_or_no_call = 'C')::numeric / count(*)
    else 0
  end as call_rate
from public.nba_pgr_evaluations
where coalesce(player_action_code, '') <> ''
  and game_id not like '001%'
group by season, player_action_code;

create or replace view public.nba_pgr_infraction_type_distribution as
select
  season,
  infraction_type_name,
  count(*)::integer as evaluations,
  count(distinct game_id || ':' || event_id)::integer as events,
  count(*) filter (where player_action_code = 'INF')::integer as infractions,
  count(*) filter (where call_or_no_call = 'C')::integer as calls,
  case
    when count(*) > 0 then count(*) filter (where player_action_code = 'INF')::numeric / count(*)
    else 0
  end as infraction_rate
from public.nba_pgr_evaluations
where coalesce(infraction_type_name, '') <> ''
  and game_id not like '001%'
group by season, infraction_type_name;

create or replace function public.nba_pgr_smart_insights(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
as $$
with params as (
  select
    coalesce(nullif(filters->>'season', ''), '2025-26') as season,
    nullif(filters->>'start_date', '')::date as start_date,
    nullif(filters->>'end_date', '')::date as end_date,
    nullif(filters->>'opponent', '') as opponent,
    nullif(filters->>'home_road', '') as home_road,
    nullif(filters->>'crew_chief', '') as crew_chief,
    nullif(filters->>'whistling_official', '') as whistling_official,
    greatest(coalesce(nullif(filters->>'previous_games', '')::integer, 0), 0) as previous_games
),
imports as (
  select imports.*
  from public.nba_pgr_imports imports
  join params on params.season = imports.season
  where imports.game_id not like '001%'
),
recent_games as (
  select game_id
  from imports
  cross join params
  order by game_date desc nulls last, game_id desc
  limit (select case when previous_games > 0 then previous_games else 100000 end from params)
),
crew_by_game as (
  select distinct on (game_id)
    game_id,
    official_name as crew_chief_name
  from public.nba_official_game_assignments
  where season = (select season from params)
    and is_alternate = false
    and lower(coalesce(season_type, '')) <> 'preseason'
  order by
    game_id,
    case when lower(coalesce(role_key, '')) in ('crewchief', 'crew_chief') then 0 else 1 end,
    coalesce(assignment_order, 99)
),
context_rows as (
  select
    evaluations.*,
    imports.game_date,
    upper(imports.home_team) as home_team,
    upper(imports.away_team) as away_team,
    case
      when upper(imports.home_team) = 'WAS' then upper(imports.away_team)
      else upper(imports.home_team)
    end as opponent,
    case when upper(imports.home_team) = 'WAS' then 'Home' else 'Road' end as home_road,
    coalesce(crew_by_game.crew_chief_name, '') as crew_chief_name,
    coalesce(call_match.official_name, '') as whistling_official_name,
    case
      when upper(coalesce(evaluations.player_team, '')) in ('WAS', 'WASHINGTON', 'WASHINGTON WIZARDS', 'WIZARDS') then 'wizards_against'
      when upper(coalesce(evaluations.opponent_team, '')) in ('WAS', 'WASHINGTON', 'WASHINGTON WIZARDS', 'WIZARDS') then 'wizards_for'
      else 'neutral'
    end as impact_side,
    case
      when evaluations.call_or_no_call = 'C'
        and evaluations.player_action_code in ('NI', 'BCA', 'WPA', 'SFA', 'PFA', 'TTFE') then 'incorrect_call'
      when evaluations.call_or_no_call = 'NC'
        and evaluations.player_action_code in ('INF', 'PI', 'PII') then 'incorrect_non_call'
      when evaluations.call_or_no_call = 'C' then 'correct_call'
      else 'correct_non_call'
    end as decision
  from public.nba_pgr_evaluations evaluations
  join imports using (game_id, season)
  join recent_games using (game_id)
  left join crew_by_game using (game_id)
  left join lateral (
    select official_name
    from public.nba_official_call_events calls
    where calls.season = evaluations.season
      and calls.game_id = evaluations.game_id
      and lower(coalesce(calls.season_type, '')) <> 'preseason'
      and (
        calls.action_number::text = evaluations.event_id
        or (calls.action_number + 100000)::text = evaluations.event_id
      )
      and coalesce(calls.official_name, '') <> ''
    order by calls.confidence desc nulls last, calls.action_number
    limit 1
  ) call_match on true
  cross join params
  where evaluations.season = params.season
    and (params.start_date is null or imports.game_date >= params.start_date)
    and (params.end_date is null or imports.game_date <= params.end_date)
    and (params.opponent is null or (
      case when upper(imports.home_team) = 'WAS' then upper(imports.away_team) else upper(imports.home_team) end
    ) = upper(params.opponent))
    and (params.home_road is null or (
      case when upper(imports.home_team) = 'WAS' then 'Home' else 'Road' end
    ) = params.home_road)
    and (params.crew_chief is null or coalesce(crew_by_game.crew_chief_name, '') = params.crew_chief)
    and (params.whistling_official is null or coalesce(call_match.official_name, '') = params.whistling_official)
),
summary_scope as (
  select 'all'::text as scope, * from context_rows
  union all
  select impact_side as scope, * from context_rows where impact_side in ('wizards_for', 'wizards_against')
),
summary as (
  select
    scope,
    count(*)::integer as total,
    count(*) filter (where decision = 'correct_call')::integer as correct_calls,
    count(*) filter (where decision = 'incorrect_call')::integer as incorrect_calls,
    count(*) filter (where decision = 'correct_non_call')::integer as correct_non_calls,
    count(*) filter (where decision = 'incorrect_non_call')::integer as incorrect_non_calls,
    count(*) filter (where call_or_no_call = 'C' and player_action_code = 'NI')::integer as called_no_infraction,
    count(*) filter (where call_or_no_call = 'C' and player_action_code in ('BCA', 'WPA', 'SFA', 'PFA', 'TTFE'))::integer as called_assessment_error,
    count(*) filter (where call_or_no_call = 'NC' and player_action_code = 'INF')::integer as missed_infractions,
    count(*) filter (where call_or_no_call = 'NC' and player_action_code in ('PI', 'PII'))::integer as missed_potential_infractions
  from summary_scope
  group by scope
),
summary_json as (
  select jsonb_object_agg(
    scope,
    jsonb_build_object(
      'total', total,
      'correctCalls', correct_calls,
      'incorrectCalls', incorrect_calls,
      'correctNonCalls', correct_non_calls,
      'incorrectNonCalls', incorrect_non_calls,
      'calledNoInfraction', called_no_infraction,
      'calledAssessmentError', called_assessment_error,
      'missedInfractions', missed_infractions,
      'missedPotentialInfractions', missed_potential_infractions,
      'accuracy', case when total > 0 then (correct_calls + correct_non_calls)::numeric / total else 0 end
    )
  ) as payload
  from summary
),
grouped as (
  select 'topInfractionTypes' as group_key, coalesce(nullif(infraction_type_name, ''), 'Unknown') as label, * from context_rows
  union all
  select 'topOpponents', coalesce(nullif(opponent, ''), 'Unknown'), * from context_rows
  union all
  select 'topCrewChiefs', coalesce(nullif(crew_chief_name, ''), 'Unknown'), * from context_rows
  union all
  select 'topWhistles', coalesce(nullif(whistling_official_name, ''), 'Unknown'), * from context_rows
),
group_rollups as (
  select
    group_key,
    label,
    count(*)::integer as total,
    count(*) filter (where decision = 'correct_call')::integer as correct_calls,
    count(*) filter (where decision = 'incorrect_call')::integer as incorrect_calls,
    count(*) filter (where decision = 'correct_non_call')::integer as correct_non_calls,
    count(*) filter (where decision = 'incorrect_non_call')::integer as incorrect_non_calls
  from grouped
  group by group_key, label
),
group_json as (
  select
    group_key,
    jsonb_agg(
      jsonb_build_object(
        'label', label,
        'total', total,
        'correctCalls', correct_calls,
        'incorrectCalls', incorrect_calls,
        'correctNonCalls', correct_non_calls,
        'incorrectNonCalls', incorrect_non_calls,
        'accuracy', case when total > 0 then (correct_calls + correct_non_calls)::numeric / total else 0 end
      )
      order by (incorrect_calls + incorrect_non_calls) desc, total desc, label asc
    ) as rows
  from group_rollups
  group by group_key
),
options_json as (
  select jsonb_build_object(
    'opponents', coalesce((select jsonb_agg(distinct opponent order by opponent) from context_rows where coalesce(opponent, '') <> ''), '[]'::jsonb),
    'homeRoad', coalesce((select jsonb_agg(distinct home_road order by home_road) from context_rows where coalesce(home_road, '') <> ''), '[]'::jsonb),
    'crewChiefs', coalesce((select jsonb_agg(distinct crew_chief_name order by crew_chief_name) from context_rows where coalesce(crew_chief_name, '') <> ''), '[]'::jsonb),
    'whistlingOfficials', coalesce((select jsonb_agg(distinct whistling_official_name order by whistling_official_name) from context_rows where coalesce(whistling_official_name, '') <> ''), '[]'::jsonb),
    'infractionTypes', coalesce((select jsonb_agg(distinct infraction_type_name order by infraction_type_name) from context_rows where coalesce(infraction_type_name, '') <> ''), '[]'::jsonb)
  ) as payload
)
select jsonb_build_object(
  'totalFiltered', (select count(*) from context_rows),
  'accuracy', coalesce((select payload from summary_json), '{}'::jsonb),
  'groups', jsonb_build_object(
    'topInfractionTypes', coalesce((select rows from group_json where group_key = 'topInfractionTypes'), '[]'::jsonb),
    'topOpponents', coalesce((select rows from group_json where group_key = 'topOpponents'), '[]'::jsonb),
    'topCrewChiefs', coalesce((select rows from group_json where group_key = 'topCrewChiefs'), '[]'::jsonb),
    'topWhistles', coalesce((select rows from group_json where group_key = 'topWhistles'), '[]'::jsonb)
  ),
  'filterOptions', (select payload from options_json)
);
$$;
