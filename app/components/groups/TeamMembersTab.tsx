'use client';

import {
  classificationNamesForMember,
  memberAssignedProgramLabel,
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
  onRefresh: () => void;
  onOpenMember: (member: any) => void;
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
  onRefresh,
  onOpenMember,
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
        {canManage ? 'Tap a member to manage their role, tags, and participation.' : 'Tap your name to open Training.'}
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
          stats.days > 0 ? `${stats.days} active day${stats.days === 1 ? '' : 's'}` : 'No activity this week';

        return (
          <button key={m.id} type="button" className="team-member-row team-member-main" onClick={() => onOpenMember(m)}>
            <div>
              <b>
                {m.display_name || 'Member'}
                {isSelf ? ' (you)' : ''}
              </b>
              <span className="muted">
                {roleLabel(m.role)} · {programLabel} · {activity}
                {stats.sets > 0 ? ` · ${stats.sets} sets` : ''}
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
        );
      })}
    </div>
  );
}
