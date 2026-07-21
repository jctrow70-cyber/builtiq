'use client';

import { useMemo, useState } from 'react';
import DateInput from '../DateInput';
import { workoutLabel } from '../../../lib/groups';
import { todayYmd } from '../../../lib/training/programCalendar';

type GroupAssignWorkoutPanelProps = {
  groupProgram: any | null;
  members: any[];
  onAssign: (payload: {
    workoutId: string;
    targetType: 'group' | 'members';
    memberUserIds: string[];
    scheduledDate: string;
    dueDate: string;
    title: string;
    notes: string;
  }) => Promise<void>;
};

export default function GroupAssignWorkoutPanel({ groupProgram, members, onAssign }: GroupAssignWorkoutPanelProps) {
  const workouts = useMemo(() => {
    return (groupProgram?.st_workouts || [])
      .slice()
      .sort((a: any, b: any) => a.week - b.week || a.day_order - b.day_order);
  }, [groupProgram]);

  const [workoutId, setWorkoutId] = useState('');
  const [targetType, setTargetType] = useState<'group' | 'members'>('group');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeMembers = members.filter((m) => m.is_active_participant !== false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!workoutId) {
      setError('Select a workout from the group program.');
      return;
    }
    if (targetType === 'members' && !selectedMembers.length) {
      setError('Select at least one member.');
      return;
    }
    setBusy(true);
    try {
      await onAssign({
        workoutId,
        targetType,
        memberUserIds: targetType === 'members' ? selectedMembers : [],
        scheduledDate,
        dueDate,
        title: title.trim(),
        notes: notes.trim(),
      });
      setSuccess('Workout assigned. Members will see it in Training → Assigned Workouts.');
      setTitle('');
      setNotes('');
      setSelectedMembers([]);
    } catch (err: any) {
      setError(err?.message || 'Could not assign workout.');
    } finally {
      setBusy(false);
    }
  }

  function toggleMember(userId: string) {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  if (!groupProgram) {
    return (
      <div className="card group-assign-workout">
        <h2>Assign workout</h2>
        <p className="muted">
          Create a group program in Training → Program Setup first, then assign specific workouts to members here.
        </p>
      </div>
    );
  }

  return (
    <div className="card group-assign-workout">
      <h2>Assign workout</h2>
      <p className="muted">
        Send a one-time workout from <b>{groupProgram.name}</b>. Members log it in Training → Assigned Workouts.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="assign-workout-pick">Workout</label>
        <select
          id="assign-workout-pick"
          value={workoutId}
          onChange={(e) => setWorkoutId(e.target.value)}
          disabled={busy}
        >
          <option value="">Select workout</option>
          {workouts.map((w: any) => (
            <option key={w.id} value={w.id}>
              {workoutLabel(w)}
            </option>
          ))}
        </select>

        <label style={{ marginTop: 10 }}>Send to</label>
        <div className="tabs">
          <button
            type="button"
            className={targetType === 'group' ? 'active' : ''}
            onClick={() => setTargetType('group')}
          >
            Whole group
          </button>
          <button
            type="button"
            className={targetType === 'members' ? 'active' : ''}
            onClick={() => setTargetType('members')}
          >
            Selected members
          </button>
        </div>

        {targetType === 'members' && (
          <div className="assign-member-picks">
            {activeMembers.map((m: any) => (
              <label key={m.id} className="remember-row assign-member-pick">
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(m.user_id)}
                  onChange={() => toggleMember(m.user_id)}
                  disabled={busy}
                />
                {m.display_name || 'Member'}
              </label>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>Scheduled date</label>
            <DateInput value={scheduledDate} onChange={setScheduledDate} disabled={busy} />
          </div>
          <div>
            <label>Due date (optional)</label>
            <DateInput value={dueDate} onChange={setDueDate} disabled={busy} />
          </div>
        </div>

        <label>Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Game-day prep"
          disabled={busy}
        />

        <label>Notes for members (optional)</label>
        <textarea
          className="ai-prompt-input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Focus on quality reps…"
          disabled={busy}
        />

        {error && <p className="assign-error">{error}</p>}
        {success && <p className="assign-success">{success}</p>}

        <button className="btn green full" style={{ marginTop: 10 }} type="submit" disabled={busy}>
          {busy ? 'Assigning…' : 'Assign workout'}
        </button>
      </form>
    </div>
  );
}
