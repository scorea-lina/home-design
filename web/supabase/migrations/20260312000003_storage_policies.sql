-- Storage RLS policies for the "images" bucket.
-- Allow public read and anon upload/update.

-- Allow anyone to read objects in the images bucket.
create policy "Public read images bucket"
  on storage.objects for select
  using (bucket_id = 'images');

-- Allow anon to upload objects to the images bucket.
create policy "Anon insert images bucket"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'images');

-- Allow anon to update objects in the images bucket.
create policy "Anon update images bucket"
  on storage.objects for update
  to anon
  using (bucket_id = 'images');
