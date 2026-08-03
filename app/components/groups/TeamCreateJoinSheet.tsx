'use client';

import { useState } from 'react';

type TeamCreateJoinSheetProps = {
  mode: 'create' | 'join' | null;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
};

export default function TeamCreateJoinSheet({ mode, onClose, onCreate, onJoin }: TeamCreateJoinSheetProps) {
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!mode) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'create') {
        const trimmed = name.trim();
        if (trimmed.length < 2) {
          setError('Team name must be at least 2 characters.');
          return;
        }
        await onCreate(trimmed);
        onClose();
      } else {
        const code = inviteCode.trim();
        if (code.length < 4) {
          setError('Enter a valid invite code.');
          return;
        }
        await onJoin(code);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="team-sheet-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2 id="team-sheet-title">{mode === 'create' ? 'Create Team' : 'Join Team'}</h2>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          {mode === 'create' ? (
            <>
              <label htmlFor="team-create-name">Team name</label>
              <input
                id="team-create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. TrowHoes"
                disabled={busy}
                autoFocus
              />
            </>
          ) : (
            <>
              <label htmlFor="team-join-code">Invite code</label>
              <input
                id="team-join-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Paste invite code"
                disabled={busy}
                autoComplete="off"
                autoFocus
              />
            </>
          )}
          {error && <p className="team-sheet-error">{error}</p>}
          <button type="submit" className="btn green full" style={{ marginTop: 12 }} disabled={busy}>
            {busy ? 'Working…' : mode === 'create' ? 'Create Team' : 'Join Team'}
          </button>
        </form>
      </div>
    </div>
  );
}
