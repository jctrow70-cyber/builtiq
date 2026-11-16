import { decorateDayPlanCompletion, type SetLogLike, type WorkoutLike } from '../programDesign/activityCompletion';
import { planForCalendarDate } from '../programDesign/trainingSchedule';
import type { ProgramActivity, ProgramDesignRecord } from '../programDesign/types';
import type { UserCalendarActivity } from '../programDesign/userCalendar';
import type { WorkoutDayMoves } from '../programDesign/workoutDayMoves';
import { addDaysYmd } from '../training/programCalendar';
import { weekAdherenceCompletionKey } from './weekAdherence';

type ProgramLike = {
  id?: string | null;
  source_program_id?: string | null;
  st_workouts?: WorkoutLike[] | null;
};

/**
 * Workout|date keys whose Training calendar day would mark the item completed via set logs.
 * Dashboard This week uses these to green-border stuck Partial sessions the same way Training does.
 */
export function weekAdherenceSetLogCompletionKeys(input: {
  monday: string;
  program: (ProgramDesignRecord & ProgramLike) | null | undefined;
  activities: ProgramActivity[];
  calendarActivities: UserCalendarActivity[];
  workouts: WorkoutLike[];
  progressLogs: SetLogLike[];
  sessionLogs?: Record<string, SetLogLike | undefined>;
  today: string;
  moves?: WorkoutDayMoves;
}): string[] {
  const program = input.program;
  if (!program) return [];
  const moves = input.moves || {};
  const workoutsById = new Map<string, WorkoutLike>();
  for (const workout of input.workouts || []) {
    const id = String(workout?.id || '').trim();
    if (id) workoutsById.set(id, workout);
  }
  for (const workout of program.st_workouts || []) {
    const id = String(workout?.id || '').trim();
    if (id) workoutsById.set(id, workout as WorkoutLike);
  }
  const workouts = Array.from(workoutsById.values());
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < 7; index += 1) {
    const date = addDaysYmd(input.monday, index);
    const plan = decorateDayPlanCompletion(
      planForCalendarDate(program, input.activities, input.calendarActivities, date, input.today, moves),
      {
        activities: input.calendarActivities,
        workouts,
        progressLogs: input.progressLogs,
        sessionLogs: input.sessionLogs || {},
        selectedDate: input.today,
        program,
      }
    );
    for (const item of plan.items) {
      if (item.isRest || !item.completed || !item.workoutId) continue;
      const key = weekAdherenceCompletionKey(item.workoutId, date);
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}
