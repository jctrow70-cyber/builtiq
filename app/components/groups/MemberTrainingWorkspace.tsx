'use client';

import { useMemo, useState, type ReactNode } from 'react';
import DateInput from '../DateInput';
import type { GroupTrainingMemberRow, GroupTrainingProgramRef } from '../../../lib/groups/trainingWorkspace';
import { orderedWeekSessions } from '../../../lib/groups/trainingWorkspace';
import { customWeekdayError, materializeMemberSchedule, programCycleAnchor } from '../../../lib/groups/memberSchedule';
import { formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';

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
}: MemberTrainingWorkspaceProps) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'program_days' | 'custom_weekdays'>('program_days');
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [effectiveOn, setEffectiveOn] = useState(todayYmd());
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<GroupTrainingMemberRow['weekItems'][number] | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [confirmMove, setConfirmMove] = useState(false);
  const [confirmExcuse, setConfirmExcuse] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [addingWorkout, setAddingWorkout] = useState(false);
  const [oneOffId, setOneOffId] = useState('');
  const [oneOffDate, setOneOffDate] = useState(todayYmd());
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

  return (
    <div className="member-training-workspace">
      <button type="button" className="btn secondary member-training-back" onClick={onBack}>
        Back to members
      </button>
      <h2>
        {member.name}
        {groupName ? <span className="muted"> · {groupName}</span> : null}
      </h2>
      <div className="group-training-summary member-training-facts">
        <div>
          <b>{member.planName}</b>
          <span className="muted">Group plan</span>
        </div>
        <div>
          <b>{member.scheduleDays}</b>
          <span className="muted">Training days</span>
        </div>
        <div>
          <b>{member.nextWorkout?.label || '—'}</b>
          <span className="muted">{member.nextWorkout ? formatDisplayDate(member.nextWorkout.date) : 'Next workout'}</span>
        </div>
        <div>
          <b className={`group-training-status group-training-status-${member.status}`}>{member.statusLabel}</b>
          <span className="muted">Status</span>
        </div>
      </div>
      {member.scheduleNeedsReview && (
        <p className="muted member-training-note">
          {member.scheduleReviewDetail || 'This schedule needs review. Future workouts stay as they are until it is updated.'}
        </p>
      )}
      {member.planKind === 'personal' && (
        <p className="muted member-training-note">This group is not assigning a plan. Personal training stays private.</p>
      )}
      {(canManage || onMessage || canEditSchedule) && (
        <div className="actions member-training-actions">
          {canManage && onChangePlan && (
            <button type="button" className="btn green" onClick={onChangePlan}>
              Change plan
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
          {canManage && onCustomize && customizePrograms.length > 0 && (
            <button type="button" className="btn secondary" onClick={() => setShowCustomize((open) => !open)}>
              Customize workouts
            </button>
          )}
          {canEditSchedule && onSetExpectations && (
            <button type="button" className="btn secondary" onClick={() => setConfirmPause((open) => !open)}>
              {member.expectationsEnabled ? 'Pause Schedule' : 'Resume Schedule'}
            </button>
          )}
          {canEditSchedule && onAddWorkout && (
            <button type="button" className="btn secondary" onClick={() => setAddingWorkout((open) => !open)}>
              Add workout
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
                <option key={workout.id} value={workout.id}>
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
      {!member.expectationsEnabled && <p className="muted member-training-note">Expected group training is paused. Past workouts stay. Personal training is unchanged.</p>}
      <h3>This week</h3>
      {member.weekItems.length === 0 ? (
        <p className="muted">Nothing from this group is scheduled this week.</p>
      ) : (
        <div className="member-training-week">
          {member.weekItems.map((item) => (
            <button
              key={`${item.date}-${item.workoutId || item.title}`}
              type="button"
              className="member-training-week-row"
              onClick={() => {
                setSelectedWorkout(item);
                setMoveDate(item.date);
                setConfirmMove(false);
                setConfirmExcuse(false);
                setConfirmRestore(false);
                setActionError('');
              }}
            >
              <div>
                <b>{formatDisplayDate(item.date)}</b>
                <span className="muted">{item.title}</span>
              </div>
              <span className={`group-training-status group-training-week-${item.state.replace(/\s+/g, '-').toLowerCase()}`}>
                {item.state}
              </span>
            </button>
          ))}
        </div>
      )}
      {selectedWorkout && (
        <div className="member-schedule-editor">
          <p>
            <b>{selectedWorkout.title}</b> · {formatDisplayDate(selectedWorkout.date)}
          </p>
          <p className="muted">This workout only. Training days and the shared program stay the same.</p>
          {actionError && <p className="team-sheet-error">{actionError}</p>}
          <div className="actions member-training-actions">
            <button type="button" className="btn secondary" onClick={() => setSelectedWorkout(null)}>
              View Workout
            </button>
            {canEditSchedule && onMoveWorkout && selectedWorkout.workoutId && !selectedWorkout.hasSession && selectedWorkout.date >= todayYmd() && (
              <button type="button" className="btn secondary" onClick={() => setConfirmMove(true)}>
                Move Workout
              </button>
            )}
            {canEditSchedule && onExcuseWorkout && selectedWorkout.workoutId && !selectedWorkout.excused && !selectedWorkout.hasSession && selectedWorkout.date >= todayYmd() && (
              <button type="button" className="btn secondary" onClick={() => setConfirmExcuse(true)}>
                Excuse Workout
              </button>
            )}
            {canEditSchedule && onRestoreWorkout && selectedWorkout.workoutId && selectedWorkout.excused && selectedWorkout.date >= todayYmd() && (
              <button type="button" className="btn secondary" onClick={() => setConfirmRestore(true)}>
                Restore Workout
              </button>
            )}
          </div>
          {confirmMove && onMoveWorkout && selectedWorkout.workoutId && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setActionBusy(true);
                setActionError('');
                void onMoveWorkout({ workoutId: selectedWorkout.workoutId!, originalDate: selectedWorkout.date, newDate: moveDate })
                  .then(() => setSelectedWorkout(null))
                  .catch((error: Error) => setActionError(error.message || 'Could not move that workout.'))
                  .finally(() => setActionBusy(false));
              }}
            >
              <label>
                Move to
                <DateInput value={moveDate} onChange={setMoveDate} />
              </label>
              <p>
                {member.name} — {selectedWorkout.title}
                <br />
                Originally: {formatDisplayDate(selectedWorkout.date)}
                <br />
                Move to: {formatDisplayDate(moveDate)}
              </p>
              {member.weekItems
                .filter((item) => item.date === moveDate && item.title !== selectedWorkout.title)
                .map((item) => (
                  <p key={item.title} className="muted">
                    Also on that day: {item.title}
                  </p>
                ))}
              <button type="submit" className="btn green" disabled={actionBusy || moveDate < todayYmd()}>
                {actionBusy ? 'Saving…' : 'Confirm move'}
              </button>
            </form>
          )}
          {confirmExcuse && onExcuseWorkout && selectedWorkout.workoutId && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setActionBusy(true);
                setActionError('');
                void onExcuseWorkout({ workoutId: selectedWorkout.workoutId!, originalDate: selectedWorkout.date })
                  .then(() => setSelectedWorkout(null))
                  .catch((error: Error) => setActionError(error.message || 'Could not excuse that workout.'))
                  .finally(() => setActionBusy(false));
              }}
            >
              <p>
                Excuse {selectedWorkout.title} on {formatDisplayDate(selectedWorkout.date)}. It leaves the adherence count and stays in history.
              </p>
              <button type="submit" className="btn green" disabled={actionBusy}>
                {actionBusy ? 'Saving…' : 'Confirm excuse'}
              </button>
            </form>
          )}
          {confirmRestore && onRestoreWorkout && selectedWorkout.workoutId && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setActionBusy(true);
                setActionError('');
                void onRestoreWorkout({ workoutId: selectedWorkout.workoutId!, originalDate: selectedWorkout.date })
                  .then(() => setSelectedWorkout(null))
                  .catch((error: Error) => setActionError(error.message || 'Could not restore that workout.'))
                  .finally(() => setActionBusy(false));
              }}
            >
              <p>Restore {selectedWorkout.title} on {formatDisplayDate(selectedWorkout.date)} to the expected schedule.</p>
              <button type="submit" className="btn green" disabled={actionBusy}>
                {actionBusy ? 'Saving…' : 'Confirm restore'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
