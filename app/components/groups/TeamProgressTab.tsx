'use client';

import type { MemberRosterMeta } from '../../../lib/groups/memberPerformance';
import { roleLabel } from '../../../lib/groups';

type TeamProgressTabProps = {
  canManage: boolean;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
  memberRosterMeta: Record<string, MemberRosterMeta>;
  compliancePct: number;
  teamActiveCount: number;
  teamTotalSets: number;
  onOpenMember: (member: any) => void;
};

export default function TeamProgressTab({
  canManage,
  members,
  memberStats,
  memberRosterMeta,
  compliancePct,
  teamActiveCount,
  teamTotalSets,
  onOpenMember,
}: TeamProgressTabProps) {
  return (
    <>
      {canManage && (
        <div className="card team-compliance-card">
          <div className="topline" style={{ justifyContent: 'space-between' }}>
            <h2>Team progress</h2>
            <span className="badge">{compliancePct}%</span>
          </div>
          <div className="dash-metrics">
            <div>
              <b>
                {teamActiveCount}/{members.length || 0}
              </b>
              <span className="muted">Active this week</span>
            </div>
            <div>
              <b>{teamTotalSets}</b>
              <span className="muted">Total sets</span>
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <h2>Member status</h2>
        <p className="muted">This week&apos;s completion and activity.{canManage ? ' Tap a member for details.' : ''}</p>
        {members.map((m: any) => {
          const stats = memberStats[m.user_id] || { sets: 0, days: 0 };
          const meta = memberRosterMeta[m.user_id] || { recentPr: false, assignmentPending: 0, assignmentOverdue: 0 };
          const status =
            stats.days > 0
              ? stats.sets > 0
                ? 'In progress'
                : 'Started'
              : 'Not started';
          return (
            <button
              key={m.id}
              type="button"
              className="team-progress-member-row"
              onClick={() => canManage && onOpenMember(m)}
              disabled={!canManage}
            >
              <div>
                <b>{m.display_name || 'Member'}</b>
                <span className="muted">
                  {roleLabel(m.role)} · {status} · {stats.sets} sets · {stats.days} days
                </span>
              </div>
              <div className="member-roster-badges">
                {meta.recentPr && <span className="badge progress-pr-badge">PR</span>}
                {meta.assignmentOverdue > 0 && (
                  <span className="badge member-overdue-badge">{meta.assignmentOverdue} overdue</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
