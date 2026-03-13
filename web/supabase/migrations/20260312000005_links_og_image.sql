-- Add og_image_url column to links for thumbnail previews.
alter table public.links add column if not exists og_image_url text;
