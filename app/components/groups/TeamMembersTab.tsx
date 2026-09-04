'use client';

import {
  classificationNamesForMember,
  memberAssignedProgramLabel,
  roleForUi,
  roleLabel,
  type GroupClassification,
  type MemberRosterMeta,
} from '../../../lib/groups';

type TeamMembersTabProps = {
  sessionUserId: string;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
  memberRosterMeta: Record<string, MemberRosterMeta>;
  memberAssignments: Record<string, any>;
  defaultProgram: any | null;
  classifications: GroupClassification[];
  memberClassificationIds: Record<string, string[]>;
  canManage: boolean;
  isOwner: boolean;
  statusLabel: (s: string) => string;
  onRefresh: () => void;
  onOpenMember: (member: any) => void;
  onSetMemberTrainingSource: (member: any, source: string) => void;
  onSetMemberRole: (member: any, role: string) => void;
  onRemoveMember: (member: any) => void;
  onSetParticipation: (member: any, active: boolean) => void;
  onToggleMemberClassification: (member: any, classificationId: string, active: boolean) => void;
};

export default function TeamMembersTab({
  sessionUserId,
  members,
  memberStats,
  memberRosterMeta,
  memberAssignments,
  defaultProgram,
  classifications,
  memberClassificationIds,
  canManage,
  isOwner,
  statusLabel,
  onRefresh,
  onOpenMember,
  onSetMemberTrainingSource,
  onSetMemberRole,
  onRemoveMember,
  onSetParticipation,
  onToggleMemberClassification,
}: TeamMembersTabProps) {
  return (
    <div className="card team-roster-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Members</h2>
        <button type="button" className="btn small secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="muted">
        {canManage ? 'Tap a member for details and program actions.' : 'Tap your name to open Training.'}
      </p>
      {members.length === 0 && <p className="muted">No members yet. Invite people below or share your team invite code.</p>}
      {members.map((m: any) => {
        const stats = memberStats[m.user_id] || { sets: 0, days: 0 };
        const rosterMeta = memberRosterMeta[m.user_id] || {
          recentPr: false,
          assignmentPending: 0,
          assignmentOverdue: 0,
        };
        const isSelf = m.user_id === sessionUserId;
        const participating = m.is_active_participant !== false;
        const memberTags = classificationNamesForMember(m.id, classifications, memberClassificationIds);
        const programLabel = memberAssignedProgramLabel(m, memberAssignments, defaultProgram);
        const weekStatus =
          stats.days > 0 ? `${stats.days} active day${stats.days === 1 ? '' : 's'}` : 'Not started this week';

        return (
          <div key={m.id} className="team-member-row">
            <button type="button" className="team-member-main" onClick={() => onOpenMember(m)}>
              <div>
                <b>
                  {m.display_name || 'Member'}
                  {isSelf ? ' (you)' : ''}
                </b>
                <span className="muted">
                  {roleLabel(m.role)} · {programLabel} · {weekStatus}
                  {!participating ? ' · observer' : ''}
                  {memberTags.length ? ` · ${memberTags.join(', ')}` : ''}
                </span>
              </div>
              <div className="member-roster-badges">
                {rosterMeta.recentPr && <span className="badge progress-pr-badge">New PR</span>}
                {stats.sets > 0 && <span className="badge">{stats.sets} sets</span>}
              </div>
            </button>
            {canManage && (
              <div className="team-member-actions">
                {!isSelf && (
                  <select
                    className="team-member-plan"
                    value={m.training_source || 'team'}
                    onChange={(e) => onSetMemberTrainingSource(m, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Plan for ${m.display_name || 'member'}`}
                  >
                    <option value="team">Team plan</option>
                    <option value="personal">Personal</option>
                  </select>
                )}
                {isOwner && !isSelf && (
                  <select
                    className="team-member-plan"
                    value={roleForUi(m.role)}
                    onChange={(e) => onSetMemberRole(m, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Role for ${m.display_name || 'member'}`}
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Editor</option>
                    <option value="member">Member</option>
                  </select>
                )}
                {!isSelf && (
                  <>
                    <label className="team-member-participation remember-row">
                      <input
                        type="checkbox"
                        checked={participating}
                        onChange={(e) => onSetParticipation(m, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      className="btn small red"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMember(m);
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
            {canManage && classifications.length > 0 && (
              <div className="member-classification-picks" style={{ gridColumn: '1 / -1' }}>
                {classifications.map((c) => (
                  <label key={c.id} className="classification-chip-toggle remember-row">
                    <input
                      type="checkbox"
                      checked={(memberClassificationIds[m.id] || []).includes(c.id)}
                      onChange={(e) => onToggleMemberClassification(m, c.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
