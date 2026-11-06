'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { completeScreenPhase, noteCalendarUsable, beginBackgroundRefresh, endBackgroundRefresh } from '../../../lib/performance/screenTiming';
import { beginScreenPaint, finishScreenPaint, readScreenCache, writeScreenCache } from '../../../lib/performance/screenSession';
import { supabase } from '../../../lib/supabaseClient';
import TrainingExecution from './TrainingExecution';
import {
  overlayVisibleExpectations,
  programLineageIds,
  type TrainingDayItem,
  type TrainingDayPlan,
  type TrainingMonthCell,
  type VisibleScheduleExpectation,
} from '../../../lib/programDesign/trainingSchedule';
import type { WorkoutDayMoves } from '../../../lib/programDesign/workoutDayMoves';
import { enrollmentSyncSettled } from '../../../lib/training/enrollmentSyncGate';
import { todayYmd } from '../../../lib/training/programCalendar';
import {
  setEnrollmentExpectation,
  setEnrollmentScheduleVisible,
} from '../../../lib/training/scheduleActions';
import { type ExpectationDisplayState } from '../../../lib/training/unifiedSchedule';
import { resolveFollowedAssignmentSource } from '../../../lib/training/trainingSource';
import {
  loadVisibleSchedule,
  refreshVisibleSchedule,
  scheduleTeamLabel,
  type VisibleScheduleEnrollment,
  type VisibleScheduleSnapshot,
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
  /** Personal this-time moves. Expectations keep stored dates; the overlay honors these. */
  workoutDayMoves?: WorkoutDayMoves;
};

type Props = {
  userId: string;
  teams: Array<{ id: string; name?: string | null }>;
  rangeFrom: string;
  rangeTo: string;
  scheduleRefreshKey?: number;
  scheduleRepairGeneration?: number;
  calendar: CalendarProps;
};

export default function UnifiedTrainingSchedule({ userId, teams, rangeFrom, rangeTo, scheduleRefreshKey = 0, scheduleRepairGeneration = 0, calendar }: Props) {
  const today = todayYmd();
  const cacheKey = `${today}|${rangeFrom}|${rangeTo}`;
  const opening = readScreenCache<VisibleScheduleSnapshot>(userId, 'schedule', cacheKey, today, {
    dateScoped: true,
    staleAreas: ['schedule', 'program'],
  });
  const [enrollments, setEnrollments] = useState<VisibleScheduleEnrollment[]>(opening?.value.pending ? [] : opening?.value.enrollments || []);
  const [programNames, setProgramNames] = useState<Record<string, string>>(opening?.value.pending ? {} : opening?.value.programNames || {});
  const [programSources, setProgramSources] = useState<Record<string, string | null>>(opening?.value.pending ? {} : opening?.value.programSources || {});
  const [visibleExpectations, setVisibleExpectations] = useState<VisibleScheduleExpectation[]>(opening?.value.pending ? [] : opening?.value.expectations || []);
  const [pending, setPending] = useState(!!opening?.value.pending);
  const [error, setError] = useState<string | null>(opening?.value.error || null);
  const [loading, setLoading] = useState(!opening);
  const [repairSettled, setRepairSettled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadGen = useRef(0);

  const applySnapshot = useCallback((snapshot: VisibleScheduleSnapshot) => {
    if (snapshot.keepPrevious) {
      setPending(snapshot.pending);
      if (snapshot.error) setError(snapshot.error);
      return;
    }
    setPending(snapshot.pending);
    setError(snapshot.error);
    setEnrollments(snapshot.pending ? [] : snapshot.enrollments);
    setProgramNames(snapshot.pending ? {} : snapshot.programNames);
    setProgramSources(snapshot.pending ? {} : snapshot.programSources || {});
    setVisibleExpectations(snapshot.pending ? [] : snapshot.expectations);
  }, []);

  const paint = useCallback(async () => {
    const gen = ++loadGen.current;
    const painted = beginScreenPaint<VisibleScheduleSnapshot>('Training', userId, 'schedule', cacheKey, today, {
      dateScoped: true,
      staleAreas: ['schedule', 'program'],
    });
    if (painted.cached) {
      if (!painted.cached.keepPrevious) applySnapshot(painted.cached);
      setLoading(false);
      noteCalendarUsable('Training');
      finishScreenPaint('Training', userId, ['schedule'], painted.background);
      completeScreenPhase('Training', 'schedule');
      return;
    }
    setLoading(true);
    setError(null);
    const snapshot = await loadVisibleSchedule(supabase, { userId, teams, rangeFrom, rangeTo, today });
    if (gen !== loadGen.current) return;
    applySnapshot(snapshot);
    if (!snapshot.keepPrevious) writeScreenCache(userId, 'schedule', cacheKey, snapshot, today);
    setLoading(false);
    noteCalendarUsable('Training');
    finishScreenPaint('Training', userId, ['schedule'], false);
    completeScreenPhase('Training', 'schedule');
  }, [userId, teams, today, rangeFrom, rangeTo, applySnapshot, cacheKey]);

  const repair = useCallback(async () => {
    if (!scheduleRepairGeneration && !scheduleRefreshKey) return;
    await enrollmentSyncSettled();
    const gen = ++loadGen.current;
    setRepairSettled(false);
    beginBackgroundRefresh('Training');
    try {
      const refreshed = await refreshVisibleSchedule(supabase, { userId, teams, rangeFrom, rangeTo, today });
      if (gen !== loadGen.current) return;
      applySnapshot(refreshed);
      if (!refreshed.keepPrevious) writeScreenCache(userId, 'schedule', cacheKey, refreshed, today);
    } finally {
      if (gen === loadGen.current) {
        setRepairSettled(true);
        endBackgroundRefresh('Training');
      }
    }
  }, [userId, teams, today, rangeFrom, rangeTo, scheduleRefreshKey, scheduleRepairGeneration, applySnapshot, cacheKey]);

  useEffect(() => {
    void paint();
  }, [paint]);

  useEffect(() => {
    void repair();
  }, [repair]);

  const teamName = (teamId: string | null, sourceKey: string) => scheduleTeamLabel(teams, teamId, sourceKey);

  const sourceProgramId = calendar.followedSourceProgramId || null;
  const lineage = programLineageIds({
    followedProgramId: calendar.followedProgramId,
    followedSourceProgramId: sourceProgramId,
    programSources,
  });
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
  const dayMoves = calendar.workoutDayMoves || {};
  const calendarToday = calendar.today ? overlayVisibleExpectations(calendar.today, visibleExpectations, today, sourceProgramId, followedSource, lineage, dayMoves) : null;
  const calendarTomorrow = calendar.tomorrow ? overlayVisibleExpectations(calendar.tomorrow, visibleExpectations, today, sourceProgramId, followedSource, lineage, dayMoves) : null;
  const calendarWeek = calendar.weekDays.map((day) => overlayVisibleExpectations(day, visibleExpectations, today, sourceProgramId, followedSource, lineage, dayMoves));
  const calendarMonth = calendar.monthCells.map((cell) => ({
    ...cell,
    plan: cell.plan ? overlayVisibleExpectations(cell.plan, visibleExpectations, today, sourceProgramId, followedSource, lineage, dayMoves) : cell.plan,
  }));

  async function toggleVisible(row: VisibleScheduleEnrollment) {
    setBusyId(row.id);
    const result = await setEnrollmentScheduleVisible(supabase, row.id, !row.schedule_visible);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await paint();
    await repair();
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
    await paint();
    await repair();
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
        {repairSettled && enrollments.length === 0 && <p className="muted">No programs yet. Follow a program or join a group to put it on this schedule.</p>}
        {!repairSettled && enrollments.length === 0 && <p className="muted">Checking your schedule…</p>}
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
