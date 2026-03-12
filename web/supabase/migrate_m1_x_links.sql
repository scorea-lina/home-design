-- M1.x Links persistence (DRAFT)

begin;
create extension if not exists pgcrypto;

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null,
  url text not null,
  title text,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists links_source_message_url_uniq
  on public.links (source_message_id, url);

create index if not exists links_created_at_idx
  on public.links (created_at desc);

alter table public.links enable row level security;

create policy if not exists "anon read links"
  on public.links
  for select
  to anon
  using (true);

commit;
