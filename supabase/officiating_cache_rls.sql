-- Enable RLS on public officiating cache tables.
-- These tables contain public report/rollup data used by the frontend, so anon and
-- authenticated clients keep read-only SELECT access. Public writes are blocked by
-- the absence of INSERT/UPDATE/DELETE policies; maintenance scripts use service_role.

alter table public.nba_authoritative_coach_challenge_events_cache enable row level security;
alter table public.nba_team_official_net_call_rollups_cache enable row level security;
alter table public.nba_official_call_category_rollups_cache enable row level security;
alter table public.nba_team_call_category_rollups_cache enable row level security;
alter table public.nba_official_profiles_cache enable row level security;
alter table public.nba_team_profiles_cache enable row level security;
alter table public.nba_officiating_overview_rollups_cache enable row level security;
alter table public.nba_officiating_cache_refreshes enable row level security;

drop policy if exists "public read authoritative challenge cache" on public.nba_authoritative_coach_challenge_events_cache;
create policy "public read authoritative challenge cache"
on public.nba_authoritative_coach_challenge_events_cache
for select
to anon, authenticated
using (true);

drop policy if exists "public read team official net call cache" on public.nba_team_official_net_call_rollups_cache;
create policy "public read team official net call cache"
on public.nba_team_official_net_call_rollups_cache
for select
to anon, authenticated
using (true);

drop policy if exists "public read official category rollup cache" on public.nba_official_call_category_rollups_cache;
create policy "public read official category rollup cache"
on public.nba_official_call_category_rollups_cache
for select
to anon, authenticated
using (true);

drop policy if exists "public read team category rollup cache" on public.nba_team_call_category_rollups_cache;
create policy "public read team category rollup cache"
on public.nba_team_call_category_rollups_cache
for select
to anon, authenticated
using (true);

drop policy if exists "public read official profiles cache" on public.nba_official_profiles_cache;
create policy "public read official profiles cache"
on public.nba_official_profiles_cache
for select
to anon, authenticated
using (true);

drop policy if exists "public read team profiles cache" on public.nba_team_profiles_cache;
create policy "public read team profiles cache"
on public.nba_team_profiles_cache
for select
to anon, authenticated
using (true);

drop policy if exists "public read officiating overview cache" on public.nba_officiating_overview_rollups_cache;
create policy "public read officiating overview cache"
on public.nba_officiating_overview_rollups_cache
for select
to anon, authenticated
using (true);

-- Intentionally no public policy for nba_officiating_cache_refreshes. It is
-- operational metadata for service-role maintenance jobs, not frontend content.
