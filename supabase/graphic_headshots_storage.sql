insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'graphic-headshots',
  'graphic-headshots',
  true,
  5242880,
  array['image/png']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists graphic_headshots_select_public on storage.objects;
create policy graphic_headshots_select_public on storage.objects
for select using (bucket_id = 'graphic-headshots');

drop policy if exists graphic_headshots_insert_own on storage.objects;
create policy graphic_headshots_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'graphic-headshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists graphic_headshots_update_own on storage.objects;
create policy graphic_headshots_update_own on storage.objects
for update to authenticated
using (bucket_id = 'graphic-headshots' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'graphic-headshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists graphic_headshots_delete_own on storage.objects;
create policy graphic_headshots_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'graphic-headshots' and (storage.foldername(name))[1] = auth.uid()::text);
