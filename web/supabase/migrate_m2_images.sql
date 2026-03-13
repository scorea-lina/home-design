-- M2 Images persistence

begin;
create extension if not exists pgcrypto;

-- ─── images table ───────────────────────────────────────────────────────
create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),

  -- Source tracking: email attachment, inline, or manual upload
  source_type text not null default 'upload',  -- 'email_attachment' | 'email_inline' | 'upload' | 'pdf_page'
  source_message_id text,                       -- FK to agentmail_messages (null for uploads)

  -- Storage
  storage_path text not null,                   -- path in Supabase Storage bucket
  file_name text,                               -- original file name
  mime_type text,                               -- image/png, image/jpeg, etc.
  file_size_bytes bigint,

  -- Clone threading
  original_image_id uuid references public.images(id) on delete set null,
  -- null = this IS an original; set = this is a clone of that image

  -- Markup data (JSON blob of annotations for clones)
  markup_json jsonb,

  -- Metadata
  title text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists images_created_at_idx
  on public.images (created_at desc);

create index if not exists images_original_id_idx
  on public.images (original_image_id)
  where original_image_id is not null;

create index if not exists images_source_message_idx
  on public.images (source_message_id)
  where source_message_id is not null;

create index if not exists images_archived_at_idx
  on public.images (archived_at)
  where archived_at is not null;

-- RLS
alter table public.images enable row level security;

drop policy if exists "anon read images" on public.images;
create policy "anon read images"
  on public.images
  for select
  to anon
  using (true);

drop policy if exists "anon insert images" on public.images;
create policy "anon insert images"
  on public.images
  for insert
  to anon
  with check (true);

drop policy if exists "anon update images" on public.images;
create policy "anon update images"
  on public.images
  for update
  to anon
  using (true);

commit;
