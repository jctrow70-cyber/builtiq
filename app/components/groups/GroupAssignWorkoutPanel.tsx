'use client';

import { useEffect, useMemo, useState } from 'react';
import DateInput from '../DateInput';
import { workoutLabel, countMembersInClassification, type GroupClassification } from '../../../lib/groups';
import { todayYmd } from '../../../lib/training/programCalendar';

export type AssignWorkoutPayload = {
  workoutId: string;
  programId: string | null;
  targetType: 'group' | 'members' | 'classification';
  memberUserIds: string[];
  classificationId: string;
  scheduledDate: string;
  dueDate: string;
  title: string;
  notes: string;
};

type GroupAssignWorkoutPanelProps = {
  /** Prefer default/active program; panel can switch among publishedTeamPrograms */
  groupProgram: any | null;
  publishedTeamPrograms?: any[];
  members: any[];
  classifications: GroupClassification[];
  memberClassificationIds: Record<string, string[]>;
  onAssign: (payload: AssignWorkoutPayload) => Promise<void>;
};

export default function GroupAssignWorkoutPanel({
  groupProgram,
  publishedTeamPrograms = [],
  members,
  classifications,
  memberClassificationIds,
  onAssign,
}: GroupAssignWorkoutPanelProps) {
  const programOptions = useMemo(() => {
    const byId = new Map<string, any>();
    (publishedTeamPrograms || []).forEach((p) => {
      if (p?.id) byId.set(p.id, p);
    });
    if (groupProgram?.id) byId.set(groupProgram.id, groupProgram);
    return Array.from(byId.values()).sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || '')),
    );
  }, [publishedTeamPrograms, groupProgram]);

  const [programId, setProgramId] = useState(groupProgram?.id || '');
  const selectedProgram =
    programOptions.find((p) => p.id === programId) || groupProgram || programOptions[0] || null;

  useEffect(() => {
    if (groupProgram?.id) setProgramId(groupProgram.id);
  }, [groupProgram?.id]);

  const workouts = useMemo(() => {
    return (selectedProgram?.st_workouts || [])
      .slice()
      .sort((a: any, b: any) => a.week - b.week || a.day_order - b.day_order);
  }, [selectedProgram]);

  const [workoutId, setWorkoutId] = useState('');
  const [targetType, setTargetType] = useState<'group' | 'members' | 'classification'>('group');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [classificationId, setClassificationId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setWorkoutId('');
  }, [selectedProgram?.id]);

  const activeMembers = members.filter((m) => m.is_active_participant !== false);
  const classificationMemberCount = classificationId
    ? countMembersInClassification(classificationId, members, memberClassificationIds)
    : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedProgram?.id) {
      setError('Select a published group program first.');
      return;
    }
    if (!workoutId) {
      setError('Select a workout from that program.');
      return;
    }
    if (targetType === 'members' && !selectedMembers.length) {
      setError('Select at least one member.');
      return;
    }
    if (targetType === 'classification') {
      if (!classificationId) {
        setError('Select a classification.');
        return;
      }
      if (classificationMemberCount === 0) {
        setError('No active members are tagged with that classification.');
        return;
      }
    }
    setBusy(true);
    try {
      await onAssign({
        workoutId,
        programId: selectedProgram.id,
        targetType,
        memberUserIds: targetType === 'members' ? selectedMembers : [],
        classificationId: targetType === 'classification' ? classificationId : '',
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
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  if (!programOptions.length) {
    return (
      <div className="card group-assign-workout">
        <h2>Assign workout</h2>
        <p className="muted">
          Publish a group program in Groups → Programs (or Training → Program Setup) first. Assign workout
          sends a template day to members — it does not restore past logged sets. Use Progress → Restore
          history for that.
        </p>
      </div>
    );
  }

  return (
    <div className="card group-assign-workout">
      <h2>Assign workout</h2>
      <p className="muted">
        Send a one-time workout template to members. If you replaced the group program, pick the{' '}
        <b>older published program</b> below to assign those workout days — or use Progress → Restore
        history for logged sets.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="assign-program-pick">Program</label>
        <select
          id="assign-program-pick"
          value={selectedProgram?.id || ''}
          onChange={(e) => setProgramId(e.target.value)}
          disabled={busy}
        >
          {programOptions.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {groupProgram?.id === p.id ? ' (team active)' : ''}
            </option>
          ))}
        </select>

        <label htmlFor="assign-workout-pick" style={{ marginTop: 10 }}>
          Workout
        </label>
        <select
          id="assign-workout-pick"
          value={workoutId}
          onChange={(e) => setWorkoutId(e.target.value)}
          disabled={busy || !workouts.length}
        >
          <option value="">{workouts.length ? 'Select workout' : 'No workouts in this program'}</option>
          {workouts.map((w: any) => (
            <option key={w.id} value={w.id}>
              {workoutLabel(w)}
            </option>
          ))}
        </select>
        {!workouts.length && (
          <p className="muted" style={{ marginTop: 6 }}>
            This program has no workout days loaded. Open Groups → Programs and confirm it is published.
          </p>
        )}

        <label style={{ marginTop: 10 }}>Send to</label>
        <div className="tabs assign-target-tabs">
          <button
            type="button"
            className={targetType === 'group' ? 'active' : ''}
            onClick={() => setTargetType('group')}
          >
            Whole group
          </button>
          <button
            type="button"
            className={targetType === 'classification' ? 'active' : ''}
            onClick={() => setTargetType('classification')}
          >
            Classification
          </button>
          <button
            type="button"
            className={targetType === 'members' ? 'active' : ''}
            onClick={() => setTargetType('members')}
          >
            Selected members
          </button>
        </div>

        {targetType === 'classification' && (
          <>
            {classifications.length === 0 ? (
              <p className="muted" style={{ marginTop: 8 }}>
                Add classifications above first, then tag members on the roster.
              </p>
            ) : (
              <>
                <label htmlFor="assign-classification-pick">Classification</label>
                <select
                  id="assign-classification-pick"
                  value={classificationId}
                  onChange={(e) => setClassificationId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select classification</option>
                  {classifications.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (
                      {countMembersInClassification(c.id, members, memberClassificationIds)} members)
                    </option>
                  ))}
                </select>
                {classificationId && (
                  <p className="muted" style={{ marginTop: 6 }}>
                    {classificationMemberCount} active member{classificationMemberCount === 1 ? '' : 's'}{' '}
                    will receive this assignment.
                  </p>
                )}
              </>
            )}
          </>
        )}

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
