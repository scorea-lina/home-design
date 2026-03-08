-- M1.2 — DB columns for card detail
-- Adds: summary text, source_email_date timestamptz
-- Ensures: source_message_id is text (if not already)

begin;

alter table public.tasks
  add column if not exists summary text;

alter table public.tasks
  add column if not exists source_email_date timestamptz;

-- source_message_id already exists in current deployments, but enforce type as text.
-- This is best-effort; if the column is already text, this is a no-op.
-- If the column is a different type, manual intervention may be required.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'source_message_id'
      and data_type <> 'text'
  ) then
    alter table public.tasks alter column source_message_id type text using source_message_id::text;
  end if;
end $$;

commit;
