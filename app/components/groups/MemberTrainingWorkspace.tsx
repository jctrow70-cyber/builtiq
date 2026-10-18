'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import DateInput from '../DateInput';
import AddActivitySheet from '../programDesign/AddActivitySheet';
import type { ActivityType } from '../../../lib/programDesign/types';
import type { GroupActivityLog, GroupTrainingExerciseRef, GroupTrainingMemberRow, GroupTrainingProgramRef, GroupTrainingWeekItem } from '../../../lib/groups/trainingWorkspace';
import { addActivityChoices, assignedProgramFromPayload, comparePrescriptionToGroupLogs, displayWorkoutName, extraActivityLabel, orderedWeekSessions, planExerciseGroups, programWorkoutPlace } from '../../../lib/groups/trainingWorkspace';
import { fetchFullProgram } from '../../../lib/training/programFetch';
import { supabase } from '../../../lib/supabaseClient';
import { customWeekdayError, materializeMemberSchedule, programCycleAnchor } from '../../../lib/groups/memberSchedule';
import { formatWarmupPrescription } from '../training/WarmupExerciseCard';
import { addDaysYmd, formatDisplayDate, mondayOfWeek, parseYmd, todayYmd } from '../../../lib/training/programCalendar';
import WorkoutScheduleActions from './WorkoutScheduleActions';

export type MemberProfileSection = 'calendar' | 'plan' | 'progress';

export type GroupWorkoutLogRequest = {
  memberUserId: string;
  expectationId: string;
  workoutId: string;
  programId: string;
  scheduledDate: string;
  sourceKey: string;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GROUP_EXTRA_TYPES: ActivityType[] = ['cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortWeekRange(start: string) {
  const end = addDaysYmd(start, 6);
  const left = parseYmd(start);
  const right = parseYmd(end);
  const startLabel = `${MONTHS[left.getMonth()]} ${left.getDate()}`;
  const endLabel = left.getMonth() === right.getMonth() ? String(right.getDate()) : `${MONTHS[right.getMonth()]} ${right.getDate()}`;
  return `${startLabel} – ${endLabel}`;
}

function dayHeading(date: string) {
  const value = parseYmd(date);
  return `${WEEKDAYS[value.getDay()]}, ${MONTHS[value.getMonth()]} ${value.getDate()}`;
}

function statusExplanation(member: GroupTrainingMemberRow): string {
  if (member.status === 'needs_attention') {
    const listed = member.missedDates.length;
    const count = member.missedCount || listed;
    const noun = count === 1 ? 'workout' : 'workouts';
    const dates = listed ? ` Loaded dates: ${Array.from(new Set(member.missedDates)).map((date) => dayHeading(date)).join(', ')}.` : '';
    const gap = count > listed ? ' Some counted workouts are outside the dates loaded on this screen.' : '';
    return `Missed ${count} ${noun} before today. Excused workouts, paused future workouts, and anything scheduled for today or later are not included.${dates}${gap}`;
  }
  if (member.status === 'needs_plan') return 'No group program is assigned.';
  if (member.status === 'schedule_review') return member.scheduleReviewDetail || 'This schedule needs review.';
  if (member.status === 'schedule_paused') return 'Expected group workouts are paused. Past workouts stay. Personal training is unchanged.';
  if (member.status === 'paused') return 'This member is paused.';
  if (member.status === 'personal') return 'This group is not assigning a plan. Personal training stays private.';
  if (member.statusLabel === 'Program ending soon' && member.programEndsOn) {
    return `This program’s last day is ${dayHeading(member.programEndsOn)}.`;
  }
  return 'No missed workouts before today in the current adherence window.';
}

function PlanNavigator({
  program,
  planName,
  load,
  currentWeek,
}: {
  program: GroupTrainingProgramRef | null;
  planName: string;
  load: 'loading' | 'ready' | 'denied' | 'empty';
  currentWeek: number | null;
}) {
  const weekCount = Math.max(1, Number(program?.weeks || 1));
  const [week, setWeek] = useState(() => Math.min(weekCount, Math.max(1, currentWeek || 1)));
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    setWeek(Math.min(weekCount, Math.max(1, currentWeek || 1)));
    setOpenId(null);
  }, [program?.id, currentWeek, weekCount]);
  if (load === 'loading') {
    return (
      <div className="member-plan-template">
        <p className="muted">Loading {planName}…</p>
      </div>
    );
  }
  if (load === 'denied') {
    return (
      <div className="member-plan-template">
        <p>{planName} is the assigned program.</p>
        <p className="muted">You do not have permission to view this program. It remains the program on this group enrollment. This view does not change the calendar or start a workout.</p>
      </div>
    );
  }
  const sessions = program ? orderedWeekSessions(program.workouts || [], week) : [];
  return (
    <div className="member-plan-template">
      <p className="muted">
        {program?.name || planName}
        {currentWeek ? ` · Current program week ${currentWeek}` : ''}
        {' · '}Saved dates stay on Calendar.
      </p>
      <div className="member-plan-weeks" role="tablist" aria-label="Program weeks">
        {Array.from({ length: weekCount }, (_, index) => index + 1).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={value === week} className={value === week ? 'is-current' : ''} onClick={() => { setWeek(value); setOpenId(null); }}>
            Week {value}
          </button>
        ))}
      </div>
      {sessions.length === 0 ? (
        <p>Rest day in week {week}. No workout is stored on this program week.</p>
      ) : (
        sessions.map((workout) => {
          const id = workout.id || workout.title || 'workout';
          const expanded = openId === id;
          return (
            <article key={id}>
              <button type="button" className="member-day-workout-open" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : id)}>
                <b>{workout.title || 'Workout'}</b>
                <span className="muted">{[workout.dayLabel, `Week ${week}`].filter(Boolean).join(' · ')}</span>
              </button>
              {expanded && (
                <div className="member-profile-workout">
                  {(workout.exercises || []).length === 0 ? (
                    <p className="muted">No exercises are stored on this workout.</p>
                  ) : (
                    planExerciseGroups(workout.exercises).map((group, groupIndex) => (
                      <div key={group.key || groupIndex} className={group.label ? 'member-superset' : undefined}>
                        {group.label ? <p className="member-superset-label">{group.label}</p> : null}
                        <ol className="member-profile-exercises">
                          {group.exercises.map((exercise, exerciseIndex) => (
                            <li key={exercise.id || `${exercise.name}-${exerciseIndex}`}>
                              <b>{exerciseIndex + 1}. {exercise.name}</b>
                              <ul>
                                {(exercise.sets || []).map((set, setIndex) => (
                                  <li key={set.id || setIndex}>
                                    Set {set.setNumber || setIndex + 1}
                                    {set.setType ? ` · ${set.setType}` : ''}
                                    {set.reps ? ` · ${set.reps} reps` : ''}
                                    {set.weight ? ` · ${set.weight}` : ''}
                                    {set.rir != null && String(set.rir).trim() ? ` · RIR ${set.rir}` : ''}
                                    {set.restSeconds != null ? ` · Rest ${set.restSeconds}s` : ''}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}

function PrescriptionCompare({
  exercises,
  logs,
  date,
}: {
  exercises: GroupTrainingExerciseRef[];
  logs: GroupActivityLog[] | null;
  date: string;
}) {
  if (logs == null) return null;
  const comparison = comparePrescriptionToGroupLogs(exercises || [], logs, date);
  if (!comparison.rows.length) return <p className="muted">No planned sets and no group-attributed sets on this date.</p>;
  return (
    <div>
      {!comparison.canMatch && (
        <p className="muted">This program read has no planned-set ids, so logged sets stay separate from the plan.</p>
      )}
      <ul className="member-profile-exercises">
        {comparison.rows.map((row) => (
          <li key={row.key}>
            <b>{row.exercise}</b>
            <span className="muted">
              {row.kind === 'extra' ? `Extra or unmatched set · ${row.logged} · ${row.planned}` : `Planned ${row.planned} · Logged ${row.logged}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function dayMark(items: GroupTrainingWeekItem[]) {
  if (!items.length) return '';
  if (items.some((item) => item.state === 'Due today')) return 'is-due';
  if (items.every((item) => item.state === 'Completed')) return 'is-done';
  if (items.some((item) => item.state === 'Missed')) return 'is-missed';
  return 'is-scheduled';
}

type MemberTrainingWorkspaceProps = {
  groupName: string;
  teamId?: string | null;
  member: GroupTrainingMemberRow;
  canManage: boolean;
  customizePrograms?: Array<{ id: string; name: string }>;
  onBack: () => void;
  onChangePlan?: () => void;
  canEditSchedule?: boolean;
  canRequireExtra?: boolean;
  scheduleProgram?: GroupTrainingProgramRef | null;
  onSaveSchedule?: (input: { mode: 'program_days' | 'custom_weekdays'; weekdays: string[]; effectiveOn: string }) => Promise<void>;
  onMoveWorkout?: (input: { workoutId: string; originalDate: string; newDate: string }) => Promise<void>;
  onExcuseWorkout?: (input: { workoutId: string; originalDate: string }) => Promise<void>;
  onRestoreWorkout?: (input: { workoutId: string; originalDate: string }) => Promise<void>;
  onSetExpectations?: (enabled: boolean) => Promise<void>;
  onAddActivity?: (input: {
    activityType: ActivityType;
    title: string;
    scheduledDate: string;
    workoutId?: string | null;
    programId?: string | null;
    durationMinutes?: number | null;
    notes?: string | null;
    details?: Record<string, unknown>;
    required?: boolean;
  }) => Promise<void>;
  onEditSharedProgram?: () => void;
  onCustomize?: (programId: string) => void;
  onMessage?: () => void;
  section?: MemberProfileSection;
  onSection?: (section: MemberProfileSection) => void;
  weekItems?: GroupTrainingWeekItem[];
  weekStart?: string;
  weekRangeLabel?: string;
  onPreviousWeek?: () => void;
  onNextWeek?: () => void;
  onThisWeek?: () => void;
  weekNotice?: string | null;
  switchMembers?: Array<{ userId: string; name: string }>;
  onSwitchMember?: (userId: string) => void;
  explainStatus?: boolean;
  onShowDate?: (date: string) => void;
  progressPanel?: ReactNode;
  viewerUserId?: string | null;
  groupLogs?: GroupActivityLog[] | null;
  onLogWorkout?: (input: GroupWorkoutLogRequest) => void;
};

export default function MemberTrainingWorkspace({
  groupName,
  teamId = null,
  member,
  canManage,
  customizePrograms = [],
  onBack,
  onChangePlan,
  canEditSchedule = false,
  canRequireExtra = false,
  scheduleProgram = null,
  onSaveSchedule,
  onMoveWorkout,
  onExcuseWorkout,
  onRestoreWorkout,
  onSetExpectations,
  onAddActivity,
  onEditSharedProgram,
  onCustomize,
  onMessage,
  section = 'calendar',
  onSection,
  weekItems,
  weekStart,
  weekRangeLabel,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  weekNotice,
  switchMembers = [],
  onSwitchMember,
  explainStatus = false,
  onShowDate,
  progressPanel,
  viewerUserId = null,
  groupLogs = null,
  onLogWorkout,
}: MemberTrainingWorkspaceProps) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'program_days' | 'custom_weekdays'>('program_days');
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [effectiveOn, setEffectiveOn] = useState(todayYmd());
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [addingWorkout, setAddingWorkout] = useState(false);
  const [activitySheet, setActivitySheet] = useState(false);
  const [extraRequired, setExtraRequired] = useState(false);
  const [oneOffId, setOneOffId] = useState('');
  const [oneOffDate, setOneOffDate] = useState(todayYmd());
  const [memberQuery, setMemberQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullProgram, setFullProgram] = useState<GroupTrainingProgramRef | null>(null);
  const [planLoad, setPlanLoad] = useState<'loading' | 'ready' | 'denied' | 'empty'>('empty');
  const [statusOpen, setStatusOpen] = useState(explainStatus);
  const [selectedDate, setSelectedDate] = useState(todayYmd());
  const days = weekItems || member.weekItems;
  const resolvedWeekStart = mondayOfWeek(weekStart || days[0]?.date || todayYmd());
  const weekCells = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDaysYmd(resolvedWeekStart, index);
        return { date, items: days.filter((item) => item.date === date) };
      }),
    [resolvedWeekStart, days]
  );
  const selectedItems = weekCells.find((cell) => cell.date === selectedDate)?.items || [];
  const currentWeek = resolvedWeekStart === mondayOfWeek(todayYmd());
  const scheduleSource = fullProgram?.workouts?.length ? fullProgram : scheduleProgram;
  const sessions = useMemo(() => {
    const workouts = scheduleSource?.workouts || [];
    const week = workouts.map((workout) => Number(workout.week)).find((value) => orderedWeekSessions(workouts, value).length > 0) || 1;
    return orderedWeekSessions(workouts, week);
  }, [scheduleSource]);
  const activity = addActivityChoices(fullProgram, planLoad);
  const canAddActivity = !!onAddActivity;
  const adherence = days.reduce(
    (counts, item) => {
      counts[item.state] = (counts[item.state] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>
  );
  function memberCanLog(item: GroupTrainingWeekItem) {
    if (!onLogWorkout || !viewerUserId || viewerUserId !== member.userId || !teamId || !member.programId) return false;
    if (!item.workoutId || !item.expectationId || item.date > todayYmd()) return false;
    return item.state !== 'Excused' && item.state !== 'Paused' && item.state !== 'Upcoming';
  }
  const preview = useMemo(() => {
    if (!scheduleSource || scheduleMode !== 'custom_weekdays') return [];
    return materializeMemberSchedule({
      mode: 'custom_weekdays',
      weekdays,
      program: scheduleSource,
      startsOn: effectiveOn,
      effectiveOn,
      cycleAnchor: programCycleAnchor(scheduleSource, effectiveOn),
    }).slice(0, 4);
  }, [scheduleSource, scheduleMode, weekdays, effectiveOn]);
  const switchIndex = switchMembers.findIndex((item) => item.userId === member.userId);
  const pickerQuery = memberQuery.trim().toLowerCase();
  const pickerMatches = switchMembers.filter((item) => item.name.toLowerCase().includes(pickerQuery));
  const largeGroup = switchMembers.length > 8;
  const pickerList = largeGroup ? (pickerQuery ? pickerMatches.slice(0, 12) : []) : switchMembers;

  useEffect(() => {
    const end = addDaysYmd(resolvedWeekStart, 6);
    setSelectedDate((current) => {
      if (current >= resolvedWeekStart && current <= end) return current;
      const today = todayYmd();
      if (today >= resolvedWeekStart && today <= end) return today;
      const weekday = parseYmd(current).getDay();
      const index = weekday === 0 ? 6 : weekday - 1;
      return addDaysYmd(resolvedWeekStart, index);
    });
  }, [resolvedWeekStart]);

  useEffect(() => {
    setExpandedKey(null);
    setAddingWorkout(false);
    setPickerOpen(false);
    setFullProgram(null);
    setPlanLoad('empty');
    setStatusOpen(false);
    setMemberQuery('');
  }, [member.userId]);

  useEffect(() => {
    if (explainStatus) setStatusOpen(true);
  }, [explainStatus, member.userId]);

  useEffect(() => {
    const programId = member.programId;
    if (!programId) {
      setFullProgram(null);
      setPlanLoad('empty');
      return;
    }
    let cancelled = false;
    setPlanLoad('loading');
    void (async () => {
      const direct = await fetchFullProgram(supabase, programId);
      if (cancelled) return;
      const mapped = direct.error ? null : assignedProgramFromPayload(direct.data, programId);
      if (mapped) {
        setFullProgram(mapped);
        setPlanLoad(mapped.workouts?.length ? 'ready' : 'empty');
        return;
      }
      if (!teamId) {
        setFullProgram(null);
        setPlanLoad('denied');
        return;
      }
      const assigned = await supabase.rpc('st_read_group_assigned_program', {
        p_team_id: teamId,
        p_member_user_id: member.userId,
        p_program_id: programId,
      });
      if (cancelled) return;
      const fromEnrollment = assigned.error ? null : assignedProgramFromPayload(assigned.data, programId);
      if (!fromEnrollment) {
        setFullProgram(null);
        setPlanLoad('denied');
        return;
      }
      setFullProgram(fromEnrollment);
      setPlanLoad(fromEnrollment.workouts?.length ? 'ready' : 'empty');
    })();
    return () => {
      cancelled = true;
    };
  }, [member.programId, member.userId, teamId]);

  useEffect(() => {
    if (addingWorkout) setOneOffDate(selectedDate);
  }, [selectedDate, addingWorkout]);

  function workoutFor(workoutId: string | null) {
    if (!workoutId) return null;
    const source = fullProgram?.workouts?.length ? fullProgram : scheduleProgram;
    return source?.workouts?.find((item) => item.id === workoutId) || null;
  }

  function closePlanTools() {
    setPlanMenuOpen(false);
    setEditingSchedule(false);
    setConfirmPause(false);
    setShowCustomize(false);
    setAddingWorkout(false);
  }

  return (
    <div className="member-training-workspace member-profile" aria-label={groupName ? `${member.name}, ${groupName}` : member.name}>
      <div className="member-profile-toolbar">
        <button type="button" className="member-text-btn" onClick={onBack}>
          Members
        </button>
        <div className="member-switcher">
          {onSwitchMember && switchMembers.length > 1 && (
            <button
              type="button"
              className="member-icon-btn"
              aria-label="Previous member"
              disabled={switchIndex <= 0}
              onClick={() => switchIndex > 0 && onSwitchMember(switchMembers[switchIndex - 1].userId)}
            >
              ‹
            </button>
          )}
          <button
            type="button"
            className="member-name-btn"
            aria-expanded={pickerOpen}
            aria-label={`Choose a member, ${member.name}`}
            onClick={() => onSwitchMember && setPickerOpen((open) => !open)}
          >
            {member.name} <span aria-hidden="true">▼</span>
          </button>
          {onSwitchMember && switchMembers.length > 1 && (
            <button
              type="button"
              className="member-icon-btn"
              aria-label="Next member"
              disabled={switchIndex < 0 || switchIndex >= switchMembers.length - 1}
              onClick={() => switchIndex >= 0 && switchIndex < switchMembers.length - 1 && onSwitchMember(switchMembers[switchIndex + 1].userId)}
            >
              ›
            </button>
          )}
        </div>
      </div>
      {pickerOpen && onSwitchMember && (
        <div className="member-picker" role="listbox" aria-label="Group members">
          {largeGroup && (
            <input
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="Find a member"
              aria-label="Find a member"
            />
          )}
          {largeGroup && !pickerQuery && <p className="muted">Type a name. Training details load after you choose someone.</p>}
          {pickerList.map((item) => (
            <button
              key={item.userId}
              type="button"
              role="option"
              aria-selected={item.userId === member.userId}
              className={item.userId === member.userId ? 'is-current' : ''}
              onClick={() => onSwitchMember(item.userId)}
            >
              {item.name}
            </button>
          ))}
          {largeGroup && pickerQuery && pickerMatches.length === 0 && <p className="muted">No member matches that search.</p>}
          {largeGroup && pickerQuery && pickerMatches.length > pickerList.length && (
            <p className="muted">Showing {pickerList.length} of {pickerMatches.length}.</p>
          )}
        </div>
      )}
      <div className="member-program-summary">
        <div className="member-program-open">
          <b>{fullProgram?.name || member.planName}</b>
          <span className="muted">
            {[
              member.scheduleDays,
              member.programWeeks || fullProgram?.weeks ? `${member.programWeeks || fullProgram?.weeks} weeks` : '',
              member.currentProgramWeek && member.programWeeks ? `Week ${member.currentProgramWeek} of ${member.programWeeks}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || member.planName}
          </span>
        </div>
        <button type="button" className={`group-training-status group-training-status-${member.status}`} onClick={() => setStatusOpen((open) => !open)}>
          {member.statusLabel}
        </button>
      </div>
      {statusOpen && (
        <div className="member-status-note">
          <p>{statusExplanation(member)}</p>
          {member.missedDates.map((date, index) => (
            <button
              key={`${date}-${index}`}
              type="button"
              className="member-text-btn"
              onClick={() => {
                setSelectedDate(date);
                onSection?.('calendar');
                onShowDate?.(date);
              }}
            >
              Show {dayHeading(date)}
            </button>
          ))}
        </div>
      )}
      <div className="member-profile-tabs" role="tablist" aria-label="Member profile">
        {(['calendar', 'plan', 'progress'] as MemberProfileSection[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            className={section === id ? 'is-current' : ''}
            onClick={() => onSection?.(id)}
          >
            {id === 'calendar' ? 'Calendar' : id === 'plan' ? 'Plan' : 'Progress'}
          </button>
        ))}
      </div>

      {section === 'progress' && (
        <div className="member-profile-panel">
          <p>
            <b>Group schedule this week.</b>{' '}
            {['Completed', 'Partial', 'Skipped', 'Missed', 'Due today', 'Paused', 'Excused', 'Upcoming', 'Scheduled']
              .filter((state) => adherence[state])
              .map((state) => `${adherence[state]} ${state.toLowerCase()}`)
              .join(' · ') || 'No Group workout scheduled this week.'}
          </p>
          <p className="muted">These counts use saved expectations and matching sessions. A personal workout does not complete a group day.</p>
          <p className="muted">Logged sets below are group-attributed. Personal Training is not loaded here.</p>
          {progressPanel || <p className="muted">Group-attributed logs stay with the people allowed to view them.</p>}
        </div>
      )}

      {section === 'plan' && (
        <div className="member-profile-panel">
          {member.scheduleNeedsReview && (
            <p className="muted member-training-note">
              {member.scheduleReviewDetail || 'This schedule needs review. Future workouts stay as they are until it is updated.'}
            </p>
          )}
          {member.planKind === 'personal' && (
            <p className="muted member-training-note">This group is not assigning a plan. Personal training stays private.</p>
          )}
          {(onChangePlan || canEditSchedule || onEditSharedProgram || onCustomize || onMessage) && (
            <div className="member-profile-actions">
              <button type="button" className="member-plan-toggle" aria-expanded={planMenuOpen} onClick={() => setPlanMenuOpen((open) => !open)}>
                Manage
              </button>
            </div>
          )}
          {planMenuOpen && (
            <div className="member-plan-menu">
              {canManage && onChangePlan && (
                <button type="button" className="member-plan-item" onClick={onChangePlan}>
                  Change Program
                </button>
              )}
              {canEditSchedule && onSaveSchedule && (
                <button
                  type="button"
                  className="member-plan-item"
                  onClick={() => {
                    setEditingSchedule((open) => !open);
                    setScheduleMode('custom_weekdays');
                    setWeekdays(sessions.map((session) => session.dayLabel || ''));
                    setEffectiveOn(todayYmd());
                    setScheduleError('');
                  }}
                >
                  Edit Training Days
                </button>
              )}
              {canEditSchedule && onSetExpectations && (
                <button type="button" className="member-plan-item" onClick={() => setConfirmPause((open) => !open)}>
                  {member.expectationsEnabled ? 'Pause Schedule' : 'Resume Schedule'}
                </button>
              )}
              {canManage && onCustomize && customizePrograms.length > 0 && (
                <button type="button" className="member-plan-item" onClick={() => setShowCustomize((open) => !open)}>
                  Customize workouts
                </button>
              )}
              {onEditSharedProgram && (
                <button type="button" className="member-plan-item" onClick={onEditSharedProgram}>
                  Edit shared program
                </button>
              )}
              {onMessage && (
                <button type="button" className="member-plan-item" onClick={onMessage}>
                  Message member
                </button>
              )}
            </div>
          )}
          {confirmPause && onSetExpectations && (
            <form
              className="member-schedule-editor"
              onSubmit={(event) => {
                event.preventDefault();
                setActionBusy(true);
                setActionError('');
                void onSetExpectations(!member.expectationsEnabled)
                  .then(() => setConfirmPause(false))
                  .catch((error: Error) => setActionError(error.message || 'Could not update expected training.'))
                  .finally(() => setActionBusy(false));
              }}
            >
              <p>
                {member.expectationsEnabled
                  ? `Pause expected group workouts for ${member.name}. Past workouts stay. Personal training and group membership stay.`
                  : `Resume expected group workouts for ${member.name} from today. Paused dates are not filled in as missed.`}
              </p>
              {actionError && <p className="team-sheet-error">{actionError}</p>}
              <button type="submit" className="btn green" disabled={actionBusy}>
                {actionBusy ? 'Saving…' : member.expectationsEnabled ? 'Confirm pause' : 'Confirm resume'}
              </button>
            </form>
          )}
          {editingSchedule && onSaveSchedule && (
            <form
              className="member-schedule-editor"
              onSubmit={(event) => {
                event.preventDefault();
                const problem = scheduleMode === 'custom_weekdays' ? customWeekdayError(scheduleSource?.workouts, weekdays) : null;
                if (problem) {
                  setScheduleError(problem);
                  return;
                }
                setScheduleBusy(true);
                setScheduleError('');
                void onSaveSchedule({ mode: scheduleMode, weekdays: scheduleMode === 'custom_weekdays' ? weekdays : [], effectiveOn })
                  .then(() => setEditingSchedule(false))
                  .catch((error: Error) => setScheduleError(error.message || 'Could not update that schedule.'))
                  .finally(() => setScheduleBusy(false));
              }}
            >
              <p>This changes this member’s future training days. One workout and the shared program stay as they are.</p>
              <p className="muted">Current schedule · {member.scheduleDays}</p>
              <div className="assign-wizard-choices">
                <button type="button" className={scheduleMode === 'program_days' ? 'is-current' : ''} onClick={() => setScheduleMode('program_days')}>
                  Use the program’s days
                </button>
                <button type="button" className={scheduleMode === 'custom_weekdays' ? 'is-current' : ''} onClick={() => setScheduleMode('custom_weekdays')}>
                  Custom days
                </button>
              </div>
              {scheduleMode === 'custom_weekdays' && (
                <div className="assign-wizard-day-grid">
                  {sessions.map((session, index) => (
                    <label key={session.id || index}>
                      {session.title || session.dayLabel || `Workout ${index + 1}`}
                      <select
                        value={weekdays[index] || ''}
                        onChange={(event) =>
                          setWeekdays((current) => {
                            const next = sessions.map((_, item) => current[item] || '');
                            next[index] = event.target.value;
                            return next;
                          })
                        }
                      >
                        <option value="">Select day</option>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <label>
                Effective date
                <DateInput value={effectiveOn} onChange={setEffectiveOn} />
              </label>
              {!!preview.length && (
                <ul className="assign-wizard-list">
                  {preview.map((row) => (
                    <li key={`${row.scheduledDate}-${row.workoutId}`}>
                      <b>{formatDisplayDate(row.scheduledDate)}</b>
                      <span className="muted">{row.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              {scheduleError && <p className="team-sheet-error">{scheduleError}</p>}
              <button type="submit" className="btn green" disabled={scheduleBusy}>
                {scheduleBusy ? 'Saving…' : 'Save schedule'}
              </button>
            </form>
          )}
          {showCustomize && onCustomize && (
            <label className="member-training-customize">
              Customize from a group program
              <select
                defaultValue=""
                onChange={(event) => {
                  const id = event.target.value;
                  if (id) onCustomize(id);
                  event.target.value = '';
                }}
              >
                <option value="">Choose a program…</option>
                {customizePrograms.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <PlanNavigator
            program={fullProgram}
            planName={fullProgram?.name || member.planName}
            load={planLoad}
            currentWeek={member.currentProgramWeek}
          />
        </div>
      )}

      {section === 'calendar' && (
        <>
          {member.scheduleNeedsReview && (
            <p className="muted member-training-note">
              {member.scheduleReviewDetail || 'This schedule needs review. Future workouts stay as they are until it is updated.'}
            </p>
          )}
          {member.planKind === 'personal' && (
            <p className="muted member-training-note">This group is not assigning a plan. Personal training stays private.</p>
          )}
          {!member.expectationsEnabled && <p className="muted member-training-note">Schedule paused. Past workouts stay. Personal training is unchanged.</p>}
          <div className="member-week-nav">
            <button type="button" className="member-icon-btn" aria-label="Previous week" onClick={onPreviousWeek}>
              ‹
            </button>
            <div className="member-week-heading">
              <b>{shortWeekRange(resolvedWeekStart)}</b>
              {weekRangeLabel ? <span className="visually-hidden">{weekRangeLabel}</span> : null}
              {!currentWeek && (
                <button type="button" className="member-text-btn" onClick={onThisWeek}>
                  Today
                </button>
              )}
            </div>
            <button type="button" className="member-icon-btn" aria-label="Next week" onClick={onNextWeek}>
              ›
            </button>
          </div>
          {weekNotice && <p className="muted group-training-notice">{weekNotice}</p>}
          <div className="member-week-strip" role="tablist" aria-label="Workout days this week">
            {weekCells.map((cell) => {
              const value = parseYmd(cell.date);
              const selected = cell.date === selectedDate;
              return (
                <button
                  key={cell.date}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`${WEEKDAYS[value.getDay()]} ${value.getDate()}${cell.items.length ? `, ${cell.items.map((item) => item.title).join(', ')}` : ''}`}
                  className={`member-week-cell${selected ? ' is-selected' : ''}${cell.date === todayYmd() ? ' is-today' : ''}`}
                  onClick={() => {
                    setSelectedDate(cell.date);
                    setExpandedKey(null);
                    setActionError('');
                  }}
                >
                  <span>{WEEKDAYS[value.getDay()]}</span>
                  <b>{value.getDate()}</b>
                  <i className={dayMark(cell.items)} />
                </button>
              );
            })}
          </div>
          <section className="member-day-detail" aria-label={dayHeading(selectedDate)}>
            <div className="member-day-head">
              <h3>{dayHeading(selectedDate)}</h3>
              {canAddActivity && (
                <button
                  type="button"
                  className="member-text-btn"
                  onClick={() => {
                    closePlanTools();
                    setOneOffDate(selectedDate);
                    setExtraRequired(false);
                    setAddingWorkout(true);
                  }}
                >
                  Add Activity
                </button>
              )}
            </div>
            {addingWorkout && onAddActivity && (
              <form
                className="member-schedule-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!oneOffId || activity.reason !== 'ready') {
                    setActionError(activity.reason === 'personal' ? 'A personal copy cannot be added with the current assignment rule.' : 'Choose a workout.');
                    return;
                  }
                  setActionBusy(true);
                  setActionError('');
                  const chosen = activity.choices.find((workout) => workout.workoutId === oneOffId);
                  const workoutName = workoutFor(oneOffId)?.title || chosen?.title || 'Workout';
                  void onAddActivity({
                    activityType: 'strength',
                    title: workoutName,
                    scheduledDate: oneOffDate,
                    workoutId: oneOffId,
                    programId: member.programId,
                    required: canRequireExtra && extraRequired,
                  })
                    .then(() => setAddingWorkout(false))
                    .catch((error: Error) => setActionError(error.message || 'Could not add that workout.'))
                    .finally(() => setActionBusy(false));
                }}
              >
                <p>Add one extra for {member.name} on {dayHeading(oneOffDate)}. It stays off the assigned program and off Personal Training.</p>
                <div className="assign-wizard-choices">
                  <button type="button" className="is-current">Program workout</button>
                  <button type="button" onClick={() => setActivitySheet(true)}>Cardio, mobility, or other</button>
                </div>
                {activity.reason === 'loading' && <p className="muted">Loading workouts from the assigned program…</p>}
                {activity.reason === 'unread' && (
                  <p>The assigned program could not be read, so there is no workout to add. The enrollment itself is unchanged.</p>
                )}
                {activity.reason === 'personal' && (
                  <p>
                    {fullProgram?.name || member.planName} is a personal copy. Adding one of its workouts needs a database change that is not turned on. The current assignment rule only accepts a team program.
                  </p>
                )}
                {activity.reason === 'empty' && <p>{fullProgram?.name || member.planName} has no workouts to add.</p>}
                {activity.reason === 'ready' && (
                  <label>
                    Workout
                    <select value={oneOffId} onChange={(event) => setOneOffId(event.target.value)}>
                      <option value="">Choose a workout…</option>
                      {activity.choices.map((workout) => (
                        <option key={workout.workoutId} value={workout.workoutId}>
                          {workout.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Date
                  <DateInput value={oneOffDate} onChange={setOneOffDate} />
                </label>
                {canRequireExtra && (
                  <label className="remember-row">
                    <input type="checkbox" checked={extraRequired} onChange={(event) => setExtraRequired(event.target.checked)} />
                    Required. Program missed totals stay the same.
                  </label>
                )}
                {actionError && <p className="team-sheet-error">{actionError}</p>}
                <button type="submit" className="btn green" disabled={actionBusy || activity.reason !== 'ready'}>
                  {actionBusy ? 'Saving…' : 'Add this workout'}
                </button>
              </form>
            )}
            {activitySheet && onAddActivity && (
              <AddActivitySheet
                dayLabel={dayHeading(oneOffDate)}
                activityTypes={GROUP_EXTRA_TYPES}
                allowRequired={canRequireExtra}
                required={extraRequired}
                onRequiredChange={setExtraRequired}
                onClose={() => setActivitySheet(false)}
                onSave={async (draft) => {
                  await onAddActivity({
                    activityType: draft.activity_type,
                    title: draft.title,
                    scheduledDate: oneOffDate,
                    durationMinutes: draft.duration_minutes,
                    notes: draft.notes,
                    details: draft.details,
                    required: canRequireExtra && extraRequired,
                  });
                  setActivitySheet(false);
                  setAddingWorkout(false);
                }}
              />
            )}
            {selectedItems.length === 0 ? (
              <div>
                <p>Rest day. No Group workout scheduled.</p>
                {member.programId ? (
                  <p className="muted">The assigned program is still {fullProgram?.name || member.planName}.</p>
                ) : null}
              </div>
            ) : (
              selectedItems.map((item, index) => {
                const key = `${item.date}-${item.workoutId || item.title}-${index}`;
                const workout = workoutFor(item.workoutId);
                const exercises = [...(workout?.exercises || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                const open = expandedKey === key;
                const countLabel = exercises.length === 1 ? '1 exercise' : exercises.length > 1 ? `${exercises.length} exercises` : '';
                const title = displayWorkoutName(item.title, workout);
                const place = programWorkoutPlace(workout) || programWorkoutPlace({ week: item.programWeek, dayLabel: item.dayLabel });
                return (
                  <article key={key} className="member-day-workout">
                    <button
                      type="button"
                      className="member-day-workout-open"
                      aria-expanded={open}
                      onClick={() => setExpandedKey(open ? null : key)}
                    >
                      <b>{title}</b>
                      {item.origin === 'extra' ? <span className="muted">{extraActivityLabel(!!item.required)}</span> : null}
                      {place ? <span className="muted">{place}</span> : null}
                      <span className="muted">
                        {item.state}
                        {countLabel ? ` · ${countLabel}` : ''}
                      </span>
                    </button>
                    {open && (
                      <div className="member-profile-workout">
                        <div className="member-day-actions">
                          {memberCanLog(item) && item.workoutId && item.expectationId && member.programId && teamId && (
                            <button
                              type="button"
                              className="btn small green"
                              onClick={() =>
                                onLogWorkout?.({
                                  memberUserId: member.userId,
                                  expectationId: item.expectationId || '',
                                  workoutId: item.workoutId || '',
                                  programId: member.programId || '',
                                  scheduledDate: item.date,
                                  sourceKey: `group:${teamId}`,
                                })
                              }
                            >
                              Log this workout
                            </button>
                          )}
                          {canEditSchedule && (
                            <WorkoutScheduleActions
                              memberName={member.name}
                              workout={item}
                              canEdit
                              compact
                              sameSchedule={days}
                              hideViewButton
                              onClose={() => setExpandedKey(null)}
                              onMoveWorkout={onMoveWorkout}
                              onExcuseWorkout={onExcuseWorkout}
                              onRestoreWorkout={onRestoreWorkout}
                            />
                          )}
                        </div>
                        {viewerUserId && viewerUserId !== member.userId && item.workoutId && item.date <= todayYmd() && item.state !== 'Excused' && item.state !== 'Paused' && (
                          <p className="muted">Only this member can log the workout.</p>
                        )}
                        <PrescriptionCompare exercises={exercises} logs={groupLogs} date={item.date} />
                        {groupLogs == null && (
                          <p className="muted">Planned sets are below. Group-attributed logs appear with this member’s progress. Personal training is not queried here.</p>
                        )}
                        {exercises.length === 0 && groupLogs == null ? (
                          <p className="muted">No exercises are stored on this workout.</p>
                        ) : groupLogs == null ? (
                          <ul className="member-profile-exercises">
                            {exercises.map((exercise) => (
                              <li key={exercise.id || exercise.name}>
                                <b>{exercise.name}</b>
                                <span className="muted">
                                  {formatWarmupPrescription(
                                    (exercise.sets || []).map((set, index) => ({
                                      set_number: set.setNumber || index + 1,
                                      target_reps: set.reps || '',
                                      target_weight: set.weight || '',
                                    }))
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
