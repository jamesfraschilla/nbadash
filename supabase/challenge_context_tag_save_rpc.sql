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
  sibling_event_ids uuid[] := '{}'::uuid[];
begin
  if p_challenge_event_id is null then
    raise exception 'Missing challenge event id.';
  end if;

  select coalesce(array_agg(sibling.id order by sibling.id), '{}'::uuid[])
  into sibling_event_ids
  from public.nba_coach_challenge_events target
  join public.nba_coach_challenge_events sibling
    on coalesce(sibling.season, '') = coalesce(target.season, '')
   and coalesce(sibling.game_id, '') = coalesce(target.game_id, '')
   and coalesce(sibling.game_date::text, '') = coalesce(target.game_date::text, '')
   and coalesce(sibling.home_team, '') = coalesce(target.home_team, '')
   and coalesce(sibling.away_team, '') = coalesce(target.away_team, '')
   and coalesce(sibling.challenging_team, '') = coalesce(target.challenging_team, '')
   and coalesce(sibling.period, -1) = coalesce(target.period, -1)
   and coalesce(sibling.game_clock, '') = coalesce(target.game_clock, '')
  where target.id = p_challenge_event_id;

  if coalesce(array_length(sibling_event_ids, 1), 0) = 0 then
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
  where challenge_event_id = any(sibling_event_ids);

  insert into public.nba_challenge_context_event_tags (challenge_event_id, tag_id, tagged_by)
  select sibling_event_id, tag_id, current_user_id
  from unnest(sibling_event_ids) as sibling_event_id
  cross join unnest(selected_ids) as tag_id
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

insert into public.nba_challenge_context_event_tags (challenge_event_id, tag_id, tagged_by, tagged_at)
select distinct
  sibling.id as challenge_event_id,
  existing.tag_id,
  existing.tagged_by,
  existing.tagged_at
from public.nba_challenge_context_event_tags existing
join public.nba_coach_challenge_events tagged
  on tagged.id = existing.challenge_event_id
join public.nba_coach_challenge_events sibling
  on coalesce(sibling.season, '') = coalesce(tagged.season, '')
 and coalesce(sibling.game_id, '') = coalesce(tagged.game_id, '')
 and coalesce(sibling.game_date::text, '') = coalesce(tagged.game_date::text, '')
 and coalesce(sibling.home_team, '') = coalesce(tagged.home_team, '')
 and coalesce(sibling.away_team, '') = coalesce(tagged.away_team, '')
 and coalesce(sibling.challenging_team, '') = coalesce(tagged.challenging_team, '')
 and coalesce(sibling.period, -1) = coalesce(tagged.period, -1)
 and coalesce(sibling.game_clock, '') = coalesce(tagged.game_clock, '')
on conflict (challenge_event_id, tag_id) do nothing;
