-- Allow manually-added links (no email source).
alter table public.links alter column source_message_id drop not null;

-- Drop the old unique index that requires source_message_id, replace with one that handles nulls.
drop index if exists links_source_message_url_uniq;
create unique index links_source_message_url_uniq
  on public.links (coalesce(source_message_id, ''), url);
