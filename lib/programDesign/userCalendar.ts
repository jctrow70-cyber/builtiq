import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysYmd } from '../training/programCalendar';
import { activityTypeShortLabel, formatDuration } from './activityTypes';
import { isWeeklyRecurrence, weekdayIndexFromYmd, weekdaysFromDetails, withRecurrenceDetails } from './recurrence';
import type { ActivityDraft, ActivityType } from './types';

const META_DETAIL_KEYS = new Set(['recurrence_weekdays', 'exception_dates', 'occurrence_overrides']);

export type OccurrenceOverride = {
  title?: string;
  activity_type?: ActivityType;
  duration_minutes?: number | null;
  notes?: string;
  details?: Record<string, unknown>;
};

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
  recurrence_weekdays: number[];
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
    recurrence_weekdays: weekdaysFromDetails(
      row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : {},
      weekdayIndexFromYmd(String(row.activity_date).slice(0, 10))
    ),
    workout_id: row.workout_id ? String(row.workout_id) : null,
  };
}

function isMissingRelation(error: { message?: string } | null | undefined): boolean {
  return /could not find the table|relation .* does not exist|schema cache/i.test(error?.message || '');
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeYmdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const dates = raw
    .map((item) => String(item || '').slice(0, 10))
    .filter((item) => isYmd(item));
  return Array.from(new Set(dates)).sort();
}

function occurrenceDetailsPayload(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (!META_DETAIL_KEYS.has(key)) out[key] = value;
  }
  return out;
}

export function exceptionDatesFromDetails(details: Record<string, unknown> | null | undefined): string[] {
  return normalizeYmdList(details?.exception_dates);
}

export function occurrenceOverridesFromDetails(
  details: Record<string, unknown> | null | undefined
): Record<string, OccurrenceOverride> {
  const raw = details?.occurrence_overrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, OccurrenceOverride> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const date = String(key).slice(0, 10);
    if (!isYmd(date) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const ov = value as Record<string, unknown>;
    out[date] = {
      title: ov.title == null ? undefined : String(ov.title),
      activity_type: ov.activity_type ? (ov.activity_type as ActivityType) : undefined,
      duration_minutes: ov.duration_minutes === undefined ? undefined : ov.duration_minutes == null ? null : Number(ov.duration_minutes),
      notes: ov.notes == null ? undefined : String(ov.notes),
      details:
        ov.details && typeof ov.details === 'object' && !Array.isArray(ov.details)
          ? occurrenceDetailsPayload(ov.details as Record<string, unknown>)
          : undefined,
    };
  }
  return out;
}

export function withExceptionDate(
  details: Record<string, unknown> | null | undefined,
  dateYmd: string
): Record<string, unknown> {
  const next = { ...(details || {}) };
  const dates = exceptionDatesFromDetails(next);
  if (isYmd(dateYmd) && !dates.includes(dateYmd)) dates.push(dateYmd);
  dates.sort();
  if (dates.length) next.exception_dates = dates;
  else delete next.exception_dates;
  return next;
}

export function withOccurrenceOverride(
  details: Record<string, unknown> | null | undefined,
  dateYmd: string,
  override: OccurrenceOverride
): Record<string, unknown> {
  const next = { ...(details || {}) };
  const overrides = occurrenceOverridesFromDetails(next);
  if (isYmd(dateYmd)) overrides[dateYmd] = override;
  next.occurrence_overrides = overrides;
  return next;
}

export function withoutOccurrenceOverride(
  details: Record<string, unknown> | null | undefined,
  dateYmd: string
): Record<string, unknown> {
  const next = { ...(details || {}) };
  const overrides = occurrenceOverridesFromDetails(next);
  delete overrides[dateYmd];
  if (Object.keys(overrides).length) next.occurrence_overrides = overrides;
  else delete next.occurrence_overrides;
  return next;
}

export function applyOccurrenceOverride(activity: UserCalendarActivity, dateYmd: string): UserCalendarActivity {
  const override = occurrenceOverridesFromDetails(activity.details)[dateYmd];
  if (!override) return activity;
  return {
    ...activity,
    title: override.title ?? activity.title,
    activity_type: override.activity_type ?? activity.activity_type,
    duration_minutes: override.duration_minutes !== undefined ? override.duration_minutes : activity.duration_minutes,
    notes: override.notes ?? activity.notes,
    details: {
      ...activity.details,
      ...(override.details || {}),
      recurrence_weekdays: activity.details.recurrence_weekdays,
      exception_dates: activity.details.exception_dates,
      occurrence_overrides: activity.details.occurrence_overrides,
    },
  };
}

export function detailsForThisDaySave(
  details: Record<string, unknown> | null | undefined,
  dateYmd: string,
  draft: Pick<ActivityDraft, 'title' | 'activity_type' | 'duration_minutes' | 'notes' | 'details'>
): Record<string, unknown> {
  return withOccurrenceOverride(details, dateYmd, {
    title: draft.title.trim() || 'Activity',
    activity_type: draft.activity_type,
    duration_minutes: draft.duration_minutes,
    notes: draft.notes.trim(),
    details: occurrenceDetailsPayload(draft.details),
  });
}

export function detailsForThisDayDelete(
  details: Record<string, unknown> | null | undefined,
  dateYmd: string
): Record<string, unknown> {
  return withExceptionDate(withoutOccurrenceOverride(details, dateYmd), dateYmd);
}

export function draftFromCalendarActivity(activity: UserCalendarActivity, occurrenceDate: string): ActivityDraft {
  const shown = applyOccurrenceOverride(activity, occurrenceDate);
  return {
    activity_type: shown.activity_type,
    title: shown.title,
    duration_minutes: shown.duration_minutes,
    notes: shown.notes,
    details: occurrenceDetailsPayload(shown.details),
    recurrence: activity.recurrence,
    recurrence_until: activity.recurrence_until,
    recurrence_weekdays: activity.recurrence_weekdays,
    occurrenceScope: isWeeklyRecurrence(activity.recurrence) ? 'this-day' : 'series',
  };
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
  if (exceptionDatesFromDetails(activity.details).includes(dateYmd)) return false;
  if (isWeeklyRecurrence(activity.recurrence)) {
    if (dateYmd < activity.activity_date) return false;
    if (activity.recurrence_until && dateYmd > activity.recurrence_until) return false;
    const weekdays = activity.recurrence_weekdays?.length
      ? activity.recurrence_weekdays
      : [weekdayIndexFromYmd(activity.activity_date)];
    return weekdays.includes(weekdayIndexFromYmd(dateYmd));
  }
  return activity.activity_date === dateYmd;
}

export function calendarItemsForDate(activities: UserCalendarActivity[], dateYmd: string) {
  return activities
    .filter((a) => activityOccursOnDate(a, dateYmd))
    .map((a) => {
      const shown = applyOccurrenceOverride(a, dateYmd);
      return {
        id: a.recurrence === 'weekly' ? `${a.id}:${dateYmd}` : a.id,
        title: shown.title || activityTypeShortLabel(shown.activity_type),
        typeLabel: activityTypeShortLabel(shown.activity_type),
        activityType: shown.activity_type,
        duration: formatDuration(shown.duration_minutes),
        workoutId: shown.workout_id,
        activityId: a.id,
        isRest: shown.activity_type === 'rest',
        source: 'calendar' as const,
        isRecurring: isWeeklyRecurrence(a.recurrence),
        occurrenceDate: dateYmd,
      };
    });
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
    details: withRecurrenceDetails(
      draft.details || {},
      draft.recurrence === 'weekly'
        ? (draft.recurrence_weekdays?.length ? draft.recurrence_weekdays : [weekdayIndexFromYmd(dateYmd)])
        : []
    ),
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

async function updateCalendarRow(
  supabase: SupabaseClient,
  activityId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('st_user_calendar_activities').update(patch).eq('id', activityId);
  if (error) {
    if (isMissingRelation(error)) {
      return { error: 'Apply the personal calendar migration to save activities on Training.' };
    }
    return { error: error.message || 'Could not save activity' };
  }
  return { error: null };
}

export async function saveUserCalendarOccurrence(
  supabase: SupabaseClient,
  activity: UserCalendarActivity,
  dateYmd: string,
  draft: ActivityDraft
): Promise<{ error: string | null }> {
  const weekly = isWeeklyRecurrence(activity.recurrence);
  const scope = draft.occurrenceScope || (weekly ? 'this-day' : 'series');
  if (weekly && scope === 'this-day') {
    return updateCalendarRow(supabase, activity.id, {
      details: detailsForThisDaySave(activity.details, dateYmd, draft),
    });
  }
  const kept = {
    exception_dates: activity.details.exception_dates,
    occurrence_overrides: activity.details.occurrence_overrides,
  };
  const details = withRecurrenceDetails(
    { ...occurrenceDetailsPayload(draft.details), ...kept },
    weekly
      ? draft.recurrence_weekdays?.length
        ? draft.recurrence_weekdays
        : activity.recurrence_weekdays
      : []
  );
  return updateCalendarRow(supabase, activity.id, {
    activity_type: draft.activity_type,
    title: draft.title.trim() || 'Activity',
    duration_minutes: draft.duration_minutes,
    notes: draft.notes.trim(),
    details,
    recurrence: weekly ? 'weekly' : 'none',
    recurrence_until: weekly ? draft.recurrence_until || null : null,
  });
}

export async function deleteUserCalendarOccurrence(
  supabase: SupabaseClient,
  activity: UserCalendarActivity,
  dateYmd: string,
  scope: 'this-day' | 'series' = 'this-day'
): Promise<{ error: string | null }> {
  const weekly = isWeeklyRecurrence(activity.recurrence);
  if (!weekly || scope === 'series') {
    return deleteUserCalendarActivity(supabase, activity.id);
  }
  return updateCalendarRow(supabase, activity.id, {
    details: detailsForThisDayDelete(activity.details, dateYmd),
  });
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
