'use client';

import type { MemberRosterMeta } from '../../../lib/groups/memberPerformance';
import { roleLabel } from '../../../lib/groups';

type TeamProgressTabProps = {
  canViewGroupProgress: boolean;
  sessionUserId: string;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
  memberRosterMeta: Record<string, MemberRosterMeta>;
  teamActiveCount: number;
  teamTotalSets: number;
  onOpenMember: (member: any) => void;
  onRestoreHistory?: () => void;
  restoreBusy?: boolean;
};

export default function TeamProgressTab({
  canViewGroupProgress,
  sessionUserId,
  members,
  memberStats,
  memberRosterMeta,
  teamActiveCount,
  teamTotalSets,
  onOpenMember,
  onRestoreHistory,
  restoreBusy = false,
}: TeamProgressTabProps) {
  const visible = canViewGroupProgress ? members : members.filter((m) => m.user_id === sessionUserId);
  const recentPrs = visible.filter((m) => memberRosterMeta[m.user_id]?.recentPr).length;
  const overdue = visible.reduce((sum, m) => sum + (memberRosterMeta[m.user_id]?.assignmentOverdue || 0), 0);
  const pending = visible.reduce((sum, m) => sum + (memberRosterMeta[m.user_id]?.assignmentPending || 0), 0);
  const showAssignments = canViewGroupProgress;

  return (
    <>
      <div className="card">
        <div className="topline" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2>Activity</h2>
          {canViewGroupProgress && onRestoreHistory && (
            <button type="button" className="btn small green" onClick={onRestoreHistory} disabled={restoreBusy}>
              {restoreBusy ? 'Restoring…' : 'Restore history'}
            </button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          {canViewGroupProgress
            ? 'People with at least one completed set this week. This is activity, not whether a scheduled workout was missed.'
            : 'Your completed sets in this group this week.'}
        </p>
        <div className="dash-metrics">
          {canViewGroupProgress ? (
            <>
              <div>
                <b>
                  {teamActiveCount}/{members.length || 0}
                </b>
                <span className="muted">Active members this week</span>
              </div>
              <div>
                <b>{teamTotalSets}</b>
                <span className="muted">Total completed sets</span>
              </div>
              {recentPrs > 0 && (
                <div>
                  <b>{recentPrs}</b>
                  <span className="muted">Recent PRs</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <b>{memberStats[sessionUserId]?.sets || 0}</b>
                <span className="muted">Your sets</span>
              </div>
              <div>
                <b>{memberStats[sessionUserId]?.days || 0}</b>
                <span className="muted">Your active days</span>
              </div>
            </>
          )}
        </div>
      </div>

      {showAssignments && (
        <div className="card">
          <h2>Assigned workouts</h2>
          <div className="dash-metrics">
            <div>
              <b>{pending}</b>
              <span className="muted">Pending</span>
            </div>
            <div>
              <b>{overdue}</b>
              <span className="muted">Overdue</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>{canViewGroupProgress ? 'Member activity' : 'Your activity'}</h2>
        {visible.map((m: any) => {
          const stats = memberStats[m.user_id] || { sets: 0, days: 0 };
          const meta = memberRosterMeta[m.user_id];
          const activity =
            stats.sets > 0 ? `${stats.sets} sets · ${stats.days} active day${stats.days === 1 ? '' : 's'}` : 'No activity this week';
          return (
            <button
              key={m.id}
              type="button"
              className="team-progress-member-row"
              onClick={() => canViewGroupProgress && onOpenMember(m)}
              disabled={!canViewGroupProgress}
            >
              <div>
                <b>{m.display_name || 'Member'}</b>
                <span className="muted">
                  {roleLabel(m.role)} · {activity}
                </span>
              </div>
              <div className="member-roster-badges">
                {meta?.recentPr && <span className="badge progress-pr-badge">PR</span>}
                {meta && meta.assignmentOverdue > 0 && (
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
