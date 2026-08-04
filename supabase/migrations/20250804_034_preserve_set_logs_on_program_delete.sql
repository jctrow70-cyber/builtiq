-- BIQ-0085: Harden set-log survival when programs/templates are replaced
-- Safe additive migration. Does not delete data.
--
-- When a group program is regenerated and the old template is deleted,
-- planned sets cascade-delete. Logs must keep surviving via ON DELETE SET NULL
-- (BIQ-0003). This migration re-asserts that constraint in case a project
-- still has the older ON DELETE CASCADE from the original schema.

alter table public.st_set_logs drop constraint if exists st_set_logs_planned_set_id_fkey;
alter table public.st_set_logs alter column planned_set_id drop not null;
alter table public.st_set_logs
  add constraint st_set_logs_planned_set_id_fkey
  foreign key (planned_set_id) references public.st_planned_sets(id) on delete set null;

-- Helpful index for rematch / Progress queries on orphaned history
create index if not exists st_set_logs_user_date_completed_idx
  on public.st_set_logs (user_id, log_date desc)
  where completed = true;

comment on column public.st_set_logs.planned_set_id is
  'Nullable link to template set. Cleared (SET NULL) when the template is deleted so completed history survives.';
