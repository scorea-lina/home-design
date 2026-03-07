-- MVP schema for auto-extraction -> Kanban
-- Apply in Supabase SQL editor (or via supabase CLI migrations later).

-- Enable UUID generator if not already enabled
create extension if not exists pgcrypto;

-- Status lanes: triage | todo | doing | done
create type if not exists public.task_status_v0 as enum ('triage', 'todo', 'doing', 'done');

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status public.task_status_v0 not null default 'triage',
  source_message_id text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_created_at_idx on public.tasks(created_at desc);
create index if not exists tasks_source_message_id_idx on public.tasks(source_message_id);

-- Idempotency marker table
create table if not exists public.agentmail_message_processing (
  message_id text primary key,
  processed_at timestamptz not null default now(),
  extractor_version text not null,
  task_id uuid null references public.tasks(id)
);

create index if not exists agentmail_message_processing_processed_at_idx
  on public.agentmail_message_processing(processed_at desc);

-- RLS: for prototype, allow read to anon; keep writes server-side.
alter table public.tasks enable row level security;
alter table public.agentmail_message_processing enable row level security;

drop policy if exists "anon read tasks" on public.tasks;
create policy "anon read tasks" on public.tasks
  for select to anon
  using (true);

drop policy if exists "anon read processing" on public.agentmail_message_processing;
create policy "anon read processing" on public.agentmail_message_processing
  for select to anon
  using (true);

-- NOTE: inserts/updates should be via service role (server), so no anon write policies.
