'use client';

import { useEffect, useState } from 'react';
import { roleLabel } from '../../../lib/groups';
import { supabase } from '../../../lib/supabaseClient';
import {
  groupPermissionFlags,
  type GroupPermissionFlags,
} from '../../../lib/groups/groupPermissions';
import { groupSettingsAccess } from '../../../lib/groups/workspaceTabs';

type TeamSettingsTabProps = {
  activeTeam: any;
  members: any[];
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
  onLeaveTeam,
  onDeleteTeam,
  onSaveGroupPermissions,
  onTransferOwnership,
}: TeamSettingsTabProps) {
  const access = groupSettingsAccess(activeTeam?.my_role);
  const transferCandidates = members.filter((m: any) => m.user_id !== activeTeam?.owner_user_id);
  const [flags, setFlags] = useState<GroupPermissionFlags>(() => groupPermissionFlags(activeTeam));
  const [managersCanInviteManagers, setManagersCanInviteManagers] = useState(!!activeTeam?.managers_can_invite_managers);
  const [quickJoinEnabled, setQuickJoinEnabled] = useState(true);
  const [quickJoinCode, setQuickJoinCode] = useState('');
  const [transferUserId, setTransferUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [quickJoinNote, setQuickJoinNote] = useState('');

  useEffect(() => {
    setFlags(groupPermissionFlags(activeTeam));
    setManagersCanInviteManagers(!!activeTeam?.managers_can_invite_managers);
  }, [activeTeam]);

  useEffect(() => {
    if (!access.showAdministration || !activeTeam?.id) return;
    let cancelled = false;
    supabase.rpc('st_group_quick_join_info', { p_team_id: activeTeam.id }).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      setQuickJoinEnabled(!!data.enabled);
      setQuickJoinCode(data.code ? String(data.code) : '');
    });
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.id, access.showAdministration]);

  async function savePermissions() {
    if (!onSaveGroupPermissions || !activeTeam?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('st_teams')
        .update({ managers_can_invite_managers: managersCanInviteManagers })
        .eq('id', activeTeam.id);
      if (error && !/managers_can_invite_managers|schema cache|does not exist/i.test(error.message || '')) {
        window.alert(error.message);
        return;
      }
      await onSaveGroupPermissions(flags);
    } finally {
      setSaving(false);
    }
  }

  async function setQuickJoin(enabled: boolean) {
    if (!activeTeam?.id) return;
    setSaving(true);
    setQuickJoinNote('');
    const { error } = await supabase.rpc('st_set_group_quick_join', { p_team_id: activeTeam.id, p_enabled: enabled });
    setSaving(false);
    if (error) {
      window.alert(/could not find the function|schema cache/i.test(error.message || '')
        ? 'Run migration 20261005_056_secure_group_invitations.sql in Supabase first.'
        : error.message);
      return;
    }
    setQuickJoinEnabled(enabled);
    setQuickJoinNote(enabled ? 'Quick Join is on.' : 'Quick Join is off. New members need an email invitation.');
  }

  async function regenerateCode() {
    if (!activeTeam?.id) return;
    if (!window.confirm('Regenerate the group code? The current code will stop working immediately.')) return;
    setSaving(true);
    setQuickJoinNote('');
    const { data, error } = await supabase.rpc('st_regenerate_group_code', { p_team_id: activeTeam.id });
    setSaving(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    setQuickJoinCode(String(data || ''));
    setQuickJoinNote('New code saved. The previous code no longer works.');
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
        <h2>{activeTeam?.name || 'Group'}</h2>
        <label>Your role</label>
        <p className="muted">{roleLabel(activeTeam?.my_role)}</p>
        {access.showLeave && (
          <button type="button" className="btn secondary full" style={{ marginTop: 12 }} onClick={() => onLeaveTeam()}>
            Leave group
          </button>
        )}
      </div>

      {access.showAdministration && (
        <div className="card">
          <h2>Group administration</h2>
          <p className="muted">Only the Owner can change these.</p>

          {access.showInviteCode && (
            <>
              <h3 style={{ marginTop: 16 }}>Quick Join</h3>
              <label className="remember-row" style={{ display: 'block', marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={quickJoinEnabled}
                  disabled={saving}
                  onChange={(e) => void setQuickJoin(e.target.checked)}
                />{' '}
                Allow Quick Join
              </label>
              <p className="muted">People with the code join as Members. Turn this off for invitation-only groups.</p>
              {quickJoinEnabled && quickJoinCode && (
                <>
                  <label style={{ marginTop: 12 }}>Group code</label>
                  <p>
                    <b>{quickJoinCode}</b>
                  </p>
                </>
              )}
              <button type="button" className="btn small secondary" style={{ marginTop: 8 }} disabled={saving} onClick={() => void regenerateCode()}>
                Regenerate code
              </button>
              {quickJoinNote && <p className="muted">{quickJoinNote}</p>}
              <label className="remember-row" style={{ display: 'block', marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={managersCanInviteManagers}
                  disabled={saving}
                  onChange={(e) => setManagersCanInviteManagers(e.target.checked)}
                />{' '}
                Managers can invite Managers
              </label>
              <p className="muted">Off by default. Managers can always invite Members. Save permissions to keep this choice.</p>
            </>
          )}

          <h3 style={{ marginTop: 16 }}>Member permissions</h3>
          {PERMISSION_FIELDS.map((field) => (
            <label key={field.key} className="remember-row" style={{ display: 'block', marginTop: 10 }}>
              <input
                type="checkbox"
                checked={flags[field.key]}
                disabled={saving}
                onChange={(e) => setFlags((prev) => ({ ...prev, [field.key]: e.target.checked }))}
              />{' '}
              {field.label}
              <span className="muted" style={{ display: 'block', marginLeft: 22 }}>
                {field.help}
              </span>
            </label>
          ))}
          {onSaveGroupPermissions && (
            <button type="button" className="btn green" style={{ marginTop: 12 }} disabled={saving} onClick={() => void savePermissions()}>
              {saving ? 'Saving…' : 'Save permissions'}
            </button>
          )}

          {onTransferOwnership && (
            <>
              <h3 style={{ marginTop: 16 }}>Transfer ownership</h3>
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
            </>
          )}

          <h3 style={{ marginTop: 16 }}>Delete group</h3>
          <button type="button" className="btn red" style={{ marginTop: 8 }} onClick={() => onDeleteTeam()}>
            Delete group
          </button>
        </div>
      )}
    </>
  );
}
