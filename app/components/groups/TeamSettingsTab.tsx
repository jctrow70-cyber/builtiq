'use client';

import { roleLabel } from '../../../lib/groups';
import GroupClassificationsPanel from './GroupClassificationsPanel';
import GroupAssignWorkoutPanel from './GroupAssignWorkoutPanel';
import type { GroupClassification } from '../../../lib/groups';

type TeamSettingsTabProps = {
  activeTeam: any;
  members: any[];
  canManage: boolean;
  isOwner: boolean;
  isSelfOwner: boolean;
  classifications: GroupClassification[];
  groupProgramForAssign: any | null;
  memberClassificationIds: Record<string, string[]>;
  onCreateClassification: (name: string) => Promise<void>;
  onDeleteClassification: (c: GroupClassification) => Promise<void>;
  onAssignWorkout: (payload: {
    workoutId: string;
    targetType: 'group' | 'members' | 'classification';
    memberUserIds: string[];
    classificationId: string;
    scheduledDate: string;
    dueDate: string;
    title: string;
    notes: string;
  }) => Promise<void>;
  onLeaveTeam: () => Promise<void>;
  onDeleteTeam: () => Promise<void>;
};

export default function TeamSettingsTab({
  activeTeam,
  members,
  canManage,
  isOwner,
  isSelfOwner,
  classifications,
  groupProgramForAssign,
  memberClassificationIds,
  onCreateClassification,
  onDeleteClassification,
  onAssignWorkout,
  onLeaveTeam,
  onDeleteTeam,
}: TeamSettingsTabProps) {
  const owners = members.filter((m: any) => m.role === 'owner');
  const editors = members.filter((m: any) => m.role === 'manager' || m.role === 'editor');

  return (
    <>
      <div className="card">
        <h2>Team settings</h2>
        <label>Team name</label>
        <p>
          <b>{activeTeam?.name}</b>
        </p>
        <label>Invite code</label>
        <p>
          <b>{activeTeam?.invite_code}</b>
          {canManage && <span className="muted"> · Share so others can join</span>}
        </p>
        <label>Owner</label>
        <p className="muted">{owners.map((m: any) => m.display_name || 'Owner').join(', ') || '—'}</p>
        {editors.length > 0 && (
          <>
            <label>Editors</label>
            <p className="muted">{editors.map((m: any) => m.display_name || 'Editor').join(', ')}</p>
          </>
        )}
        <label>Your role</label>
        <p className="muted">{roleLabel(activeTeam?.my_role)}</p>
      </div>

      {canManage && (
        <>
          <GroupClassificationsPanel
            classifications={classifications}
            members={members}
            memberClassificationIds={memberClassificationIds}
            onCreate={onCreateClassification}
            onDelete={onDeleteClassification}
          />
          <GroupAssignWorkoutPanel
            groupProgram={groupProgramForAssign}
            members={members}
            classifications={classifications}
            memberClassificationIds={memberClassificationIds}
            onAssign={onAssignWorkout}
          />
        </>
      )}

      <div className="card">
        <h2>Membership</h2>
        {!isSelfOwner && (
          <button type="button" className="btn secondary full" style={{ marginTop: 8 }} onClick={() => onLeaveTeam()}>
            Leave team
          </button>
        )}
        {isOwner && (
          <button type="button" className="btn red full" style={{ marginTop: 8 }} onClick={() => onDeleteTeam()}>
            Delete team
          </button>
        )}
        {isSelfOwner && (
          <p className="muted" style={{ marginTop: 8 }}>
            Owners cannot leave — delete the team or transfer ownership (coming soon).
          </p>
        )}
      </div>
    </>
  );
}
