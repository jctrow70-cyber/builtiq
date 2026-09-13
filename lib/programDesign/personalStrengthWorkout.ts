import type { SupabaseClient } from '@supabase/supabase-js';
import { dayLabelFromYmd, mondayOfWeek, todayYmd } from '../training/programCalendar';
import { insertProgramRecord } from '../training/programStatus';

export const ON_THE_FLY_GENERATION_METHOD = 'on_the_fly';
export const ON_THE_FLY_PROGRAM_NAME = 'Personal workouts';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function isOnTheFlyProgram(program: {
  generation_method?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  return !!program && program.generation_method === ON_THE_FLY_GENERATION_METHOD;
}

export function isPersonalWorkoutContainer(program: {
  generation_method?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  if (!program) return false;
  if (isOnTheFlyProgram(program)) return true;
  return String(program.name || '').trim() === ON_THE_FLY_PROGRAM_NAME;
}

export function excludeOnTheFlyPrograms<T extends { generation_method?: string | null; name?: string | null }>(
  programs: T[]
): T[] {
  return programs.filter((program) => !isOnTheFlyProgram(program));
}

export async function ensurePersonalWorkoutProgram(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('st_programs')
    .select('id, name, generation_method, owner_user_id, visibility')
    .eq('owner_user_id', userId)
    .eq('visibility', 'personal')
    .order('created_at', { ascending: true });
  if (error) return { id: null, error: error.message || 'Could not load personal programs' };

  const found = (data || []).find((row) => isPersonalWorkoutContainer(row as { name?: string; generation_method?: string }));
  if (found?.id) return { id: String(found.id), error: null };

  const { data: created, error: createError } = await insertProgramRecord(supabase, {
    owner_user_id: userId,
    team_id: null,
    visibility: 'personal',
    name: ON_THE_FLY_PROGRAM_NAME,
    weeks: 1,
    cycle_length_weeks: 1,
    start_date: mondayOfWeek(todayYmd()),
    status: 'draft',
    record_kind: 'instance',
    generation_method: ON_THE_FLY_GENERATION_METHOD,
    inclusive_plan: false,
  });
  if (createError || !created?.id) {
    return { id: null, error: createError || 'Could not create a personal workout container' };
  }
  return { id: String(created.id), error: null };
}

export async function createPersonalStrengthWorkout(
  supabase: SupabaseClient,
  userId: string,
  dateYmd: string,
  title: string
): Promise<{ workout: Record<string, unknown> | null; programId: string | null; error: string | null }> {
  const container = await ensurePersonalWorkoutProgram(supabase, userId);
  if (container.error || !container.id) {
    return { workout: null, programId: null, error: container.error || 'Could not create a personal workout container' };
  }

  const { data: existing, error: existingError } = await supabase
    .from('st_workouts')
    .select('id, week')
    .eq('program_id', container.id);
  if (existingError) {
    return { workout: null, programId: container.id, error: existingError.message || 'Could not load personal workouts' };
  }

  const nextWeek = (existing || []).reduce((max, row) => Math.max(max, Number((row as { week?: number }).week) || 0), 0) + 1;
  const dayLabel = dayLabelFromYmd(dateYmd);
  const dayOrder = DAY_ORDER.indexOf(dayLabel);

  const { data: created, error: createError } = await supabase
    .from('st_workouts')
    .insert({
      program_id: container.id,
      week: nextWeek,
      day_order: dayOrder < 0 ? 0 : dayOrder,
      day_label: dayLabel,
      workout_type: title.trim() || 'Strength',
    })
    .select('id, program_id, week, day_label, day_order, workout_type')
    .single();

  if (createError || !created?.id) {
    return { workout: null, programId: container.id, error: createError?.message || 'Could not create the strength workout' };
  }

  return {
    workout: { ...(created as Record<string, unknown>), st_exercises: [] },
    programId: container.id,
    error: null,
  };
}

export async function fetchWorkoutsByIds(
  supabase: SupabaseClient,
  workoutIds: string[]
): Promise<{ data: any[]; error: string | null }> {
  const ids = Array.from(new Set(workoutIds.filter(Boolean)));
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await supabase
    .from('st_workouts')
    .select('id, program_id, week, day_label, day_order, workout_type, st_exercises(*, st_planned_sets(*))')
    .in('id', ids);
  if (error) return { data: [], error: error.message || 'Could not load workouts' };
  return { data: data || [], error: null };
}
