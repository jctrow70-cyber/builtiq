'use client';

import { useState } from 'react';
import type { GroupExtraAction } from '../../../lib/groups/groupActivities';
import { GROUP_WEEKDAY_LABELS, groupWeekdayIndex } from '../../../lib/groups/groupActivityRepeat';
import { extraActivityLabel, extraStatusLabel, type GroupExtraActivity } from '../../../lib/groups/trainingWorkspace';
import type { ActivityType } from '../../../lib/programDesign/types';
import DateInput from '../DateInput';

const TYPES: ActivityType[] = ['strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'];

type GroupExtraActionsProps = {
  extra: GroupExtraActivity;
  memberName: string;
  canAssign: boolean;
  viewerUserId: string;
  onClose?: () => void;
  onLogWorkout?: () => void;
  onAction: (action: GroupExtraAction) => Promise<string | null>;
};

type Scope = 'occurrence' | 'future' | 'series' | 'end';

export default function GroupExtraActions({
  extra,
  memberName,
  canAssign,
  viewerUserId,
  onClose,
  onLogWorkout,
  onAction,
}: GroupExtraActionsProps) {
  const seriesId = extra.seriesId || '';
  const originalDate = extra.originalDate || extra.date;
  const own = viewerUserId === extra.userId;
  const canChange = !!seriesId && (canAssign || (own && !extra.required));
  const canComplete = !!seriesId && !extra.completed && (own || canAssign);
  const weekly = extra.recurrence === 'weekly';
  const [scope, setScope] = useState<Scope | ''>('');
  const [date, setDate] = useState(extra.date);
  const [title, setTitle] = useState(extra.title);
  const [activityType, setActivityType] = useState(extra.activityType);
  const [duration, setDuration] = useState(extra.durationMinutes == null ? '' : String(extra.durationMinutes));
  const [notes, setNotes] = useState(extra.notes || '');
  const [weekdays, setWeekdays] = useState<number[]>(extra.recurrenceWeekdays?.length ? extra.recurrenceWeekdays : [groupWeekdayIndex(originalDate)]);
  const [until, setUntil] = useState(extra.recurrenceUntil || '');
  const [lastDate, setLastDate] = useState(extra.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!seriesId) return null;

  async function run(action: GroupExtraAction) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const message = await onAction(action);
      if (message) setNotice(message);
      else onClose?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update that activity.');
    } finally {
      setBusy(false);
    }
  }

  function durationValue() {
    if (!duration.trim()) return null;
    const parsed = Number(duration);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toggleDay(day: number) {
    setWeekdays((current) => {
      if (current.includes(day)) {
        const next = current.filter((item) => item !== day);
        return next.length ? next : current;
      }
      return [...current, day].sort((left, right) => left - right);
    });
  }

  const status = extraStatusLabel(extra);

  return (
    <div className="member-schedule-editor">
      <p>
        <b>{extra.title}</b> · {extraActivityLabel(!!extra.required)} · {status}
      </p>
      <p className="muted">
        {memberName}. This stays off the assigned program, missed workouts, and Personal Training.
        {extra.completed ? ' Completed details stay as they were when it was finished.' : ''}
      </p>
      {error && <p className="team-sheet-error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      <div className="actions member-training-actions">
        {onLogWorkout && (
          <button type="button" className="btn small green" data-testid="log-group-activity" onClick={onLogWorkout}>
            Log workout
          </button>
        )}
        {canComplete && (
          <button type="button" className="btn small green" disabled={busy} onClick={() => run({ kind: 'complete', seriesId, userId: extra.userId, originalDate })}>
            Mark complete
          </button>
        )}
        {canChange && !extra.completed && extra.status !== 'skipped' && (
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => run({ kind: 'skip', seriesId, userId: extra.userId, originalDate })}>
            Skip
          </button>
        )}
        {canChange && !extra.completed && extra.status === 'skipped' && (
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => run({ kind: 'restore', seriesId, userId: extra.userId, originalDate })}>
            Restore
          </button>
        )}
        {canChange && !extra.completed && (
          <button type="button" className="btn small secondary" onClick={() => setScope(scope === 'occurrence' ? '' : 'occurrence')}>
            This occurrence
          </button>
        )}
        {canChange && !extra.completed && weekly && (
          <button type="button" className="btn small secondary" onClick={() => setScope(scope === 'future' ? '' : 'future')}>
            This and future
          </button>
        )}
        {canChange && !extra.completed && weekly && (
          <button type="button" className="btn small secondary" onClick={() => setScope(scope === 'series' ? '' : 'series')}>
            Entire series
          </button>
        )}
        {canChange && weekly && (
          <button type="button" className="btn small secondary" onClick={() => setScope(scope === 'end' ? '' : 'end')}>
            End series
          </button>
        )}
      </div>
      {scope === 'occurrence' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const overrideFields: string[] = [];
            if (activityType !== extra.activityType) overrideFields.push('activity_type');
            if (title.trim() !== extra.title) overrideFields.push('title');
            if (durationValue() !== (extra.durationMinutes ?? null)) overrideFields.push('duration_minutes');
            if ((notes.trim() || null) !== (extra.notes || null)) overrideFields.push('notes');
            void run({
              kind: 'occurrence',
              seriesId,
              userId: extra.userId,
              originalDate,
              occurrenceDate: date,
              activityType,
              title: title.trim(),
              durationMinutes: durationValue(),
              notes: notes.trim() || null,
              overrideFields,
            });
          }}
        >
          <label>
            Date
            <DateInput value={date} onChange={setDate} />
          </label>
          <label>
            Type
            <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
              {TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Duration (minutes)
            <input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button type="submit" className="btn green" disabled={busy}>Save this occurrence</button>
        </form>
      )}
      {(scope === 'future' || scope === 'series') && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const days = Array.from(new Set(weekdays)).sort((left, right) => left - right);
            void run({
              kind: scope,
              seriesId,
              originalDate,
              activityType,
              title: title.trim() || 'Activity',
              durationMinutes: durationValue(),
              notes: notes.trim() || null,
              details: (scope === 'series' ? extra.seriesDetails : extra.details) || {},
              weekdays: days,
              until: until || null,
              updateUntil: true,
            });
          }}
        >
          <p className="muted">
            {scope === 'future'
              ? 'Dates before this one stay on the current series, including completed history.'
              : 'Changes the repeating rule. A finished occurrence keeps the details it had when it was completed.'}
          </p>
          <label>
            Type
            <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
              {TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Duration (minutes)
            <input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="group-activity-weekdays" role="group" aria-label="Weekdays">
            {GROUP_WEEKDAY_LABELS.map((label, day) => (
              <label key={label}>
                <input type="checkbox" checked={weekdays.includes(day)} onChange={() => toggleDay(day)} />
                {label}
              </label>
            ))}
          </div>
          <label>
            End date (optional)
            <input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
          </label>
          <button type="submit" className="btn green" disabled={busy}>
            {scope === 'future' ? 'Save this and future' : 'Save entire series'}
          </button>
        </form>
      )}
      {scope === 'end' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run({ kind: 'end', seriesId, lastDate });
          }}
        >
          <label>
            Last day
            <DateInput value={lastDate} onChange={setLastDate} />
          </label>
          <button type="submit" className="btn green" disabled={busy}>End series</button>
        </form>
      )}
    </div>
  );
}
