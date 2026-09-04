'use client';

import { useMemo, useState } from 'react';
import { roleLabel } from '../../../lib/groups';
import {
  emptyInviteDraft,
  inviteMailtoHref,
  isValidInviteEmail,
  normalizeInviteDrafts,
  type GroupInviteDraft,
} from '../../../lib/groups/invites';

export type CreateGroupPayload = {
  name: string;
  invites: GroupInviteDraft[];
};

type TeamCreateJoinSheetProps = {
  mode: 'create' | 'join' | null;
  onClose: () => void;
  onCreate: (payload: CreateGroupPayload) => Promise<{ inviteCode?: string; inviteSummary?: string } | void>;
  onJoin: (code: string) => Promise<void>;
};

export default function TeamCreateJoinSheet({ mode, onClose, onCreate, onJoin }: TeamCreateJoinSheetProps) {
  const [step, setStep] = useState<'details' | 'invites' | 'done'>('details');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteDrafts, setInviteDrafts] = useState<GroupInviteDraft[]>([emptyInviteDraft()]);
  const [createdCode, setCreatedCode] = useState('');
  const [inviteSummary, setInviteSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const validInviteCount = useMemo(() => normalizeInviteDrafts(inviteDrafts).length, [inviteDrafts]);

  if (!mode) return null;

  function resetAndClose() {
    setStep('details');
    setName('');
    setInviteCode('');
    setInviteDrafts([emptyInviteDraft()]);
    setCreatedCode('');
    setInviteSummary('');
    setError('');
    onClose();
  }

  function updateDraft(index: number, patch: Partial<GroupInviteDraft>) {
    setInviteDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeDraft(index: number) {
    setInviteDrafts((prev) => (prev.length <= 1 ? [emptyInviteDraft()] : prev.filter((_, i) => i !== index)));
  }

  async function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const code = inviteCode.trim();
      if (code.length < 4) {
        setError('Enter a valid invite code.');
        return;
      }
      await onJoin(code);
      resetAndClose();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function continueToInvites(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Team name must be at least 2 characters.');
      return;
    }
    setStep('invites');
  }

  async function createWithInvites(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Team name must be at least 2 characters.');
      setStep('details');
      return;
    }
    const invites = normalizeInviteDrafts(inviteDrafts);
    const invalid = inviteDrafts.some((d) => d.email.trim() && !isValidInviteEmail(d.email));
    if (invalid) {
      setError('Fix invalid email addresses or clear those rows.');
      return;
    }
    setBusy(true);
    try {
      const result = (await onCreate({ name: trimmed, invites })) || {};
      setCreatedCode(result.inviteCode || '');
      setInviteSummary(result.inviteSummary || '');
      setStep('done');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-sheet-backdrop" role="presentation" onClick={resetAndClose}>
      <div
        className="team-sheet-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2 id="team-sheet-title">
            {mode === 'join' ? 'Join Team' : step === 'done' ? 'Team created' : step === 'invites' ? 'Invite members' : 'Create Team'}
          </h2>
          <button type="button" className="btn small secondary" onClick={resetAndClose}>
            Close
          </button>
        </div>

        {mode === 'join' ? (
          <form onSubmit={submitJoin} style={{ marginTop: 12 }}>
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
            {error && <p className="team-sheet-error">{error}</p>}
            <button type="submit" className="btn green full" style={{ marginTop: 12 }} disabled={busy}>
              {busy ? 'Working…' : 'Join Team'}
            </button>
          </form>
        ) : step === 'details' ? (
          <form onSubmit={continueToInvites} style={{ marginTop: 12 }}>
            <label htmlFor="team-create-name">Team name</label>
            <input
              id="team-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TrowHoes"
              disabled={busy}
              autoFocus
            />
            <p className="muted" style={{ marginTop: 8 }}>
              Next you can add members by email and send join invites.
            </p>
            {error && <p className="team-sheet-error">{error}</p>}
            <button type="submit" className="btn green full" style={{ marginTop: 12 }} disabled={busy}>
              Next: Invite members
            </button>
          </form>
        ) : step === 'invites' ? (
          <form onSubmit={createWithInvites} style={{ marginTop: 12 }}>
            <p className="muted">
              Add people to <b>{name.trim()}</b>. They&apos;ll get an email with the join code (or you can share the code
              yourself).
            </p>
            <div className="team-invite-list">
              {inviteDrafts.map((draft, index) => (
                <div key={index} className="team-invite-row">
                  <div className="row">
                    <div>
                      <label htmlFor={`invite-name-${index}`}>Name</label>
                      <input
                        id={`invite-name-${index}`}
                        value={draft.displayName}
                        onChange={(e) => updateDraft(index, { displayName: e.target.value })}
                        placeholder="Optional"
                        disabled={busy}
                      />
                    </div>
                    <div>
                      <label htmlFor={`invite-role-${index}`}>Role</label>
                      <select
                        id={`invite-role-${index}`}
                        value={draft.role}
                        onChange={(e) => updateDraft(index, { role: e.target.value as GroupInviteDraft['role'] })}
                        disabled={busy}
                      >
                        <option value="member">Member</option>
                        <option value="manager">Editor</option>
                      </select>
                    </div>
                  </div>
                  <label htmlFor={`invite-email-${index}`}>Email</label>
                  <div className="team-invite-email-row">
                    <input
                      id={`invite-email-${index}`}
                      type="email"
                      value={draft.email}
                      onChange={(e) => updateDraft(index, { email: e.target.value })}
                      placeholder="name@email.com"
                      disabled={busy}
                      autoComplete="email"
                    />
                    <button type="button" className="btn small secondary" onClick={() => removeDraft(index)} disabled={busy}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn small secondary"
              style={{ marginTop: 8 }}
              onClick={() => setInviteDrafts((prev) => [...prev, emptyInviteDraft()])}
              disabled={busy}
            >
              + Add another member
            </button>
            {error && <p className="team-sheet-error">{error}</p>}
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn secondary" onClick={() => setStep('details')} disabled={busy}>
                Back
              </button>
              <button type="submit" className="btn green" disabled={busy}>
                {busy
                  ? 'Creating…'
                  : validInviteCount
                    ? `Create team & send ${validInviteCount} invite${validInviteCount === 1 ? '' : 's'}`
                    : 'Create team without invites'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p>
              <b>{name.trim()}</b> is ready.
            </p>
            {createdCode && (
              <p className="team-invite-code-box">
                Invite code: <b>{createdCode}</b>
              </p>
            )}
            {inviteSummary && <p className="muted">{inviteSummary}</p>}
            {normalizeInviteDrafts(inviteDrafts).length > 0 && createdCode && (
              <div className="team-invite-mailto-list">
                <p className="muted">Open a mail draft if email sending is not configured:</p>
                {normalizeInviteDrafts(inviteDrafts).map((invite) => (
                  <a
                    key={invite.email}
                    className="btn small secondary"
                    href={inviteMailtoHref({
                      email: invite.email,
                      groupName: name.trim(),
                      inviteCode: createdCode,
                    })}
                  >
                    Email {invite.displayName || invite.email} ({roleLabel(invite.role)})
                  </a>
                ))}
              </div>
            )}
            <button type="button" className="btn green full" style={{ marginTop: 12 }} onClick={resetAndClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
