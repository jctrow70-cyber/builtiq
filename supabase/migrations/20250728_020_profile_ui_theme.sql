-- BIQ-0060: User UI theme preference (optional — app falls back to localStorage until applied)
alter table public.st_profiles
  add column if not exists ui_theme text;

comment on column public.st_profiles.ui_theme is
  'Visual theme id: calm, performance, energy, nature, minimal';
