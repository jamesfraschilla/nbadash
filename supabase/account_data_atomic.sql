-- Run after accounts_auth.sql. These RPCs keep records, versions, shares, and audit rows atomic.

alter table public.user_tool_records
add column if not exists revision integer not null default 1;

create or replace function public.create_user_note_atomic(p_note jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  saved public.user_notes;
  note_tags text[];
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select coalesce(array_agg(value), '{}'::text[]) into note_tags
  from jsonb_array_elements_text(coalesce(p_note -> 'tags', '[]'::jsonb));

  insert into public.user_notes (
    id, owner_id, legacy_local_id, game_id, period_label, minutes, seconds,
    text, tags, source_meta, sharing_scope, created_at, updated_at
  ) values (
    coalesce((p_note ->> 'id')::uuid, gen_random_uuid()),
    actor,
    nullif(p_note ->> 'legacy_local_id', ''),
    coalesce(p_note ->> 'game_id', ''),
    nullif(p_note ->> 'period_label', ''),
    (p_note ->> 'minutes')::integer,
    (p_note ->> 'seconds')::integer,
    coalesce(p_note ->> 'text', ''),
    note_tags,
    coalesce(p_note -> 'source_meta', '{}'::jsonb),
    case when 'Halftime' = any(note_tags) or 'Concept' = any(note_tags)
      then 'shared'
      when p_note ->> 'sharing_scope' = 'shared' then 'shared'
      else 'private' end,
    coalesce((p_note ->> 'created_at')::timestamptz, now()),
    coalesce((p_note ->> 'updated_at')::timestamptz, now())
  ) returning * into saved;

  insert into public.user_note_versions (note_id, version_number, snapshot, created_by)
  values (saved.id, 1, to_jsonb(saved), actor);
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'note', saved.id, 'created', jsonb_build_object('gameId', saved.game_id));
  return to_jsonb(saved);
end;
$$;

create or replace function public.update_user_note_atomic(p_note_id uuid, p_updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  existing public.user_notes;
  saved public.user_notes;
  next_tags text[];
  next_version integer;
begin
  select * into existing from public.user_notes where id = p_note_id for update;
  if existing.id is null then raise exception 'Note not found'; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to update this note';
  end if;

  if p_updates ? 'tags' then
    select coalesce(array_agg(value), '{}'::text[]) into next_tags
    from jsonb_array_elements_text(coalesce(p_updates -> 'tags', '[]'::jsonb));
  else
    next_tags := existing.tags;
  end if;

  update public.user_notes set
    text = case when p_updates ? 'text' then coalesce(p_updates ->> 'text', '') else existing.text end,
    tags = next_tags,
    period_label = case when p_updates ? 'period_label' then nullif(p_updates ->> 'period_label', '') else existing.period_label end,
    minutes = case when p_updates ? 'minutes' then (p_updates ->> 'minutes')::integer else existing.minutes end,
    seconds = case when p_updates ? 'seconds' then (p_updates ->> 'seconds')::integer else existing.seconds end,
    source_meta = case when p_updates ? 'source_meta' then coalesce(p_updates -> 'source_meta', '{}'::jsonb) else existing.source_meta end,
    sharing_scope = case
      when 'Halftime' = any(next_tags) or 'Concept' = any(next_tags) then 'shared'
      when p_updates ->> 'sharing_scope' = 'shared' then 'shared'
      when p_updates ? 'sharing_scope' then 'private'
      else existing.sharing_scope end
  where id = p_note_id
  returning * into saved;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.user_note_versions where note_id = p_note_id;
  insert into public.user_note_versions (note_id, version_number, snapshot, created_by)
  values (p_note_id, next_version, to_jsonb(saved), actor);

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'note', saved.id, 'updated', p_updates);
  return to_jsonb(saved);
end;
$$;

create or replace function public.replace_user_note_shares_atomic(p_note_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  existing public.user_notes;
  saved public.user_notes;
  normalized_ids uuid[];
  next_version integer;
begin
  select * into existing from public.user_notes where id = p_note_id for update;
  if existing.id is null then raise exception 'Note not found'; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to share this note';
  end if;
  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_ids
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) value;

  delete from public.user_note_shares where note_id = p_note_id;
  insert into public.user_note_shares (note_id, user_id, shared_by)
  select p_note_id, value, actor from unnest(normalized_ids) value;
  update public.user_notes set sharing_scope = case
    when 'Halftime' = any(existing.tags) or 'Concept' = any(existing.tags) then 'shared'
    when cardinality(normalized_ids) > 0 then 'shared' else 'private' end
  where id = p_note_id returning * into saved;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.user_note_versions where note_id = p_note_id;
  insert into public.user_note_versions (note_id, version_number, snapshot, created_by)
  values (p_note_id, next_version, to_jsonb(saved), actor);
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'note', p_note_id, 'shared', jsonb_build_object('userIds', to_jsonb(normalized_ids)));
  return to_jsonb(saved);
end;
$$;

create or replace function public.delete_user_note_atomic(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid(); existing public.user_notes;
begin
  select * into existing from public.user_notes where id = p_note_id for update;
  if existing.id is null then return false; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to delete this note';
  end if;
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'note', p_note_id, 'deleted', jsonb_build_object('gameId', existing.game_id));
  delete from public.user_notes where id = p_note_id;
  return true;
end;
$$;

create or replace function public.create_user_drawing_atomic(p_drawing jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid(); saved public.user_drawings;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  insert into public.user_drawings (
    id, owner_id, game_id, title, court_mode, strokes, sharing_scope, created_at, updated_at
  ) values (
    coalesce((p_drawing ->> 'id')::uuid, gen_random_uuid()), actor,
    nullif(p_drawing ->> 'game_id', ''), coalesce(nullif(p_drawing ->> 'title', ''), 'Untitled'),
    case when p_drawing ->> 'court_mode' = 'full' then 'full' else 'half' end,
    coalesce(p_drawing -> 'strokes', '[]'::jsonb),
    case when p_drawing ->> 'sharing_scope' = 'shared' then 'shared' else 'private' end,
    coalesce((p_drawing ->> 'created_at')::timestamptz, now()),
    coalesce((p_drawing ->> 'updated_at')::timestamptz, now())
  ) returning * into saved;
  insert into public.user_drawing_versions (drawing_id, version_number, snapshot, created_by)
  values (saved.id, 1, to_jsonb(saved), actor);
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'drawing', saved.id, 'created', jsonb_build_object('gameId', saved.game_id));
  return to_jsonb(saved);
end;
$$;

create or replace function public.update_user_drawing_atomic(p_drawing_id uuid, p_updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid(); existing public.user_drawings; saved public.user_drawings; next_version integer;
begin
  select * into existing from public.user_drawings where id = p_drawing_id for update;
  if existing.id is null then raise exception 'Drawing not found'; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to update this drawing';
  end if;
  update public.user_drawings set
    title = case when p_updates ? 'title' then coalesce(nullif(p_updates ->> 'title', ''), 'Untitled') else existing.title end,
    court_mode = case when p_updates ->> 'court_mode' = 'full' then 'full' when p_updates ? 'court_mode' then 'half' else existing.court_mode end,
    strokes = case when p_updates ? 'strokes' then coalesce(p_updates -> 'strokes', '[]'::jsonb) else existing.strokes end,
    sharing_scope = case when p_updates ->> 'sharing_scope' = 'shared' then 'shared' when p_updates ? 'sharing_scope' then 'private' else existing.sharing_scope end
  where id = p_drawing_id returning * into saved;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.user_drawing_versions where drawing_id = p_drawing_id;
  insert into public.user_drawing_versions (drawing_id, version_number, snapshot, created_by)
  values (p_drawing_id, next_version, to_jsonb(saved), actor);
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'drawing', saved.id, 'updated', p_updates);
  return to_jsonb(saved);
end;
$$;

create or replace function public.replace_user_drawing_shares_atomic(p_drawing_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid(); existing public.user_drawings; saved public.user_drawings;
  normalized_ids uuid[]; next_version integer;
begin
  select * into existing from public.user_drawings where id = p_drawing_id for update;
  if existing.id is null then raise exception 'Drawing not found'; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to share this drawing';
  end if;
  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_ids
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) value;
  delete from public.user_drawing_shares where drawing_id = p_drawing_id;
  insert into public.user_drawing_shares (drawing_id, user_id, shared_by)
  select p_drawing_id, value, actor from unnest(normalized_ids) value;
  update public.user_drawings set sharing_scope = case when cardinality(normalized_ids) > 0 then 'shared' else 'private' end
  where id = p_drawing_id returning * into saved;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.user_drawing_versions where drawing_id = p_drawing_id;
  insert into public.user_drawing_versions (drawing_id, version_number, snapshot, created_by)
  values (p_drawing_id, next_version, to_jsonb(saved), actor);
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'drawing', p_drawing_id, 'shared', jsonb_build_object('userIds', to_jsonb(normalized_ids)));
  return to_jsonb(saved);
end;
$$;

create or replace function public.delete_user_drawing_atomic(p_drawing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid(); existing public.user_drawings;
begin
  select * into existing from public.user_drawings where id = p_drawing_id for update;
  if existing.id is null then return false; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to delete this drawing';
  end if;
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'drawing', p_drawing_id, 'deleted', jsonb_build_object('title', existing.title));
  delete from public.user_drawings where id = p_drawing_id;
  return true;
end;
$$;

create or replace function public.save_user_tool_record_atomic(p_record jsonb, p_expected_revision integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid(); record_id uuid := (p_record ->> 'id')::uuid;
  existing public.user_tool_records; saved public.user_tool_records;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into existing from public.user_tool_records where id = record_id for update;
  if existing.id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception using message = 'TOOL_RECORD_CONFLICT', errcode = '40001';
    end if;
    insert into public.user_tool_records (id, owner_id, type, title, payload, created_at, updated_at, revision)
    values (
      record_id, actor, coalesce(p_record ->> 'type', 'matchup_graphic'),
      coalesce(nullif(p_record ->> 'title', ''), 'Untitled'), coalesce(p_record -> 'payload', '{}'::jsonb),
      coalesce((p_record ->> 'created_at')::timestamptz, now()), now(), 1
    ) returning * into saved;
  else
    if existing.owner_id <> actor and not public.is_admin_user(actor) then
      raise exception 'Not authorized to update this saved tool';
    end if;
    if existing.revision <> coalesce(p_expected_revision, 0) then
      raise exception using message = 'TOOL_RECORD_CONFLICT', errcode = '40001';
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

revoke all on function public.create_user_note_atomic(jsonb) from public;
revoke all on function public.update_user_note_atomic(uuid, jsonb) from public;
revoke all on function public.replace_user_note_shares_atomic(uuid, uuid[]) from public;
revoke all on function public.delete_user_note_atomic(uuid) from public;
revoke all on function public.create_user_drawing_atomic(jsonb) from public;
revoke all on function public.update_user_drawing_atomic(uuid, jsonb) from public;
revoke all on function public.replace_user_drawing_shares_atomic(uuid, uuid[]) from public;
revoke all on function public.delete_user_drawing_atomic(uuid) from public;
revoke all on function public.save_user_tool_record_atomic(jsonb, integer) from public;
grant execute on function public.create_user_note_atomic(jsonb) to authenticated;
grant execute on function public.update_user_note_atomic(uuid, jsonb) to authenticated;
grant execute on function public.replace_user_note_shares_atomic(uuid, uuid[]) to authenticated;
grant execute on function public.delete_user_note_atomic(uuid) to authenticated;
grant execute on function public.create_user_drawing_atomic(jsonb) to authenticated;
grant execute on function public.update_user_drawing_atomic(uuid, jsonb) to authenticated;
grant execute on function public.replace_user_drawing_shares_atomic(uuid, uuid[]) to authenticated;
grant execute on function public.delete_user_drawing_atomic(uuid) to authenticated;
grant execute on function public.save_user_tool_record_atomic(jsonb, integer) to authenticated;
