'use client';

import { useEffect, useState } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';
import { excuseMemberWorkout, moveMemberWorkout, restoreMemberWorkout } from '../../../lib/groups/assignGroupTraining';
import { runGroupExtraAction, type GroupExtraAction } from '../../../lib/groups/groupActivities';
import type { GroupClassification } from '../../../lib/groups/schema';
import { todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import GroupTrainingCalendar from './GroupTrainingCalendar';
import type { GroupActivityLogRequest } from '../../../lib/groups/groupActivityLog';

type GroupTrainingHomeProps = {
  canManage: boolean;
  current: TeamProgramRow | null;
  onAssign?: () => void;
  onOpenAssignWizard?: (seed?: { memberUserId?: string | null; programId?: string | null }) => void;
  canAssign?: boolean;
  onManagePlans?: () => void;
  teamId?: string | null;
  teamName?: string | null;
  sessionUserId?: string | null;
  members?: Array<{
    id?: string;
    user_id?: string;
    display_name?: string | null;
    is_active_participant?: boolean;
  }>;
  classifications?: GroupClassification[];
  memberClassificationIds?: Record<string, string[]>;
  calendarFocusDate?: string | null;
  onCalendarFocusHandled?: () => void;
  onOpenMember: (userId: string) => void;
  onLogGroupActivity?: (input: GroupActivityLogRequest) => void;
  reloadKey: number;
  notice?: string | null;
  onTrainingChanged: () => void;
};

export default function GroupTrainingHome({
  canManage,
  current,
  onAssign,
  onOpenAssignWizard,
  canAssign = false,
  onManagePlans,
  teamId,
  teamName,
  sessionUserId,
  calendarFocusDate = null,
  onCalendarFocusHandled,
  onOpenMember,
  onLogGroupActivity,
  members = [],
  classifications = [],
  memberClassificationIds = {},
  reloadKey,
  notice = null,
  onTrainingChanged,
}: GroupTrainingHomeProps) {
  const [calendarDate, setCalendarDate] = useState<string | null>(null);

  useEffect(() => {
    setCalendarDate(null);
  }, [teamId]);

  useEffect(() => {
    if (!calendarFocusDate) return;
    setCalendarDate(calendarFocusDate);
    onCalendarFocusHandled?.();
  }, [calendarFocusDate, onCalendarFocusHandled]);

  async function changeExtra(action: GroupExtraAction) {
    const { error, message } = await runGroupExtraAction(supabase, action);
    if (error) throw new Error(error);
    onTrainingChanged();
    return message;
  }

  function assignTraining() {
    if (onOpenAssignWizard) onOpenAssignWizard();
    else if (current && current.status === 'published' && onAssign) onAssign();
    else onManagePlans?.();
  }

  return (
    <div className="group-training">
      {(canManage || canAssign) && (
        <div className="group-training-assign-row">
          <button type="button" className="btn secondary" onClick={assignTraining}>
            Assign Training
          </button>
        </div>
      )}
      {notice && <p className="muted group-training-notice">{notice}</p>}
      <div className="card group-training-card">
        {teamId ? (
          <GroupTrainingCalendar
            key={teamId}
            teamId={teamId}
            teamName={teamName}
            canSeeAll={canManage || canAssign}
            canEdit={!!canAssign}
            viewerUserId={sessionUserId || ''}
            reloadKey={reloadKey}
            members={members
              .filter((member) => member.user_id)
              .map((member) => ({
                id: member.id,
                userId: member.user_id as string,
                name: member.display_name || 'Member',
                active: member.is_active_participant !== false,
              }))}
            classifications={classifications}
            memberClassificationIds={memberClassificationIds}
            onOpenMember={onOpenMember}
            onMoveWorkout={async (input) => {
              const { error } = await moveMemberWorkout(supabase, {
                teamId,
                memberUserId: input.memberUserId,
                workoutId: input.workoutId,
                originalDate: input.originalDate,
                newDate: input.newDate,
                localToday: todayYmd(),
              });
              if (error) throw new Error(error);
              onTrainingChanged();
            }}
            onExcuseWorkout={async (input) => {
              const { error } = await excuseMemberWorkout(supabase, {
                teamId,
                memberUserId: input.memberUserId,
                workoutId: input.workoutId,
                originalDate: input.originalDate,
                localToday: todayYmd(),
              });
              if (error) throw new Error(error);
              onTrainingChanged();
            }}
            onExtraAction={changeExtra}
            onLogGroupActivity={onLogGroupActivity}
            focusDate={calendarDate}
            onActivitySaved={onTrainingChanged}
            onRestoreWorkout={async (input) => {
              const { error } = await restoreMemberWorkout(supabase, {
                teamId,
                memberUserId: input.memberUserId,
                workoutId: input.workoutId,
                originalDate: input.originalDate,
                localToday: todayYmd(),
              });
              if (error) throw new Error(error);
              onTrainingChanged();
            }}
          />
        ) : (
          <p className="muted">Choose a group to see its calendar.</p>
        )}
      </div>
    </div>
  );
}
