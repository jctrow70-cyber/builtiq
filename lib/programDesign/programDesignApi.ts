import type { SupabaseClient } from '@supabase/supabase-js';
import { insertProgramRecord, missingProgramColumnFromError } from '../training/programStatus';
import { inferActivityTypeFromWorkout } from './activityTypes';
import { cycleEndDate, cycleLengthOf, dayOfWeekFromLabel, snapStartToMonday } from './cycle';
import type {
  ActivityDraft,
  ActivityType,
  ProgramActivity,
  ProgramActivityDetails,
  ProgramDesignRecord,
  ProgramLifecycleStatus,
  ProgramRecordKind,
  ProgramScope,
} from './types';

const PROGRAM_FIELDS = [
  'id',
  'name',
  'status',
  'visibility',
  'weeks',
  'cycle_length_weeks',
  'start_date',
  'end_date',
  'created_at',
  'team_id',
  'owner_user_id',
  'record_kind',
  'source_program_id',
];

function isMissingRelation(error: { message?: string } | null | undefined): boolean {
  const msg = error?.message || '';
  return /could not find the table|relation .* does not exist|schema cache/i.test(msg);
}

function asActivity(row: Record<string, unknown>): ProgramActivity {
  const details =
    row.details && typeof row.details === 'object' && !Array.isArray(row.details)
      ? (row.details as ProgramActivityDetails)
      : {};
  return {
    id: String(row.id),
    program_id: String(row.program_id),
    week_number: Number(row.week_number || 1),
    day_of_week: Number(row.day_of_week || 0),
    sort_order: Number(row.sort_order || 0),
    activity_type: (row.activity_type as ActivityType) || 'strength',
    title: String(row.title || ''),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    notes: String(row.notes || ''),
    details,
    workout_id: row.workout_id ? String(row.workout_id) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

export async function fetchDesignPrograms(
  supabase: SupabaseClient,
  opts: { scope: ProgramScope; ownerUserId: string; teamId?: string | null }
): Promise<{ data: ProgramDesignRecord[]; error: string | null }> {
  let fields = [...PROGRAM_FIELDS];

  for (let attempt = 0; attempt < 8; attempt++) {
    let q = supabase.from('st_programs').select(fields.join(', ')).order('created_at', { ascending: false });
    if (opts.scope === 'personal') {
      q = q.eq('visibility', 'personal').eq('owner_user_id', opts.ownerUserId);
    } else {
      q = q.eq('visibility', 'team').eq('team_id', opts.teamId || '00000000-0000-0000-0000-000000000000');
    }
    const { data, error } = await q;
    if (!error) return { data: (data || []) as ProgramDesignRecord[], error: null };

    const missingCol = missingProgramColumnFromError(error);
    if (missingCol && fields.includes(missingCol)) {
      fields = fields.filter((f) => f !== missingCol);
      continue;
    }
    return { data: [], error: error.message || 'Could not load programs' };
  }

  return { data: [], error: 'Could not load programs' };
}

export async function createDesignProgram(
  supabase: SupabaseClient,
  input: {
    ownerUserId: string;
    name: string;
    startDate: string;
    cycleWeeks: number;
    scope: ProgramScope;
    teamId?: string | null;
    recordKind?: ProgramRecordKind;
  }
): Promise<{ data: ProgramDesignRecord | null; error: string | null }> {
  const { startDate } = snapStartToMonday(input.startDate);
  const weeks = Math.max(1, Math.min(52, Number(input.cycleWeeks) || 6));
  const endDate = cycleEndDate(startDate, weeks);
  const payload: Record<string, unknown> = {
    owner_user_id: input.ownerUserId,
    team_id: input.scope === 'group' ? input.teamId || null : null,
    visibility: input.scope === 'group' ? 'team' : 'personal',
    name: input.name.trim() || 'New program',
    weeks,
    cycle_length_weeks: weeks,
    start_date: startDate,
    end_date: endDate,
    status: 'draft',
    record_kind: input.recordKind || 'instance',
  };

  const { data, error } = await insertProgramRecord(supabase, payload);
  if (error || !data) return { data: null, error: error || 'Could not create program' };
  return { data: data as ProgramDesignRecord, error: null };
}

export async function updateDesignProgram(
  supabase: SupabaseClient,
  programId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const working = { ...patch };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from('st_programs').update(working).eq('id', programId);
    if (!error) return { error: null };
    const missingCol = missingProgramColumnFromError(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(working, missingCol)) {
      delete working[missingCol];
      continue;
    }
    return { error: error.message || 'Could not update program' };
  }
  return { error: 'Could not update program' };
}

export async function setProgramLifecycle(
  supabase: SupabaseClient,
  programs: ProgramDesignRecord[],
  programId: string,
  next: ProgramLifecycleStatus,
  ownerUserId: string
): Promise<{ error: string | null }> {
  if (next === 'active') {
    const others = programs.filter(
      (p) => p.id !== programId && p.visibility === 'personal' && p.owner_user_id === ownerUserId && p.status === 'active'
    );
    for (const other of others) {
      const { error } = await updateDesignProgram(supabase, other.id, { status: 'scheduled' });
      if (error) return { error };
    }
  }
  return updateDesignProgram(supabase, programId, { status: next });
}

export async function fetchProgramActivities(
  supabase: SupabaseClient,
  programId: string
): Promise<{ data: ProgramActivity[]; error: string | null; tableReady: boolean }> {
  const { data, error } = await supabase
    .from('st_program_activities')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true })
    .order('day_of_week', { ascending: true })
    .order('sort_order', { ascending: true });

  if (!error) return { data: (data || []).map((row) => asActivity(row as Record<string, unknown>)), error: null, tableReady: true };
  if (isMissingRelation(error)) return { data: [], error: null, tableReady: false };
  return { data: [], error: error.message || 'Could not load activities', tableReady: true };
}

/** Display-only bridge from existing strength workouts until Phase 2 builders attach. */
export function activitiesFromLegacyWorkouts(
  programId: string,
  workouts: Array<{ id?: string; week?: number; day_label?: string; workout_type?: string; day_order?: number }>
): ProgramActivity[] {
  return (workouts || []).map((w, idx) => ({
    id: `legacy-${w.id || idx}`,
    program_id: programId,
    week_number: Number(w.week || 1),
    day_of_week: dayOfWeekFromLabel(String(w.day_label || 'Mon')),
    sort_order: Number(w.day_order ?? idx),
    activity_type: inferActivityTypeFromWorkout(w.workout_type),
    title: String(w.workout_type || w.day_label || 'Workout'),
    duration_minutes: null,
    notes: '',
    details: {},
    workout_id: w.id || null,
  }));
}

export async function fetchLegacyWorkouts(
  supabase: SupabaseClient,
  programId: string
): Promise<{ data: Array<{ id: string; week: number; day_label: string; workout_type: string; day_order: number }> }> {
  const { data } = await supabase
    .from('st_workouts')
    .select('id, week, day_label, workout_type, day_order')
    .eq('program_id', programId)
    .order('week', { ascending: true })
    .order('day_order', { ascending: true });
  return { data: (data || []) as Array<{ id: string; week: number; day_label: string; workout_type: string; day_order: number }> };
}

export async function createProgramActivity(
  supabase: SupabaseClient,
  programId: string,
  weekNumber: number,
  dayOfWeek: number,
  draft: ActivityDraft,
  sortOrder: number
): Promise<{ data: ProgramActivity | null; error: string | null }> {
  const { data, error } = await supabase
    .from('st_program_activities')
    .insert({
      program_id: programId,
      week_number: weekNumber,
      day_of_week: dayOfWeek,
      sort_order: sortOrder,
      activity_type: draft.activity_type,
      title: draft.title.trim() || 'Activity',
      duration_minutes: draft.duration_minutes,
      notes: draft.notes.trim(),
      details: draft.details || {},
    })
    .select()
    .single();
  if (error) {
    if (isMissingRelation(error)) {
      return { data: null, error: 'Apply the Program Design migration to save calendar activities.' };
    }
    return { data: null, error: error.message || 'Could not add activity' };
  }
  return { data: asActivity(data as Record<string, unknown>), error: null };
}

export async function updateProgramActivity(
  supabase: SupabaseClient,
  activityId: string,
  draft: Partial<ActivityDraft> & { sort_order?: number }
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (draft.activity_type) patch.activity_type = draft.activity_type;
  if (draft.title != null) patch.title = draft.title.trim();
  if (draft.duration_minutes !== undefined) patch.duration_minutes = draft.duration_minutes;
  if (draft.notes != null) patch.notes = draft.notes.trim();
  if (draft.details) patch.details = draft.details;
  if (draft.sort_order != null) patch.sort_order = draft.sort_order;
  const { error } = await supabase.from('st_program_activities').update(patch).eq('id', activityId);
  if (error) return { error: error.message || 'Could not update activity' };
  return { error: null };
}

export async function deleteProgramActivity(
  supabase: SupabaseClient,
  activityId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('st_program_activities').delete().eq('id', activityId);
  if (error) return { error: error.message || 'Could not remove activity' };
  return { error: null };
}

export async function copyWeekActivities(
  supabase: SupabaseClient,
  programId: string,
  fromWeek: number,
  toWeeks: number[]
): Promise<{ error: string | null }> {
  const { data: source, error: loadError, tableReady } = await fetchProgramActivities(supabase, programId);
  if (!tableReady) return { error: 'Apply the Program Design migration to copy weeks.' };
  if (loadError) return { error: loadError };
  const rows = source.filter((a) => a.week_number === fromWeek && !a.id.startsWith('legacy-'));
  if (!rows.length) return { error: 'This week has no calendar activities to copy yet.' };

  for (const week of toWeeks) {
    if (week === fromWeek) continue;
    const { error: delError } = await supabase
      .from('st_program_activities')
      .delete()
      .eq('program_id', programId)
      .eq('week_number', week);
    if (delError) return { error: delError.message || 'Could not replace the target week' };
  }

  const inserts = toWeeks
    .filter((week) => week !== fromWeek)
    .flatMap((week) =>
      rows.map((a) => ({
        program_id: programId,
        week_number: week,
        day_of_week: a.day_of_week,
        sort_order: a.sort_order,
        activity_type: a.activity_type,
        title: a.title,
        duration_minutes: a.duration_minutes,
        notes: a.notes,
        details: a.details || {},
      }))
    );

  if (!inserts.length) return { error: null };
  const { error } = await supabase.from('st_program_activities').insert(inserts);
  if (error) return { error: error.message || 'Could not copy week' };
  return { error: null };
}

export function nextSortOrder(activities: ProgramActivity[], weekNumber: number, dayOfWeek: number): number {
  const sameDay = activities.filter((a) => a.week_number === weekNumber && a.day_of_week === dayOfWeek);
  return sameDay.reduce((max, a) => Math.max(max, a.sort_order), -1) + 1;
}

export function activitiesForDay(
  activities: ProgramActivity[],
  weekNumber: number,
  dayOfWeek: number
): ProgramActivity[] {
  return activities
    .filter((a) => a.week_number === weekNumber && a.day_of_week === dayOfWeek)
    .sort((a, b) => a.sort_order - b.sort_order);
}
