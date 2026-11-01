'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { logMapForDate } from '../../../lib/programDesign/activityCompletion';
import type { ProgramActivity, ProgramDesignRecord } from '../../../lib/programDesign/types';
import type { UserCalendarActivity } from '../../../lib/programDesign/userCalendar';
import { workoutDayMovesFromActivities, type WorkoutDayMoves } from '../../../lib/programDesign/workoutDayMoves';
import { formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';
import { resolveFollowedAssignmentSource } from '../../../lib/training/trainingSource';
import { trainingStatusClass } from '../../../lib/training/trainingDayCard';
import {
  classifyTodayTraining,
  composeTodayTrainingPlan,
  navigationForTodayTraining,
  type TodayTrainingNavigation,
  type TodayTrainingNotice,
} from '../../../lib/training/todayTraining';
import { beginScreenPaint, finishScreenPaint, readScreenCache, subscribeScreenSession, writeScreenCache } from '../../../lib/performance/screenSession';
import { beginBackgroundRefresh, endBackgroundRefresh, noteCalendarUsable } from '../../../lib/performance/screenTiming';
import { enrollmentSyncSettled } from '../../../lib/training/enrollmentSyncGate';
import { loadVisibleSchedule, refreshVisibleSchedule, scheduleTeamLabel, type VisibleScheduleSnapshot } from '../../../lib/training/visibleSchedule';

type TodaysTrainingHeroProps = {
  userId: string;
  teams: Array<{ id: string; name?: string | null }>;
  inputsReady: boolean;
  programReady?: boolean;
  scheduleRepairGeneration?: number;
  loadError?: string | null;
  program: ProgramDesignRecord | null;
  programName?: string | null;
  followedFromGroup?: string | null;
  followedSourceProgramId?: string | null;
  activities: ProgramActivity[];
  calendarActivities: UserCalendarActivity[];
  workouts: Array<{ id?: string; st_exercises?: unknown[] }>;
  progressLogs: Array<{ planned_set_id?: string; log_date?: string; completed?: boolean }>;
  sessionLogs: Record<string, { planned_set_id?: string; log_date?: string; completed?: boolean } | undefined>;
  moves?: WorkoutDayMoves;
  onNavigate: (navigation: TodayTrainingNavigation) => void;
};

function ScheduleNotice({ notice, onRetry }: { notice: TodayTrainingNotice | null; onRetry: () => void }) {
  if (!notice) return null;
  if (notice.kind === 'pending') {
    return (
      <p className="muted today-training-notice">
        Apply the unified training schedule migration to show every personal and group program here. Your followed plan and added activities still appear.
      </p>
    );
  }
  return (
    <div className="today-training-empty today-training-notice">
      <p className="muted">{notice.message} This is not the full schedule.</p>
      <button type="button" className="btn secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export default function TodaysTrainingHero({
  userId,
  teams,
  inputsReady,
  programReady = true,
  scheduleRepairGeneration = 0,
  loadError,
  program,
  programName,
  followedFromGroup,
  followedSourceProgramId,
  activities,
  calendarActivities,
  workouts,
  progressLogs,
  sessionLogs,
  moves,
  onNavigate,
}: TodaysTrainingHeroProps) {
  const today = todayYmd();
  const teamsKey = teams.map((team) => `${team.id}:${team.name || ''}`).join('|');
  const heroKey = `training|${today}|${teamsKey}`;
  const [snapshot, setSnapshot] = useState<VisibleScheduleSnapshot | null>(() => {
    if (!userId) return null;
    return readScreenCache<VisibleScheduleSnapshot>(userId, 'dashboard', heroKey, today, {
      dateScoped: true,
      staleAreas: ['dashboard', 'schedule', 'program'],
    })?.value || null;
  });
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(!snapshot);
  const [repairSettled, setRepairSettled] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionTick, setSessionTick] = useState(0);
  useEffect(() => subscribeScreenSession(() => setSessionTick((value) => value + 1)), []);

  useEffect(() => {
    if (!userId || !inputsReady) return;
    let cancelled = false;
    const paint = beginScreenPaint<VisibleScheduleSnapshot>('Dashboard', userId, 'dashboard', heroKey, today, {
      dateScoped: true,
      staleAreas: ['dashboard', 'schedule', 'program'],
    });
    const request = { userId, teams, rangeFrom: today, rangeTo: today, today };
    async function paintSchedule() {
      try {
        if (paint.cached && !paint.cached.keepPrevious) {
          setSnapshot(paint.cached);
          setSnapshotError(paint.cached.error);
          setSnapshotLoading(false);
          noteCalendarUsable('Dashboard');
          finishScreenPaint('Dashboard', userId, ['dashboard'], paint.background);
          return;
        }
        setSnapshotLoading(true);
        const next = await loadVisibleSchedule(supabase, request);
        if (cancelled) return;
        if (!next.keepPrevious) {
          writeScreenCache(userId, 'dashboard', heroKey, next, today);
          setSnapshot(next);
        }
        setSnapshotError(next.error);
        setSnapshotLoading(false);
        noteCalendarUsable('Dashboard');
        finishScreenPaint('Dashboard', userId, ['dashboard'], false);
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message || '') : '';
        setSnapshotError(message || 'Could not load today’s training.');
        setSnapshotLoading(false);
      }
    }
    void paintSchedule();
    return () => {
      cancelled = true;
    };
  }, [userId, inputsReady, today, teamsKey, heroKey, teams]);

  useEffect(() => {
    if (!userId || !inputsReady) return;
    if (!scheduleRepairGeneration && !reloadKey) return;
    let cancelled = false;
    const request = { userId, teams, rangeFrom: today, rangeTo: today, today };
    async function repairSchedule() {
      await enrollmentSyncSettled();
      if (cancelled) return;
      setRepairSettled(false);
      beginBackgroundRefresh('Dashboard');
      try {
        const refreshed = await refreshVisibleSchedule(supabase, request);
        if (cancelled) return;
        if (refreshed.keepPrevious) {
          setSnapshot((current) => current);
          if (refreshed.error) setSnapshotError(refreshed.error);
          return;
        }
        writeScreenCache(userId, 'dashboard', heroKey, refreshed, today);
        setSnapshot(refreshed);
        setSnapshotError(refreshed.error);
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message || '') : '';
        setSnapshotError(message || 'Could not load today’s training.');
      } finally {
        endBackgroundRefresh('Dashboard');
        if (!cancelled) setRepairSettled(true);
      }
    }
    void repairSchedule();
    return () => {
      cancelled = true;
    };
  }, [userId, inputsReady, today, reloadKey, teamsKey, heroKey, sessionTick, teams, scheduleRepairGeneration]);

  const dayMoves = moves || workoutDayMovesFromActivities(calendarActivities);
  const logMap = useMemo(
    () => logMapForDate(today, progressLogs, sessionLogs, today),
    [today, progressLogs, sessionLogs]
  );
  const workoutsById = useMemo(() => {
    const byId: Record<string, { id?: string }> = {};
    workouts.forEach((workout) => {
      if (workout?.id) byId[String(workout.id)] = workout;
    });
    return byId;
  }, [workouts]);

  const followedSource = useMemo(
    () =>
      resolveFollowedAssignmentSource({
        followedProgramId: program?.id || null,
        enrollments: (snapshot?.enrollments || []).map((row) => ({
          status: row.status,
          programId: row.program_id,
          sourceKey: row.source_key,
          teamId: row.team_id,
          teamName: scheduleTeamLabel(teams, row.team_id, row.source_key),
        })),
      }),
    [program?.id, snapshot?.enrollments, teams]
  );

  const plan = useMemo(() => {
    if (!inputsReady || snapshotLoading) return null;
    if (!snapshot && !snapshotError) return null;
    return composeTodayTrainingPlan({
      program,
      activities,
      calendarActivities,
      moves: dayMoves,
      workouts,
      progressLogs,
      sessionLogs,
      expectations: snapshot?.expectations || [],
      today,
      followedSourceProgramId,
      followedSource,
    });
  }, [
    inputsReady,
    snapshotLoading,
    snapshot,
    snapshotError,
    program,
    activities,
    calendarActivities,
    dayMoves,
    workouts,
    progressLogs,
    sessionLogs,
    today,
    followedSourceProgramId,
    followedSource,
  ]);

  const model = classifyTodayTraining({
    loading: !inputsReady || snapshotLoading,
    failed: !!loadError,
    programConfigured: !!program,
    plan,
    workoutsById,
    logMap,
    programNames: snapshot?.programNames || {},
    followedProgramName: programName,
    schedulePending: !!snapshot?.pending,
    scheduleError: loadError ? null : snapshotError,
    scheduleRepairing: inputsReady && !repairSettled,
    programReady,
  });

  const following = programName
    ? `Following ${programName}${followedFromGroup ? ` · from ${followedFromGroup}` : ''}`
    : null;

  return (
    <section className="dash-card dash-featured today-training" aria-labelledby="today-training-heading" data-today-state={model.state}>
      <div className="dash-card-head">
        <h2 id="today-training-heading">Today&apos;s training</h2>
        <span className="badge">{formatDisplayDate(today)}</span>
      </div>
      {following && model.state !== 'loading' && model.state !== 'error' ? <p className="muted today-training-following">{following}</p> : null}
      {model.state !== 'loading' && model.state !== 'error' ? (
        <ScheduleNotice notice={model.notice} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : null}

      {model.state === 'loading' && <p className="muted">Loading today&apos;s training…</p>}

      {model.state === 'error' && (
        <div className="today-training-empty">
          <p className="muted">Today&apos;s training could not be loaded.</p>
          <button type="button" className="btn secondary" onClick={() => setReloadKey((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      {model.state === 'no-program' && (
        <div className="today-training-empty">
          <p className="muted">No program yet. Follow a plan to see today&apos;s training.</p>
          <button type="button" className="btn green" onClick={() => onNavigate({ kind: 'programs' })}>
            Set up program
          </button>
        </div>
      )}

      {model.state === 'rest' && (
        <div className="today-training-empty">
          <p className="muted">Rest day. Nothing is scheduled to train.</p>
          <button type="button" className="btn secondary" onClick={() => onNavigate({ kind: 'calendar' })}>
            View calendar
          </button>
        </div>
      )}

      {model.state === 'empty' && (
        <div className="today-training-empty">
          <p className="muted">No activities today.</p>
          <button type="button" className="btn secondary" onClick={() => onNavigate({ kind: 'calendar' })}>
            View calendar
          </button>
        </div>
      )}

      {model.state === 'activities' && (
        <>
          <div className="today-training-list">
            {model.rows.map((row, index) => {
              const openPreview = () => {
                if (!row.canPreview) return;
                onNavigate(navigationForTodayTraining({ item: row.item, date: today, action: 'preview' }));
              };
              return (
                <article key={row.item.id} className="today-training-item">
                  <div className="today-training-item-main">
                    {row.canPreview ? (
                      <button type="button" className="today-training-name" onClick={openPreview}>
                        {row.name}
                      </button>
                    ) : (
                      <h3 className="today-training-name">{row.name}</h3>
                    )}
                    {row.meta ? <p className="muted today-training-meta">{row.meta}</p> : null}
                    {row.movedLabel ? <p className="muted today-training-moved">{row.movedLabel}</p> : null}
                    {row.status ? <span className={trainingStatusClass(row.status)}>{row.status}</span> : null}
                  </div>
                  {row.action ? (
                    <div className="today-training-actions">
                      <button
                        type="button"
                        className={`btn ${index === 0 && (row.action === 'Start' || row.action === 'Continue') ? 'green' : 'secondary'}`}
                        onClick={() => onNavigate(navigationForTodayTraining({ item: row.item, date: today, action: row.action }))}
                      >
                        {row.action}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          {model.hiddenCount > 0 && (
            <button type="button" className="btn secondary today-training-more" onClick={() => onNavigate({ kind: 'calendar' })}>
              View all on calendar
            </button>
          )}
        </>
      )}
    </section>
  );
}
