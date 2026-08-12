-- BIQ-0110: Serving size number on meal entries (separate from amount eaten)

alter table public.st_meal_entries
  add column if not exists serving_size numeric not null default 1;
