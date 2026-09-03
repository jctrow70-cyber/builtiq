-- BIQ-0138 Followed program for Training
-- Additive. Does not delete programs or workout history.

alter table public.st_profiles
  add column if not exists followed_program_id uuid references public.st_programs(id) on delete set null;

comment on column public.st_profiles.followed_program_id is
  'The program this user is following in Training. Group programs are copied to a personal instance before follow.';

create index if not exists st_profiles_followed_program_idx
  on public.st_profiles (followed_program_id)
  where followed_program_id is not null;
