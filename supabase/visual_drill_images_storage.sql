insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visual-drill-images',
  'visual-drill-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists visual_drill_images_select_public on storage.objects;
drop policy if exists visual_drill_images_select_own on storage.objects;
create policy visual_drill_images_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'visual-drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists visual_drill_images_insert_own on storage.objects;
create policy visual_drill_images_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'visual-drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists visual_drill_images_update_own on storage.objects;
create policy visual_drill_images_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'visual-drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'visual-drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists visual_drill_images_delete_own on storage.objects;
create policy visual_drill_images_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'visual-drill-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
