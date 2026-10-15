'use client';

import { useMemo, useState, type ReactNode } from 'react';
import DateInput from '../DateInput';
import type { GroupTrainingMemberRow, GroupTrainingProgramRef, GroupTrainingWeekItem } from '../../../lib/groups/trainingWorkspace';
import { orderedWeekSessions } from '../../../lib/groups/trainingWorkspace';
import { customWeekdayError, materializeMemberSchedule, programCycleAnchor } from '../../../lib/groups/memberSchedule';
import { formatWarmupPrescription } from '../training/WarmupExerciseCard';
import { formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';
import WorkoutScheduleActions from './WorkoutScheduleActions';

export type MemberProfileSection = 'calendar' | 'progress' | 'details';

type MemberTrainingWorkspaceProps = {
  groupName: string;
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
  weekRangeLabel?: string;
  onPreviousWeek?: () => void;
  onNextWeek?: () => void;
  onThisWeek?: () => void;
  weekNotice?: string | null;
  switchMembers?: Array<{ userId: string; name: string }>;
  onSwitchMember?: (userId: string) => void;
  progressPanel?: ReactNode;
  detailsPanel?: ReactNode;
};

export default function MemberTrainingWorkspace({
  groupName,
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
  weekRangeLabel,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  weekNotice,
  switchMembers = [],
  onSwitchMember,
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
  const days = weekItems || member.weekItems;
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
  const matches = switchMembers.filter((item) => item.name.toLowerCase().includes(memberQuery.trim().toLowerCase()));
  const completed = days.filter((item) => item.state === 'Completed').length;
  const due = days.filter((item) => item.state === 'Due today').length;

  function exercisesFor(workoutId: string | null) {
    if (!workoutId) return [];
    const workout = scheduleProgram?.workouts?.find((item) => item.id === workoutId);
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
    <div className="member-training-workspace member-profile">
      <div className="member-profile-toolbar">
        <button type="button" className="btn secondary member-training-back" onClick={onBack}>
          Back to members
        </button>
        {onSwitchMember && switchMembers.length > 1 && (
          <div className="member-profile-switch">
            <button
              type="button"
              className="btn secondary"
              disabled={switchIndex <= 0}
              onClick={() => switchIndex > 0 && onSwitchMember(switchMembers[switchIndex - 1].userId)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={switchIndex < 0 || switchIndex >= switchMembers.length - 1}
              onClick={() => switchIndex >= 0 && switchIndex < switchMembers.length - 1 && onSwitchMember(switchMembers[switchIndex + 1].userId)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <h2>
        {member.name}
        {groupName ? <span className="muted"> · {groupName}</span> : null}
      </h2>
      <p className="muted member-profile-planline">
        {member.planName} · {member.scheduleDays} · {member.statusLabel}
      </p>
      {onSwitchMember && switchMembers.length > 5 && (
        <label className="member-profile-search">
          Find a member
          <input
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="Search members"
          />
        </label>
      )}
      {memberQuery.trim() && onSwitchMember && (
        <div className="member-profile-search-results">
          {matches.slice(0, 8).map((item) => (
            <button key={item.userId} type="button" className="btn small secondary" onClick={() => onSwitchMember(item.userId)}>
              {item.name}
            </button>
          ))}
          {matches.length === 0 && <p className="muted">No member matches that search.</p>}
        </div>
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
          <div className="member-profile-actions">
            {canEditSchedule && onAddWorkout && (
              <button type="button" className="btn green" onClick={() => { closePlanTools(); setAddingWorkout(true); }}>
                Add Activity
              </button>
            )}
            {(onChangePlan || canEditSchedule || onEditSharedProgram || onCustomize || onMessage) && (
              <button type="button" className="btn secondary" aria-expanded={planMenuOpen} onClick={() => setPlanMenuOpen((open) => !open)}>
                Plan
              </button>
            )}
          </div>
          {planMenuOpen && (
            <div className="member-plan-menu">
              {canManage && onChangePlan && (
                <button type="button" className="btn secondary" onClick={onChangePlan}>
                  Change Plan
                </button>
              )}
              {canEditSchedule && onSaveSchedule && (
                <button
                  type="button"
                  className="btn secondary"
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
                <button type="button" className="btn secondary" onClick={() => setConfirmPause((open) => !open)}>
                  {member.expectationsEnabled ? 'Pause Schedule' : 'Resume Schedule'}
                </button>
              )}
              {canManage && onCustomize && customizePrograms.length > 0 && (
                <button type="button" className="btn secondary" onClick={() => setShowCustomize((open) => !open)}>
                  Customize workouts
                </button>
              )}
              {onEditSharedProgram && (
                <button type="button" className="btn secondary" onClick={onEditSharedProgram}>
                  Edit shared program
                </button>
              )}
              {onMessage && (
                <button type="button" className="btn secondary" onClick={onMessage}>
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
              <p>Add one workout for {member.name}. This does not change the shared program or their training days.</p>
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
          {!member.expectationsEnabled && <p className="muted member-training-note">Schedule paused. Past workouts stay. Personal training is unchanged.</p>}
          <div className="member-profile-weekbar">
            <button type="button" className="btn secondary" onClick={onPreviousWeek}>Previous week</button>
            <div>
              <b>{weekRangeLabel || 'This week'}</b>
              <span className="muted">{completed} completed · {due} due today · {days.length} scheduled</span>
            </div>
            <button type="button" className="btn secondary" onClick={onThisWeek}>Today</button>
            <button type="button" className="btn secondary" onClick={onNextWeek}>Next week</button>
          </div>
          {weekNotice && <p className="muted group-training-notice">{weekNotice}</p>}
          {days.length === 0 ? (
            <p className="muted">Nothing from this group is scheduled this week.</p>
          ) : (
            <div className="training-workout-days member-profile-days" role="tablist" aria-label="Workout days this week">
              {days.map((item) => {
                const key = `${item.date}-${item.workoutId || item.title}`;
                const open = expandedKey === key;
                const exercises = exercisesFor(item.workoutId);
                return (
                  <div key={key} className="member-profile-day">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={open}
                      className={`training-workout-day${open ? ' training-workout-day--active' : ''}${item.state === 'Due today' ? ' training-workout-day--today' : ''}`}
                      onClick={() => {
                        setExpandedKey(open ? null : key);
                        setActionError('');
                      }}
                    >
                      <span className="training-workout-day-label">
                        {item.dayLabel || formatDisplayDate(item.date)} · {item.title}
                      </span>
                      <span className="training-workout-day-date">
                        {formatDisplayDate(item.date)} · {item.state}
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
                        <WorkoutScheduleActions
                          memberName={member.name}
                          workout={item}
                          canEdit={!!canEditSchedule}
                          sameSchedule={days}
                          hideViewButton
                          onClose={() => setExpandedKey(null)}
                          onMoveWorkout={onMoveWorkout}
                          onExcuseWorkout={onExcuseWorkout}
                          onRestoreWorkout={onRestoreWorkout}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
