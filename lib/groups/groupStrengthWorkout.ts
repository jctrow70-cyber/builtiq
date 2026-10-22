import type { SupabaseClient } from '@supabase/supabase-js';
import type { GroupStrengthExercisePayload } from '../training/draftWorkout';

export type GroupStrengthRecipientMode = 'self' | 'members' | 'group';

export type GroupProgramWorkoutOption = {
  programId: string;
  programName: string;
  workoutId: string;
  title: string;
  detail: string;
  week: number;
  dayOrder: number;
};

type ProgramWorkoutRow = {
  id?: string | null;
  week?: number | null;
  day_order?: number | null;
  day_label?: string | null;
  workout_type?: string | null;
};

type ProgramRow = {
  id?: string | null;
  name?: string | null;
  visibility?: string | null;
  program_use?: string | null;
  st_workouts?: ProgramWorkoutRow[] | null;
  workouts?: ProgramWorkoutRow[] | null;
};

export function eligibleGroupProgramWorkouts(programs: ProgramRow[]): GroupProgramWorkoutOption[] {
  const options: GroupProgramWorkoutOption[] = [];
  const seen = new Set<string>();
  for (const program of programs || []) {
    if (!program?.id) continue;
    if (program.visibility !== 'team') continue;
    if (program.program_use === 'group_strength_shelf') continue;
    const workouts = [...(program.st_workouts || program.workouts || [])].sort(
      (left, right) => Number(left.week || 0) - Number(right.week || 0) || Number(left.day_order || 0) - Number(right.day_order || 0)
    );
    for (const workout of workouts) {
      if (!workout?.id || seen.has(workout.id)) continue;
      seen.add(workout.id);
      const title = workout.day_label?.trim() || 'Workout';
      const detail = [workout.week ? `Week ${workout.week}` : '', workout.day_label || ''].filter(Boolean).join(' · ');
      options.push({
        programId: program.id,
        programName: program.name?.trim() || 'Group program',
        workoutId: workout.id,
        title,
        detail: detail || title,
        week: Number(workout.week || 0),
        dayOrder: Number(workout.day_order || 0),
      });
    }
  }
  return options.sort(
    (left, right) => left.programName.localeCompare(right.programName) || left.week - right.week || left.dayOrder - right.dayOrder
  );
}

export function resolveGroupStrengthRecipients(input: {
  mode: GroupStrengthRecipientMode;
  viewerUserId: string;
  selectedUserIds: string[];
  groupUserIds: string[];
  canAssign: boolean;
  required?: boolean;
}): { userIds: string[] } | { error: string } {
  const viewer = input.viewerUserId;
  if (!viewer) return { error: 'You do not have permission to add that activity. Nothing was saved.' };
  if (input.required && !input.canAssign) {
    return { error: 'Only a manager can mark an extra as required. Nothing was saved.' };
  }
  const activeGroup = Array.from(new Set(input.groupUserIds.filter(Boolean)));
  if (input.mode === 'self') return { userIds: [viewer] };
  if (!input.canAssign) {
    return { error: 'You can add an optional workout for yourself. Nothing was saved.' };
  }
  if (input.mode === 'group') {
    if (!activeGroup.length) return { error: 'This group has no members to assign.' };
    return { userIds: activeGroup };
  }
  const selected = Array.from(new Set(input.selectedUserIds.filter(Boolean)));
  if (!selected.length) return { error: 'Select at least one member.' };
  if (selected.some((userId) => !activeGroup.includes(userId))) return { error: 'Member not found' };
  return { userIds: selected };
}

export type GroupStrengthSaveInput = {
  teamId: string;
  title: string;
  scheduledDate: string;
  memberUserIds: string[];
  requestKey: string;
  notes?: string | null;
  required?: boolean;
  recurrence?: 'none' | 'weekly';
  recurrenceWeekdays?: number[];
  recurrenceUntil?: string | null;
  exercises: GroupStrengthExercisePayload[];
};

export function groupStrengthSaveArgs(input: GroupStrengthSaveInput) {
  return {
    p_team_id: input.teamId,
    p_title: input.title.trim() || 'Workout',
    p_occurrence_date: input.scheduledDate,
    p_recipient_user_ids: input.memberUserIds,
    p_request_key: input.requestKey,
    p_notes: input.notes?.trim() || null,
    p_required: !!input.required,
    p_recurrence: input.recurrence || 'none',
    p_recurrence_weekdays: input.recurrence === 'weekly' ? input.recurrenceWeekdays || [] : [],
    p_recurrence_until: input.recurrence === 'weekly' ? input.recurrenceUntil || null : null,
    p_exercises: input.exercises,
  };
}

function strengthError(message: string | undefined): string {
  const raw = message || 'Could not add that workout.';
  if (/could not find the function|schema cache|does not exist/i.test(raw)) {
    return 'Group strength workouts need the current Supabase update. Nothing was saved.';
  }
  if (/mark an extra required/i.test(raw)) return 'Only a manager can mark an extra as required. Nothing was saved.';
  if (/not authorized/i.test(raw)) return 'You do not have permission to add that activity. Nothing was saved.';
  if (/already on this date/i.test(raw)) return 'That workout is already on this date. Nothing new was saved.';
  if (/add at least one exercise/i.test(raw)) return 'Add at least one exercise.';
  if (/name each exercise/i.test(raw)) return 'Name each exercise.';
  if (/member not found/i.test(raw)) return 'Choose a member of this group. Nothing was saved.';
  return raw;
}

export async function saveGroupStrengthWorkout(
  supabase: SupabaseClient,
  input: GroupStrengthSaveInput
): Promise<{ error: string | null }> {
  if (!input.exercises.length) return { error: 'Add at least one exercise.' };
  const { error } = await supabase.rpc('st_save_group_strength_workout', groupStrengthSaveArgs(input));
  if (error) return { error: strengthError(error.message) };
  return { error: null };
}
