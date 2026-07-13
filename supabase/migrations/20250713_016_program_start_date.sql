-- BIQ-0022: Align program week numbers with calendar dates
alter table public.st_programs
  add column if not exists start_date date;

comment on column public.st_programs.start_date is
  'Calendar date when Week 1 begins. Used to map log dates to program weeks.';

-- Backfill existing programs from created_at (UTC date)
update public.st_programs
set start_date = (created_at at time zone 'utc')::date
where start_date is null;
