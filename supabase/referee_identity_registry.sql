begin;

-- This is intentionally a compact identity index, not another event store.
-- Detailed game history remains in the existing assignment and call tables.
create table if not exists public.nba_official_identities (
  official_id text primary key check (btrim(official_id) <> ''),
  current_name text not null default '',
  current_jersey_number text not null default '',
  name_aliases text[] not null default '{}'::text[],
  jersey_number_history text[] not null default '{}'::text[],
  first_seen_on date,
  last_seen_on date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists nba_official_identities_current_name_idx
on public.nba_official_identities (lower(current_name));

alter table public.nba_official_identities enable row level security;

drop policy if exists "official identities visible to authenticated users" on public.nba_official_identities;
create policy "official identities visible to authenticated users"
on public.nba_official_identities for select to authenticated using (true);

revoke all on public.nba_official_identities from public, anon;
revoke insert, update, delete on public.nba_official_identities from authenticated;
grant select on public.nba_official_identities to authenticated, service_role;

create or replace function public.upsert_nba_official_identity(
  target_official_id text,
  observed_name text,
  observed_jersey_number text default '',
  observed_on date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_id text := btrim(coalesce(target_official_id, ''));
  clean_name text := btrim(coalesce(observed_name, ''));
  clean_number text := btrim(coalesce(observed_jersey_number, ''));
begin
  if clean_id = '' then return; end if;

  insert into public.nba_official_identities (
    official_id, current_name, current_jersey_number, name_aliases,
    jersey_number_history, first_seen_on, last_seen_on
  ) values (
    clean_id,
    clean_name,
    clean_number,
    case when clean_name = '' then '{}'::text[] else array[clean_name] end,
    case when clean_number = '' then '{}'::text[] else array[clean_number] end,
    observed_on,
    observed_on
  )
  on conflict (official_id) do update set
    current_name = case
      when excluded.current_name <> ''
        and coalesce(excluded.last_seen_on, date '0001-01-01') >= coalesce(nba_official_identities.last_seen_on, date '0001-01-01')
      then excluded.current_name else nba_official_identities.current_name end,
    current_jersey_number = case
      when excluded.current_jersey_number <> ''
        and coalesce(excluded.last_seen_on, date '0001-01-01') >= coalesce(nba_official_identities.last_seen_on, date '0001-01-01')
      then excluded.current_jersey_number else nba_official_identities.current_jersey_number end,
    name_aliases = array(
      select distinct alias from unnest(nba_official_identities.name_aliases || excluded.name_aliases) alias
      where btrim(alias) <> '' order by alias
    ),
    jersey_number_history = array(
      select distinct number from unnest(nba_official_identities.jersey_number_history || excluded.jersey_number_history) number
      where btrim(number) <> '' order by number
    ),
    first_seen_on = case
      when nba_official_identities.first_seen_on is null then excluded.first_seen_on
      when excluded.first_seen_on is null then nba_official_identities.first_seen_on
      else least(nba_official_identities.first_seen_on, excluded.first_seen_on) end,
    last_seen_on = case
      when nba_official_identities.last_seen_on is null then excluded.last_seen_on
      when excluded.last_seen_on is null then nba_official_identities.last_seen_on
      else greatest(nba_official_identities.last_seen_on, excluded.last_seen_on) end,
    updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.upsert_nba_official_identity(text, text, text, date) from public, anon, authenticated;
grant execute on function public.upsert_nba_official_identity(text, text, text, date) to service_role;

create or replace function public.observe_nba_official_identities(observations jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  observation jsonb;
begin
  for observation in select value from jsonb_array_elements(coalesce(observations, '[]'::jsonb)) loop
    perform public.upsert_nba_official_identity(
      observation->>'officialId',
      observation->>'name',
      observation->>'jerseyNumber',
      coalesce(nullif(observation->>'observedOn', '')::date, current_date)
    );
  end loop;
end;
$$;

revoke all on function public.observe_nba_official_identities(jsonb) from public, anon, authenticated;
grant execute on function public.observe_nba_official_identities(jsonb) to service_role;

create or replace function public.capture_nba_official_assignment_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_nba_official_identity(new.official_id, new.official_name, new.jersey_number, new.game_date);
  return new;
end;
$$;

drop trigger if exists nba_official_assignment_identity_registry on public.nba_official_game_assignments;
create trigger nba_official_assignment_identity_registry
after insert or update of official_id, official_name, jersey_number, game_date
on public.nba_official_game_assignments
for each row execute function public.capture_nba_official_assignment_identity();

create or replace function public.capture_nba_official_call_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_nba_official_identity(new.official_id, new.official_name, '', new.game_date);
  return new;
end;
$$;

drop trigger if exists nba_official_call_identity_registry on public.nba_official_call_events;
create trigger nba_official_call_identity_registry
after insert or update of official_id, official_name, game_date
on public.nba_official_call_events
for each row execute function public.capture_nba_official_call_identity();

-- One-time compact backfill. Reapplying this migration does not rescan history.
do $$
declare
  identity_row record;
begin
  if not exists (select 1 from public.nba_official_identities limit 1) then
    for identity_row in
      select distinct official_id, official_name, jersey_number, game_date
      from (
        select official_id, official_name, jersey_number, game_date
        from public.nba_official_game_assignments
        where coalesce(official_id, '') <> ''
        union
        select official_id, official_name, ''::text as jersey_number, game_date
        from public.nba_official_call_events
        where coalesce(official_id, '') <> ''
      ) source_rows
      order by game_date asc nulls first
    loop
      perform public.upsert_nba_official_identity(
        identity_row.official_id,
        identity_row.official_name,
        identity_row.jersey_number,
        identity_row.game_date
      );
    end loop;
  end if;
end
$$;

-- The October 3 preseason feed emitted 200608 for Brent Barnaky while the
-- NBA's established ID before and after that game is 201638. Collapse the
-- one-game feed anomaly so it cannot split his career profile.
update public.nba_official_game_assignments
set official_id = '201638'
where official_id = '200608';

update public.nba_official_call_events
set official_id = '201638'
where official_id = '200608';

delete from public.nba_official_game_facts duplicate
using public.nba_official_game_facts canonical
where duplicate.official_id = '200608'
  and canonical.official_id = '201638'
  and duplicate.game_id = canonical.game_id;

update public.nba_official_game_facts
set official_id = '201638'
where official_id = '200608';

update public.nba_coach_challenge_events
set
  crew_chief_id = case when crew_chief_id = '200608' then '201638' else crew_chief_id end,
  whistling_official_id = case when whistling_official_id = '200608' then '201638' else whistling_official_id end
where crew_chief_id = '200608' or whistling_official_id = '200608';

delete from public.nba_official_identities where official_id = '200608';

commit;
