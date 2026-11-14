import type { SupabaseClient } from '@supabase/supabase-js';
import {
  currentDateForMove,
  workoutDayMovesFromDetails,
  type WorkoutDayMoves,
} from '../programDesign/workoutDayMoves';

export type ShownScheduleWorkout = {
  expectationId: string;
  workoutId: string | null;
  scheduledDate: string;
  /** Native expectation day when the calendar already applied a personal move. */
  movedFrom?: string | null;
};

export type StoredExpectationRow = {
  id: string;
  workout_id: string | null;
  scheduled_date: string;
  excused: boolean;
};

export type ScheduleStartDecision = 'open' | 'refresh';

export type DirectWorkoutOpenDecision = 'open' | 'wait' | 'deny';

/**
 * Personal day moves keep scheduled_date on the native day (Decision 161).
 * Compare the calendar display date after workout_day_moves, not the stored date alone.
 */
export function expectationDisplayDateForStart(
  row: Pick<StoredExpectationRow, 'workout_id' | 'scheduled_date'>,
  moves: WorkoutDayMoves = {}
): string {
  const workoutId = String(row.workout_id || '').trim();
  if (!workoutId) return row.scheduled_date;
  return currentDateForMove(moves, `w:${workoutId}`, row.scheduled_date);
}

/** True when the card already shows this expectation relocated from its stored day. */
export function personalMoveMatchesShown(
  shown: Pick<ShownScheduleWorkout, 'scheduledDate' | 'movedFrom'>,
  row: Pick<StoredExpectationRow, 'scheduled_date'>
): boolean {
  const from = String(shown.movedFrom || '').slice(0, 10);
  if (!from || from !== row.scheduled_date) return false;
  return shown.scheduledDate !== row.scheduled_date;
}

/** Open the workout on screen only when that expectation row is unchanged. */
export function expectationStillMatches(
  shown: ShownScheduleWorkout,
  row: StoredExpectationRow | null,
  moves: WorkoutDayMoves = {}
): ScheduleStartDecision {
  if (!row || row.id !== shown.expectationId) return 'refresh';
  if (row.excused) return 'refresh';
  if ((row.workout_id || null) !== (shown.workoutId || null)) return 'refresh';
  if (expectationDisplayDateForStart(row, moves) === shown.scheduledDate) return 'open';
  // Calendar already painted "Moved from …" from the stored expectation day.
  if (personalMoveMatchesShown(shown, row)) return 'open';
  return 'refresh';
}

/**
 * Start and View without an expectation id still need a known workout
 * on a program this user can open. An unknown id waits while the tree is loading.
 */
export function directWorkoutOpenAllowed(input: {
  userId: string | null;
  workoutId: string | null;
  programId?: string | null;
  knownWorkoutIds: readonly string[];
  authorizedProgramIds: readonly string[];
  treeReady: boolean;
}): DirectWorkoutOpenDecision {
  if (!input.userId || !input.workoutId) return 'deny';
  const known = input.knownWorkoutIds.indexOf(input.workoutId) !== -1;
  if (!known) return input.treeReady ? 'deny' : 'wait';
  if (input.programId && input.authorizedProgramIds.indexOf(input.programId) === -1) return 'deny';
  return 'open';
}

export async function readExpectationForStart(
  supabase: SupabaseClient,
  userId: string,
  expectationId: string
): Promise<{ row: StoredExpectationRow | null; error: string | null }> {
  const result = await supabase
    .from('st_training_expectations')
    .select('id, workout_id, scheduled_date, excused')
    .eq('id', expectationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error) return { row: null, error: result.error.message };
  return { row: (result.data as StoredExpectationRow | null) || null, error: null };
}

/** Fresh personal move map from the completion ledger (not React state). */
export async function readWorkoutDayMovesForStart(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkoutDayMoves> {
  const result = await supabase
    .from('st_user_calendar_activities')
    .select('details')
    .eq('user_id', userId)
    .eq('activity_date', '1970-01-01')
    .limit(5);
  if (result.error) return {};
  const moves: WorkoutDayMoves = {};
  for (const row of result.data || []) {
    Object.assign(moves, workoutDayMovesFromDetails((row as { details?: Record<string, unknown> }).details));
  }
  return moves;
}
