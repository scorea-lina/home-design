-- M1.1 — Simplify Kanban columns to: To Do | Done
--
-- DB status normalization (no schema change):
-- Requirement: migrate any status in ('triage','doing') -> 'todo'

begin;

update public.tasks
set status = 'todo'
where status in ('triage', 'doing');

commit;
