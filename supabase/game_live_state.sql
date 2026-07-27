-- Shared normalized game-state snapshots.
--
-- This is intentionally a compact cache of the existing dashboard game feed, not
-- a replacement data source. The live Game page still reads directly from the
-- current API while this table keeps a last-known-good normalized snapshot that
-- can be used later for faster reloads, diagnostics, and cross-device state.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.game_live_state (
  game_id text primary key,
  league text not null default 'nba',
  season_year text,
  game_status integer,
  game_status_text text,
  game_date text,
  source text not null default 'dashboard-api',
  source_signature text not null,
  source_updated_at timestamptz,
  normalized_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_live_state_game_id_check
    check (game_id ~ '^[0-9]{5,20}$'),
  constraint game_live_state_league_check
    check (league in ('nba', 'gleague', 'summer', 'unknown'))
);

alter table public.game_live_state
  add column if not exists league text not null default 'nba',
  add column if not exists season_year text,
  add column if not exists game_status integer,
  add column if not exists game_status_text text,
  add column if not exists game_date text,
  add column if not exists source text not null default 'dashboard-api',
  add column if not exists source_signature text not null default '',
  add column if not exists source_updated_at timestamptz,
  add column if not exists normalized_at timestamptz not null default now(),
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists diagnostics jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_game_live_state_league_status
on public.game_live_state (league, game_status, updated_at desc);

create index if not exists idx_game_live_state_source_updated_at
on public.game_live_state (source_updated_at desc);

drop trigger if exists set_game_live_state_updated_at on public.game_live_state;
create trigger set_game_live_state_updated_at
before update on public.game_live_state
for each row
execute function public.set_updated_at();

alter table public.game_live_state enable row level security;

drop policy if exists "game live state readable" on public.game_live_state;
create policy "game live state readable"
on public.game_live_state
for select
to authenticated
using (true);

-- Mutations are intentionally handled by the game-live-state Edge Function with
-- the service role. Browser clients should not write rows directly.
