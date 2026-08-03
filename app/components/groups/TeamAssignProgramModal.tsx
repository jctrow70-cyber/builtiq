'use client';

import { useState } from 'react';

export type AssignProgramTarget = 'team' | 'members' | 'individual';

type TeamAssignProgramModalProps = {
  program: { id: string; name: string };
  members: any[];
  onClose: () => void;
  onAssign: (payload: {
    target: AssignProgramTarget;
    memberUserIds: string[];
    setAsTeamDefault: boolean;
  }) => Promise<void>;
};

export default function TeamAssignProgramModal({
  program,
  members,
  onClose,
  onAssign,
}: TeamAssignProgramModalProps) {
  const [target, setTarget] = useState<AssignProgramTarget>('team');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleMember(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (target === 'members' && selectedIds.length === 0) {
      setError('Select at least one member.');
      return;
    }
    if (target === 'individual' && selectedIds.length !== 1) {
      setError('Select exactly one member.');
      return;
    }
    setBusy(true);
    try {
      await onAssign({
        target,
        memberUserIds: target === 'team' ? [] : selectedIds,
        setAsTeamDefault: target === 'team',
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not assign program.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="team-sheet-panel card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Assign program</h2>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          <b>{program.name}</b>
        </p>
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          <label>Assign to</label>
          <div className="team-assign-target-chips">
            <button type="button" className={target === 'team' ? 'active' : ''} onClick={() => setTarget('team')}>
              Entire Team
            </button>
            <button type="button" className={target === 'members' ? 'active' : ''} onClick={() => setTarget('members')}>
              Selected Members
            </button>
            <button
              type="button"
              className={target === 'individual' ? 'active' : ''}
              onClick={() => setTarget('individual')}
            >
              One Member
            </button>
          </div>
          {target !== 'team' && (
            <div className="team-assign-member-picks">
              {members.map((m: any) => (
                <label key={m.user_id} className="remember-row team-assign-member-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(m.user_id)}
                    onChange={() => {
                      if (target === 'individual') setSelectedIds([m.user_id]);
                      else toggleMember(m.user_id);
                    }}
                  />
                  {m.display_name || 'Member'}
                </label>
              ))}
            </div>
          )}
          {error && <p className="team-sheet-error">{error}</p>}
          <button type="submit" className="btn green full" style={{ marginTop: 12 }} disabled={busy}>
            {busy ? 'Assigning…' : 'Assign program'}
          </button>
        </form>
      </div>
    </div>
  );
}
