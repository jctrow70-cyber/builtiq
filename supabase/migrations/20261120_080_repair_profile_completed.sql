-- BIQ-0326: Re-heal profile_completed for accounts that already have a display name.
-- Safe additive repair. Matches the original BIQ-0006 backfill intent.
-- Does not drop tables or delete data.

update public.st_profiles
set profile_completed = true
where coalesce(length(trim(display_name)), 0) > 0
  and profile_completed = false;
