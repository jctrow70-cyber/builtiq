-- BIQ-0014: AI program generation metadata on st_programs

alter table public.st_programs
  add column if not exists generation_prompt text,
  add column if not exists generation_method text,
  add column if not exists program_summary text,
  add column if not exists program_style text;

comment on column public.st_programs.generation_prompt is 'Natural-language prompt used when generating this program (BIQ-0014)';
comment on column public.st_programs.generation_method is 'How program was created: ai, template, manual';
comment on column public.st_programs.program_summary is 'Human-readable summary of program design';
comment on column public.st_programs.program_style is 'general|hypertrophy|strength|athletic_performance';

alter table public.st_programs
  drop constraint if exists st_programs_generation_method_check;

alter table public.st_programs
  add constraint st_programs_generation_method_check check (
    generation_method is null
    or generation_method in ('ai', 'template', 'manual')
  );

alter table public.st_programs
  drop constraint if exists st_programs_program_style_check;

alter table public.st_programs
  add constraint st_programs_program_style_check check (
    program_style is null
    or program_style in ('general', 'hypertrophy', 'strength', 'athletic_performance')
  );
