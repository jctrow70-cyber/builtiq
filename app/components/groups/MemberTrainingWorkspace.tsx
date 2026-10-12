'use client';

import { useState, type ReactNode } from 'react';
import type { GroupTrainingMemberRow } from '../../../lib/groups/trainingWorkspace';
import { formatDisplayDate } from '../../../lib/training/programCalendar';

type MemberTrainingWorkspaceProps = {
  groupName: string;
  member: GroupTrainingMemberRow;
  canManage: boolean;
  planEditor?: ReactNode;
  customizePrograms?: Array<{ id: string; name: string }>;
  onBack: () => void;
  onChangePlan?: () => void;
  onCustomize?: (programId: string) => void;
  onMessage?: () => void;
};

export default function MemberTrainingWorkspace({
  groupName,
  member,
  canManage,
  planEditor,
  customizePrograms = [],
  onBack,
  onChangePlan,
  onCustomize,
  onMessage,
}: MemberTrainingWorkspaceProps) {
  const [showCustomize, setShowCustomize] = useState(false);

  return (
    <div className="member-training-workspace">
      <button type="button" className="btn secondary member-training-back" onClick={onBack}>
        Back to members
      </button>
      <h2>
        {member.name}
        {groupName ? <span className="muted"> · {groupName}</span> : null}
      </h2>
      <div className="group-training-summary member-training-facts">
        <div>
          <b>{member.planName}</b>
          <span className="muted">Group plan</span>
        </div>
        <div>
          <b>{member.scheduleDays}</b>
          <span className="muted">Training days</span>
        </div>
        <div>
          <b>{member.nextWorkout?.label || '—'}</b>
          <span className="muted">{member.nextWorkout ? formatDisplayDate(member.nextWorkout.date) : 'Next workout'}</span>
        </div>
        <div>
          <b className={`group-training-status group-training-status-${member.status}`}>{member.statusLabel}</b>
          <span className="muted">Status</span>
        </div>
      </div>
      {member.scheduleNeedsReview && (
        <p className="muted member-training-note">
          This program&apos;s weeks do not share the same training days. Per-member weekday changes arrive in a later update.
        </p>
      )}
      {member.planKind === 'personal' && (
        <p className="muted member-training-note">This group is not assigning a plan. Personal training stays private.</p>
      )}
      {(canManage || onMessage) && (
        <div className="actions member-training-actions">
          {canManage && onChangePlan && (
            <button type="button" className="btn green" onClick={onChangePlan}>
              Change plan
            </button>
          )}
          {canManage && onCustomize && customizePrograms.length > 0 && (
            <button type="button" className="btn secondary" onClick={() => setShowCustomize((open) => !open)}>
              Customize workouts
            </button>
          )}
          {onMessage && (
            <button type="button" className="btn secondary" onClick={onMessage}>
              Message member
            </button>
          )}
        </div>
      )}
      {showCustomize && onCustomize && (
        <label className="member-training-customize">
          Customize from a group program
          <select
            defaultValue=""
            onChange={(event) => {
              const id = event.target.value;
              if (id) onCustomize(id);
              event.target.value = '';
            }}
          >
            <option value="">Choose a program…</option>
            {customizePrograms.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {planEditor}
      <h3>This week</h3>
      {member.weekItems.length === 0 ? (
        <p className="muted">Nothing from this group is scheduled this week.</p>
      ) : (
        <div className="member-training-week">
          {member.weekItems.map((item) => (
            <div key={`${item.date}-${item.title}`} className="member-training-week-row">
              <div>
                <b>{formatDisplayDate(item.date)}</b>
                <span className="muted">{item.title}</span>
              </div>
              <span className={`group-training-status group-training-week-${item.state.replace(/\s+/g, '-').toLowerCase()}`}>
                {item.state}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
