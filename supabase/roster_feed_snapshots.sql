-- Run after accounts_auth.sql so public.set_updated_at() is available.
create table if not exists public.roster_feed_snapshots (
  league text primary key check (league in ('nba', 'gleague')),
  season text not null,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.roster_feed_snapshots enable row level security;

-- No client policy is intentional. Roster Edge Functions use the service role,
-- while browser clients receive only the bounded public function response.
revoke all on table public.roster_feed_snapshots from anon, authenticated;

drop trigger if exists set_roster_feed_snapshots_updated_at on public.roster_feed_snapshots;
create trigger set_roster_feed_snapshots_updated_at
before update on public.roster_feed_snapshots
for each row
execute function public.set_updated_at();
