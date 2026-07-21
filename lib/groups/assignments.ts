import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dayLabelFromYmd,
  resolveProgramStartDate,
  weekForDate,
} from '../training/programCalendar';
import type { RecipientStatus } from './schema';

export type AssignedWorkoutRow = {
  id: string;
  assignment_id: string;
  user_id: string;
  status: RecipientStatus;
  personal_copy_program_id?: string | null;
  st_workout_assignments: {
    id: string;
    team_id: string;
    workout_id?: string | null;
    program_id?: string | null;
    workout_date?: string | null;
    scheduled_date: string;
    due_date?: string | null;
    title?: string | null;
    notes?: string | null;
    is_active: boolean;
    st_teams?: { id: string; name: string } | null;
    st_workouts?: {
      id: string;
      week: number;
      day_label: string;
      workout_type: string;
      day_order: number;
    } | null;
    st_programs?: { id: string; name: string } | null;
  };
};

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  pending: 'Not started',
  started: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

export function assignmentDisplayTitle(row: AssignedWorkoutRow): string {
  const wa = row.st_workout_assignments;
  if (wa?.title?.trim()) return wa.title.trim();
  const w = wa?.st_workouts;
  if (w) return `${w.day_label} · ${w.workout_type}`;
  return wa?.st_programs?.name || 'Assigned workout';
}

export function resolveAssignmentWorkout(program: any, assignment: AssignedWorkoutRow['st_workout_assignments']) {
  if (!program || !assignment) return null;
  const workouts = program.st_workouts || [];
  if (assignment.workout_id) {
    return workouts.find((w: any) => w.id === assignment.workout_id) || null;
  }
  if (assignment.program_id && assignment.workout_date) {
    const start = resolveProgramStartDate(program);
    const week = weekForDate(start, assignment.workout_date, program.weeks || 6);
    const dayLabel = dayLabelFromYmd(assignment.workout_date);
    return (
      workouts.find((w: any) => w.week === week && w.day_label === dayLabel) ||
      workouts.find((w: any) => w.week === 1 && w.day_label === dayLabel) ||
      null
    );
  }
  return null;
}

export function workoutLabel(w: any): string {
  if (!w) return 'Workout';
  return `${w.day_label} · ${w.workout_type} (Week ${w.week})`;
}

export function assignedHasPersonalCopy(row: AssignedWorkoutRow): boolean {
  return !!row.personal_copy_program_id;
}

export async function copyAssignmentToPersonal(
  supabase: SupabaseClient,
  recipientId: string,
): Promise<{ programId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('st_copy_assignment_to_personal', {
    p_recipient_id: recipientId,
  });
  if (error) return { programId: null, error: error.message };
  return { programId: typeof data === 'string' ? data : null, error: null };
}
