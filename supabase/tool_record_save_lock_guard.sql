create or replace function public.save_user_tool_record_atomic(p_record jsonb, p_expected_revision integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  record_id uuid := nullif(p_record ->> 'id', '')::uuid;
  existing public.user_tool_records;
  saved public.user_tool_records;
begin
  if actor is null then
    return jsonb_build_object('error', 'AUTH_REQUIRED', 'message', 'Authentication required');
  end if;
  if record_id is null then
    return jsonb_build_object('error', 'INVALID_RECORD', 'message', 'Saved tool id is required');
  end if;

  perform set_config('lock_timeout', '1000ms', true);
  perform set_config('statement_timeout', '8000ms', true);

  if not pg_try_advisory_xact_lock(hashtextextended(record_id::text, 0)) then
    return jsonb_build_object('error', 'TOOL_RECORD_BUSY', 'message', 'This saved tool is already saving.');
  end if;

  select * into existing from public.user_tool_records where id = record_id for update;
  if existing.id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      return jsonb_build_object('error', 'TOOL_RECORD_CONFLICT', 'message', 'This saved tool changed in another browser.');
    end if;
    insert into public.user_tool_records (id, owner_id, type, title, payload, created_at, updated_at, revision)
    values (
      record_id, actor, coalesce(p_record ->> 'type', 'matchup_graphic'),
      coalesce(nullif(p_record ->> 'title', ''), 'Untitled'), coalesce(p_record -> 'payload', '{}'::jsonb),
      coalesce((p_record ->> 'created_at')::timestamptz, now()), now(), 1
    ) returning * into saved;
  else
    if existing.owner_id <> actor and not public.is_admin_user(actor) then
      return jsonb_build_object('error', 'NOT_AUTHORIZED', 'message', 'Not authorized to update this saved tool');
    end if;
    if existing.revision <> coalesce(p_expected_revision, 0) then
      return jsonb_build_object(
        'error', 'TOOL_RECORD_CONFLICT',
        'message', 'This saved tool changed in another browser.',
        'record', to_jsonb(existing)
      );
    end if;
    update public.user_tool_records set
      type = coalesce(p_record ->> 'type', existing.type),
      title = coalesce(nullif(p_record ->> 'title', ''), existing.title),
      payload = coalesce(p_record -> 'payload', existing.payload),
      revision = existing.revision + 1
    where id = record_id returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.save_user_tool_record_atomic(jsonb, integer) from public;
grant execute on function public.save_user_tool_record_atomic(jsonb, integer) to authenticated;
