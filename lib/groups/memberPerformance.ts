import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computePersonalRecords,
  computeProgressSummary,
  computeWeeklyTrends,
  type PersonalRecord,
  type ProgressInsightsSummary,
  type WeeklyTrendPoint,
} from '../training/progressAnalytics';
import { formatDisplayDate, todayYmd } from '../training/programCalendar';
import type { AssignedWorkoutRow } from './assignments';

export type AssignmentComplianceSummary = {
  total: number;
  completed: number;
  pending: number;
  started: number;
  skipped: number;
  overdue: number;
  completionPct: number;
};

export type MemberWorkoutHistoryDay = {
  date: string;
  label: string;
  sets: number;
  exercises: string[];
};

export type MemberRosterMeta = {
  recentPr: boolean;
  assignmentPending: number;
  assignmentOverdue: number;
};

export type MemberPerformanceBundle = {
  logs: any[];
  prs: PersonalRecord[];
  weeks: WeeklyTrendPoint[];
  summary: ProgressInsightsSummary;
  assignmentCompliance: AssignmentComplianceSummary;
  history: MemberWorkoutHistoryDay[];
};

export function emptyAssignmentCompliance(): AssignmentComplianceSummary {
  return {
    total: 0,
    completed: 0,
    pending: 0,
    started: 0,
    skipped: 0,
    overdue: 0,
    completionPct: 0,
  };
}

export function computeAssignmentCompliance(
  rows: Pick<AssignedWorkoutRow, 'status' | 'st_workout_assignments'>[],
  today = todayYmd(),
): AssignmentComplianceSummary {
  const summary = emptyAssignmentCompliance();
  summary.total = rows.length;
  if (!rows.length) return summary;

  rows.forEach((row) => {
    const status = row.status;
    if (status === 'completed') summary.completed += 1;
    else if (status === 'started') summary.started += 1;
    else if (status === 'skipped') summary.skipped += 1;
    else summary.pending += 1;

    const due = row.st_workout_assignments?.due_date;
    if (due && String(due).slice(0, 10) < today && status !== 'completed' && status !== 'skipped') {
      summary.overdue += 1;
    }
  });

  const actionable = summary.total - summary.skipped;
  summary.completionPct = actionable ? Math.round((summary.completed / actionable) * 100) : 0;
  return summary;
}

export function buildMemberWorkoutHistory(logs: any[], limit = 8): MemberWorkoutHistoryDay[] {
  const byDate = new Map<string, { sets: number; exercises: Set<string> }>();
  (logs || [])
    .filter((row) => row?.completed)
    .forEach((row) => {
      const date = String(row.log_date || '').slice(0, 10);
      if (!date) return;
      if (!byDate.has(date)) byDate.set(date, { sets: 0, exercises: new Set() });
      const bucket = byDate.get(date)!;
      bucket.sets += 1;
      const name = String(row.snapshot_exercise_name || 'Exercise').trim();
      if (name) bucket.exercises.add(name);
    });

  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([date, bucket]) => ({
      date,
      label: formatDisplayDate(date),
      sets: bucket.sets,
      exercises: Array.from(bucket.exercises).slice(0, 4),
    }));
}

export function hasRecentPersonalRecord(logs: any[]): boolean {
  return computePersonalRecords(logs).some((pr) => pr.recentPr);
}

export function buildMemberPerformanceBundle(
  logs: any[],
  assignmentRows: Pick<AssignedWorkoutRow, 'status' | 'st_workout_assignments'>[] = [],
): MemberPerformanceBundle {
  const prs = computePersonalRecords(logs);
  return {
    logs,
    prs,
    weeks: computeWeeklyTrends(logs, 8),
    summary: computeProgressSummary(logs, prs),
    assignmentCompliance: computeAssignmentCompliance(assignmentRows),
    history: buildMemberWorkoutHistory(logs),
  };
}

export async function fetchMemberSetLogs(
  supabase: SupabaseClient,
  userId: string,
  opts?: { teamId?: string | null; limit?: number },
): Promise<any[]> {
  const limit = Math.max(50, Math.min(opts?.limit || 400, 800));
  let q = supabase
    .from('st_set_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('log_date', { ascending: false })
    .limit(limit);

  if (opts?.teamId) q = q.eq('team_id', opts.teamId);

  const { data, error } = await q;
  if (error) {
    console.warn(error.message);
    return [];
  }
  return data || [];
}

export async function fetchMemberAssignmentRows(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<AssignedWorkoutRow[]> {
  const { data, error } = await supabase
    .from('st_assignment_recipients')
    .select('*, st_workout_assignments!inner(*, st_teams(id, name))')
    .eq('user_id', userId)
    .eq('st_workout_assignments.team_id', teamId)
    .eq('st_workout_assignments.is_active', true);

  if (error) {
    console.warn(error.message);
    return [];
  }
  return (data || []) as AssignedWorkoutRow[];
}

export async function fetchTeamAssignmentRowsByUser(
  supabase: SupabaseClient,
  teamId: string,
  userIds: string[],
): Promise<Record<string, AssignedWorkoutRow[]>> {
  const byUser: Record<string, AssignedWorkoutRow[]> = {};
  userIds.forEach((id) => {
    byUser[id] = [];
  });
  if (!userIds.length) return byUser;

  const { data, error } = await supabase
    .from('st_assignment_recipients')
    .select('*, st_workout_assignments!inner(*, st_teams(id, name))')
    .in('user_id', userIds)
    .eq('st_workout_assignments.team_id', teamId)
    .eq('st_workout_assignments.is_active', true);

  if (error) {
    console.warn(error.message);
    return byUser;
  }

  (data || []).forEach((row: any) => {
    if (!byUser[row.user_id]) byUser[row.user_id] = [];
    byUser[row.user_id].push(row as AssignedWorkoutRow);
  });
  return byUser;
}

export async function fetchTeamMemberLogsForPr(
  supabase: SupabaseClient,
  userIds: string[],
  teamId?: string | null,
): Promise<Record<string, any[]>> {
  const byUser: Record<string, any[]> = {};
  userIds.forEach((id) => {
    byUser[id] = [];
  });
  if (!userIds.length) return byUser;

  let q = supabase
    .from('st_set_logs')
    .select('*')
    .in('user_id', userIds)
    .eq('completed', true)
    .order('log_date', { ascending: false })
    .limit(Math.min(userIds.length * 120, 800));

  if (teamId) q = q.eq('team_id', teamId);

  const { data, error } = await q;
  if (error) {
    console.warn(error.message);
    return byUser;
  }

  (data || []).forEach((row: any) => {
    if (!byUser[row.user_id]) byUser[row.user_id] = [];
    byUser[row.user_id].push(row);
  });
  return byUser;
}

export async function loadMemberPerformanceBundle(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<MemberPerformanceBundle> {
  const [logs, assignmentRows] = await Promise.all([
    fetchMemberSetLogs(supabase, userId, { teamId: null, limit: 400 }),
    fetchMemberAssignmentRows(supabase, userId, teamId),
  ]);
  return buildMemberPerformanceBundle(logs, assignmentRows);
}

export async function loadMemberRosterMeta(
  supabase: SupabaseClient,
  teamId: string,
  userIds: string[],
): Promise<Record<string, MemberRosterMeta>> {
  const meta: Record<string, MemberRosterMeta> = {};
  userIds.forEach((id) => {
    meta[id] = { recentPr: false, assignmentPending: 0, assignmentOverdue: 0 };
  });
  if (!userIds.length) return meta;

  const [assignmentsByUser, logsByUser] = await Promise.all([
    fetchTeamAssignmentRowsByUser(supabase, teamId, userIds),
    fetchTeamMemberLogsForPr(supabase, userIds, teamId),
  ]);

  const today = todayYmd();
  userIds.forEach((userId) => {
    const rows = assignmentsByUser[userId] || [];
    const open = rows.filter((r) => r.status === 'pending' || r.status === 'started');
    meta[userId].assignmentPending = open.length;
    meta[userId].assignmentOverdue = open.filter((r) => {
      const due = r.st_workout_assignments?.due_date;
      return due && String(due).slice(0, 10) < today;
    }).length;
    meta[userId].recentPr = hasRecentPersonalRecord(logsByUser[userId] || []);
  });

  return meta;
}
