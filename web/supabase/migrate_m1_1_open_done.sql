-- M1.1 — Simplify Kanban statuses to: open | done
--
-- Requirement: migrate any status in ('triage','doing') -> 'open'
-- NOTE: we also include 'todo' -> 'open' for safety so no tasks disappear.

begin;

update public.tasks
set status = 'open'
where status in ('triage', 'todo', 'doing');

commit;
