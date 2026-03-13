-- Add summary, notes, and archived_at columns to links table.

alter table public.links add column if not exists summary text;
alter table public.links add column if not exists notes text;
alter table public.links add column if not exists archived_at timestamptz;

-- Allow anon to update links (for notes, archive).
drop policy if exists "anon update links" on public.links;
create policy "anon update links"
  on public.links
  for update
  to anon
  using (true);

-- Add 'link' to tag target type enum.
alter type public.tag_target_type_v0 add value if not exists 'link';
