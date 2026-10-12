-- Changes function definitions only. No existing notes, shares, or versions are rewritten.
-- Reminder is displayed as Officiating by the app without a bulk tag migration.
begin;
set transaction isolation level repeatable read;

-- Ephemeral fingerprints verify that deploying the functions changes no saved
-- content. Concurrent authors continue to save against the existing RPCs.
create temporary table note_data_guard (
  table_name text, row_count bigint, content_hash text
) on commit drop;
do $$
declare table_name text; row_count bigint; content_hash text;
begin
  foreach table_name in array array['user_notes', 'user_note_versions', 'user_note_shares'] loop
    execute format(
      'select count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' order by md5(to_jsonb(t)::text)), '''')) from public.%I t',
      table_name
    ) into row_count, content_hash;
    insert into note_data_guard values (table_name, row_count, content_hash);
  end loop;
end;
$$;

create or replace function public.can_access_note(note_row_id uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.user_notes n
    where n.id = note_row_id
      and (
        n.owner_id = coalesce(target_user, auth.uid())
        or public.is_admin_user(target_user)
        or 'Halftime' = any(n.tags)
        or 'Concept' = any(n.tags)
        or 'Playcall' = any(n.tags)
        or exists (
          select 1
          from public.user_note_shares s
          where s.note_id = n.id
            and s.user_id = coalesce(target_user, auth.uid())
        )
      )
  );
$$;

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
    case when 'Halftime' = any(note_tags) or 'Concept' = any(note_tags) or 'Playcall' = any(note_tags)
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
  expected_revision integer;
begin
  select * into existing from public.user_notes where id = p_note_id for update;
  if existing.id is null then raise exception 'Note not found'; end if;
  if actor is null or (existing.owner_id <> actor and not public.is_admin_user(actor)) then
    raise exception 'Not authorized to update this note';
  end if;
  expected_revision := case
    when p_updates ? '_expected_revision' then (p_updates ->> '_expected_revision')::integer
    else existing.revision
  end;
  if existing.revision <> expected_revision then
    return jsonb_build_object(
      'error', 'NOTE_CONFLICT',
      'message', 'This note changed in another browser. Reload it before saving again.',
      'record', to_jsonb(existing)
    );
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
      when 'Halftime' = any(next_tags) or 'Concept' = any(next_tags) or 'Playcall' = any(next_tags) then 'shared'
      when p_updates ->> 'sharing_scope' = 'shared' then 'shared'
      when p_updates ? 'sharing_scope' then 'private'
      else existing.sharing_scope end,
    revision = existing.revision + 1
  where id = p_note_id
  returning * into saved;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.user_note_versions where note_id = p_note_id;
  insert into public.user_note_versions (note_id, version_number, snapshot, created_by)
  values (p_note_id, next_version, to_jsonb(saved), actor);

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, detail)
  values (actor, 'note', saved.id, 'updated', p_updates - '_expected_revision');
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
    when 'Halftime' = any(existing.tags) or 'Concept' = any(existing.tags) or 'Playcall' = any(existing.tags) then 'shared'
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

do $$
declare saved record; current_count bigint; current_hash text;
begin
  for saved in select * from note_data_guard loop
    execute format(
      'select count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' order by md5(to_jsonb(t)::text)), '''')) from public.%I t',
      saved.table_name
    ) into current_count, current_hash;
    if current_count <> saved.row_count or current_hash <> saved.content_hash then
      raise exception 'Saved content changed during note-sharing migration: %', saved.table_name;
    end if;
  end loop;
end;
$$;
select table_name, row_count as protected_rows from note_data_guard;
commit;

