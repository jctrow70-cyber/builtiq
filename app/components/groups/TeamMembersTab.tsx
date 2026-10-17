'use client';

import { useState } from 'react';
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
  isOwner?: boolean;
  onRefresh: () => void;
  onOpenMember: (member: any) => void;
  onSetMemberRole?: (member: any, role: string) => void;
  onSetParticipation?: (member: any, active: boolean) => void;
  onRemoveMember?: (member: any) => void;
  onToggleMemberClassification?: (member: any, classificationId: string, active: boolean) => void;
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
  isOwner = false,
  onRefresh,
  onOpenMember,
  onSetMemberRole,
  onSetParticipation,
  onRemoveMember,
  onToggleMemberClassification,
}: TeamMembersTabProps) {
  const [membershipUserId, setMembershipUserId] = useState<string | null>(null);
  return (
    <div className="card team-roster-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Members</h2>
        <button type="button" className="btn small secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="muted">
        {canManage ? 'Open a name for the group plan. Membership is separate from training.' : 'Tap your name to open your group plan.'}
      </p>
      {members.length === 0 && <p className="muted">No members yet. Invite people below or share your group invite code.</p>}
      {members.map((m: any) => {
        const stats = memberStats[m.user_id] || { sets: 0, days: 0 };
        const rosterMeta = memberRosterMeta[m.user_id] || {
          recentPr: false,
          assignmentPending: 0,
          assignmentOverdue: 0,
        };
        const isSelf = m.user_id === sessionUserId;
        const memberTags = classificationNamesForMember(m.id, classifications, memberClassificationIds);
        const programLabel = memberAssignedProgramLabel(m, memberAssignments, defaultProgram);
        const activity =
          stats.days > 0 ? `${stats.days} day${stats.days === 1 ? '' : 's'} with group-attributed sets` : 'No group-attributed sets this week';
        const membershipOpen = membershipUserId === m.user_id;

        return (
          <div key={m.id} className="team-member-row">
            <button type="button" className="team-member-main" onClick={() => onOpenMember(m)}>
              <div>
                <b>
                  {m.display_name || 'Member'}
                  {isSelf ? ' (you)' : ''}
                </b>
                <span className="muted">
                  {roleLabel(m.role)} · {programLabel} · {activity}
                  {stats.sets > 0 ? ` · ${stats.sets} group-attributed sets` : ''}
                  {memberTags.length ? ` · ${memberTags.join(', ')}` : ''}
                </span>
              </div>
              <div className="member-roster-badges">
                {rosterMeta.recentPr && <span className="badge progress-pr-badge">PR</span>}
                {rosterMeta.assignmentOverdue > 0 && (
                  <span className="badge member-overdue-badge">{rosterMeta.assignmentOverdue} overdue</span>
                )}
                {rosterMeta.assignmentPending > 0 && (
                  <span className="badge">{rosterMeta.assignmentPending} pending</span>
                )}
              </div>
            </button>
            {canManage && (
              <button
                type="button"
                className="member-text-btn"
                aria-expanded={membershipOpen}
                onClick={() => setMembershipUserId(membershipOpen ? null : m.user_id)}
              >
                Membership
              </button>
            )}
            {canManage && membershipOpen && (
              <div className="team-member-admin member-schedule-editor">
                {isOwner && onSetMemberRole && m.role !== 'owner' && (
                  <label>
                    Role
                    <select
                      value={roleForUi(m.role)}
                      onChange={(event) => onSetMemberRole(m, event.target.value)}
                      aria-label={`Role for ${m.display_name || 'member'}`}
                    >
                      <option value="manager">Manager</option>
                      <option value="member">Member</option>
                    </select>
                  </label>
                )}
                {onSetParticipation && (
                  <label className="remember-row">
                    <input
                      type="checkbox"
                      checked={m.is_active_participant !== false}
                      onChange={(event) => onSetParticipation(m, event.target.checked)}
                    />{' '}
                    Active participant
                  </label>
                )}
                {classifications.length > 0 && onToggleMemberClassification && (
                  <div className="member-classification-picks">
                    {classifications.map((classification) => (
                      <label key={classification.id} className="classification-chip-toggle remember-row">
                        <input
                          type="checkbox"
                          checked={(memberClassificationIds[m.id] || []).includes(classification.id)}
                          onChange={(event) => onToggleMemberClassification(m, classification.id, event.target.checked)}
                        />
                        {classification.name}
                      </label>
                    ))}
                  </div>
                )}
                {onRemoveMember && !isSelf && (
                  <button type="button" className="btn small red" onClick={() => onRemoveMember(m)}>
                    Remove from group
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
