'use client';

import { useState } from 'react';

type GroupCreateJoinPanelProps = {
  onCreate: (name: string) => Promise<void>;
  onJoin: (inviteCode: string) => Promise<void>;
  compact?: boolean;
};

export default function GroupCreateJoinPanel({ onCreate, onJoin, compact }: GroupCreateJoinPanelProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('My Group');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'create') {
        const trimmed = name.trim();
        if (trimmed.length < 2) {
          setError('Group name must be at least 2 characters.');
          return;
        }
        await onCreate(trimmed);
      } else {
        const code = inviteCode.trim();
        if (code.length < 4) {
          setError('Enter a valid invite code.');
          return;
        }
        await onJoin(code);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card group-create-join${compact ? ' group-create-join-compact' : ''}`}>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
          Create group
        </button>
        <button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>
          Join with code
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'create' ? (
          <>
            <label htmlFor="group-create-name">Group name</label>
            <input
              id="group-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trowbridge Baseball"
              disabled={busy}
            />
          </>
        ) : (
          <>
            <label htmlFor="group-join-code">Invite code</label>
            <input
              id="group-join-code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Paste invite code"
              disabled={busy}
              autoComplete="off"
            />
          </>
        )}
        {error && <p className="muted" style={{ color: 'var(--red, #f87171)', marginTop: 8 }}>{error}</p>}
        <button className="btn green full" style={{ marginTop: 10 }} type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'create' ? 'Create group' : 'Join group'}
        </button>
      </form>
    </div>
  );
}
