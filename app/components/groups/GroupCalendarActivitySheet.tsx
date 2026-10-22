'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import DateInput from '../DateInput';
import AddActivitySheet from '../programDesign/AddActivitySheet';
import type { ActivityType } from '../../../lib/programDesign/types';
import { saveGroupActivity } from '../../../lib/groups/groupActivities';
import { groupRepeatDraft, groupRepeatSave, groupWeekdayIndex, type GroupRepeatDraft } from '../../../lib/groups/groupActivityRepeat';
import {
  eligibleGroupProgramWorkouts,
  resolveGroupStrengthRecipients,
  saveGroupStrengthWorkout,
  type GroupProgramWorkoutOption,
  type GroupStrengthRecipientMode,
} from '../../../lib/groups/groupStrengthWorkout';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import { groupStrengthExercisePayload, validateGroupStrengthDraft, type DraftWorkout } from '../../../lib/training/draftWorkout';
import GroupActivityRepeatFields from './GroupActivityRepeatFields';
import GroupStrengthWorkoutEditor, { initialGroupStrengthDraft } from './GroupStrengthWorkoutEditor';

const OTHER_TYPES: ActivityType[] = ['cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'];

type CalendarMember = { userId: string; name: string; active?: boolean };

type GroupCalendarActivitySheetProps = {
  supabase: SupabaseClient;
  teamId: string;
  date: string;
  members: CalendarMember[];
  canAssign: boolean;
  viewerUserId: string;
  onDate: (date: string) => void;
  onClose: () => void;
  onSaved: () => void;
};

export default function GroupCalendarActivitySheet({
  supabase,
  teamId,
  date,
  members,
  canAssign,
  viewerUserId,
  onDate,
  onClose,
  onSaved,
}: GroupCalendarActivitySheetProps) {
  const [kind, setKind] = useState<'menu' | 'strength' | 'other'>('menu');
  const [source, setSource] = useState<'program' | 'new'>('new');
  const [programs, setPrograms] = useState<GroupProgramWorkoutOption[]>([]);
  const [programsState, setProgramsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [programError, setProgramError] = useState('');
  const [workoutId, setWorkoutId] = useState('');
  const [title, setTitle] = useState('Strength workout');
  const [draft, setDraft] = useState<DraftWorkout>(() => initialGroupStrengthDraft());
  const [notes, setNotes] = useState('');
  const [required, setRequired] = useState(false);
  const [repeat, setRepeat] = useState<GroupRepeatDraft>(() => groupRepeatDraft(date));
  const [recipientMode, setRecipientMode] = useState<GroupStrengthRecipientMode>('self');
  const [selectedIds, setSelectedIds] = useState<string[]>(viewerUserId ? [viewerUserId] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeMembers = members.filter((member) => member.active !== false && member.userId);

  useEffect(() => {
    let cancelled = false;
    setProgramsState('loading');
    void supabase
      .from('st_programs')
      .select('id, name, visibility, program_use, st_workouts(id, week, day_order, day_label, workout_type)')
      .eq('team_id', teamId)
      .eq('visibility', 'team')
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          setProgramsState('error');
          setProgramError(loadError.message);
          setPrograms([]);
          return;
        }
        setPrograms(eligibleGroupProgramWorkouts((data || []) as Parameters<typeof eligibleGroupProgramWorkouts>[0]));
        setProgramsState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, teamId]);

  function changeDate(next: string) {
    onDate(next);
    setRepeat((current) => ({ ...current, weekdays: Array.from(new Set([groupWeekdayIndex(next), ...current.weekdays])) }));
  }

  function toggleMember(userId: string) {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  async function saveStrength(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const recipients = resolveGroupStrengthRecipients({
      mode: recipientMode,
      viewerUserId,
      selectedUserIds: selectedIds,
      groupUserIds: activeMembers.map((member) => member.userId),
      canAssign,
      required,
    });
    if ('error' in recipients) {
      setError(recipients.error);
      return;
    }
    const recurrence = groupRepeatSave(repeat, date);
    if (source === 'program' && !programs.some((option) => option.workoutId === workoutId)) {
      setError('Choose a workout from the group program.');
      return;
    }
    if (source === 'new') {
      const draftError = validateGroupStrengthDraft(draft);
      if (draftError) {
        setError(draftError);
        return;
      }
    }
    setBusy(true);
    try {
      if (source === 'program') {
        const chosen = programs.find((option) => option.workoutId === workoutId);
        if (!chosen) {
          setError('Choose a workout from the group program.');
          return;
        }
        const saved = await saveGroupActivity(supabase, {
          teamId,
          activityType: 'strength',
          title: chosen.title,
          scheduledDate: date,
          memberUserIds: recipients.userIds,
          requestKey: crypto.randomUUID(),
          workoutId: chosen.workoutId,
          programId: chosen.programId,
          notes,
          required: canAssign && required,
          ...recurrence,
        });
        if (saved.error) throw new Error(saved.error);
      } else {
        const saved = await saveGroupStrengthWorkout(supabase, {
          teamId,
          title: title.trim() || 'Workout',
          scheduledDate: date,
          memberUserIds: recipients.userIds,
          requestKey: crypto.randomUUID(),
          notes,
          required: canAssign && required,
          exercises: groupStrengthExercisePayload(draft),
          ...recurrence,
        });
        if (saved.error) throw new Error(saved.error);
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that workout.');
    } finally {
      setBusy(false);
    }
  }

  if (kind === 'other') {
    return (
      <AddActivitySheet
        dayLabel={formatDisplayDate(date)}
        activityTypes={OTHER_TYPES}
        allowRequired={canAssign}
        required={required}
        onRequiredChange={setRequired}
        repeatSlot={<GroupActivityRepeatFields date={date} value={repeat} onChange={setRepeat} />}
        onClose={onClose}
        onSave={async (activity) => {
          const recipients = resolveGroupStrengthRecipients({
            mode: recipientMode,
            viewerUserId,
            selectedUserIds: selectedIds,
            groupUserIds: activeMembers.map((member) => member.userId),
            canAssign,
            required,
          });
          if ('error' in recipients) throw new Error(recipients.error);
          const saved = await saveGroupActivity(supabase, {
            teamId,
            activityType: activity.activity_type,
            title: activity.title,
            scheduledDate: date,
            memberUserIds: recipients.userIds,
            requestKey: crypto.randomUUID(),
            durationMinutes: activity.duration_minutes,
            notes: activity.notes,
            details: activity.details,
            required: canAssign && required,
            ...groupRepeatSave(repeat, date),
          });
          if (saved.error) throw new Error(saved.error);
          onSaved();
          onClose();
        }}
      />
    );
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <form className="card pd-sheet group-strength-sheet" onClick={(event) => event.stopPropagation()} onSubmit={saveStrength}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Add activity</h2>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="muted">{formatDisplayDate(date)}</p>
        {kind === 'menu' ? (
          <div className="assign-wizard-choices">
            <button type="button" className="is-current" onClick={() => setKind('strength')}>
              Strength workout
            </button>
            <button type="button" onClick={() => setKind('other')}>
              Cardio, mobility, or other
            </button>
          </div>
        ) : (
          <>
            <div className="assign-wizard-choices">
              <button type="button" className={source === 'program' ? 'is-current' : ''} onClick={() => setSource('program')}>
                Program workout
              </button>
              <button type="button" className={source === 'new' ? 'is-current' : ''} onClick={() => setSource('new')}>
                New workout
              </button>
            </div>
            {source === 'program' ? (
              <>
                {programsState === 'loading' ? <p className="muted">Loading group program workouts…</p> : null}
                {programsState === 'error' ? <p className="team-sheet-error">{programError}</p> : null}
                {programsState === 'ready' && programs.length === 0 ? (
                  <p>No group program workouts are available. Create a new workout, or publish a group program first.</p>
                ) : null}
                {programs.length > 0 ? (
                  <label>
                    Workout
                    <select value={workoutId} onChange={(event) => setWorkoutId(event.target.value)}>
                      <option value="">Choose a workout…</option>
                      {programs.map((option) => (
                        <option key={option.workoutId} value={option.workoutId}>
                          {option.programName} · {option.detail}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : (
              <GroupStrengthWorkoutEditor
                supabase={supabase}
                title={title}
                onTitle={(next) => {
                  setTitle(next);
                  setError('');
                }}
                workout={draft}
                onWorkout={(next) => {
                  setDraft(next);
                  setError('');
                }}
              />
            )}
            <label>
              Date
              <DateInput value={date} onChange={changeDate} />
            </label>
            <GroupActivityRepeatFields date={date} value={repeat} onChange={setRepeat} />
            <fieldset>
              <legend>Recipients</legend>
              <label className="remember-row">
                <input type="radio" name="group-strength-recipients" checked={recipientMode === 'self'} onChange={() => setRecipientMode('self')} />
                Me
              </label>
              {canAssign ? (
                <>
                  <label className="remember-row">
                    <input type="radio" name="group-strength-recipients" checked={recipientMode === 'members'} onChange={() => setRecipientMode('members')} />
                    Selected members
                  </label>
                  {recipientMode === 'members' ? (
                    <div className="group-strength-members">
                      {activeMembers.map((member) => (
                        <label key={member.userId} className="remember-row">
                          <input type="checkbox" checked={selectedIds.includes(member.userId)} onChange={() => toggleMember(member.userId)} />
                          {member.name}
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <label className="remember-row">
                    <input type="radio" name="group-strength-recipients" checked={recipientMode === 'group'} onChange={() => setRecipientMode('group')} />
                    Entire group
                  </label>
                </>
              ) : (
                <p className="muted">You can add an optional workout for yourself.</p>
              )}
            </fieldset>
            {canAssign ? (
              <label className="remember-row">
                <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
                Required. Program missed totals stay the same.
              </label>
            ) : null}
            <label>
              Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
            {error ? <p className="team-sheet-error">{error}</p> : null}
            <button type="submit" className="btn green" disabled={busy}>
              {busy ? 'Saving…' : 'Save workout'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
