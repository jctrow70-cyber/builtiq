import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityType } from '../programDesign/types';
import { addDaysYmd } from '../training/programCalendar';
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
  recurrence?: 'none' | 'weekly';
  recurrenceWeekdays?: number[];
  recurrenceUntil?: string | null;
};

export type GroupExtraAction =
  | { kind: 'complete' | 'skip' | 'restore'; seriesId: string; userId: string; originalDate: string }
  | {
      kind: 'occurrence';
      seriesId: string;
      userId: string;
      originalDate: string;
      occurrenceDate: string;
      activityType: string | null;
      title: string | null;
      durationMinutes: number | null;
      notes: string | null;
      overrideFields: string[];
    }
  | {
      kind: 'future' | 'series';
      seriesId: string;
      originalDate?: string;
      activityType: string;
      title: string;
      durationMinutes: number | null;
      notes: string | null;
      details: Record<string, unknown>;
      weekdays: number[];
      until: string | null;
      updateUntil?: boolean;
    }
  | { kind: 'end'; seriesId: string; lastDate: string };

function activityError(message: string | undefined): string {
  const raw = message || 'Could not add that activity.';
  if (/could not find the function|schema cache|does not exist/i.test(raw)) {
    return 'Group extras need a Supabase update. In the SQL Editor, run migration 20261021_069_group_activity_recurrence.sql, then try again. Nothing was saved.';
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
    p_recurrence: input.recurrence || 'none',
    p_recurrence_weekdays: input.recurrence === 'weekly' ? input.recurrenceWeekdays || [] : [],
    p_recurrence_until: input.recurrence === 'weekly' ? input.recurrenceUntil || null : null,
  });
  if (error) return { error: activityError(error.message) };
  return { error: null };
}

type ListedActivity = {
  series_id?: string | null;
  occurrence_id?: string | null;
  user_id?: string | null;
  original_date?: string | null;
  occurrence_date?: string | null;
  status?: string | null;
  completed?: boolean | null;
  detached?: boolean | null;
  activity_type?: string | null;
  title?: string | null;
  duration_minutes?: number | null;
  notes?: string | null;
  details?: Record<string, unknown> | null;
  required?: boolean | null;
  virtual?: boolean | null;
};

type SeriesMeta = {
  id: string;
  workout_id?: string | null;
  recurrence?: string | null;
  recurrence_weekdays?: number[] | string | null;
  recurrence_until?: string | null;
  details?: Record<string, unknown> | null;
};

function ymd(value: string | null | undefined): string {
  return String(value || '').slice(0, 10);
}

function weekdayList(value: number[] | string | null | undefined): number[] {
  if (Array.isArray(value)) return value.map((day) => Number(day)).filter((day) => Number.isInteger(day));
  if (typeof value !== 'string') return [];
  return value.replace(/[{}]/g, '').split(',').map((day) => Number(day.trim())).filter((day) => Number.isInteger(day));
}

/** The list function accepts at most 16 weeks. Longer reads are separate calls, not client-side dates. */
export function groupActivityListRanges(from: string, to: string): Array<{ from: string; to: string }> {
  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = from;
  while (cursor <= to) {
    const end = addDaysYmd(cursor, 111);
    const chunkTo = end < to ? end : to;
    ranges.push({ from: cursor, to: chunkTo });
    if (chunkTo >= to) break;
    cursor = addDaysYmd(chunkTo, 1);
  }
  return ranges;
}

export function mapListedGroupActivity(row: ListedActivity, series?: SeriesMeta | null): GroupExtraActivity | null {
  const seriesId = row.series_id || '';
  const userId = row.user_id || '';
  const originalDate = ymd(row.original_date);
  const date = ymd(row.occurrence_date);
  if (!seriesId || !userId || !originalDate || !date) return null;
  const repeats = series?.recurrence === 'weekly';
  return {
    id: row.occurrence_id || `${seriesId}:${userId}:${originalDate}`,
    seriesId,
    userId,
    date,
    originalDate,
    title: row.title || 'Activity',
    activityType: row.activity_type || 'sport',
    workoutId: series?.workout_id || null,
    required: !!row.required,
    completed: !!row.completed,
    status: row.status === 'skipped' ? 'skipped' : 'scheduled',
    virtual: !!row.virtual,
    detached: !!row.detached,
    durationMinutes: row.duration_minutes ?? null,
    notes: row.notes ?? null,
    details: row.details || {},
    seriesDetails: series?.details || {},
    recurrence: repeats ? 'weekly' : 'none',
    recurrenceWeekdays: repeats ? weekdayList(series?.recurrence_weekdays) : [],
    recurrenceUntil: series?.recurrence_until ? ymd(series.recurrence_until) : null,
  };
}

export async function fetchGroupExtras(
  supabase: SupabaseClient,
  input: { teamId: string; from: string; to: string; userId?: string | null }
): Promise<GroupExtraActivity[]> {
  const listed: ListedActivity[] = [];
  for (const range of groupActivityListRanges(input.from, input.to)) {
    const { data, error } = await supabase.rpc('st_list_group_activities', {
      p_team_id: input.teamId,
      p_from: range.from,
      p_to: range.to,
      p_user_id: input.userId || null,
    });
    if (error || !data) return [];
    listed.push(...(data as ListedActivity[]));
  }
  const seriesIds = Array.from(new Set(listed.map((row) => row.series_id).filter((id): id is string => !!id)));
  const meta = new Map<string, SeriesMeta>();
  if (seriesIds.length) {
    const series = await supabase
      .from('st_group_activity_series')
      .select('id, workout_id, recurrence, recurrence_weekdays, recurrence_until, details')
      .in('id', seriesIds);
    if (!series.error) {
      for (const row of (series.data || []) as SeriesMeta[]) meta.set(row.id, row);
    }
  }
  return listed
    .map((row) => mapListedGroupActivity(row, row.series_id ? meta.get(row.series_id) : null))
    .filter((row): row is GroupExtraActivity => !!row);
}

export async function runGroupExtraAction(
  supabase: SupabaseClient,
  action: GroupExtraAction
): Promise<{ error: string | null; message: string | null }> {
  let error: { message?: string } | null = null;
  let message: string | null = null;
  if (action.kind === 'complete') {
    ({ error } = await supabase.rpc('st_complete_group_activity_occurrence', {
      p_series_id: action.seriesId,
      p_user_id: action.userId,
      p_original_date: action.originalDate,
    }));
  } else if (action.kind === 'skip') {
    ({ error } = await supabase.rpc('st_skip_group_activity_occurrence', {
      p_series_id: action.seriesId,
      p_user_id: action.userId,
      p_original_date: action.originalDate,
    }));
  } else if (action.kind === 'restore') {
    const result = await supabase.rpc('st_restore_group_activity_occurrence', {
      p_series_id: action.seriesId,
      p_user_id: action.userId,
      p_original_date: action.originalDate,
    });
    error = result.error;
    const body = result.data as { restored?: boolean; message?: string } | null;
    if (!error && body && body.restored === false) message = body.message || 'That weekday is no longer on this series';
  } else if (action.kind === 'occurrence') {
    ({ error } = await supabase.rpc('st_edit_group_activity_occurrence', {
      p_series_id: action.seriesId,
      p_user_id: action.userId,
      p_original_date: action.originalDate,
      p_occurrence_date: action.occurrenceDate,
      p_activity_type: action.activityType,
      p_title: action.title,
      p_duration_minutes: action.durationMinutes,
      p_notes: action.notes,
      p_override_fields: action.overrideFields,
    }));
  } else if (action.kind === 'future') {
    ({ error } = await supabase.rpc('st_edit_group_activity_future', {
      p_series_id: action.seriesId,
      p_original_date: action.originalDate,
      p_activity_type: action.activityType,
      p_title: action.title,
      p_duration_minutes: action.durationMinutes,
      p_notes: action.notes,
      p_details: action.details || {},
      p_recurrence_weekdays: action.weekdays,
      p_recurrence_until: action.until,
    }));
  } else if (action.kind === 'series') {
    ({ error } = await supabase.rpc('st_edit_group_activity_series', {
      p_series_id: action.seriesId,
      p_activity_type: action.activityType,
      p_title: action.title,
      p_duration_minutes: action.durationMinutes,
      p_notes: action.notes,
      p_details: action.details || {},
      p_recurrence_weekdays: action.weekdays,
      p_recurrence_until: action.until,
      p_update_until: !!action.updateUntil,
    }));
  } else if (action.kind === 'end') {
    ({ error } = await supabase.rpc('st_end_group_activity_series', {
      p_series_id: action.seriesId,
      p_last_date: action.lastDate,
    }));
  }
  if (error) return { error: activityError(error.message), message: null };
  return { error: null, message };
}
