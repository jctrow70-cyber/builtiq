-- Triggers required by the production schedule functions. Not a migration.

create or replace function public.st_training_enrollments_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists st_training_enrollments_touch on public.st_training_enrollments;
create trigger st_training_enrollments_touch
  before insert or update on public.st_training_enrollments
  for each row execute function public.st_training_enrollments_touch();

drop trigger if exists st_training_expectations_guard on public.st_training_expectations;
create trigger st_training_expectations_guard
  before update or delete on public.st_training_expectations
  for each row execute function public.st_guard_training_expectation();

drop trigger if exists st_training_enrollments_schedule on public.st_training_enrollments;
create trigger st_training_enrollments_schedule
  after insert or update of program_id, expectation_enabled, status
  on public.st_training_enrollments
  for each row execute function public.st_training_enrollment_schedule_trigger();

drop trigger if exists st_training_expectations_reject_group_extra on public.st_training_expectations;
create trigger st_training_expectations_reject_group_extra
  before insert or update of user_id, workout_id, scheduled_date, excused
  on public.st_training_expectations
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_training_expectations_apply_override on public.st_training_expectations;
create constraint trigger st_training_expectations_apply_override
  after insert on public.st_training_expectations
  deferrable initially deferred
  for each row
  execute function public.st_training_expectation_apply_override();
