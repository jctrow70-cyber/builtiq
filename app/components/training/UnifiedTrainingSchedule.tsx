'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import TrainingExecution from './TrainingExecution';
import {
  overlayVisibleExpectations,
  type TrainingDayItem,
  type TrainingDayPlan,
  type TrainingMonthCell,
  type VisibleScheduleExpectation,
} from '../../../lib/programDesign/trainingSchedule';
import { todayYmd } from '../../../lib/training/programCalendar';
import {
  repairFollowedTrainingSchedule,
  scheduleSetupMissing,
  setEnrollmentExpectation,
  setEnrollmentScheduleVisible,
} from '../../../lib/training/scheduleActions';
import {
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

type CalendarProps = {
  programName: string | null;
  followedFromGroup?: string | null;
  followingGroupTemplate?: boolean;
  personalizedCopy?: boolean;
  onCustomizeForMe?: () => void;
  customizeBusy?: boolean;
  today: TrainingDayPlan | null;
  tomorrow: TrainingDayPlan | null;
  weekDays: TrainingDayPlan[];
  monthCells: TrainingMonthCell[];
  monthLabel: string;
  selectedDate: string;
  weekNumber: number;
  totalWeeks: number;
  calendarView: 'day' | 'week' | 'month';
  onCalendarViewChange: (view: 'day' | 'week' | 'month') => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onThisMonth: () => void;
  onSelectDay: (date: string) => void;
  onStartWorkout: (item: TrainingDayItem, date: string) => void;
  onViewWorkout?: (item: TrainingDayItem, date: string) => void;
  onOpenPrograms: () => void;
  onAddActivity?: (date: string) => void;
  onEditActivity?: (activityId: string, date: string) => void;
  onSetupWorkout?: (activityId: string, date: string) => void;
  onCompleteItem?: (item: TrainingDayItem, date: string) => void;
  onMoveItem?: (item: TrainingDayItem, date: string) => void;
  completingItemId?: string | null;
  completedDates?: string[];
};

type Props = {
  userId: string;
  teams: Array<{ id: string; name?: string | null }>;
  rangeFrom: string;
  rangeTo: string;
  calendar: CalendarProps;
};

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

export default function UnifiedTrainingSchedule({ userId, teams, rangeFrom, rangeTo, calendar }: Props) {
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [programNames, setProgramNames] = useState<Record<string, string>>({});
  const [expectations, setExpectations] = useState<ExpectationRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayYmd();

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
    const programIds = rows.reduce<string[]>((ids, row) => {
      if (row.program_id && ids.indexOf(row.program_id) === -1) ids.push(row.program_id);
      return ids;
    }, []);
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
      .gte('scheduled_date', rangeFrom)
      .lte('scheduled_date', rangeTo)
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
      .gte('log_date', rangeFrom)
      .lte('log_date', rangeTo);
    setSessions((sessionResult.data || []) as SessionRow[]);
    setPending(false);
    setLoading(false);
  }, [userId, today, rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamName = (teamId: string | null, sourceKey: string) => {
    if (sourceKey === 'personal') return 'Personal';
    return teams.find((team) => team.id === teamId)?.name || sourceLabel(sourceKey);
  };

  const visibleExpectations = useMemo<VisibleScheduleExpectation[]>(() => {
    return expectations.map((row) => ({
      id: row.id,
      workoutId: row.workout_id,
      programId: row.program_id,
      scheduledDate: row.scheduled_date,
      title: row.title,
      sourceKey: row.source_key,
      teamId: row.team_id,
      sourceName: teamName(row.team_id, row.source_key),
      excused: row.excused,
      sessionStatus: sessionFor(row, sessions),
    }));
  }, [expectations, sessions, teams]);

  const calendarToday = calendar.today ? overlayVisibleExpectations(calendar.today, visibleExpectations, today) : null;
  const calendarTomorrow = calendar.tomorrow ? overlayVisibleExpectations(calendar.tomorrow, visibleExpectations, today) : null;
  const calendarWeek = calendar.weekDays.map((day) => overlayVisibleExpectations(day, visibleExpectations, today));
  const calendarMonth = calendar.monthCells.map((cell) => ({
    ...cell,
    plan: cell.plan ? overlayVisibleExpectations(cell.plan, visibleExpectations, today) : cell.plan,
  }));

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

  return (
    <div className="unified-schedule">
      {pending && (
        <div className="card">
          <p className="muted">Apply the unified training schedule migration to show every personal and group program on this calendar. Your followed plan and added activities still appear.</p>
        </div>
      )}
      {error && <div className="card"><p className="muted">{error}</p></div>}
      {loading && <p className="muted">Loading your schedule…</p>}
      <TrainingExecution
        {...calendar}
        today={calendarToday}
        tomorrow={calendarTomorrow}
        weekDays={calendarWeek}
        monthCells={calendarMonth}
      />
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
