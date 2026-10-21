'use client';

import { useEffect, useState } from 'react';
import { fetchGroupExtras } from '../../../lib/groups/groupActivities';
import type { MemberRosterMeta } from '../../../lib/groups/memberPerformance';
import { summarizeGroupExtras } from '../../../lib/groups/trainingWorkspace';
import { addDaysYmd, mondayOfWeek, todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import { roleLabel } from '../../../lib/groups';
import GroupScheduleAdherence from './GroupScheduleAdherence';

type TeamProgressTabProps = {
  teamId?: string | null;
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
  teamId,
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
  const showAssignments = canViewGroupProgress && (pending > 0 || overdue > 0);
  const [extraSummary, setExtraSummary] = useState<ReturnType<typeof summarizeGroupExtras> | null>(null);

  useEffect(() => {
    if (!teamId) {
      setExtraSummary(null);
      return;
    }
    let cancelled = false;
    const today = todayYmd();
    void fetchGroupExtras(supabase, { teamId, from: mondayOfWeek(today), to: addDaysYmd(mondayOfWeek(today), 6) }).then((extras) => {
      if (!cancelled) setExtraSummary(summarizeGroupExtras(extras, today));
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

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
            ? 'People with at least one group-attributed completed set this week. This is not whether a scheduled group workout was missed.'
            : 'Your group-attributed completed sets this week. Personal training is not included.'}
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
                <span className="muted">Group-attributed sets</span>
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
                <span className="muted">Your group-attributed sets</span>
              </div>
              <div>
                <b>{memberStats[sessionUserId]?.days || 0}</b>
                <span className="muted">Your active days</span>
              </div>
            </>
          )}
        </div>
      </div>

      {teamId && (
        <GroupScheduleAdherence
          teamId={teamId}
          members={visible.map((member) => ({ user_id: member.user_id, display_name: member.display_name }))}
        />
      )}

      {extraSummary && extraSummary.total > 0 && (
        <div className="card">
          <h2>Group extras this week</h2>
          <p className="muted">Required extras have their own standing. Optional extras are not program misses.</p>
          <div className="dash-metrics">
            <div>
              <b>{extraSummary.requiredCompleted}</b>
              <span className="muted">Required completed</span>
            </div>
            <div>
              <b>{extraSummary.requiredOpen}</b>
              <span className="muted">Required still open</span>
            </div>
            <div>
              <b>{extraSummary.optional}</b>
              <span className="muted">Optional</span>
            </div>
            {extraSummary.skipped > 0 && (
              <div>
                <b>{extraSummary.skipped}</b>
                <span className="muted">Skipped</span>
              </div>
            )}
          </div>
        </div>
      )}

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
            stats.sets > 0 ? `${stats.sets} group-attributed sets · ${stats.days} day${stats.days === 1 ? '' : 's'}` : 'No group-attributed sets this week';
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
