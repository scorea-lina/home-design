-- Allow anon to delete image rows (for clone deletion).
create policy "Anon delete images"
  on public.images for delete
  to anon
  using (true);

-- Allow anon to delete objects from the images storage bucket.
create policy "Anon delete images bucket"
  on storage.objects for delete
  to anon
  using (bucket_id = 'images');
