-- BIQ-0108: Serving unit on meal entries (amount + unit of measure)

alter table public.st_meal_entries
  add column if not exists serving_unit text not null default 'serving';
