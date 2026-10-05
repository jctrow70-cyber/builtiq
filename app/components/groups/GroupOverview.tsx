'use client';

import { roleLabel } from '../../../lib/groups';
import type { TeamWorkspaceTab } from '../../../lib/groups/workspaceTabs';

type GroupOverviewProps = {
  groupName: string;
  role?: string | null;
  memberCount: number;
  activeThisWeek: number;
  setsThisWeek: number;
  planName?: string | null;
  onOpen: (tab: TeamWorkspaceTab) => void;
};

export default function GroupOverview({
  groupName,
  role,
  memberCount,
  activeThisWeek,
  setsThisWeek,
  planName,
  onOpen,
}: GroupOverviewProps) {
  return (
    <div className="card">
      <h2>{groupName}</h2>
      <p className="muted">You are {roleLabel(role)} in this group.</p>
      <div className="dash-metrics" style={{ marginTop: 12 }}>
        <div>
          <b>{memberCount}</b>
          <span className="muted">Members</span>
        </div>
        <div>
          <b>
            {activeThisWeek}/{memberCount || 0}
          </b>
          <span className="muted">Active this week</span>
        </div>
        <div>
          <b>{setsThisWeek}</b>
          <span className="muted">Sets this week</span>
        </div>
      </div>
      <p style={{ marginTop: 12 }}>
        <span className="muted">Group plan · </span>
        <b>{planName || 'No group plan yet'}</b>
      </p>
      <div className="actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn small green" onClick={() => onOpen('training')}>
          Training
        </button>
        <button type="button" className="btn small secondary" onClick={() => onOpen('members')}>
          Members
        </button>
        <button type="button" className="btn small secondary" onClick={() => onOpen('progress')}>
          Progress
        </button>
      </div>
    </div>
  );
}
