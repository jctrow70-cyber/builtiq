/** BIQ-0027: Shared workout completion status for coach + athlete views */

import type { WorkoutDayStatus } from './types';

export function workoutStatusFromLogs(
  workout: any | null,
  logMap: Record<string, any>
): WorkoutDayStatus {
  if (!workout) return 'rest';
  let planned = 0;
  let done = 0;
  (workout.st_exercises || []).forEach((e: any) =>
    (e.st_planned_sets || [])
      .filter((s: any) => !s.is_deleted)
      .forEach((s: any) => {
        planned++;
        if (logMap[s.id]?.completed) done++;
      })
  );
  if (!planned) return 'none';
  if (done === 0) return 'not_started';
  if (done < planned) return 'in_progress';
  return 'completed';
}

export function statusLabel(status: WorkoutDayStatus | string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  if (status === 'not_started') return 'Not started';
  if (status === 'rest') return 'Rest day';
  return 'No workout';
}

export function statusBadgeClass(status: WorkoutDayStatus | string): string {
  if (status === 'completed') return 'status-completed';
  if (status === 'in_progress') return 'status-progress';
  if (status === 'not_started') return 'status-pending';
  return 'status-muted';
}
