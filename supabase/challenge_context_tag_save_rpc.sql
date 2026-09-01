create or replace function public.nba_save_challenge_context_tags(
  p_challenge_event_id uuid,
  p_selected_tag_ids uuid[] default '{}'::uuid[],
  p_new_tag_labels text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_label text;
  selected_ids uuid[] := '{}'::uuid[];
begin
  if p_challenge_event_id is null then
    raise exception 'Missing challenge event id.';
  end if;

  if not exists (
    select 1
    from public.nba_coach_challenge_events
    where id = p_challenge_event_id
  ) then
    raise exception 'Challenge event % does not exist.', p_challenge_event_id;
  end if;

  for clean_label in
    select distinct regexp_replace(btrim(label), '\s+', ' ', 'g')
    from unnest(coalesce(p_new_tag_labels, '{}'::text[])) as label
    where btrim(label) <> ''
  loop
    insert into public.nba_challenge_context_tags (label, created_by)
    values (clean_label, current_user_id)
    on conflict (label) do nothing;
  end loop;

  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into selected_ids
  from public.nba_challenge_context_tags
  where id = any(coalesce(p_selected_tag_ids, '{}'::uuid[]))
     or label in (
       select distinct regexp_replace(btrim(label), '\s+', ' ', 'g')
       from unnest(coalesce(p_new_tag_labels, '{}'::text[])) as label
       where btrim(label) <> ''
     );

  delete from public.nba_challenge_context_event_tags
  where challenge_event_id = p_challenge_event_id;

  insert into public.nba_challenge_context_event_tags (challenge_event_id, tag_id, tagged_by)
  select p_challenge_event_id, tag_id, current_user_id
  from unnest(selected_ids) as tag_id
  on conflict (challenge_event_id, tag_id) do nothing;

  return jsonb_build_object(
    'options',
    coalesce((
      select jsonb_agg(jsonb_build_object('id', id::text, 'label', label) order by label)
      from public.nba_challenge_context_tags
    ), '[]'::jsonb),
    'selected',
    coalesce((
      select jsonb_agg(jsonb_build_object('id', id::text, 'label', label) order by label)
      from public.nba_challenge_context_tags
      where id = any(selected_ids)
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.nba_save_challenge_context_tags(uuid, uuid[], text[]) to anon, authenticated;
