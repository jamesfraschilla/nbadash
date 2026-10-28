-- Exercise real RPCs only against disposable records. Nothing is committed or
-- published to Realtime; existing user records are never edited by this test.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare
  owner uuid;
  test_note_id uuid := gen_random_uuid();
  test_drawing_id uuid := gen_random_uuid();
  saved jsonb;
  result jsonb;
  version_count integer;
  rejected boolean := false;
begin
  select id into owner from public.profiles where status = 'active' order by id limit 1;
  if owner is null then raise exception 'No active account available for rollback verification'; end if;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  saved := public.create_user_note_atomic(jsonb_build_object(
    'id', test_note_id, 'game_id', 'note-revision-rollback-test', 'period_label', 'Q1',
    'minutes', 5, 'seconds', 3, 'text', 'Temporary revision verification',
    'tags', jsonb_build_array('Playcall'), 'source_meta', jsonb_build_object('clip_url', 'https://clips.nba.com/')
  ));
  if (saved ->> 'revision')::integer <> 1 or saved ->> 'sharing_scope' <> 'shared' then
    raise exception 'New note revision or Playcall sharing is incorrect';
  end if;
  result := public.update_user_note_atomic(test_note_id, jsonb_build_object('text', 'Verified edit', '_expected_revision', 1));
  if (result ->> 'revision')::integer <> 2 or result ->> 'text' <> 'Verified edit'
    or result ->> 'owner_id' <> owner::text or result ->> 'sharing_scope' <> 'shared'
    or result -> 'source_meta' <> saved -> 'source_meta' or result -> 'tags' <> saved -> 'tags'
    or result ->> 'period_label' <> 'Q1' or (result ->> 'minutes')::integer <> 5 or (result ->> 'seconds')::integer <> 3 then
    raise exception 'Note edit did not preserve clock, owner, tags, link, and sharing';
  end if;
  select count(*) into version_count from public.user_note_versions where note_id = test_note_id;
  if version_count <> 2 then raise exception 'Note version history did not advance'; end if;
  result := public.update_user_note_atomic(test_note_id, jsonb_build_object('text', 'Stale edit', '_expected_revision', 1));
  if result ->> 'error' <> 'NOTE_CONFLICT' then raise exception 'Stale note edit was not rejected'; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.update_user_note_atomic(test_note_id, jsonb_build_object('text', 'Unauthorized edit'));
  exception when others then
    if sqlerrm = 'Not authorized to update this note' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Unauthorized note edit was not rejected'; end if;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  saved := public.create_user_drawing_atomic(jsonb_build_object('id', test_drawing_id, 'title', 'Temporary revision verification'));
  result := public.update_user_drawing_atomic(test_drawing_id, jsonb_build_object('title', 'Verified drawing edit', '_expected_revision', 1));
  if (result ->> 'revision')::integer <> 2 then raise exception 'Drawing edit revision did not advance'; end if;
  result := public.update_user_drawing_atomic(test_drawing_id, jsonb_build_object('title', 'Stale drawing edit', '_expected_revision', 1));
  if result ->> 'error' <> 'DRAWING_CONFLICT' then raise exception 'Stale drawing edit was not rejected'; end if;
end;
$$;
rollback;
