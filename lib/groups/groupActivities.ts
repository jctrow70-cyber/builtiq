import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityType } from '../programDesign/types';
import type { GroupExtraActivity } from './trainingWorkspace';

export type { GroupExtraActivity };

export type GroupActivitySaveInput = {
  teamId: string;
  activityType: ActivityType;
  title: string;
  scheduledDate: string;
  memberUserIds: string[];
  requestKey: string;
  workoutId?: string | null;
  programId?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  details?: Record<string, unknown>;
  required?: boolean;
};

function activityError(message: string | undefined): string {
  const raw = message || 'Could not add that activity.';
  if (/could not find the function|schema cache|does not exist/i.test(raw)) {
    return 'Group extras need a Supabase update. In the SQL Editor, run migration 20261018_068_group_activity_series.sql, then try again. Nothing was saved.';
  }
  if (/not authorized/i.test(raw)) return 'You do not have permission to add that activity. Nothing was saved.';
  if (/already on this date/i.test(raw)) return 'That workout is already on this date. Nothing new was saved.';
  if (/custom group workout is not available/i.test(raw)) return 'Choose a program workout, or pick cardio, mobility, stretching, recovery, sport, or rest.';
  if (/mark an extra required/i.test(raw)) return 'Only a manager can mark an extra as required. Nothing was saved.';
  if (/publish a group program/i.test(raw)) return 'Choose a workout from the group program. Nothing was saved.';
  return raw;
}

export async function saveGroupActivity(
  supabase: SupabaseClient,
  input: GroupActivitySaveInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_save_group_activity', {
    p_team_id: input.teamId,
    p_activity_type: input.activityType,
    p_title: input.title,
    p_occurrence_date: input.scheduledDate,
    p_recipient_user_ids: input.memberUserIds,
    p_request_key: input.requestKey,
    p_duration_minutes: input.durationMinutes ?? null,
    p_notes: input.notes || null,
    p_details: input.details || {},
    p_workout_id: input.workoutId || null,
    p_program_id: input.programId || null,
    p_required: !!input.required,
  });
  if (error) return { error: activityError(error.message) };
  return { error: null };
}

export async function fetchGroupExtras(
  supabase: SupabaseClient,
  input: { teamId: string; from: string; to: string; userId?: string | null }
): Promise<GroupExtraActivity[]> {
  let query = supabase
    .from('st_group_activity_occurrences')
    .select('id, user_id, occurrence_date, completed, st_group_activity_series!inner(team_id, activity_type, title, required, workout_id)')
    .eq('st_group_activity_series.team_id', input.teamId)
    .gte('occurrence_date', input.from)
    .lte('occurrence_date', input.to);
  if (input.userId) query = query.eq('user_id', input.userId);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    user_id: string;
    occurrence_date: string;
    completed?: boolean | null;
    st_group_activity_series?: {
      activity_type?: string | null;
      title?: string | null;
      required?: boolean | null;
      workout_id?: string | null;
    } | null;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    date: String(row.occurrence_date).slice(0, 10),
    title: row.st_group_activity_series?.title || 'Activity',
    activityType: row.st_group_activity_series?.activity_type || 'sport',
    workoutId: row.st_group_activity_series?.workout_id || null,
    required: !!row.st_group_activity_series?.required,
    completed: !!row.completed,
  }));
}
