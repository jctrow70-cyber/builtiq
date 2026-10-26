-- BIQ-0264 Phase 2B.2 hosted preflight. Read only. Do not run the postcheck until 073, 074, and 075 are applied.
-- Run in the Supabase SQL editor as a role that can read pg_proc. Do not call the functions.

-- Preflight: who can execute the internal schedule functions before 075.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       p.proacl as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'st_refresh_enrollment_expectations',
    'st_sync_enrollment_schedule',
    'st_withdraw_future_program_expectations',
    'st_apply_group_member_schedules'
  )
order by p.proname;

select has_function_privilege('anon', 'public.st_refresh_enrollment_expectations(uuid,date)', 'EXECUTE') as anon_refresh,
       has_function_privilege('authenticated', 'public.st_refresh_enrollment_expectations(uuid,date)', 'EXECUTE') as authenticated_refresh,
       has_function_privilege('anon', 'public.st_sync_enrollment_schedule(uuid,date)', 'EXECUTE') as anon_sync,
       has_function_privilege('authenticated', 'public.st_sync_enrollment_schedule(uuid,date)', 'EXECUTE') as authenticated_sync,
       has_function_privilege('anon', 'public.st_withdraw_future_program_expectations(uuid,date)', 'EXECUTE') as anon_withdraw,
       has_function_privilege('authenticated', 'public.st_withdraw_future_program_expectations(uuid,date)', 'EXECUTE') as authenticated_withdraw,
       has_function_privilege('service_role', 'public.st_withdraw_future_program_expectations(uuid,date)', 'EXECUTE') as service_withdraw;

-- Preflight: confirm no group timezone column yet.
select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'st_teams'
    and column_name = 'timezone'
) as timezone_column_exists;

-- Postcheck, after 073, 074, 072, and 075. Still read only.
-- Expect timezone_column_exists true, anon and authenticated false for all three internal functions,
-- service_role true only for withdraw, and st_apply_group_member_schedules present.
-- Then confirm a null timezone still allows the existing one-member RPC and rejects the batch:
--   select timezone from public.st_teams where id = '<group id>';
--   -- null is expected for existing groups
-- Do not call st_refresh_enrollment_expectations, st_sync_enrollment_schedule,
-- or st_withdraw_future_program_expectations from the SQL editor as a write test on real rows.
