'use client';

import { useEffect, useState } from 'react';
import { roleLabel } from '../../../lib/groups';
import { deriveInviteStatus, type InviteListStatus } from '../../../lib/groups/invitationSecurity';
import {
  emptyInviteDraft,
  isValidInviteEmail,
  normalizeInviteDrafts,
  type GroupInviteDraft,
  type GroupInviteRecord,
} from '../../../lib/groups/invites';
import { supabase } from '../../../lib/supabaseClient';
import type { GroupClassification } from '../../../lib/groups/schema';

type GroupInviteMembersPanelProps = {
  teamId: string;
  teamName: string;
  accessToken: string | null;
  canManage: boolean;
  canInviteManagers: boolean;
  classifications: GroupClassification[];
};

const STATUS_LABEL: Record<InviteListStatus, string> = {
  pending: 'Pending',
  expired: 'Expired',
  revoked: 'Canceled',
  accepted: 'Accepted',
};

export default function GroupInviteMembersPanel({
  teamId,
  teamName,
  accessToken,
  canManage,
  canInviteManagers,
  classifications,
}: GroupInviteMembersPanelProps) {
  const [drafts, setDrafts] = useState<GroupInviteDraft[]>([emptyInviteDraft()]);
  const [invites, setInvites] = useState<GroupInviteRecord[]>([]);
  const [quickJoinCode, setQuickJoinCode] = useState<string | null>(null);
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

  useEffect(() => {
    if (!canManage || !teamId) return;
    let cancelled = false;
    supabase.rpc('st_group_quick_join_info', { p_team_id: teamId }).then(({ data }) => {
      if (cancelled) return;
      const code = data && typeof data === 'object' && data.code ? String(data.code) : '';
      setQuickJoinCode(code || null);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, canManage]);

  if (!canManage) return null;

  function updateDraft(index: number, patch: Partial<GroupInviteDraft>) {
    setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function summarize(data: any): string {
    const emailed = Number(data?.emailed || 0);
    const created = Number(data?.created || 0);
    const failed = Number(data?.failed || 0);
    if (failed && !created) return data?.results?.find((row: any) => row.error)?.error || 'Invitation was not created.';
    if (emailed && emailed === created) {
      return `Sent ${emailed} invitation email${emailed === 1 ? '' : 's'}.`;
    }
    if (created && !emailed) {
      return emailConfigured
        ? `Saved ${created} invitation${created === 1 ? '' : 's'}, but the email could not be sent. Use Resend to try again.`
        : `Saved ${created} invitation${created === 1 ? '' : 's'}. Email is not configured on this deploy, so nothing was sent. Use Resend after email is set up.`;
    }
    if (created) {
      return `Sent ${emailed} of ${created} invitation emails. Use Resend for the ones that were not delivered.`;
    }
    return 'No invitations were created.';
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
    if (!canInviteManagers && invitesToSend.some((d) => d.role === 'manager')) {
      setError('You can invite Members. Only the Owner can invite a Manager.');
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
      const rowError = (data.results || []).find((row: any) => row.error && !row.emailed)?.error;
      setMessage(summarize(data));
      if (rowError && !data.emailed) setError(rowError);
      setDrafts([emptyInviteDraft()]);
      await loadInvites();
    } catch (err: any) {
      setError(err?.message || 'Could not send invites');
    } finally {
      setBusy(false);
    }
  }

  async function resend(inviteId: string) {
    if (!accessToken) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/groups/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ inviteId, appUrl: window.location.origin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not resend');
      setMessage(data.emailed ? 'Invitation email sent.' : 'A new link was created, but the email could not be sent. Try Resend again.');
      await loadInvites();
    } catch (err: any) {
      setError(err?.message || 'Could not resend');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inviteId: string) {
    if (!accessToken) return;
    if (!window.confirm('Cancel this invitation? The link will stop working.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/groups/invite/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not cancel');
      setMessage('Invitation canceled.');
      await loadInvites();
    } catch (err: any) {
      setError(err?.message || 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  function classificationLabel(ids: string[] | null | undefined): string {
    const names = (ids || [])
      .map((id) => classifications.find((c) => c.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(', ') : '';
  }

  return (
    <div className="card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Invite member</h2>
        <button type="button" className="btn small secondary" onClick={() => void loadInvites()} disabled={loading || busy}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Send a private email invitation to {teamName}. The link expires in 7 days and only works for that email address.
        {!emailConfigured ? ' Email sending is not configured on this deploy.' : ''}
      </p>
      {quickJoinCode && (
        <p className="muted">
          Quick Join is on. The group code is <b>{quickJoinCode}</b>. People who use it join as Members. It is not included in invitation emails.
        </p>
      )}

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
                  value={canInviteManagers ? draft.role : 'member'}
                  onChange={(e) => updateDraft(index, { role: e.target.value as GroupInviteDraft['role'] })}
                  disabled={busy || !canInviteManagers}
                >
                  <option value="member">Member</option>
                  {canInviteManagers && <option value="manager">Manager</option>}
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
            {classifications.length > 0 && (
              <>
                <label>Classification</label>
                <select
                  value={draft.classificationId || ''}
                  onChange={(e) => updateDraft(index, { classificationId: e.target.value || null })}
                  disabled={busy}
                >
                  <option value="">None</option>
                  {classifications.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </>
            )}
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
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
      </form>

      {error && <p className="team-sheet-error">{error}</p>}
      {message && (
        <p className="muted" style={{ marginTop: 8 }}>
          {message}
        </p>
      )}

      <div className="team-invite-pending" style={{ marginTop: 16 }}>
        <h3>Pending invitations</h3>
        {invites.length === 0 && !loading && <p className="muted">No invitations yet.</p>}
        {invites.map((invite) => {
          const display = (invite.display_status || deriveInviteStatus(invite.status, invite.expires_at)) as InviteListStatus;
          const tags = classificationLabel(invite.classification_ids);
          const actionable = display === 'pending' || display === 'expired';
          return (
            <div key={invite.id} className="team-invite-pending-row">
              <div>
                <b>{invite.display_name || invite.email}</b>
                <span className="muted">
                  {invite.email} · {roleLabel(invite.role)}
                  {tags ? ` · ${tags}` : ''}
                  {invite.last_sent_at ? ` · sent ${String(invite.last_sent_at).slice(0, 10)}` : ''}
                  {invite.expires_at ? ` · expires ${String(invite.expires_at).slice(0, 10)}` : ''}
                  {` · ${STATUS_LABEL[display] || display}`}
                </span>
              </div>
              {actionable && (
                <div className="actions">
                  <button type="button" className="btn small secondary" disabled={busy} onClick={() => void resend(invite.id)}>
                    Resend
                  </button>
                  <button type="button" className="btn small secondary" disabled={busy} onClick={() => void revoke(invite.id)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {loading && <p className="muted">Loading invitations…</p>}
    </div>
  );
}
