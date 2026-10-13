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
              Edit schedule
            </button>
          )}
          {canManage && onCustomize && customizePrograms.length > 0 && (
            <button type="button" className="btn secondary" onClick={() => setShowCustomize((open) => !open)}>
              Customize workouts
            </button>
          )}
          {onMessage && (
            <button type="button" className="btn secondary" onClick={onMessage}>
              Message member
            </button>
          )}
        </div>
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
          <p>Only {member.name}&apos;s future schedule will change. Past workouts and logged sessions stay.</p>
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
      <h3>This week</h3>
      {member.weekItems.length === 0 ? (
        <p className="muted">Nothing from this group is scheduled this week.</p>
      ) : (
        <div className="member-training-week">
          {member.weekItems.map((item) => (
            <div key={`${item.date}-${item.title}`} className="member-training-week-row">
              <div>
                <b>{formatDisplayDate(item.date)}</b>
                <span className="muted">{item.title}</span>
              </div>
              <span className={`group-training-status group-training-week-${item.state.replace(/\s+/g, '-').toLowerCase()}`}>
                {item.state}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
