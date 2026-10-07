'use client';

import type { ReactNode } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';
import GroupScheduleAdherence from './GroupScheduleAdherence';

type GroupTrainingHomeProps = {
  canManage: boolean;
  current: TeamProgramRow | null;
  onView?: () => void;
  onAssign?: () => void;
  onManagePlans?: () => void;
  managingPlans: boolean;
  planLibrary?: ReactNode;
  assignmentTools?: ReactNode;
  teamId?: string | null;
  members?: Array<{ user_id?: string; display_name?: string | null }>;
};

export default function GroupTrainingHome({
  canManage,
  current,
  onView,
  onAssign,
  onManagePlans,
  managingPlans,
  planLibrary,
  assignmentTools,
  teamId,
  members,
}: GroupTrainingHomeProps) {
  return (
    <>
      <div className="card">
        <h2>Current group program</h2>
        {current ? (
          <>
            <p>
              <b>{current.name}</b>
            </p>
            <p className="muted">
              {current.statusLabel}
              {current.weeks ? ` · ${current.weeks} week cycle` : ''}
              {current.isDefault ? ' · Group default' : ''}
              {current.assignmentSummary ? ` · ${current.assignmentSummary}` : ''}
            </p>
          </>
        ) : (
          <p className="muted">This group does not have a current program yet.</p>
        )}
        {canManage && (
          <div className="actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {current && onView && (
              <button type="button" className="btn small secondary" onClick={onView}>
                View
              </button>
            )}
            {current && current.status === 'published' && onAssign && (
              <button type="button" className="btn small green" onClick={onAssign}>
                Assign
              </button>
            )}
            {onManagePlans && (
              <button type="button" className="btn small secondary" onClick={onManagePlans}>
                {managingPlans ? 'Hide plans' : 'Manage plans'}
              </button>
            )}
          </div>
        )}
      </div>
      {canManage && managingPlans && planLibrary}
      {teamId && <GroupScheduleAdherence teamId={teamId} members={members || []} />}
      <div className="card">
        <h2>This week&apos;s training</h2>
        <p className="muted">
          {current
            ? 'The group is on the program above. One-off workouts from this group count on this grade.'
            : 'Assign a group program before scheduling one-off workouts.'}
        </p>
      </div>
      {canManage && assignmentTools}
    </>
  );
}
