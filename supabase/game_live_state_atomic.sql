-- Atomically deduplicates live-state writes across every browser and device.
create or replace function public.upsert_game_live_state_if_changed(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game_id text := coalesce(p_snapshot ->> 'game_id', '');
  incoming_signature text := coalesce(p_snapshot ->> 'source_signature', '');
  existing public.game_live_state;
  saved public.game_live_state;
begin
  if target_game_id !~ '^[0-9]{5,20}$' or incoming_signature = '' then
    raise exception 'A valid game ID and source signature are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_game_id, 0));
  select * into existing from public.game_live_state where game_id = target_game_id for update;
  if existing.game_id is not null and existing.source_signature = incoming_signature then
    return jsonb_build_object('changed', false, 'row', to_jsonb(existing));
  end if;

  insert into public.game_live_state (
    game_id, league, season_year, game_status, game_status_text, game_date,
    source, source_signature, source_updated_at, normalized_at, payload, diagnostics
  ) values (
    target_game_id,
    coalesce(nullif(p_snapshot ->> 'league', ''), 'unknown'),
    nullif(p_snapshot ->> 'season_year', ''),
    (p_snapshot ->> 'game_status')::integer,
    nullif(p_snapshot ->> 'game_status_text', ''),
    nullif(p_snapshot ->> 'game_date', ''),
    coalesce(nullif(p_snapshot ->> 'source', ''), 'dashboard-api'),
    incoming_signature,
    nullif(p_snapshot ->> 'source_updated_at', '')::timestamptz,
    coalesce(nullif(p_snapshot ->> 'normalized_at', '')::timestamptz, now()),
    coalesce(p_snapshot -> 'payload', '{}'::jsonb),
    coalesce(p_snapshot -> 'diagnostics', '{}'::jsonb)
  )
  on conflict (game_id) do update set
    league = excluded.league,
    season_year = excluded.season_year,
    game_status = excluded.game_status,
    game_status_text = excluded.game_status_text,
    game_date = excluded.game_date,
    source = excluded.source,
    source_signature = excluded.source_signature,
    source_updated_at = excluded.source_updated_at,
    normalized_at = excluded.normalized_at,
    payload = excluded.payload,
    diagnostics = excluded.diagnostics
  returning * into saved;

  return jsonb_build_object('changed', true, 'row', to_jsonb(saved));
end;
$$;

revoke all on function public.upsert_game_live_state_if_changed(jsonb) from public;
revoke all on function public.upsert_game_live_state_if_changed(jsonb) from anon;
revoke all on function public.upsert_game_live_state_if_changed(jsonb) from authenticated;
grant execute on function public.upsert_game_live_state_if_changed(jsonb) to service_role;
