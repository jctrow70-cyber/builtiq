import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgramActivity } from './types';

export type SourceWorkout = {
  id: string;
  week: number;
  day_label: string;
  day_order: number;
  workout_type: string;
  exercises: SourceExercise[];
};

type SourceExercise = {
  id: string;
  name: string;
  section: string | null;
  sort_order: number;
  catalog_exercise_id: string | null;
  exercise_type: string | null;
  superset_group_id: string | null;
  superset_label: string | null;
  superset_order: number | null;
  planned_sets: SourcePlannedSet[];
};

type SourcePlannedSet = {
  id: string;
  set_number: number;
  target_reps: number | null;
  target_weight: number | null;
  target_rpe: number | null;
  target_duration_seconds: number | null;
  rest_seconds: number | null;
  set_type: string | null;
};

const PLANNED_SET_FIELDS_FULL = 'id, set_number, target_reps, target_weight, target_rpe, target_duration_seconds, rest_seconds, set_type';
const PLANNED_SET_FIELDS_SAFE = 'id, set_number, target_reps, target_weight, target_rpe, rest_seconds, set_type';

const EXERCISE_FIELDS_FULL = 'id, name, section, sort_order, catalog_exercise_id, exercise_type, superset_group_id, superset_label, superset_order';
const EXERCISE_FIELDS_SAFE = 'id, name, section, sort_order, catalog_exercise_id';

function buildWorkoutSelect(exerciseFields: string, setFields: string): string {
  return `id, week, day_label, day_order, workout_type, st_exercises(${exerciseFields}, st_planned_sets(${setFields}))`;
}

export async function fetchSourceWorkouts(
  supabase: SupabaseClient,
  programId: string
): Promise<{ data: SourceWorkout[]; error: string | null }> {
  // Try with all columns first, fall back if columns are missing
  const selects = [
    buildWorkoutSelect(EXERCISE_FIELDS_FULL, PLANNED_SET_FIELDS_FULL),
    buildWorkoutSelect(EXERCISE_FIELDS_FULL, PLANNED_SET_FIELDS_SAFE),
    buildWorkoutSelect(EXERCISE_FIELDS_SAFE, PLANNED_SET_FIELDS_SAFE),
  ];

  let data: any[] | null = null;
  let lastError = '';

  for (const select of selects) {
    const result = await supabase
      .from('st_workouts')
      .select(select)
      .eq('program_id', programId)
      .order('week', { ascending: true })
      .order('day_order', { ascending: true });

    if (!result.error) {
      data = result.data;
      break;
    }
    lastError = result.error.message;
    if (!/does not exist|could not find/i.test(result.error.message)) {
      return { data: [], error: result.error.message };
    }
  }

  if (!data) return { data: [], error: lastError || 'Could not load workouts' };

  const workouts: SourceWorkout[] = ((data || []) as any[]).map((w) => ({
    id: w.id,
    week: w.week,
    day_label: w.day_label,
    day_order: w.day_order,
    workout_type: w.workout_type || '',
    exercises: ((w.st_exercises || []) as any[])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((e: any) => ({
        id: e.id,
        name: e.name,
        section: e.section || null,
        sort_order: e.sort_order || 0,
        catalog_exercise_id: e.catalog_exercise_id || null,
        exercise_type: e.exercise_type || null,
        superset_group_id: e.superset_group_id || null,
        superset_label: e.superset_label || null,
        superset_order: e.superset_order ?? null,
        planned_sets: ((e.st_planned_sets || []) as any[])
          .sort((a: any, b: any) => (a.set_number || 0) - (b.set_number || 0))
          .map((s: any) => ({
            id: s.id,
            set_number: s.set_number || 0,
            target_reps: s.target_reps ?? null,
            target_weight: s.target_weight ?? null,
            target_rpe: s.target_rpe ?? null,
            target_duration_seconds: s.target_duration_seconds ?? null,
            rest_seconds: s.rest_seconds ?? null,
            set_type: s.set_type || null,
          })),
      })),
  }));

  return { data: workouts, error: null };
}

const DAY_LABEL_TO_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};
const INDEX_TO_DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Copy exercises and planned sets from source workouts into the target program's
 * strength activity workout shells.
 *
 * Matching strategy: match source week-1 workouts to target strength activities
 * by day-of-week when possible, otherwise by order.
 */
export async function importWorkoutsIntoActivities(
  supabase: SupabaseClient,
  targetProgramId: string,
  strengthActivities: ProgramActivity[],
  sourceWorkouts: SourceWorkout[]
): Promise<{ imported: number; error: string | null }> {
  // Use week 1 if available, otherwise use the lowest week that has workouts
  const availableWeeks = Array.from(new Set(sourceWorkouts.map((w) => w.week))).sort((a, b) => a - b);
  const sourceWeek = availableWeeks[0] ?? 1;
  const week1Workouts = sourceWorkouts.filter((w) => w.week === sourceWeek);
  if (!week1Workouts.length) {
    return { imported: 0, error: 'Source program has no workouts to import.' };
  }

  const targetStrength = strengthActivities
    .filter((a) => a.activity_type === 'strength' && a.workout_id)
    .sort((a, b) => a.day_of_week - b.day_of_week);

  if (!targetStrength.length) {
    return { imported: 0, error: 'No strength activities with workouts found on your calendar.' };
  }

  // Try to match by day of week first, then fall back to order
  const matched: Array<{ activity: ProgramActivity; source: SourceWorkout }> = [];
  const usedSources = new Set<string>();

  for (const act of targetStrength) {
    const dayLabel = INDEX_TO_DAY_LABEL[act.day_of_week];
    const byDay = week1Workouts.find(
      (w) => w.day_label === dayLabel && !usedSources.has(w.id)
    );
    if (byDay) {
      matched.push({ activity: act, source: byDay });
      usedSources.add(byDay.id);
    }
  }

  // For unmatched activities, assign remaining source workouts by order
  const unmatched = targetStrength.filter((a) => !matched.some((m) => m.activity.id === a.id));
  const remainingSources = week1Workouts.filter((w) => !usedSources.has(w.id));
  for (let i = 0; i < Math.min(unmatched.length, remainingSources.length); i++) {
    matched.push({ activity: unmatched[i], source: remainingSources[i] });
  }

  if (!matched.length) {
    return { imported: 0, error: 'Could not match any source workouts to your strength days.' };
  }

  let imported = 0;

  for (const { activity, source } of matched) {
    const workoutId = activity.workout_id!;

    // Clear existing exercises from the target workout (it's an empty shell)
    await supabase.from('st_exercises').delete().eq('workout_id', workoutId);

    // Build new superset group ID mapping (fresh UUIDs for the target)
    const supersetMap = new Map<string, string>();

    for (const ex of source.exercises) {
      let newSupersetGroupId: string | null = null;
      if (ex.superset_group_id) {
        if (!supersetMap.has(ex.superset_group_id)) {
          supersetMap.set(ex.superset_group_id, crypto.randomUUID());
        }
        newSupersetGroupId = supersetMap.get(ex.superset_group_id)!;
      }

      const exercisePayload: Record<string, unknown> = {
        workout_id: workoutId,
        name: ex.name,
        section: ex.section,
        sort_order: ex.sort_order,
        catalog_exercise_id: ex.catalog_exercise_id,
      };

      if (ex.exercise_type) exercisePayload.exercise_type = ex.exercise_type;
      if (newSupersetGroupId) exercisePayload.superset_group_id = newSupersetGroupId;
      if (ex.superset_label) exercisePayload.superset_label = ex.superset_label;
      if (ex.superset_order != null) exercisePayload.superset_order = ex.superset_order;

      // Try inserting with all fields; retry without optional ones if columns are missing
      let newEx: { id: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error: exErr } = await supabase
          .from('st_exercises')
          .insert(exercisePayload)
          .select('id')
          .single();

        if (!exErr && data) {
          newEx = data as { id: string };
          break;
        }
        if (exErr && /does not exist/i.test(exErr.message)) {
          const col = exErr.message.match(/column\s+\S+\.(\w+)/i)?.[1];
          if (col && col in exercisePayload) {
            delete exercisePayload[col];
            continue;
          }
        }
        break;
      }

      if (!newEx) continue;

      if (ex.planned_sets.length) {
        const setInserts = ex.planned_sets.map((s) => {
          const row: Record<string, unknown> = {
            exercise_id: newEx!.id,
            set_number: s.set_number,
          };
          if (s.target_reps != null) row.target_reps = s.target_reps;
          if (s.target_weight != null) row.target_weight = s.target_weight;
          if (s.target_rpe != null) row.target_rpe = s.target_rpe;
          if (s.target_duration_seconds != null) row.target_duration_seconds = s.target_duration_seconds;
          if (s.rest_seconds != null) row.rest_seconds = s.rest_seconds;
          if (s.set_type) row.set_type = s.set_type;
          return row;
        });

        // Retry without missing columns
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: setErr } = await supabase.from('st_planned_sets').insert(setInserts);
          if (!setErr) break;
          if (/does not exist/i.test(setErr.message)) {
            const col = setErr.message.match(/column\s+\S+\.(\w+)/i)?.[1];
            if (col) {
              for (const row of setInserts) delete row[col];
              continue;
            }
          }
          break;
        }
      }
    }

    // Update the activity title to match the source workout type
    if (source.workout_type) {
      await supabase
        .from('st_program_activities')
        .update({ title: source.workout_type })
        .eq('id', activity.id);
    }

    imported++;
  }

  return { imported, error: null };
}
