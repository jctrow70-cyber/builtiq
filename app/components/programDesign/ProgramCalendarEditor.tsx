'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionHeader from '../ui/SectionHeader';
import WeeklyHealthCalendar from './WeeklyHealthCalendar';
import ProgramMonthCalendar from './ProgramMonthCalendar';
import ProgramDaySummary from './ProgramDaySummary';
import AddActivitySheet from './AddActivitySheet';
import ImportWorkoutsSheet from './ImportWorkoutsSheet';
import PushToMembersSheet from './PushToMembersSheet';
import ProgramWorkoutPlan, { type WorkoutFocusMode } from './ProgramWorkoutPlan';
import ProgramCriteriaPanel from './ProgramCriteriaPanel';
import SegmentedControl from '../ui/SegmentedControl';
import { cycleLengthOf, dateForProgramDay, formatProgramRange, programDateRange } from '../../../lib/programDesign/cycle';
import { lifecycleLabel, lifecycleStatusOf } from '../../../lib/programDesign/lifecycle';
import { programEditAudience, programEditScopeCopy, willCreatePersonalizedCopy } from '../../../lib/programDesign/enrollment';
import {
  activitiesForDay,
  activitiesFromLegacyWorkouts,
  copyWeekActivities,
  createProgramActivity,
  deleteProgramActivity,
  fetchLegacyWorkouts,
  fetchProgramActivities,
  nextSortOrder,
  setProgramLifecycle,
  updateDesignProgram,
  updateProgramActivity,
} from '../../../lib/programDesign/programDesignApi';
import type {
  ActivityDraft,
  ProgramActivity,
  ProgramDesignRecord,
  ProgramLifecycleStatus,
} from '../../../lib/programDesign/types';
import { draftWeekdays } from '../../../lib/programDesign/recurrence';
import {
  monthCalendarCells,
  monthLabel as formatMonthLabel,
  shiftYearMonth,
  yearMonthOf,
} from '../../../lib/programDesign/trainingSchedule';
import {
  defaultProgramDate,
  readPreferredCalendarView,
  rememberCalendarView,
  selectProgramDate,
  type ProgramCalendarView,
} from '../../../lib/programDesign/programCalendarView';
import { addDaysYmd, todayYmd } from '../../../lib/training/programCalendar';

type ProgramCalendarEditorProps = {
  supabase: SupabaseClient;
  program: ProgramDesignRecord;
  programs: ProgramDesignRecord[];
  ownerUserId: string;
  canEdit: boolean;
  canEditGroupTemplate?: boolean;
  isFollowing?: boolean;
  groups?: { id: string; name: string; my_role?: string | null }[];
  pushTeamId?: string | null;
  audienceBusy?: boolean;
  personalPrograms?: ProgramDesignRecord[];
  onEditAudienceChange?: (next: 'group' | 'me') => Promise<void>;
  onBack: () => void;
  onProgramChange: (program: ProgramDesignRecord) => void;
  onFollow?: () => Promise<void>;
  onShareWithGroup?: (teamId: string) => Promise<void>;
  onBuildWorkouts?: () => void;
  justBuiltMessage?: string | null;
};

export default function ProgramCalendarEditor({
  supabase,
  program,
  programs,
  ownerUserId,
  canEdit,
  canEditGroupTemplate = false,
  isFollowing,
  groups = [],
  pushTeamId = null,
  audienceBusy = false,
  personalPrograms = [],
  onEditAudienceChange,
  onBack,
  onProgramChange,
  onFollow,
  onShareWithGroup,
  onBuildWorkouts,
  justBuiltMessage = null,
}: ProgramCalendarEditorProps) {
  const totalWeeks = cycleLengthOf(program);
  const { start, end } = programDateRange(program);
  const initialDate = defaultProgramDate(start, totalWeeks);
  const initialPick = selectProgramDate(start, initialDate, totalWeeks);

  const [week, setWeek] = useState(initialPick.week);
  const [selectedDate, setSelectedDate] = useState(initialPick.date);
  const [calendarView, setCalendarView] = useState<ProgramCalendarView>('week');
  const [yearMonth, setYearMonth] = useState(yearMonthOf(initialPick.date));
  const [activities, setActivities] = useState<ProgramActivity[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [tableReady, setTableReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheetDay, setSheetDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProgramActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [hasExercises, setHasExercises] = useState(false);
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<WorkoutFocusMode | null>(null);
  const [editReturn, setEditReturn] = useState<WorkoutFocusMode | null>(null);
  const [pendingAudience, setPendingAudience] = useState<'me' | null>(null);

  const status = lifecycleStatusOf(program);
  const inclusive = !!program.inclusive_plan;
  const audience = programEditAudience(program);
  const scopeCopy = programEditScopeCopy(program);
  const groupName = groups.find((g) => g.id === program.team_id)?.name;
  const selectedDay = selectProgramDate(start, selectedDate, totalWeeks).dayOfWeek;

  useEffect(() => {
    setCalendarView(readPreferredCalendarView());
  }, []);

  async function reload() {
    setLoading(true);
    setError('');
    const [{ data, error: loadError, tableReady: ready }, legacy] = await Promise.all([
      fetchProgramActivities(supabase, program.id),
      fetchLegacyWorkouts(supabase, program.id),
    ]);
    setTableReady(ready);
    if (loadError) setError(loadError);
    const planned = data || [];
    const linked = new Set(planned.map((a) => a.workout_id).filter(Boolean));
    const bridged = activitiesFromLegacyWorkouts(
      program.id,
      (legacy.data || []).filter((w) => !linked.has(w.id))
    );
    setActivities([...planned, ...bridged]);
    const workoutIds = (legacy.data || []).map((w) => w.id).filter(Boolean);
    if (workoutIds.length) {
      const { data: exercises } = await supabase
        .from('st_exercises')
        .select('id')
        .in('workout_id', workoutIds)
        .limit(1);
      setHasExercises(!!exercises?.length);
    } else {
      setHasExercises(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    const pick = selectProgramDate(start, defaultProgramDate(start, totalWeeks), totalWeeks);
    setWeek(pick.week);
    setSelectedDate(pick.date);
    setYearMonth(yearMonthOf(pick.date));
    setOpenWorkoutId(null);
    setOpenMode(null);
    setEditReturn(null);
    setPendingAudience(null);
    void reload();
  }, [program.id]);

  const dayActivities = useMemo(
    () => activitiesForDay(activities, week, selectedDay),
    [activities, week, selectedDay]
  );
  const selectedWorkout = useMemo(() => {
    const workoutId = dayActivities.find((activity) => activity.workout_id)?.workout_id;
    return (workouts || []).find((workout) => workout.id === workoutId) || null;
  }, [dayActivities, workouts]);
  const monthCells = useMemo(
    () => monthCalendarCells(program, activities, yearMonth, todayYmd()),
    [program, activities, yearMonth]
  );

  const hasStrengthActivities = useMemo(
    () => activities.some((a) => a.activity_type === 'strength' && a.workout_id && a.week_number === week),
    [activities, week]
  );

  const dayLabel = useMemo(() => {
    if (sheetDay == null) return '';
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][sheetDay] || 'Day';
  }, [sheetDay]);

  function applyDate(dateYmd: string) {
    const pick = selectProgramDate(start, dateYmd, totalWeeks);
    setWeek(pick.week);
    setSelectedDate(pick.date);
    setYearMonth(yearMonthOf(pick.date));
  }

  function changeView(next: ProgramCalendarView) {
    setCalendarView(next);
    rememberCalendarView(next);
    setOpenMode(null);
    setOpenWorkoutId(null);
    setEditReturn(null);
  }

  function openWorkout(workoutId: string, mode: WorkoutFocusMode, from: WorkoutFocusMode | 'calendar' = 'calendar') {
    setOpenWorkoutId(workoutId);
    setOpenMode(mode);
    setEditReturn(mode === 'edit' && from === 'details' ? 'details' : null);
  }

  function closeWorkoutFocus() {
    if (openMode === 'edit' && editReturn === 'details' && openWorkoutId) {
      setOpenMode('details');
      setEditReturn(null);
      return;
    }
    setOpenMode(null);
    setOpenWorkoutId(null);
    setEditReturn(null);
  }

  function selectedWorkoutId() {
    return selectedWorkout?.id || dayActivities.find((activity) => activity.workout_id)?.workout_id || null;
  }

  function requestAudienceChange(next: 'group' | 'me') {
    if (!onEditAudienceChange || next === audience || audienceBusy) return;
    if (next === 'me') {
      setPendingAudience('me');
      return;
    }
    void onEditAudienceChange(next).catch((e) => setError(e?.message || 'Could not switch who edits apply to'));
  }

  function changeWeek(nextWeek: number) {
    const bounded = Math.max(1, Math.min(totalWeeks, nextWeek));
    applyDate(dateForProgramDay(start, bounded, selectedDay));
  }

  function openAdd(day = selectedDay) {
    if (!canEdit) return;
    setEditing(null);
    setSheetDay(day);
  }

  function openActivity(activity: ProgramActivity) {
    if (activity.workout_id && hasExercises && activity.activity_type === 'strength') {
      applyDate(dateForProgramDay(start, activity.week_number, activity.day_of_week));
      openWorkout(activity.workout_id, 'details');
      return;
    }
    setEditing(activity);
    setSheetDay(activity.day_of_week);
  }

  async function saveActivity(draft: ActivityDraft) {
    if (!canEdit) return;
    if (editing && editing.id.startsWith('legacy-')) return;
    const isNewStrength = !editing && draft.activity_type === 'strength';
    if (editing) {
      const { error: updateError } = await updateProgramActivity(supabase, editing.id, {
        ...draft,
        week_number: week,
        day_of_week: sheetDay ?? selectedDay,
      });
      if (updateError) throw new Error(updateError);
    } else if (sheetDay != null) {
      const days = draftWeekdays(draft, sheetDay);
      const weeks = draft.applyRemainingWeeks
        ? Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w >= week)
        : [week];
      for (const targetWeek of weeks) {
        for (const day of days) {
          const { error: createError } = await createProgramActivity(
            supabase,
            program.id,
            targetWeek,
            day,
            draft,
            nextSortOrder(activities, targetWeek, day)
          );
          if (createError) throw new Error(createError);
        }
      }
    }
    setSheetDay(null);
    setEditing(null);
    await reload();
    if (isNewStrength) setImportOpen(true);
  }

  async function removeActivity() {
    if (!editing || editing.id.startsWith('legacy-')) return;
    const { error: deleteError } = await deleteProgramActivity(supabase, editing.id);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    setSheetDay(null);
    setEditing(null);
    await reload();
  }

  async function copyCurrentWeek() {
    if (!canEdit) return;
    const target = week + 1;
    if (target > totalWeeks) {
      setError('There is no next week to copy into.');
      return;
    }
    setBusy(true);
    const { error: copyError } = await copyWeekActivities(supabase, program.id, week, [target]);
    setBusy(false);
    if (copyError) {
      setError(copyError);
      return;
    }
    changeWeek(target);
    await reload();
  }

  async function copyToRemaining() {
    if (!canEdit) return;
    const targets = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w > week);
    if (!targets.length) {
      setError('This is the last week in the cycle.');
      return;
    }
    setBusy(true);
    const { error: copyError } = await copyWeekActivities(supabase, program.id, week, targets);
    setBusy(false);
    if (copyError) {
      setError(copyError);
      return;
    }
    await reload();
  }

  async function changeStatus(next: ProgramLifecycleStatus) {
    if (!canEdit) return;
    if (next === 'active') {
      const conflict = programs.find(
        (p) =>
          p.id !== program.id &&
          p.visibility === 'personal' &&
          p.owner_user_id === ownerUserId &&
          lifecycleStatusOf(p) === 'active'
      );
      if (conflict && !window.confirm(`${conflict.name} is already active. Make this the active program instead?`)) {
        return;
      }
    }
    setBusy(true);
    const { error: statusError } = await setProgramLifecycle(supabase, programs, program.id, next, ownerUserId);
    setBusy(false);
    if (statusError) {
      setError(statusError);
      return;
    }
    onProgramChange({ ...program, status: next });
  }

  async function toggleInclusive(next: boolean) {
    if (!canEdit) return;
    setBusy(true);
    const { error: updateError } = await updateDesignProgram(supabase, program.id, { inclusive_plan: next });
    setBusy(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    onProgramChange({ ...program, inclusive_plan: next });
  }

  const focusingWorkout = openMode === 'details' || openMode === 'edit';
  const creatingPersonalizedCopy = willCreatePersonalizedCopy(program, personalPrograms);
  const atFirstDay = selectedDate <= start;
  const atLastDay = selectedDate >= end;

  return (
    <div className="pd-editor">
      {!focusingWorkout && (
        <button type="button" className="pd-back" onClick={onBack}>
          ← Back to programs
        </button>
      )}
      {!focusingWorkout && (
        <SectionHeader
          title={program.name}
          subtitle={`${formatProgramRange(start, end)} · Week ${week} of ${totalWeeks}${inclusive ? ' · All-inclusive' : ' · Training'}`}
          actions={<span className="ui-badge">{lifecycleLabel(status)}</span>}
        />
      )}

      {!focusingWorkout && !(audience === 'group' && onEditAudienceChange) && (
        <p className="muted pd-scope-note">
          <strong>{scopeCopy.title}</strong>
          {' — '}
          {scopeCopy.detail}
        </p>
      )}

      {!focusingWorkout && audience === 'group' && onEditAudienceChange && (
        <fieldset className="pd-scope">
          <legend>Editing for</legend>
          <div className="pd-scope-stack" role="radiogroup" aria-label="Editing for">
            <button
              type="button"
              role="radio"
              aria-checked="true"
              className="pd-scope-choice active"
              disabled={!canEditGroupTemplate}
              onClick={() => requestAudienceChange('group')}
            >
              <b>{groupName ? `Everyone in ${groupName}` : 'Everyone in the group'}</b>
              <span>Changes affect assigned members.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked="false"
              className="pd-scope-choice"
              onClick={() => requestAudienceChange('me')}
            >
              <b>Only me</b>
              <span>{creatingPersonalizedCopy ? 'Creates a private copy. The group plan stays the same.' : 'Open your private copy. The group plan stays the same.'}</span>
            </button>
          </div>
          {audienceBusy && <p className="muted">Switching…</p>}
        </fieldset>
      )}

      {!focusingWorkout && (
        <SegmentedControl
          ariaLabel="Program calendar"
          value={calendarView}
          onChange={(v) => changeView(v as ProgramCalendarView)}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          size="sm"
        />
      )}

      {!focusingWorkout && calendarView === 'day' && (
        <div className="pd-week-bar">
          <button type="button" className="btn small secondary" disabled={atFirstDay} onClick={() => applyDate(addDaysYmd(selectedDate, -1))}>
            Previous day
          </button>
          <button type="button" className="btn small secondary" onClick={() => applyDate(todayYmd())}>
            Today
          </button>
          <button type="button" className="btn small secondary" disabled={atLastDay} onClick={() => applyDate(addDaysYmd(selectedDate, 1))}>
            Next day
          </button>
        </div>
      )}

      {!focusingWorkout && calendarView === 'week' && (
        <div className="pd-week-bar">
          <button type="button" className="btn small secondary" disabled={week <= 1} onClick={() => changeWeek(week - 1)}>
            Previous week
          </button>
          <button type="button" className="btn small secondary" onClick={() => applyDate(defaultProgramDate(start, totalWeeks))}>
            This week
          </button>
          <button type="button" className="btn small secondary" disabled={week >= totalWeeks} onClick={() => changeWeek(week + 1)}>
            Next week
          </button>
        </div>
      )}

      {!focusingWorkout && calendarView === 'month' && (
        <div className="pd-week-bar">
          <button type="button" className="btn small secondary" onClick={() => setYearMonth((value) => shiftYearMonth(value, -1))}>
            Previous month
          </button>
          <button type="button" className="btn small secondary" onClick={() => setYearMonth(yearMonthOf(todayYmd()))}>
            This month
          </button>
          <button type="button" className="btn small secondary" onClick={() => setYearMonth((value) => shiftYearMonth(value, 1))}>
            Next month
          </button>
        </div>
      )}

      {!tableReady && !focusingWorkout && (
        <p className="pd-note">
          Calendar activities will save after the Program Design migration is applied in Supabase.
        </p>
      )}
      {error && <p className="pd-error">{error}</p>}
      {!focusingWorkout && !loading && canEdit && !hasExercises && !justBuiltMessage && onBuildWorkouts && (
        <div className="pd-note" style={{ marginBottom: 12 }}>
          <p>This program does not have exercises yet. Build the actual workouts to fill the calendar.</p>
          <button type="button" className="btn green" style={{ marginTop: 8 }} onClick={onBuildWorkouts}>
            Build my workouts
          </button>
        </div>
      )}

      {loading && !focusingWorkout ? (
        <p className="muted">Loading this week…</p>
      ) : (
        <>
          {!focusingWorkout && calendarView === 'week' && (
            <WeeklyHealthCalendar
              startMonday={start}
              weekNumber={week}
              activities={activities}
              variant="strip"
              selectedDay={selectedDay}
              onSelectDay={(day) => applyDate(dateForProgramDay(start, week, day))}
              onAddActivity={openAdd}
              onOpenActivity={openActivity}
            />
          )}
          {!focusingWorkout && calendarView === 'month' && (
            <>
              <p className="pd-week-label">{formatMonthLabel(yearMonth)}</p>
              <ProgramMonthCalendar
                monthLabel={formatMonthLabel(yearMonth)}
                monthCells={monthCells}
                selectedDate={selectedDate}
                onSelectDate={applyDate}
              />
            </>
          )}

          {!focusingWorkout && (
            <ProgramDaySummary
              date={selectedDate}
              activities={dayActivities}
              workout={selectedWorkout}
              canEdit={canEdit && !audienceBusy}
              onAddActivity={() => openAdd(selectedDay)}
              onOpenActivity={openActivity}
              onMoveActivity={(activity, dayOfWeek) => {
                if (!canEdit || activity.id.startsWith('legacy-')) return;
                void updateProgramActivity(supabase, activity.id, { week_number: week, day_of_week: dayOfWeek }).then(
                  (result) => {
                    if (result.error) setError(result.error);
                    else {
                      applyDate(dateForProgramDay(start, week, dayOfWeek));
                      void reload();
                    }
                  }
                );
              }}
              onViewDetails={() => {
                const workoutId = selectedWorkoutId();
                if (!workoutId) return;
                openWorkout(workoutId, 'details');
              }}
              onEditWorkout={() => {
                const workoutId = selectedWorkoutId();
                if (!workoutId) return;
                openWorkout(workoutId, 'edit', 'calendar');
              }}
            />
          )}

          {justBuiltMessage && !focusingWorkout && (
            <div className="ai-wiz-coach">
              <p>Your workouts are ready. Review a day below and edit only when you want to change it.</p>
              <p>{justBuiltMessage}</p>
            </div>
          )}

          <ProgramWorkoutPlan
            key={program.id}
            supabase={supabase}
            programId={program.id}
            week={week}
            canEdit={canEdit && !audienceBusy}
            hideList
            openWorkoutId={openWorkoutId}
            openMode={openMode}
            backLabel={editReturn === 'details' ? '← Back to workout details' : '← Done'}
            onModeChange={(mode) => {
              if (mode === 'edit' && openWorkoutId) openWorkout(openWorkoutId, 'edit', 'details');
            }}
            onCloseFocus={closeWorkoutFocus}
            onLoaded={(info) => {
              setHasExercises(info.hasExercises);
              setWorkouts(info.workouts || []);
            }}
          />
        </>
      )}

      {!focusingWorkout && (
        <div className="pd-status-row">
          {onFollow && !isFollowing && status !== 'draft' && status !== 'archived' && (
            <button type="button" className="btn green" disabled={busy} onClick={() => void onFollow()}>
              Use in Training
            </button>
          )}
          {isFollowing && <span className="ui-badge">In Training</span>}
          {canEdit && pushTeamId && (
            <button type="button" className="btn green" disabled={busy} onClick={() => setPushOpen(true)}>
              Push to members
            </button>
          )}
          {onShareWithGroup && canEdit && groups.length > 0 && (
            <select
              aria-label="Share with group"
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) void onShareWithGroup(id);
                e.target.value = '';
              }}
            >
              <option value="">Share with group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!focusingWorkout && isFollowing && program.visibility === 'team' && !canEdit && (
        <p className="muted">Live group plan. Owner and manager workout edits appear here after you reopen this screen.</p>
      )}

      {!focusingWorkout && canEdit && (
        <div className="pd-status-row">
          {status === 'draft' && (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void changeStatus('scheduled')}>
              Schedule
            </button>
          )}
          {(status === 'draft' || status === 'scheduled') && (
            <button type="button" className="btn green" disabled={busy} onClick={() => void changeStatus('active')}>
              Set as active
            </button>
          )}
          {status === 'active' && (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void changeStatus('completed')}>
              Mark completed
            </button>
          )}
          {status !== 'archived' && (
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => void changeStatus('archived')}>
              Archive
            </button>
          )}
        </div>
      )}

      {!focusingWorkout && (
        <ProgramCriteriaPanel value={program.generation_criteria}>
          {!inclusive && (
            <p className="muted pd-note">
              This is a training program. Add walks, yoga, or sport on the Training calendar, or turn on an all-inclusive week below if you want those on this plan.
            </p>
          )}
          {canEdit && (
            <label className="remember-row" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={inclusive}
                disabled={busy}
                onChange={(e) => void toggleInclusive(e.target.checked)}
              />
              All-inclusive plan — include cardio, mobility, sport, and rest on this program (can push to a group)
            </label>
          )}
          {canEdit && (
            <div className="pd-week-actions" style={{ marginTop: 12 }}>
              {inclusive && (
                <>
                  <button type="button" className="btn small secondary" disabled={busy} onClick={() => void copyCurrentWeek()}>
                    Copy week
                  </button>
                  <button type="button" className="btn small secondary" disabled={busy} onClick={() => void copyToRemaining()}>
                    Copy to remaining weeks
                  </button>
                </>
              )}
              {hasStrengthActivities && (
                <button type="button" className="btn small accent" disabled={busy} onClick={() => setImportOpen(true)}>
                  Import exercises from program
                </button>
              )}
            </div>
          )}
        </ProgramCriteriaPanel>
      )}

      {sheetDay != null && (
        <AddActivitySheet
          dayLabel={dayLabel}
          existing={editing}
          allowMultiDay={inclusive && !editing}
          allowRemainingWeeks={inclusive && !editing}
          defaultWeekday={sheetDay}
          onClose={() => {
            setSheetDay(null);
            setEditing(null);
          }}
          onSave={saveActivity}
          onDelete={editing ? removeActivity : undefined}
        />
      )}

      {importOpen && (
        <ImportWorkoutsSheet
          supabase={supabase}
          userId={ownerUserId}
          targetProgramId={program.id}
          strengthActivities={activities.filter((a) => a.week_number === week)}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void reload();
          }}
        />
      )}

      {pushOpen && pushTeamId && (
        <PushToMembersSheet
          supabase={supabase}
          teamId={pushTeamId}
          programId={program.id}
          programName={program.name}
          programStatus={program.status}
          onClose={() => setPushOpen(false)}
          onPushed={() => {
            onProgramChange({ ...program, status: program.status === 'draft' ? 'published' : program.status });
          }}
        />
      )}

      {pendingAudience === 'me' && (
        <div className="panel-overlay" onClick={() => setPendingAudience(null)}>
          <div
            className="card pd-copy-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pd-copy-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="pd-copy-confirm-title">{creatingPersonalizedCopy ? 'Create your own copy?' : 'Open your copy?'}</h2>
            <p>
              {creatingPersonalizedCopy
                ? "Create your own copy of this group program? Changes to your copy won't affect anyone else."
                : 'You already have a private copy of this group program. Open it to keep editing just for you.'}
            </p>
            <div className="pd-day-summary-actions">
              <button type="button" className="btn secondary" onClick={() => setPendingAudience(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn green"
                onClick={() => {
                  setPendingAudience(null);
                  void onEditAudienceChange?.('me').catch((e) => setError(e?.message || 'Could not switch who edits apply to'));
                }}
              >
                {creatingPersonalizedCopy ? 'Create my copy' : 'Open my copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
