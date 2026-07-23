-- Shared cache for automatically generated game segment analyses.
-- This keeps Q1/Q2/halftime/etc. analysis text uniform across users/devices.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.game_analysis_segments (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  segment_key text not null,
  segment_label text not null,
  range_label text not null,
  data_signature text not null,
  source text not null default 'unknown',
  result jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_analysis_segments_segment_key_check
    check (segment_key ~ '^[a-z0-9-]{1,40}$')
);

create unique index if not exists idx_game_analysis_segments_game_segment
on public.game_analysis_segments (game_id, segment_key);

create index if not exists idx_game_analysis_segments_game_id
on public.game_analysis_segments (game_id);

drop trigger if exists set_game_analysis_segments_updated_at on public.game_analysis_segments;
create trigger set_game_analysis_segments_updated_at
before update on public.game_analysis_segments
for each row
execute function public.set_updated_at();

alter table public.game_analysis_segments enable row level security;

drop policy if exists "game analysis segments readable" on public.game_analysis_segments;
create policy "game analysis segments readable"
on public.game_analysis_segments
for select
to authenticated
using (true);
