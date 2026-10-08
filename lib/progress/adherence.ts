import { adherenceCounts, sessionFulfillsExpectation, type AdherenceCounts, type ExpectationFact, type ExpectationSessionStatus } from '../training/unifiedSchedule';

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
};

/**
 * Progress reads the schedule's expectation rows and session status.
 * It does not decide on its own whether a workout was required.
 */
export function expectationFactsFromSchedule(expectations: ExpectationRow[], sessions: SessionRow[]): ExpectationFact[] {
  return expectations.map((row) => {
    const match = sessions.find((session) =>
      sessionFulfillsExpectation(
        { expectationId: session.expectation_id, workoutId: session.workout_id, logDate: session.log_date },
        { id: row.id, workoutId: row.workout_id, scheduledDate: row.scheduled_date }
      )
    );
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
