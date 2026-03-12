-- M1.x Images persistence (DRAFT)

begin;

create extension if not exists pgcrypto;

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null,
  url text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create unique index if not exists images_source_message_url_uniq
  on public.images (source_message_id, url);

create index if not exists images_created_at_idx
  on public.images (created_at desc);

alter table public.images enable row level security;

create policy if not exists "anon read images"
  on public.images
  for select
  to anon
  using (true);

commit;
