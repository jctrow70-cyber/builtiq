'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import DateInput from '../DateInput';
import type { GroupTrainingMemberRow, GroupTrainingProgramRef, GroupTrainingWeekItem } from '../../../lib/groups/trainingWorkspace';
import { assignedProgramFromPayload, orderedWeekSessions } from '../../../lib/groups/trainingWorkspace';
import { fetchFullProgram } from '../../../lib/training/programFetch';
import { supabase } from '../../../lib/supabaseClient';
import { customWeekdayError, materializeMemberSchedule, programCycleAnchor } from '../../../lib/groups/memberSchedule';
import { formatWarmupPrescription } from '../training/WarmupExerciseCard';
import { addDaysYmd, formatDisplayDate, mondayOfWeek, parseYmd, todayYmd } from '../../../lib/training/programCalendar';
import WorkoutScheduleActions from './WorkoutScheduleActions';

export type MemberProfileSection = 'calendar' | 'progress' | 'details';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

function ProgramTemplate({
  program,
  planName,
  load,
}: {
  program: GroupTrainingProgramRef | null;
  planName: string;
  load: 'loading' | 'ready' | 'denied' | 'empty';
}) {
  if (load === 'loading') {
    return (
      <div className="member-plan-template">
        <p className="muted">Loading the assigned program…</p>
      </div>
    );
  }
  if (load === 'denied') {
    return (
      <div className="member-plan-template">
        <p>This is the assigned program, not this member’s calendar.</p>
        <p className="muted">You do not have permission to view this program. It remains the program on this group enrollment. Opening this view does not change the calendar or start a workout.</p>
      </div>
    );
  }
  if (load === 'empty' || !program?.workouts?.length) {
    return (
      <div className="member-plan-template">
        <p>This is the program template. The calendar uses this member’s saved dates, including moved and one-off workouts.</p>
        <p className="muted">{program?.name || planName} has no workouts stored on the program.</p>
      </div>
    );
  }
  const weeks = Array.from(new Set(program.workouts.map((workout) => Number(workout.week || 1)))).sort((a, b) => a - b);
  return (
    <div className="member-plan-template">
      <p>This is the program template, {program.name}. The calendar uses this member’s saved dates, including moved and one-off workouts.</p>
      {weeks.map((week) => (
        <section key={week}>
          <h3>Week {week}</h3>
          {program.workouts
            ?.filter((workout) => Number(workout.week || 1) === week)
            .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0))
            .map((workout) => (
              <article key={workout.id || `${week}-${workout.title}`}>
                <b>{[workout.dayLabel, workout.title].filter(Boolean).join(' · ') || 'Workout'}</b>
                {(workout.exercises || []).length === 0 ? (
                  <p className="muted">No exercises are stored on this workout.</p>
                ) : (
                  <ul className="member-profile-exercises">
                    {(workout.exercises || []).map((exercise) => {
                      const rest = (exercise.sets || []).map((set) => Number(set.restSeconds || 0)).find((value) => value > 0);
                      const rir = (exercise.sets || []).map((set) => String(set.rir || '').trim()).find(Boolean);
                      const setTypes = Array.from(
                        new Set((exercise.sets || []).map((set) => String(set.setType || '').trim()).filter((value) => value && value !== 'working'))
                      );
                      return (
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
                            {setTypes.length ? ` · ${setTypes.join(', ')}` : ''}
                            {rir ? ` · RIR ${rir}` : ''}
                            {rest ? ` · Rest ${rest}s` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            ))}
        </section>
      ))}
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
  planEditor?: ReactNode;
  customizePrograms?: Array<{ id: string; name: string }>;
  onBack: () => void;
  onChangePlan?: () => void;
  canEditSchedule?: boolean;
  scheduleProgram?: GroupTrainingProgramRef | null;
  onSaveSchedule?: (input: { mode: 'program_days' | 'custom_weekdays'; weekdays: string[]; effectiveOn: string }) => Promise<void>;
  onMoveWorkout?: (input: { workoutId: string; originalDate: string; newDate: string }) => Promise<void>;
  onExcuseWorkout?: (input: { workoutId: string; originalDate: string }) => Promise<void>;
  onRestoreWorkout?: (input: { workoutId: string; originalDate: string }) => Promise<void>;
  onSetExpectations?: (enabled: boolean) => Promise<void>;
  onAddWorkout?: (input: { workoutId: string; scheduledDate: string }) => Promise<void>;
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
  detailsPanel?: ReactNode;
};

export default function MemberTrainingWorkspace({
  groupName,
  teamId = null,
  member,
  canManage,
  planEditor,
  customizePrograms = [],
  onBack,
  onChangePlan,
  canEditSchedule = false,
  scheduleProgram = null,
  onSaveSchedule,
  onMoveWorkout,
  onExcuseWorkout,
  onRestoreWorkout,
  onSetExpectations,
  onAddWorkout,
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
  detailsPanel,
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
  const [oneOffId, setOneOffId] = useState('');
  const [oneOffDate, setOneOffDate] = useState(todayYmd());
  const [memberQuery, setMemberQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
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
  const sessions = useMemo(() => {
    const workouts = scheduleProgram?.workouts || [];
    const week = workouts.map((workout) => Number(workout.week)).find((value) => orderedWeekSessions(workouts, value).length > 0) || 1;
    return orderedWeekSessions(workouts, week);
  }, [scheduleProgram]);
  const preview = useMemo(() => {
    if (!scheduleProgram || scheduleMode !== 'custom_weekdays') return [];
    return materializeMemberSchedule({
      mode: 'custom_weekdays',
      weekdays,
      program: scheduleProgram,
      startsOn: effectiveOn,
      effectiveOn,
      cycleAnchor: programCycleAnchor(scheduleProgram, effectiveOn),
    }).slice(0, 4);
  }, [scheduleProgram, scheduleMode, weekdays, effectiveOn]);
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
    setPlanOpen(false);
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

  function exercisesFor(workoutId: string | null) {
    if (!workoutId) return [];
    const source = fullProgram?.workouts?.length ? fullProgram : scheduleProgram;
    const workout = source?.workouts?.find((item) => item.id === workoutId);
    return [...(workout?.exercises || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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
        <button type="button" className="member-program-open" onClick={() => setPlanOpen((open) => !open)} aria-expanded={planOpen}>
          <b>{fullProgram?.name || member.planName}</b>
          <span className="muted">
            {[
              member.scheduleDays,
              member.programWeeks || fullProgram?.weeks ? `${member.programWeeks || fullProgram?.weeks} weeks` : '',
              member.currentProgramWeek && member.programWeeks ? `Week ${member.currentProgramWeek} of ${member.programWeeks}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || 'Program details are not on this assignment.'}
          </span>
        </button>
        <button type="button" className="member-text-btn" onClick={() => setPlanOpen(true)}>
          View Full Plan
        </button>
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
                setPlanOpen(false);
                onShowDate?.(date);
              }}
            >
              Show {dayHeading(date)}
            </button>
          ))}
          {member.status === 'needs_plan' && onChangePlan && (
            <button type="button" className="member-text-btn" onClick={onChangePlan}>
              Change Plan
            </button>
          )}
          {member.status === 'schedule_review' && onSaveSchedule && (
            <button type="button" className="member-text-btn" onClick={() => { setPlanMenuOpen(true); setEditingSchedule(true); }}>
              Edit Training Days
            </button>
          )}
        </div>
      )}
      {planOpen && (
        <ProgramTemplate
          program={fullProgram}
          planName={fullProgram?.name || member.planName}
          load={planLoad}
        />
      )}
      <div className="member-profile-tabs" role="tablist" aria-label="Member profile">
        {(['calendar', 'progress', 'details'] as MemberProfileSection[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            className={section === id ? 'is-current' : ''}
            onClick={() => onSection?.(id)}
          >
            {id === 'calendar' ? 'Calendar' : id === 'progress' ? 'Progress' : 'Details'}
          </button>
        ))}
      </div>

      {section === 'progress' && (
        <div className="member-profile-panel">
          {progressPanel || <p className="muted">Progress for this member stays with the people allowed to view it.</p>}
        </div>
      )}
      {section === 'details' && (
        <div className="member-profile-panel">
          {detailsPanel || (
            <p className="muted">
              {member.planName}. {member.scheduleDays}. Personal training stays private.
            </p>
          )}
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
                const problem = scheduleMode === 'custom_weekdays' ? customWeekdayError(scheduleProgram?.workouts, weekdays) : null;
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
          {planEditor}
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
              {canEditSchedule && onAddWorkout && (
                <button
                  type="button"
                  className="member-text-btn"
                  onClick={() => {
                    closePlanTools();
                    setOneOffDate(selectedDate);
                    setAddingWorkout(true);
                  }}
                >
                  Add Activity
                </button>
              )}
            </div>
            {addingWorkout && onAddWorkout && (
              <form
                className="member-schedule-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!oneOffId) {
                    setActionError('Choose a workout.');
                    return;
                  }
                  setActionBusy(true);
                  setActionError('');
                  void onAddWorkout({ workoutId: oneOffId, scheduledDate: oneOffDate })
                    .then(() => setAddingWorkout(false))
                    .catch((error: Error) => setActionError(error.message || 'Could not add that workout.'))
                    .finally(() => setActionBusy(false));
                }}
              >
                <p>Add one group workout for {member.name} on {dayHeading(oneOffDate)}. This stays on the group schedule. Personal training is not changed.</p>
                <label>
                  Workout
                  <select value={oneOffId} onChange={(event) => setOneOffId(event.target.value)}>
                    <option value="">Choose a workout…</option>
                    {(scheduleProgram?.workouts ?? []).map((workout) => (
                      <option key={workout.id} value={workout.id || workout.title}>
                        {workout.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <DateInput value={oneOffDate} onChange={setOneOffDate} />
                </label>
                {actionError && <p className="team-sheet-error">{actionError}</p>}
                <button type="submit" className="btn green" disabled={actionBusy}>
                  {actionBusy ? 'Saving…' : 'Add this workout'}
                </button>
              </form>
            )}
            {selectedItems.length === 0 ? (
              <p className="muted">Nothing from this group is scheduled this day.</p>
            ) : (
              selectedItems.map((item, index) => {
                const key = `${item.date}-${item.workoutId || item.title}-${index}`;
                const exercises = exercisesFor(item.workoutId);
                const open = expandedKey === key;
                const countLabel = exercises.length === 1 ? '1 exercise' : exercises.length > 1 ? `${exercises.length} exercises` : '';
                return (
                  <article key={key} className="member-day-workout">
                    <button
                      type="button"
                      className="member-day-workout-open"
                      aria-expanded={open}
                      onClick={() => setExpandedKey(open ? null : key)}
                    >
                      <b>{item.title}</b>
                      <span className="muted">
                        {dayHeading(item.date)} · {item.state}
                        {countLabel ? ` · ${countLabel}` : ''}
                      </span>
                    </button>
                    {open && (
                      <div className="member-profile-workout">
                        {exercises.length === 0 ? (
                          <p className="muted">No exercise details are stored on this workout.</p>
                        ) : (
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
                        )}
                        {canEditSchedule && (
                          <WorkoutScheduleActions
                            memberName={member.name}
                            workout={item}
                            canEdit
                            sameSchedule={days}
                            hideViewButton
                            onClose={() => setExpandedKey(null)}
                            onMoveWorkout={onMoveWorkout}
                            onExcuseWorkout={onExcuseWorkout}
                            onRestoreWorkout={onRestoreWorkout}
                          />
                        )}
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
