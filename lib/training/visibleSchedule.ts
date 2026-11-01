import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisibleScheduleExpectation } from '../programDesign/trainingSchedule';
import { repairFollowedTrainingSchedule, scheduleSetupMissing } from './scheduleActions';
import { sourceLabel, type ExpectationSessionStatus } from './unifiedSchedule';

export type VisibleScheduleEnrollment = {
  id: string;
  source_key: string;
  source_kind: string;
  team_id: string | null;
  program_id: string | null;
  status: string;
  schedule_visible: boolean;
  expectation_enabled: boolean;
};

type ExpectationRow = {
  id: string;
  source_key: string;
  team_id: string | null;
  program_id: string | null;
  workout_id: string | null;
  scheduled_date: string;
  title: string;
  excused: boolean;
};

type SessionRow = {
  expectation_id?: string | null;
  workout_id?: string | null;
  log_date?: string | null;
  status?: string | null;
};

export type VisibleScheduleSnapshot = {
  pending: boolean;
  error: string | null;
  enrollments: VisibleScheduleEnrollment[];
  programNames: Record<string, string>;
  expectations: VisibleScheduleExpectation[];
  /** A failed or pending repair must not replace a calendar that already painted. */
  keepPrevious?: boolean;
};

const emptySnapshot = (pending: boolean, error: string | null = null): VisibleScheduleSnapshot => ({
  pending,
  error,
  enrollments: [],
  programNames: {},
  expectations: [],
});

/** Same expectation/session match the Training calendar uses. First linked row wins. */
export function sessionStatusForExpectation(
  expectation: { id: string; workout_id?: string | null; scheduled_date: string },
  sessions: SessionRow[]
): ExpectationSessionStatus {
  const match = sessions.find(
    (session) =>
      (session.expectation_id && session.expectation_id === expectation.id) ||
      (!!session.workout_id && session.workout_id === expectation.workout_id && session.log_date === expectation.scheduled_date)
  );
  const status = match?.status;
  if (status === 'completed' || status === 'partial' || status === 'skipped' || status === 'in_progress' || status === 'not_started') {
    return status;
  }
  return null;
}

export function scheduleTeamLabel(
  teams: Array<{ id: string; name?: string | null }>,
  teamId: string | null,
  sourceKey: string
): string {
  if (sourceKey === 'personal') return 'Personal';
  return teams.find((team) => team.id === teamId)?.name || sourceLabel(sourceKey);
}

/**
 * Loads the signed-in user's visible enrollments, expectations, and sessions.
 * Queries are scoped with user_id. This is the Training calendar loader.
 */
export async function loadVisibleSchedule(
  supabase: SupabaseClient,
  input: {
    userId: string;
    teams: Array<{ id: string; name?: string | null }>;
    rangeFrom: string;
    rangeTo: string;
    today: string;
  }
): Promise<VisibleScheduleSnapshot> {
  const enrollmentSelect = 'id, source_key, source_kind, team_id, program_id, status, schedule_visible, expectation_enabled';
  const enrollmentResult = await supabase
    .from('st_training_enrollments')
    .select(enrollmentSelect)
    .eq('user_id', input.userId)
    .order('source_kind', { ascending: true });
  if (enrollmentResult.error) {
    if (scheduleSetupMissing(enrollmentResult.error.message)) return emptySnapshot(true);
    return emptySnapshot(false, enrollmentResult.error.message);
  }
  const enrollments = ((enrollmentResult.data || []) as VisibleScheduleEnrollment[]).filter((row) => row.status !== 'ended');
  const programIds = enrollments.reduce<string[]>((ids, row) => {
    if (row.program_id && ids.indexOf(row.program_id) === -1) ids.push(row.program_id);
    return ids;
  }, []);
  const programNames: Record<string, string> = {};
  if (programIds.length) {
    const programs = await supabase.from('st_programs').select('id, name').in('id', programIds);
    for (const program of programs.data || []) programNames[program.id] = program.name || 'Program';
  }
  const visibleKeys = new Set(
    enrollments.filter((row) => row.schedule_visible && row.status === 'active').map((row) => row.source_key)
  );
  const expectationResult = await supabase
    .from('st_training_expectations')
    .select('id, source_key, team_id, program_id, workout_id, scheduled_date, title, excused')
    .eq('user_id', input.userId)
    .gte('scheduled_date', input.rangeFrom)
    .lte('scheduled_date', input.rangeTo)
    .order('scheduled_date', { ascending: true });
  if (expectationResult.error && scheduleSetupMissing(expectationResult.error.message)) {
    return { pending: true, error: null, enrollments, programNames, expectations: [] };
  }
  let error: string | null = null;
  if (expectationResult.error) error = expectationResult.error.message;
  const visible = ((expectationResult.data || []) as ExpectationRow[]).filter((row) => visibleKeys.has(row.source_key));
  const sessionResult = await supabase
    .from('st_workout_sessions')
    .select('expectation_id, workout_id, log_date, status')
    .eq('user_id', input.userId)
    .gte('log_date', input.rangeFrom)
    .lte('log_date', input.rangeTo);
  if (sessionResult.error) error = error || sessionResult.error.message;
  const sessions = sessionResult.error ? [] : ((sessionResult.data || []) as SessionRow[]);
  const expectations: VisibleScheduleExpectation[] = visible.map((row) => ({
    id: row.id,
    workoutId: row.workout_id,
    programId: row.program_id,
    scheduledDate: row.scheduled_date,
    title: row.title,
    sourceKey: row.source_key,
    teamId: row.team_id,
    sourceName: scheduleTeamLabel(input.teams, row.team_id, row.source_key),
    excused: row.excused,
    sessionStatus: sessionStatusForExpectation(row, sessions),
  }));
  return { pending: false, error, enrollments, programNames, expectations };
}

/** Keep the painted calendar when repair cannot return a trustworthy replacement. */
export function scheduleRefreshResult(input: {
  repairPending: boolean;
  repairError: string | null;
  snapshot: VisibleScheduleSnapshot | null;
}): VisibleScheduleSnapshot {
  if (input.repairPending || !input.snapshot) {
    return { ...emptySnapshot(!!input.repairPending, input.repairError), keepPrevious: true };
  }
  const snapshot: VisibleScheduleSnapshot = {
    ...input.snapshot,
    error: input.snapshot.error || input.repairError,
  };
  const empty = snapshot.enrollments.length === 0 && snapshot.expectations.length === 0;
  if (snapshot.pending || (empty && !!snapshot.error)) return { ...snapshot, keepPrevious: true };
  return snapshot;
}

/** Repair followed expectations, then read the calendar again. This stays off the first paint. */
export async function refreshVisibleSchedule(
  supabase: SupabaseClient,
  input: {
    userId: string;
    teams: Array<{ id: string; name?: string | null }>;
    rangeFrom: string;
    rangeTo: string;
    today: string;
  }
): Promise<VisibleScheduleSnapshot> {
  const repair = await repairFollowedTrainingSchedule(supabase, input.today);
  if (repair.pending) return scheduleRefreshResult({ repairPending: true, repairError: repair.error, snapshot: null });
  const snapshot = await loadVisibleSchedule(supabase, input);
  return scheduleRefreshResult({ repairPending: false, repairError: repair.error, snapshot });
}
