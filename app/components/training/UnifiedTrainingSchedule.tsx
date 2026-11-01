'use client';

import { useCallback, useEffect, useState } from 'react';
import { completeScreenPhase } from '../../../lib/performance/screenTiming';
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
  setEnrollmentExpectation,
  setEnrollmentScheduleVisible,
} from '../../../lib/training/scheduleActions';
import { type ExpectationDisplayState } from '../../../lib/training/unifiedSchedule';
import { resolveFollowedAssignmentSource } from '../../../lib/training/trainingSource';
import {
  loadVisibleSchedule,
  scheduleTeamLabel,
  type VisibleScheduleEnrollment,
} from '../../../lib/training/visibleSchedule';

export type ScheduleStartItem = {
  expectationId: string;
  workoutId: string | null;
  programId: string | null;
  scheduledDate: string;
  sourceKey: string;
  teamId: string | null;
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
  followedSourceProgramId?: string | null;
  followedProgramId?: string | null;
  workoutsById?: Record<string, any>;
};

type Props = {
  userId: string;
  teams: Array<{ id: string; name?: string | null }>;
  rangeFrom: string;
  rangeTo: string;
  calendar: CalendarProps;
};

export default function UnifiedTrainingSchedule({ userId, teams, rangeFrom, rangeTo, calendar }: Props) {
  const [enrollments, setEnrollments] = useState<VisibleScheduleEnrollment[]>([]);
  const [programNames, setProgramNames] = useState<Record<string, string>>({});
  const [visibleExpectations, setVisibleExpectations] = useState<VisibleScheduleExpectation[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayYmd();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const snapshot = await loadVisibleSchedule(supabase, { userId, teams, rangeFrom, rangeTo, today });
    setPending(snapshot.pending);
    setError(snapshot.error);
    setEnrollments(snapshot.pending ? [] : snapshot.enrollments);
    setProgramNames(snapshot.pending ? {} : snapshot.programNames);
    setVisibleExpectations(snapshot.pending ? [] : snapshot.expectations);
    setLoading(false);
    completeScreenPhase('Training', 'schedule');
  }, [userId, teams, today, rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamName = (teamId: string | null, sourceKey: string) => scheduleTeamLabel(teams, teamId, sourceKey);

  const sourceProgramId = calendar.followedSourceProgramId || null;
  const followedSource = resolveFollowedAssignmentSource({
    followedProgramId: calendar.followedProgramId,
    enrollments: enrollments.map((row) => ({
      status: row.status,
      programId: row.program_id,
      sourceKey: row.source_key,
      teamId: row.team_id,
      teamName: teamName(row.team_id, row.source_key),
    })),
  });
  const calendarToday = calendar.today ? overlayVisibleExpectations(calendar.today, visibleExpectations, today, sourceProgramId, followedSource) : null;
  const calendarTomorrow = calendar.tomorrow ? overlayVisibleExpectations(calendar.tomorrow, visibleExpectations, today, sourceProgramId, followedSource) : null;
  const calendarWeek = calendar.weekDays.map((day) => overlayVisibleExpectations(day, visibleExpectations, today, sourceProgramId, followedSource));
  const calendarMonth = calendar.monthCells.map((cell) => ({
    ...cell,
    plan: cell.plan ? overlayVisibleExpectations(cell.plan, visibleExpectations, today, sourceProgramId, followedSource) : cell.plan,
  }));

  async function toggleVisible(row: VisibleScheduleEnrollment) {
    setBusyId(row.id);
    const result = await setEnrollmentScheduleVisible(supabase, row.id, !row.schedule_visible);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function toggleExpectation(row: VisibleScheduleEnrollment) {
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
