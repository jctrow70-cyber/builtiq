import type { SupabaseClient } from '@supabase/supabase-js';

export type MemberScheduleInput = {
  userId: string;
  mode: 'program_days' | 'custom_weekdays';
  weekdays: string[];
};

export type GroupProgramAssignInput = {
  teamId: string;
  memberUserIds: string[];
  programId: string;
  startsOn: string;
  notes?: string | null;
  requestKey: string;
  setAsGroupPlan?: boolean;
  assignmentType?: 'individual_team' | 'manual';
  schedules?: MemberScheduleInput[];
};

export type GroupWorkoutAssignInput = {
  teamId: string;
  workoutId: string;
  programId: string | null;
  targetType: 'group' | 'members' | 'classification' | 'individual';
  memberUserIds: string[];
  classificationId?: string | null;
  scheduledDate: string;
  dueDate?: string | null;
  notes?: string | null;
  requestKey: string;
};

function assignmentError(message: string | undefined, fallback: string): string {
  const raw = message || fallback;
  if (/could not find the function|schema cache/i.test(raw)) {
    return 'Assign Training needs a Supabase update. In the SQL Editor, run migration 20261012_062_group_assignment_wizard.sql, then 20261012_063_member_training_schedules.sql, and try again.';
  }
  if (/not authorized/i.test(raw)) return 'You do not have permission to assign training in this group.';
  if (/member not found/i.test(raw)) return 'One of the selected people is not an active member of this group. Nothing was assigned.';
  if (/publish a group program/i.test(raw)) return 'Publish the group program before assigning it. Nothing was assigned.';
  return raw;
}

/** One authorized transaction for every selected member. A failure assigns nobody. */
export async function assignGroupPrograms(
  supabase: SupabaseClient,
  input: GroupProgramAssignInput
): Promise<{ error: string | null; memberCount: number }> {
  const { data, error } = await supabase.rpc('st_assign_group_programs', {
    p_team_id: input.teamId,
    p_member_user_ids: input.memberUserIds,
    p_program_id: input.programId,
    p_starts_on: input.startsOn,
    p_notes: input.notes || null,
    p_request_key: input.requestKey,
    p_assignment_type: input.assignmentType || 'individual_team',
    p_set_as_group_default: !!input.setAsGroupPlan,
    p_schedules: (input.schedules || []).map((row) => ({
      user_id: row.userId,
      mode: row.mode,
      weekdays: row.weekdays,
    })),
  });
  if (error) return { error: assignmentError(error.message, 'Could not assign training.'), memberCount: 0 };
  const count = Number((data as { member_count?: number } | null)?.member_count);
  return { error: null, memberCount: Number.isFinite(count) ? count : input.memberUserIds.length };
}

/** Uses the existing workout assignment tables and expectation trigger. */
export async function assignGroupWorkout(
  supabase: SupabaseClient,
  input: GroupWorkoutAssignInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_assign_group_workout', {
    p_team_id: input.teamId,
    p_workout_id: input.workoutId,
    p_program_id: input.programId,
    p_target_type: input.targetType,
    p_target_classification_id: input.classificationId || null,
    p_target_user_ids: input.memberUserIds,
    p_scheduled_date: input.scheduledDate,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || null,
    p_request_key: input.requestKey,
  });
  if (error) return { error: assignmentError(error.message, 'Could not assign that workout.') };
  return { error: null };
}

/** Changes one member's future group training days. The shared program is not copied. */
export async function setMemberTrainingSchedule(
  supabase: SupabaseClient,
  input: {
    teamId: string;
    memberUserId: string;
    mode: 'program_days' | 'custom_weekdays';
    weekdays: string[];
    effectiveOn: string;
    localToday: string;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_set_member_training_schedule', {
    p_team_id: input.teamId,
    p_member_user_id: input.memberUserId,
    p_mode: input.mode,
    p_weekdays: input.weekdays,
    p_effective_on: input.effectiveOn,
    p_local_today: input.localToday,
  });
  if (error) return { error: assignmentError(error.message, 'Could not update that schedule.') };
  return { error: null };
}

function scheduleEditError(message: string | undefined, fallback: string): string {
  if (/could not find the function|schema cache/i.test(message || '')) {
    return 'Workout rescheduling needs a Supabase update. In the SQL Editor, run migration 20261012_064_workout_reschedule.sql after 063, and try again.';
  }
  const raw = assignmentError(message, fallback);
  if (/past workouts stay in history/i.test(raw)) return 'Past workouts stay in history.';
  if (/logged workout stays/i.test(raw)) return 'A logged workout stays on its date.';
  if (/not authorized/i.test(raw)) return 'You do not have permission to change this schedule.';
  return raw;
}

export async function moveMemberWorkout(
  supabase: SupabaseClient,
  input: { teamId: string; memberUserId: string; workoutId: string; originalDate: string; newDate: string; localToday: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_move_member_workout', {
    p_team_id: input.teamId,
    p_member_user_id: input.memberUserId,
    p_workout_id: input.workoutId,
    p_original_date: input.originalDate,
    p_new_date: input.newDate,
    p_local_today: input.localToday,
  });
  if (error) return { error: scheduleEditError(error.message, 'Could not move that workout.') };
  return { error: null };
}

export async function excuseMemberWorkout(
  supabase: SupabaseClient,
  input: { teamId: string; memberUserId: string; workoutId: string; originalDate: string; localToday: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_excuse_member_workout', {
    p_team_id: input.teamId,
    p_member_user_id: input.memberUserId,
    p_workout_id: input.workoutId,
    p_original_date: input.originalDate,
    p_local_today: input.localToday,
  });
  if (error) return { error: scheduleEditError(error.message, 'Could not excuse that workout.') };
  return { error: null };
}

export async function restoreMemberWorkout(
  supabase: SupabaseClient,
  input: { teamId: string; memberUserId: string; workoutId: string; originalDate: string; localToday: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_restore_member_workout', {
    p_team_id: input.teamId,
    p_member_user_id: input.memberUserId,
    p_workout_id: input.workoutId,
    p_original_date: input.originalDate,
    p_local_today: input.localToday,
  });
  if (error) return { error: scheduleEditError(error.message, 'Could not restore that workout.') };
  return { error: null };
}

export async function setMemberGroupExpectation(
  supabase: SupabaseClient,
  input: { teamId: string; memberUserId: string; enabled: boolean; effectiveOn: string; localToday: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_set_member_group_expectation', {
    p_team_id: input.teamId,
    p_member_user_id: input.memberUserId,
    p_enabled: input.enabled,
    p_effective_on: input.effectiveOn,
    p_local_today: input.localToday,
  });
  if (error) return { error: scheduleEditError(error.message, 'Could not update expected training.') };
  return { error: null };
}
