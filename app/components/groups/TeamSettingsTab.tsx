'use client';

import { useEffect, useState } from 'react';
import { roleLabel } from '../../../lib/groups';
import {
  groupPermissionFlags,
  type GroupPermissionFlags,
} from '../../../lib/groups/groupPermissions';

type TeamSettingsTabProps = {
  activeTeam: any;
  members: any[];
  isOwner: boolean;
  isSelfOwner: boolean;
  onLeaveTeam: () => Promise<void>;
  onDeleteTeam: () => Promise<void>;
  onSaveGroupPermissions?: (flags: GroupPermissionFlags) => Promise<void>;
  onTransferOwnership?: (userId: string) => Promise<void>;
};

const PERMISSION_FIELDS: { key: keyof GroupPermissionFlags; label: string; help: string }[] = [
  {
    key: 'members_can_create_shared_workouts',
    label: 'Members can create shared workouts',
    help: 'A member can add a new shared group plan.',
  },
  {
    key: 'members_can_edit_shared_workouts',
    label: 'Members can edit shared workouts',
    help: 'A member can change the shared group plan. Customize for Me stays available either way.',
  },
  {
    key: 'members_can_assign_workouts',
    label: 'Members can assign workouts',
    help: 'A member can assign a plan or workout to other people in the group.',
  },
  {
    key: 'members_can_view_member_progress',
    label: 'Members can view member progress',
    help: 'A member can see other members’ group workout logs. Body measurements stay private.',
  },
];

export default function TeamSettingsTab({
  activeTeam,
  members,
  isOwner,
  isSelfOwner,
  onLeaveTeam,
  onDeleteTeam,
  onSaveGroupPermissions,
  onTransferOwnership,
}: TeamSettingsTabProps) {
  const owners = members.filter((m: any) => m.role === 'owner');
  const editors = members.filter((m: any) => m.role === 'manager' || m.role === 'editor');
  const transferCandidates = members.filter((m: any) => m.user_id !== activeTeam?.owner_user_id);
  const [flags, setFlags] = useState<GroupPermissionFlags>(() => groupPermissionFlags(activeTeam));
  const [transferUserId, setTransferUserId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFlags(groupPermissionFlags(activeTeam));
  }, [activeTeam]);

  async function savePermissions() {
    if (!onSaveGroupPermissions) return;
    setSaving(true);
    try {
      await onSaveGroupPermissions(flags);
    } finally {
      setSaving(false);
    }
  }

  async function transfer() {
    if (!onTransferOwnership || !transferUserId) return;
    const person = transferCandidates.find((m: any) => m.user_id === transferUserId);
    const name = person?.display_name || 'this member';
    if (!window.confirm(`Transfer ownership of ${activeTeam?.name || 'this group'} to ${name}? You will become a Manager.`)) {
      return;
    }
    setSaving(true);
    try {
      await onTransferOwnership(transferUserId);
      setTransferUserId('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Group settings</h2>
        <label>Group name</label>
        <p>
          <b>{activeTeam?.name}</b>
        </p>
        <label>Invite code</label>
        <p>
          <b>{activeTeam?.invite_code}</b>
          <span className="muted"> · Anyone with this code can join as a Member</span>
        </p>
        <label>Owner</label>
        <p className="muted">{owners.map((m: any) => m.display_name || 'Owner').join(', ') || '—'}</p>
        {editors.length > 0 && (
          <>
            <label>Managers</label>
            <p className="muted">{editors.map((m: any) => m.display_name || 'Manager').join(', ')}</p>
          </>
        )}
        <label>Your role</label>
        <p className="muted">{roleLabel(activeTeam?.my_role)}</p>
      </div>

      <div className="card">
        <h2>Member permissions</h2>
        <p className="muted">Owners and Managers can always create, edit, assign, and view group progress.</p>
        {PERMISSION_FIELDS.map((field) => (
          <label key={field.key} className="remember-row" style={{ display: 'block', marginTop: 10 }}>
            <input
              type="checkbox"
              checked={flags[field.key]}
              disabled={!isOwner || saving}
              onChange={(e) => setFlags((prev) => ({ ...prev, [field.key]: e.target.checked }))}
            />{' '}
            {field.label}
            <span className="muted" style={{ display: 'block', marginLeft: 22 }}>
              {field.help}
            </span>
          </label>
        ))}
        {isOwner && onSaveGroupPermissions && (
          <button type="button" className="btn green" style={{ marginTop: 12 }} disabled={saving} onClick={() => void savePermissions()}>
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        )}
        {!isOwner && <p className="muted" style={{ marginTop: 8 }}>Only the Owner can change these.</p>}
      </div>

      {isOwner && onTransferOwnership && (
        <div className="card">
          <h2>Transfer ownership</h2>
          <p className="muted">The new Owner takes owner-only actions. You stay in the group as a Manager.</p>
          <select value={transferUserId} onChange={(e) => setTransferUserId(e.target.value)} disabled={saving}>
            <option value="">Choose a member</option>
            {transferCandidates.map((m: any) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || 'Member'} · {roleLabel(m.role)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn secondary"
            style={{ marginTop: 8 }}
            disabled={!transferUserId || saving}
            onClick={() => void transfer()}
          >
            Transfer ownership
          </button>
        </div>
      )}

      <div className="card">
        <h2>Membership</h2>
        {!isSelfOwner && (
          <button type="button" className="btn secondary full" style={{ marginTop: 8 }} onClick={() => onLeaveTeam()}>
            Leave group
          </button>
        )}
        {isOwner && (
          <button type="button" className="btn red full" style={{ marginTop: 8 }} onClick={() => onDeleteTeam()}>
            Delete group
          </button>
        )}
        {isSelfOwner && (
          <p className="muted" style={{ marginTop: 8 }}>
            Owners stay until they transfer ownership or delete the group.
          </p>
        )}
      </div>
    </>
  );
}
