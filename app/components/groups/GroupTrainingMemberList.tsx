'use client';

import type { GroupTrainingMemberRow } from '../../../lib/groups/trainingWorkspace';
import { formatDisplayDate } from '../../../lib/training/programCalendar';

type GroupTrainingMemberListProps = {
  members: GroupTrainingMemberRow[];
  sessionUserId?: string | null;
  onOpenMember: (userId: string) => void;
  onExplainStatus?: (userId: string) => void;
};

export default function GroupTrainingMemberList({ members, sessionUserId, onOpenMember, onExplainStatus }: GroupTrainingMemberListProps) {
  if (!members.length) {
    return <p className="muted">No members to show in this group yet.</p>;
  }

  return (
    <div className="group-training-list">
      {members.map((member) => {
        const you = member.userId === sessionUserId;
        return (
          <div key={member.userId} className="group-training-member">
            <button type="button" className="group-training-member-open" onClick={() => onOpenMember(member.userId)}>
              <span className="group-training-member-name">
                <b>
                  {member.name}
                  {you ? ' (you)' : ''}
                </b>
              </span>
              <span className="group-training-member-plan">
                <span>{member.planName}</span>
                <span className="muted">{member.scheduleDays}</span>
              </span>
              <span className="group-training-member-next">
                <span>{member.nextWorkout?.label || '—'}</span>
                <span className="muted">
                  {member.nextWorkout ? formatDisplayDate(member.nextWorkout.date) : 'Next workout'}
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`group-training-status group-training-status-${member.status}`}
              onClick={() => (onExplainStatus || onOpenMember)(member.userId)}
            >
              {member.statusLabel}
            </button>
          </div>
        );
      })}
    </div>
  );
}
