-- BIQ-0264 Phase 2B.2 revoke direct execute on internal schedule functions.
-- Apply manually after 059, 062, and 063. Not applied to hosted Supabase by this change.
-- Security-definer callers keep working because the function owner retains execute.
-- service_role receives execute on withdraw only, for scripts/verify-group-activity-stage1-live.ts.
-- Refresh and sync are not granted to service_role.

begin;

revoke all on function public.st_refresh_enrollment_expectations(uuid, date) from public, anon, authenticated;
revoke all on function public.st_sync_enrollment_schedule(uuid, date) from public, anon, authenticated;
revoke all on function public.st_withdraw_future_program_expectations(uuid, date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.st_withdraw_future_program_expectations(uuid, date) to service_role;
  end if;
end $$;

commit;
