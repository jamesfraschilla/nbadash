-- Repair schema drift without replacing RPCs, policies, saved content, or history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.user_notes, public.user_drawings in access exclusive mode;

create temporary table account_revision_data_guard (
  table_name text primary key, row_count bigint, content_hash text
) on commit drop;
do $$
declare
  table_name text;
  row_count bigint;
  content_hash text;
begin
  foreach table_name in array array['user_notes', 'user_note_versions', 'user_note_shares',
    'user_drawings', 'user_drawing_versions', 'user_drawing_shares'] loop
    execute format(
      'select count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ''revision'')::text), '''' order by md5((to_jsonb(t) - ''revision'')::text)), '''')) from public.%I t',
      table_name
    ) into row_count, content_hash;
    insert into account_revision_data_guard values (table_name, row_count, content_hash);
  end loop;
end;
$$;

alter table public.user_notes add column if not exists revision integer not null default 1;
alter table public.user_drawings add column if not exists revision integer not null default 1;

do $$
declare
  saved record;
  current_count bigint;
  current_hash text;
begin
  for saved in select * from account_revision_data_guard loop
    execute format(
      'select count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ''revision'')::text), '''' order by md5((to_jsonb(t) - ''revision'')::text)), '''')) from public.%I t',
      saved.table_name
    ) into current_count, current_hash;
    if current_count <> saved.row_count or current_hash <> saved.content_hash then
      raise exception 'Account revision repair changed saved content in %; rolling back', saved.table_name;
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
