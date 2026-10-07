'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { addDaysYmd, formatDisplayDate, mondayOfWeek, todayYmd } from '../../../lib/training/programCalendar';
import {
  repairFollowedTrainingSchedule,
  scheduleSetupMissing,
  setEnrollmentExpectation,
  setEnrollmentScheduleVisible,
} from '../../../lib/training/scheduleActions';
import {
  expectationDisplayState,
  sourceLabel,
  type ExpectationDisplayState,
  type ExpectationSessionStatus,
} from '../../../lib/training/unifiedSchedule';

export type ScheduleStartItem = {
  expectationId: string;
  workoutId: string | null;
  programId: string | null;
  scheduledDate: string;
  sourceKey: string;
  teamId: string | null;
};

type EnrollmentRow = {
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

type Props = {
  userId: string;
  teams: Array<{ id: string; name?: string | null }>;
  onStartWorkout: (item: ScheduleStartItem) => void;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function sessionFor(expectation: ExpectationRow, sessions: SessionRow[]): ExpectationSessionStatus {
  const match = sessions.find(
    (session) =>
      (session.expectation_id && session.expectation_id === expectation.id) ||
      (session.workout_id && session.workout_id === expectation.workout_id && session.log_date === expectation.scheduled_date)
  );
  const status = match?.status;
  if (status === 'completed' || status === 'partial' || status === 'skipped' || status === 'in_progress' || status === 'not_started') {
    return status;
  }
  return null;
}

export default function UnifiedTrainingSchedule({ userId, teams, onStartWorkout }: Props) {
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [programNames, setProgramNames] = useState<Record<string, string>>({});
  const [expectations, setExpectations] = useState<ExpectationRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayYmd();
  const weekStart = mondayOfWeek(today);
  const weekEnd = addDaysYmd(weekStart, 6);
  const upcomingEnd = addDaysYmd(weekStart, 13);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const enrollmentResult = await supabase
      .from('st_training_enrollments')
      .select('id, source_key, source_kind, team_id, program_id, status, schedule_visible, expectation_enabled')
      .eq('user_id', userId)
      .order('source_kind', { ascending: true });
    if (enrollmentResult.error) {
      if (scheduleSetupMissing(enrollmentResult.error.message)) {
        setPending(true);
        setEnrollments([]);
        setExpectations([]);
        setLoading(false);
        return;
      }
      setError(enrollmentResult.error.message);
      setLoading(false);
      return;
    }
    const repair = await repairFollowedTrainingSchedule(supabase, today);
    if (repair.pending) {
      setPending(true);
      setLoading(false);
      return;
    }
    const refreshed = repair.error
      ? enrollmentResult
      : await supabase
          .from('st_training_enrollments')
          .select('id, source_key, source_kind, team_id, program_id, status, schedule_visible, expectation_enabled')
          .eq('user_id', userId)
          .order('source_kind', { ascending: true });
    const rows = ((refreshed.data || []) as EnrollmentRow[]).filter((row) => row.status !== 'ended');
    setEnrollments(rows);
    const programIds = [...new Set(rows.map((row) => row.program_id).filter(Boolean))] as string[];
    if (programIds.length) {
      const programs = await supabase.from('st_programs').select('id, name').in('id', programIds);
      const names: Record<string, string> = {};
      for (const program of programs.data || []) names[program.id] = program.name || 'Program';
      setProgramNames(names);
    } else {
      setProgramNames({});
    }
    const visibleKeys = new Set(rows.filter((row) => row.schedule_visible && row.status === 'active').map((row) => row.source_key));
    const expectationResult = await supabase
      .from('st_training_expectations')
      .select('id, source_key, team_id, program_id, workout_id, scheduled_date, title, excused')
      .eq('user_id', userId)
      .gte('scheduled_date', weekStart)
      .lte('scheduled_date', upcomingEnd)
      .order('scheduled_date', { ascending: true });
    if (expectationResult.error && !scheduleSetupMissing(expectationResult.error.message)) {
      setError(expectationResult.error.message);
    }
    const visible = ((expectationResult.data || []) as ExpectationRow[]).filter((row) => visibleKeys.has(row.source_key));
    setExpectations(visible);
    const sessionResult = await supabase
      .from('st_workout_sessions')
      .select('expectation_id, workout_id, log_date, status')
      .eq('user_id', userId)
      .gte('log_date', weekStart)
      .lte('log_date', upcomingEnd);
    setSessions((sessionResult.data || []) as SessionRow[]);
    setPending(false);
    setLoading(false);
  }, [userId, today, weekStart, upcomingEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamName = (teamId: string | null, sourceKey: string) => {
    if (sourceKey === 'personal') return 'Personal';
    return teams.find((team) => team.id === teamId)?.name || sourceLabel(sourceKey);
  };

  const itemsFor = (date: string) => expectations.filter((row) => row.scheduled_date === date);

  async function toggleVisible(row: EnrollmentRow) {
    setBusyId(row.id);
    const result = await setEnrollmentScheduleVisible(supabase, row.id, !row.schedule_visible);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function toggleExpectation(row: EnrollmentRow) {
    const next = !row.expectation_enabled;
    if (!next) {
      const label = teamName(row.team_id, row.source_key);
      const ok = window.confirm(
        `Stop expecting future workouts from ${label}? Workouts already on the schedule stay in your history. This does not leave the group.`
      );
      if (!ok) return;
    }
    setBusyId(row.id);
    const result = await setEnrollmentExpectation(supabase, row.id, next, today);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  function renderItem(row: ExpectationRow, showStart: boolean) {
    const state = expectationDisplayState({
      scheduledDate: row.scheduled_date,
      localToday: today,
      excused: row.excused,
      sessionStatus: sessionFor(row, sessions),
    });
    return (
      <div key={row.id} className="schedule-item">
        <div>
          <b>{row.title}</b>
          <div className="muted">{teamName(row.team_id, row.source_key)}</div>
        </div>
        <div className="schedule-item-actions">
          <span className={`schedule-state schedule-state--${state.toLowerCase()}`}>{state}</span>
          {showStart && state !== 'Completed' && state !== 'Excused' && (
            <button
              type="button"
              className="btn small green"
              onClick={() =>
                onStartWorkout({
                  expectationId: row.id,
                  workoutId: row.workout_id,
                  programId: row.program_id,
                  scheduledDate: row.scheduled_date,
                  sourceKey: row.source_key,
                  teamId: row.team_id,
                })
              }
            >
              Start Workout
            </button>
          )}
        </div>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="card">
        <h2>Training</h2>
        <p className="muted">Apply the unified training schedule migration to see today, this week, and each program together.</p>
      </div>
    );
  }

  const todayItems = itemsFor(today);
  const upcomingStart = addDaysYmd(weekEnd, 1);

  return (
    <div className="unified-schedule">
      {error && <div className="card"><p className="muted">{error}</p></div>}
      <div className="card">
        <h2>Today</h2>
        {loading && <p className="muted">Loading your schedule…</p>}
        {!loading && todayItems.length === 0 && <p className="muted">Nothing scheduled today.</p>}
        {todayItems.map((row) => renderItem(row, true))}
      </div>
      <div className="card">
        <h2>This week</h2>
        {WEEKDAYS.map((label, index) => {
          const date = addDaysYmd(weekStart, index);
          const items = itemsFor(date);
          return (
            <div key={date} className="schedule-day">
              <div className="schedule-day-label">
                {label}
                <span className="muted"> {formatDisplayDate(date)}</span>
              </div>
              {items.length === 0 && <p className="muted">Rest</p>}
              {items.map((row) => renderItem(row, date === today))}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2>Upcoming</h2>
        <p className="muted">Next week. Later weeks stay on the program and are not loaded here.</p>
        {Array.from({ length: 7 }, (_, index) => addDaysYmd(upcomingStart, index))
          .filter((date) => itemsFor(date).length > 0)
          .map((date) => (
            <div key={date} className="schedule-day">
              <div className="schedule-day-label">{formatDisplayDate(date)}</div>
              {itemsFor(date).map((row) => renderItem(row, false))}
            </div>
          ))}
        {!loading && expectations.every((row) => row.scheduled_date <= weekEnd) && <p className="muted">Nothing in the next week yet.</p>}
      </div>
      <div className="card">
        <h2>Programs</h2>
        {enrollments.length === 0 && <p className="muted">No programs yet. Follow a program or join a group to put it on this schedule.</p>}
        {enrollments.map((row) => {
          const name = (row.program_id && programNames[row.program_id]) || 'Program';
          const label = teamName(row.team_id, row.source_key);
          return (
            <div key={row.id} className="schedule-source">
              <div>
                <b>{label}</b>
                <div className="muted">{name}</div>
                {row.status !== 'active' && <div className="muted">{row.status}</div>}
                <div className="muted">{row.expectation_enabled ? 'Expected on this schedule' : 'Not counting future workouts'}</div>
                {row.expectation_enabled && !row.schedule_visible && row.source_kind === 'group' && (
                  <p className="muted">This training still counts toward your Group schedule.</p>
                )}
              </div>
              <div className="schedule-item-actions">
                <button type="button" className="btn small secondary" disabled={busyId === row.id} onClick={() => void toggleVisible(row)}>
                  {row.schedule_visible ? 'Hide from Training calendar' : 'Show on Training calendar'}
                </button>
                <button type="button" className="btn small secondary" disabled={busyId === row.id} onClick={() => void toggleExpectation(row)}>
                  {row.expectation_enabled ? 'Stop expected participation' : 'Expect this schedule'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { ExpectationDisplayState };
