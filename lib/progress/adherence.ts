import { adherenceCounts, pickFulfillingSession, type AdherenceCounts, type ExpectationFact, type ExpectationSessionStatus } from '../training/unifiedSchedule';
import { linkedSessionsForExpectation } from '../training/visibleSchedule';

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
 * linkedSessions also keep destination-day logs after a personal move (Dashboard day chips).
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
    const linkedSessions = linkedSessionsForWeekAdherence(row, sessions);
    return {
      id: row.id,
      workoutId: row.workout_id,
      scheduledDate: row.scheduled_date,
      excused: !!row.excused,
      sessionStatus: sessionStatus(match?.status),
      sourceKey: row.source_key || undefined,
      teamId: row.team_id,
      origin: row.origin || undefined,
      linkedSessions,
    };
  });
}

/**
 * Same as calendar linked sessions, plus unlinked same-workout logs on other dates in the fetched window
 * so a Saturday completion after a Sunday→Saturday move still paints the destination day.
 */
function linkedSessionsForWeekAdherence(
  expectation: ExpectationRow,
  sessions: SessionRow[]
): Array<{ logDate: string; status: ExpectationSessionStatus }> {
  const linked = linkedSessionsForExpectation(
    { id: expectation.id, workout_id: expectation.workout_id, scheduled_date: expectation.scheduled_date },
    sessions
  );
  const seen = new Set(linked.map((row) => row.logDate));
  const workoutId = String(expectation.workout_id || '').trim();
  if (!workoutId) return linked;
  for (const session of sessions) {
    if (session.expectation_id) continue;
    if (String(session.workout_id || '').trim() !== workoutId) continue;
    const logDate = String(session.log_date || '').slice(0, 10);
    const status = sessionStatus(session.status);
    if (!logDate || !status || seen.has(logDate)) continue;
    seen.add(logDate);
    linked.push({ logDate, status });
  }
  return linked;
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
