-- Tagging v0 schema + seed data (Areas + Topics) per PRD
-- Apply in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Enums
create type if not exists public.tag_category_v0 as enum ('area', 'topic');
create type if not exists public.tag_confidence_v0 as enum ('manual', 'auto_high', 'auto_low');
create type if not exists public.tag_target_type_v0 as enum ('task', 'inbox_item', 'transcript', 'chunk', 'attachment', 'canvas_version');

-- Tables
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category public.tag_category_v0 not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, category)
);

create table if not exists public.tag_assignments (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.tags(id) on delete cascade,
  target_type public.tag_target_type_v0 not null,
  target_id uuid not null,
  confidence public.tag_confidence_v0 not null,
  created_at timestamptz not null default now(),
  unique (tag_id, target_type, target_id)
);

create index if not exists tag_assignments_target_idx on public.tag_assignments(target_type, target_id);
create index if not exists tag_assignments_tag_idx on public.tag_assignments(tag_id);

-- RLS: prototype = allow anon read
alter table public.tags enable row level security;
alter table public.tag_assignments enable row level security;

drop policy if exists "anon read tags" on public.tags;
create policy "anon read tags" on public.tags for select to anon using (true);

drop policy if exists "anon read tag_assignments" on public.tag_assignments;
create policy "anon read tag_assignments" on public.tag_assignments for select to anon using (true);

-- Seed tags (idempotent via unique(name,category) + on conflict do nothing)
insert into public.tags (name, category)
values
  -- Areas
  ('Exterior','area'),
  ('Entryway','area'),
  ('Living','area'),
  ('Dining','area'),
  ('Kitchen','area'),
  ('Pantry','area'),
  ('Mudroom','area'),
  ('Utility Room','area'),
  ('Laundry Machines','area'),
  ('Powder Bath','area'),
  ('1st floor Office','area'),
  ('2nd floor Bedrooms','area'),
  ('2nd floor Bathrooms','area'),
  ('Primary Bedroom','area'),
  ('Primary Closet','area'),
  ('Primary Bathroom','area'),
  ('Hallways/Stairs','area'),
  ('Arches','area'),
  ('Garage','area'),
  ('Under the stair storage','area'),
  ('Light fixtures','area'),
  ('Windows','area'),
  ('Doors','area'),
  ('Vent hood','area'),
  ('Kitchen counter','area'),
  ('Bathroom counter','area'),
  ('Counter','area'),
  ('Cabinets','area'),
  ('Built-In','area'),
  ('Drawers','area'),
  ('Wine Fridge','area'),
  ('Wallpaper','area'),
  ('Pool','area'),
  ('Casita','area'),
  ('Pool Bath','area'),

  -- Topics
  ('Budget','topic'),
  ('Finance','topic'),
  ('Allowances','topic'),
  ('Timeline','topic'),
  ('Decisions','topic'),
  ('Open Questions','topic'),
  ('Procurement','topic')
on conflict (name, category) do nothing;
