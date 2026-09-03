'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchGroupMembers,
  pushProgramToMembers,
  type GroupMemberOption,
  type PushMode,
} from '../../../lib/programDesign/pushToMembers';

type PushToMembersSheetProps = {
  supabase: SupabaseClient;
  teamId: string;
  programId: string;
  programName: string;
  programStatus?: string | null;
  onClose: () => void;
  onPushed?: () => void;
};

export default function PushToMembersSheet({
  supabase,
  teamId,
  programId,
  programName,
  programStatus,
  onClose,
  onPushed,
}: PushToMembersSheetProps) {
  const [members, setMembers] = useState<GroupMemberOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PushMode>('shared');
  const [makeTeamDefault, setMakeTeamDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void loadMembers();
  }, [teamId]);

  async function loadMembers() {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await fetchGroupMembers(supabase, teamId);
    setLoading(false);
    if (loadError) {
      setError(loadError);
      return;
    }
    setMembers(data);
  }

  function toggle(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function selectAll() {
    setSelectedIds(members.map((m) => m.user_id));
  }

  async function handlePush() {
    if (!selectedIds.length && !makeTeamDefault) {
      setError('Select at least one member, or set as the group default.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    const result = await pushProgramToMembers(supabase, {
      teamId,
      programId,
      programName,
      programStatus,
      memberUserIds: selectedIds,
      mode,
      setAsTeamDefault: makeTeamDefault,
    });
    setBusy(false);

    if (result.pushed === 0 && result.errors.length && !makeTeamDefault) {
      setError(result.errors[0]);
      return;
    }

    const parts: string[] = [];
    if (result.pushed) {
      parts.push(
        mode === 'copy'
          ? `Pushed a personal copy to ${result.pushed} member${result.pushed !== 1 ? 's' : ''}`
          : `Assigned to ${result.pushed} member${result.pushed !== 1 ? 's' : ''}`
      );
    }
    if (makeTeamDefault) parts.push('Set as group default for Follow Team Plan');
    if (result.errors.length) parts.push(`Notes: ${result.errors.join('; ')}`);
    setSuccess(parts.join('. ') + '.');
    onPushed?.();
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="pd-sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">Group program</p>
            <h2>Push to members</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="muted">
          Send <b>{programName}</b> to the athletes you choose. Design the week first, then push it out.
        </p>

        <label>How should they receive it?</label>
        <div className="push-mode-chips">
          <button
            type="button"
            className={`pd-cycle-chip${mode === 'shared' ? ' active' : ''}`}
            onClick={() => setMode('shared')}
          >
            Shared program
          </button>
          <button
            type="button"
            className={`pd-cycle-chip${mode === 'copy' ? ' active' : ''}`}
            onClick={() => setMode('copy')}
          >
            Personal copy each
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          {mode === 'shared'
            ? 'Members train from this same group program. Your calendar edits apply to everyone assigned.'
            : 'Each selected member gets their own copy. Their Training plan stays independent.'}
        </p>

        <label className="remember-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={makeTeamDefault}
            onChange={(e) => setMakeTeamDefault(e.target.checked)}
          />
          Also set as group default (everyone on Follow Team Plan)
        </label>

        <div className="topline" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <label style={{ margin: 0 }}>Members</label>
          {members.length > 0 && (
            <button type="button" className="btn small secondary" onClick={selectAll}>
              Select all
            </button>
          )}
        </div>

        {loading && <p className="muted">Loading members…</p>}
        {!loading && members.length === 0 && (
          <p className="muted">No active members in this group yet.</p>
        )}

        <div className="push-member-list">
          {members.map((m) => (
            <label key={m.user_id} className="remember-row push-member-row">
              <input
                type="checkbox"
                checked={selectedIds.includes(m.user_id)}
                onChange={() => toggle(m.user_id)}
              />
              <span>
                {m.display_name}
                {m.role ? <span className="muted"> · {m.role}</span> : null}
              </span>
            </label>
          ))}
        </div>

        {error && <p className="pd-error">{error}</p>}
        {success && <p className="pd-success">{success}</p>}

        <div className="actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn green"
            disabled={busy || !!success || (!selectedIds.length && !makeTeamDefault)}
            onClick={() => void handlePush()}
          >
            {busy ? 'Pushing…' : success ? 'Done!' : 'Push program'}
          </button>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
