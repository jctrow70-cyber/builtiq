-- BIQ-0170: All-inclusive programs can carry lifestyle activities (cardio/mobility/sport)
-- on the same plan as training, for group push. Training-only is the default.

alter table public.st_programs
  add column if not exists inclusive_plan boolean not null default false;

comment on column public.st_programs.inclusive_plan is
  'false = training workouts only. true = also schedule cardio/mobility/sport/rest on this plan and push them with the program.';
