'use client';

import { useEffect, useState } from 'react';
import { roleLabel } from '../../../lib/groups';
import {
  emptyInviteDraft,
  inviteMailtoHref,
  isValidInviteEmail,
  normalizeInviteDrafts,
  type GroupInviteDraft,
  type GroupInviteRecord,
} from '../../../lib/groups/invites';

type GroupInviteMembersPanelProps = {
  teamId: string;
  teamName: string;
  inviteCode: string;
  accessToken: string | null;
  canManage: boolean;
};

export default function GroupInviteMembersPanel({
  teamId,
  teamName,
  inviteCode,
  accessToken,
  canManage,
}: GroupInviteMembersPanelProps) {
  const [drafts, setDrafts] = useState<GroupInviteDraft[]>([emptyInviteDraft()]);
  const [invites, setInvites] = useState<GroupInviteRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [emailConfigured, setEmailConfigured] = useState(true);

  async function loadInvites() {
    if (!canManage || !accessToken || !teamId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/invite?teamId=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not load invites (${res.status})`);
      setInvites(data.invites || []);
      if (typeof data.emailConfigured === 'boolean') setEmailConfigured(data.emailConfigured);
      if (data.error) setError(data.error);
    } catch (e: any) {
      setError(e?.message || 'Could not load invites');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvites();
  }, [teamId, accessToken, canManage]);

  if (!canManage) return null;

  function updateDraft(index: number, patch: Partial<GroupInviteDraft>) {
    setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function sendInvites(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const invitesToSend = normalizeInviteDrafts(drafts);
    if (!invitesToSend.length) {
      setError('Add at least one valid email.');
      return;
    }
    if (drafts.some((d) => d.email.trim() && !isValidInviteEmail(d.email))) {
      setError('Fix invalid email addresses or clear those rows.');
      return;
    }
    if (!accessToken) {
      setError('Sign in again to send invites.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/groups/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          teamId,
          invites: invitesToSend,
          appUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Invite failed (${res.status})`);
      setEmailConfigured(!!data.emailConfigured);
      setMessage(
        data.sent
          ? `Sent ${data.sent} email invite${data.sent === 1 ? '' : 's'}.`
          : data.saved
            ? `Saved ${data.saved} invite${data.saved === 1 ? '' : 's'}. Email sending is off — share code ${data.inviteCode || inviteCode}.`
            : 'No invites sent.'
      );
      setDrafts([emptyInviteDraft()]);
      await loadInvites();
    } catch (err: any) {
      setError(err?.message || 'Could not send invites');
    } finally {
      setBusy(false);
    }
  }

  const pending = invites.filter((i) => i.status === 'pending');

  return (
    <div className="card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Invite members</h2>
        <button type="button" className="btn small secondary" onClick={() => void loadInvites()} disabled={loading}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Add people by email. They join with code <b>{inviteCode}</b>
        {!emailConfigured ? ' · email sending is not configured on this deploy' : ''}.
      </p>

      <form onSubmit={sendInvites}>
        {drafts.map((draft, index) => (
          <div key={index} className="team-invite-row">
            <div className="row">
              <div>
                <label>Name</label>
                <input
                  value={draft.displayName}
                  onChange={(e) => updateDraft(index, { displayName: e.target.value })}
                  placeholder="Optional"
                  disabled={busy}
                />
              </div>
              <div>
                <label>Role</label>
                <select
                  value={draft.role}
                  onChange={(e) => updateDraft(index, { role: e.target.value as GroupInviteDraft['role'] })}
                  disabled={busy}
                >
                  <option value="member">Member</option>
                  <option value="manager">Editor</option>
                </select>
              </div>
            </div>
            <label>Email</label>
            <input
              type="email"
              value={draft.email}
              onChange={(e) => updateDraft(index, { email: e.target.value })}
              placeholder="name@email.com"
              disabled={busy}
            />
          </div>
        ))}
        <div className="actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setDrafts((prev) => [...prev, emptyInviteDraft()])}
            disabled={busy}
          >
            + Add another
          </button>
          <button type="submit" className="btn green" disabled={busy}>
            {busy ? 'Sending…' : 'Send invites'}
          </button>
        </div>
      </form>

      {error && <p className="team-sheet-error">{error}</p>}
      {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}

      {pending.length > 0 && (
        <div className="team-invite-pending" style={{ marginTop: 12 }}>
          <h3>Pending invites</h3>
          {pending.map((invite) => (
            <div key={invite.id} className="team-invite-pending-row">
              <div>
                <b>{invite.display_name || invite.email}</b>
                <span className="muted">
                  {invite.email} · {roleLabel(invite.role)}
                  {invite.last_sent_at ? ` · last sent ${String(invite.last_sent_at).slice(0, 10)}` : ''}
                </span>
              </div>
              <a
                className="btn small secondary"
                href={inviteMailtoHref({
                  email: invite.email,
                  groupName: teamName,
                  inviteCode,
                })}
              >
                Open email
              </a>
            </div>
          ))}
        </div>
      )}
      {loading && <p className="muted">Loading invites…</p>}
    </div>
  );
}
