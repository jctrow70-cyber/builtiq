import { adherenceCounts, pickFulfillingSession, type AdherenceCounts, type ExpectationFact, type ExpectationSessionStatus } from '../training/unifiedSchedule';

export type ProgressAdherence = {
  source: 'training_expectations';
  counts: AdherenceCounts;
};

type ExpectationRow = {
  id: string;
  workout_id?: string | null;
  scheduled_date: string;
  excused?: boolean | null;
  source_key?: string | null;
  team_id?: string | null;
  origin?: 'program' | 'assignment' | null;
};

type SessionRow = {
  expectation_id?: string | null;
  workout_id?: string | null;
  log_date?: string | null;
  status?: string | null;
  source_key?: string | null;
};

/**
 * Progress reads the schedule's expectation rows and session status.
 * It does not decide on its own whether a workout was required.
 */
export function expectationFactsFromSchedule(expectations: ExpectationRow[], sessions: SessionRow[]): ExpectationFact[] {
  const context = expectations.map((row) => ({
    id: row.id,
    workoutId: row.workout_id,
    scheduledDate: row.scheduled_date,
  }));
  const mapped = sessions.map((session) => ({
    ...session,
    expectationId: session.expectation_id,
    workoutId: session.workout_id,
    logDate: session.log_date,
    sourceKey: session.source_key,
  }));
  return expectations.map((row) => {
    const match = pickFulfillingSession(mapped, { id: row.id, workoutId: row.workout_id, scheduledDate: row.scheduled_date }, context);
    return {
      id: row.id,
      workoutId: row.workout_id,
      scheduledDate: row.scheduled_date,
      excused: !!row.excused,
      sessionStatus: sessionStatus(match?.status),
      sourceKey: row.source_key || undefined,
      teamId: row.team_id,
      origin: row.origin || undefined,
    };
  });
}

export function progressAdherence(facts: ExpectationFact[] | null | undefined, today: string): ProgressAdherence | null {
  if (!facts) return null;
  return { source: 'training_expectations', counts: adherenceCounts(facts, today) };
}

function sessionStatus(status?: string | null): ExpectationSessionStatus {
  if (status === 'completed' || status === 'partial' || status === 'skipped' || status === 'in_progress' || status === 'not_started') {
    return status;
  }
  return null;
}
