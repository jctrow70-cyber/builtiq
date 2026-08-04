/**
 * BIQ-0085: Reattach completed set logs onto a new/replaced program template.
 *
 * Regenerating a group program creates new planned_set IDs. Completed logs still
 * exist (snapshots + user_id) but Training looks empty because loadLogs keys by
 * planned_set_id. This module rematches historical logs onto the current program.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { dayLabelFromYmd, resolveProgramStartDate, weekForDate } from './programCalendar';

export type ProgramLike = {
  id?: string;
  start_date?: string | null;
  created_at?: string | null;
  weeks?: number | null;
  team_id?: string | null;
  st_workouts?: any[];
};

export type PlannedSetTarget = {
  plannedSetId: string;
  workoutId: string;
  week: number;
  dayOrder: number;
  dayLabel: string;
  exerciseId: string;
  exerciseName: string;
  catalogId: string | null;
  setNumber: number;
  setType: string;
};

export type RematchResult = {
  scanned: number;
  unlinked: number;
  rematched: number;
  skippedConflict: number;
  unmatched: number;
  errors: string[];
};

function normName(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function collectProgramTargets(program: ProgramLike | null | undefined): PlannedSetTarget[] {
  const targets: PlannedSetTarget[] = [];
  (program?.st_workouts || []).forEach((w: any) => {
    (w.st_exercises || []).forEach((e: any) => {
      (e.st_planned_sets || [])
        .filter((s: any) => !s.is_deleted)
        .forEach((s: any) => {
          targets.push({
            plannedSetId: s.id,
            workoutId: w.id,
            week: Number(w.week) || 1,
            dayOrder: Number(w.day_order) || 0,
            dayLabel: String(w.day_label || ''),
            exerciseId: e.id,
            exerciseName: String(e.name || ''),
            catalogId: e.catalog_exercise_id || null,
            setNumber: Number(s.set_number) || 1,
            setType: String(s.set_type || 'working'),
          });
        });
    });
  });
  return targets;
}

export function plannedSetIdSet(program: ProgramLike | null | undefined): Set<string> {
  return new Set(collectProgramTargets(program).map((t) => t.plannedSetId));
}

function exerciseMatches(log: any, target: PlannedSetTarget): boolean {
  const logCatalog = log.snapshot_catalog_exercise_id || null;
  const logName = normName(log.snapshot_exercise_name);
  const targetName = normName(target.exerciseName);
  if (logCatalog && target.catalogId && logCatalog === target.catalogId) return true;
  if (logName && targetName && logName === targetName) return true;
  return false;
}

function setNumberOf(log: any): number {
  return Number(log.snapshot_set_number ?? 1) || 1;
}

/** Score a log → target pair. Higher is better; -1 means incompatible. */
export function scoreLogTargetMatch(
  log: any,
  target: PlannedSetTarget,
  program: ProgramLike,
): number {
  if (setNumberOf(log) !== target.setNumber) return -1;
  if (!exerciseMatches(log, target)) return -1;

  let score = 10; // base for exercise + set number

  const logDate = String(log.log_date || '').slice(0, 10);
  if (logDate) {
    const start = resolveProgramStartDate(program);
    const weekOnDate = weekForDate(start, logDate, program.weeks || 6);
    const dayOnDate = dayLabelFromYmd(logDate);
    if (target.week === weekOnDate && normName(target.dayLabel) === normName(dayOnDate)) {
      score += 40; // strongest: belongs on this calendar day in the new program
    } else if (normName(target.dayLabel) === normName(dayOnDate)) {
      score += 8;
    }
  }

  if (log.snapshot_week != null && Number(log.snapshot_week) === target.week) score += 12;
  if (log.snapshot_day_order != null && Number(log.snapshot_day_order) === target.dayOrder) score += 10;
  else if (log.snapshot_day_label && normName(log.snapshot_day_label) === normName(target.dayLabel)) {
    score += 8;
  }

  if (log.snapshot_set_type && String(log.snapshot_set_type) === target.setType) score += 2;

  return score;
}

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
 * Used so Training immediately shows history after a program redo.
 */
export function mapDateLogsToProgram(
  dateLogs: any[],
  program: ProgramLike,
  workout: any | null,
): Record<string, any> {
  const by: Record<string, any> = {};
  if (!workout) return by;
  const currentIds = plannedSetIdSet(program);
  const targets = collectProgramTargets(program).filter((t) => t.workoutId === workout.id);

  // Prefer exact planned_set_id hits first
  (dateLogs || []).forEach((log) => {
    if (log?.planned_set_id && currentIds.has(log.planned_set_id)) {
      by[log.planned_set_id] = log;
    }
  });

  const occupied = new Set(Object.keys(by));
  (dateLogs || []).forEach((log) => {
    if (!log) return;
    if (log.planned_set_id && currentIds.has(log.planned_set_id)) return;
    if (!(log.completed === true || hasPerf(log))) return;
    let best: { id: string; score: number } | null = null;
    targets.forEach((target) => {
      if (occupied.has(target.plannedSetId)) return;
      const score = scoreLogTargetMatch(log, target, program);
      if (score < 0) return;
      // For same-day overlay, exercise+set is enough
      if (!best || score > best.score) best = { id: target.plannedSetId, score };
    });
    if (best) {
      by[best.id] = { ...log, planned_set_id: best.id };
      occupied.add(best.id);
    }
  });

  return by;
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
