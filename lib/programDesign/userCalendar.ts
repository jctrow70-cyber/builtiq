import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysYmd, dayLabelFromYmd } from '../training/programCalendar';
import { activityTypeShortLabel, formatDuration } from './activityTypes';
import type { ActivityDraft, ActivityType } from './types';

export type UserCalendarActivity = {
  id: string;
  user_id: string;
  activity_date: string;
  activity_type: ActivityType;
  title: string;
  duration_minutes: number | null;
  notes: string;
  details: Record<string, unknown>;
  recurrence: 'none' | 'weekly';
  recurrence_until: string | null;
  workout_id: string | null;
};

function asActivity(row: Record<string, unknown>): UserCalendarActivity {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    activity_date: String(row.activity_date).slice(0, 10),
    activity_type: (row.activity_type as ActivityType) || 'strength',
    title: String(row.title || ''),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    notes: String(row.notes || ''),
    details: row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : {},
    recurrence: row.recurrence === 'weekly' ? 'weekly' : 'none',
    recurrence_until: row.recurrence_until ? String(row.recurrence_until).slice(0, 10) : null,
    workout_id: row.workout_id ? String(row.workout_id) : null,
  };
}

function isMissingRelation(error: { message?: string } | null | undefined): boolean {
  return /could not find the table|relation .* does not exist|schema cache/i.test(error?.message || '');
}

export async function fetchUserCalendarActivities(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<{ data: UserCalendarActivity[]; error: string | null }> {
  const { data, error } = await supabase
    .from('st_user_calendar_activities')
    .select('*')
    .eq('user_id', userId)
    .or(
      `and(activity_date.gte.${fromDate},activity_date.lte.${toDate}),and(recurrence.eq.weekly,activity_date.lte.${toDate})`
    )
    .order('activity_date', { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return { data: [], error: null };
    return { data: [], error: error.message };
  }
  return { data: (data || []).map((row) => asActivity(row as Record<string, unknown>)), error: null };
}

export function activityOccursOnDate(activity: UserCalendarActivity, dateYmd: string): boolean {
  if (activity.recurrence === 'weekly') {
    if (dateYmd < activity.activity_date) return false;
    if (activity.recurrence_until && dateYmd > activity.recurrence_until) return false;
    return dayLabelFromYmd(dateYmd) === dayLabelFromYmd(activity.activity_date);
  }
  return activity.activity_date === dateYmd;
}

export function calendarItemsForDate(activities: UserCalendarActivity[], dateYmd: string) {
  return activities
    .filter((a) => activityOccursOnDate(a, dateYmd))
    .map((a) => ({
      id: a.recurrence === 'weekly' ? `${a.id}:${dateYmd}` : a.id,
      title: a.title || activityTypeShortLabel(a.activity_type),
      typeLabel: activityTypeShortLabel(a.activity_type),
      activityType: a.activity_type,
      duration: formatDuration(a.duration_minutes),
      workoutId: a.workout_id,
      activityId: a.id,
      isRest: a.activity_type === 'rest',
      source: 'calendar' as const,
    }));
}

export async function createUserCalendarActivity(
  supabase: SupabaseClient,
  userId: string,
  dateYmd: string,
  draft: ActivityDraft
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('st_user_calendar_activities').insert({
    user_id: userId,
    activity_date: dateYmd,
    activity_type: draft.activity_type,
    title: draft.title.trim() || 'Activity',
    duration_minutes: draft.duration_minutes,
    notes: draft.notes.trim(),
    details: draft.details || {},
    recurrence: draft.recurrence === 'weekly' ? 'weekly' : 'none',
    recurrence_until: draft.recurrence === 'weekly' ? draft.recurrence_until || null : null,
  });
  if (error) {
    if (isMissingRelation(error)) {
      return { error: 'Apply the personal calendar migration to save activities on Training.' };
    }
    return { error: error.message || 'Could not add activity' };
  }
  return { error: null };
}

export async function deleteUserCalendarActivity(
  supabase: SupabaseClient,
  activityId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('st_user_calendar_activities').delete().eq('id', activityId);
  if (error) return { error: error.message || 'Could not remove activity' };
  return { error: null };
}

export function monthWindow(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y || 2026, m || 1, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from: addDaysYmd(from, -7), to: addDaysYmd(to, 7) };
}
