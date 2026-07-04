insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-headshots',
  'player-headshots',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists player_headshots_select_public on storage.objects;
create policy player_headshots_select_public
on storage.objects
for select
using (bucket_id = 'player-headshots');

drop policy if exists player_headshots_insert_admin on storage.objects;
create policy player_headshots_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-headshots'
  and public.is_admin_user()
);

drop policy if exists player_headshots_update_admin on storage.objects;
create policy player_headshots_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-headshots'
  and public.is_admin_user()
)
with check (
  bucket_id = 'player-headshots'
  and public.is_admin_user()
);

drop policy if exists player_headshots_delete_admin on storage.objects;
create policy player_headshots_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-headshots'
  and public.is_admin_user()
);
