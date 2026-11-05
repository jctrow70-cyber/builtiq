/**
 * BIQ-0085: Reattach completed set logs onto a new/replaced program template.
 *
 * Regenerating a group program creates new planned_set IDs. Completed logs still
 * exist (snapshots + user_id) but Training looks empty because loadLogs keys by
 * planned_set_id. This module rematches historical logs onto the current program.
 *
 * Display/completion projection (no DB write) lives in historicalLogProjection.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { projectDateLogsOntoWorkout } from './historicalLogProjection';
import {
  collectProgramTargets,
  plannedSetIdSet,
  scoreLogTargetMatch,
  type PlannedSetTarget,
  type ProgramLike,
} from './logTargetMatch';

export type { PlannedSetTarget, ProgramLike };
export { collectProgramTargets, plannedSetIdSet, scoreLogTargetMatch };

export type RematchResult = {
  scanned: number;
  unlinked: number;
  rematched: number;
  skippedConflict: number;
  unmatched: number;
  errors: string[];
};

export function buildRematchPlan(
  logs: any[],
  program: ProgramLike,
  currentIds: Set<string>,
): { logId: string; fromPlannedSetId: string | null; toPlannedSetId: string; logDate: string }[] {
  const targets = collectProgramTargets(program);
  const usedTargets = new Set<string>();
  // Already-occupied (planned_set_id, log_date) on the current program
  const occupied = new Set<string>();
  logs.forEach((log) => {
    if (log.planned_set_id && currentIds.has(log.planned_set_id)) {
      occupied.add(`${log.planned_set_id}|${String(log.log_date).slice(0, 10)}`);
    }
  });

  const unlinked = logs.filter((log) => {
    if (!log?.id) return false;
    if (!(log.completed === true || hasPerf(log))) return false;
    if (!log.planned_set_id) return true;
    return !currentIds.has(log.planned_set_id);
  });

  const plan: { logId: string; fromPlannedSetId: string | null; toPlannedSetId: string; logDate: string }[] = [];

  // Prefer more recent logs first when competing for the same target slot on a date
  const sorted = [...unlinked].sort((a, b) =>
    String(b.log_date || '').localeCompare(String(a.log_date || '')),
  );

  sorted.forEach((log) => {
    const logDate = String(log.log_date || '').slice(0, 10);
    let best: { target: PlannedSetTarget; score: number } | null = null;
    targets.forEach((target) => {
      const key = `${target.plannedSetId}|${logDate}`;
      if (usedTargets.has(key) || occupied.has(key)) return;
      const score = scoreLogTargetMatch(log, target, program);
      if (score < 0) return;
      if (!best || score > best.score) best = { target, score };
    });
    if (!best || best.score < 18) return; // require calendar or week/day signal beyond bare exercise
    const key = `${best.target.plannedSetId}|${logDate}`;
    usedTargets.add(key);
    plan.push({
      logId: log.id,
      fromPlannedSetId: log.planned_set_id || null,
      toPlannedSetId: best.target.plannedSetId,
      logDate,
    });
  });

  return plan;
}

function hasPerf(row: any): boolean {
  return !!(
    row &&
    (String(row.actual_weight || '').trim() ||
      String(row.actual_reps || '').trim() ||
      String(row.actual_duration || '').trim() ||
      String(row.actual_distance || '').trim() ||
      String(row.log_notes || '').trim())
  );
}

/**
 * Overlay date logs onto current planned sets for display without mutating DB.
 * Delegates to the shared historical projection (BIQ-0308).
 */
export function mapDateLogsToProgram(
  dateLogs: any[],
  program: ProgramLike,
  workout: any | null,
): Record<string, any> {
  const logDate =
    (dateLogs || []).find((row) => row?.log_date)?.log_date ||
    null;
  return projectDateLogsOntoWorkout(dateLogs || [], program, workout, { logDate }).byPlannedSetId;
}

export async function fetchUserCompletedLogs(
  supabase: SupabaseClient,
  userId: string,
  opts?: { sinceYmd?: string; limit?: number },
): Promise<any[]> {
  const limit = Math.max(50, Math.min(opts?.limit || 2000, 3000));
  let q = supabase
    .from('st_set_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('log_date', { ascending: false })
    .limit(limit);
  if (opts?.sinceYmd) q = q.gte('log_date', opts.sinceYmd);

  const { data, error } = await q;
  if (error) {
    console.warn(error.message);
    return [];
  }
  return data || [];
}

export async function countUnlinkedLogs(
  supabase: SupabaseClient,
  userId: string,
  program: ProgramLike,
  opts?: { sinceYmd?: string },
): Promise<{ total: number; unlinked: number }> {
  const logs = await fetchUserCompletedLogs(supabase, userId, {
    sinceYmd: opts?.sinceYmd,
    limit: 2000,
  });
  const currentIds = plannedSetIdSet(program);
  const unlinked = logs.filter((log) => !log.planned_set_id || !currentIds.has(log.planned_set_id));
  return { total: logs.length, unlinked: unlinked.length };
}

export async function reattachUserLogsToProgram(
  supabase: SupabaseClient,
  userId: string,
  program: ProgramLike,
  opts?: { sinceYmd?: string; teamId?: string | null },
): Promise<RematchResult> {
  const result: RematchResult = {
    scanned: 0,
    unlinked: 0,
    rematched: 0,
    skippedConflict: 0,
    unmatched: 0,
    errors: [],
  };

  if (!program?.id) {
    result.errors.push('No program selected.');
    return result;
  }

  const logs = await fetchUserCompletedLogs(supabase, userId, {
    sinceYmd: opts?.sinceYmd,
    limit: 2500,
  });
  result.scanned = logs.length;
  const currentIds = plannedSetIdSet(program);
  const unlinked = logs.filter((log) => !log.planned_set_id || !currentIds.has(log.planned_set_id));
  result.unlinked = unlinked.length;

  const plan = buildRematchPlan(logs, program, currentIds);
  result.unmatched = Math.max(0, unlinked.length - plan.length);

  for (const step of plan) {
    const payload: Record<string, unknown> = { planned_set_id: step.toPlannedSetId };
    if (opts?.teamId) payload.team_id = opts.teamId;

    const { error } = await supabase
      .from('st_set_logs')
      .update(payload)
      .eq('id', step.logId)
      .eq('user_id', userId);

    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) {
        result.skippedConflict += 1;
      } else {
        result.errors.push(error.message || 'Update failed');
      }
      continue;
    }
    result.rematched += 1;
  }

  return result;
}
