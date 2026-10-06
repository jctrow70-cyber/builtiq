'use client';

import { useState } from 'react';
import GroupMemberDashboard from './GroupMemberDashboard';
import MemberPerformancePanel from './MemberPerformancePanel';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';
import { emptyAssignmentCompliance } from '../../../lib/groups/memberPerformance';
import { roleForUi, type GroupClassification } from '../../../lib/groups';

type MemberDetailTab = 'overview' | 'assigned' | 'history' | 'progress';

type TeamMemberDetailProps = {
  member: any;
  memberAssignment: any;
  memberDashProgram: any;
  memberTodayWorkout: any;
  memberWorkoutStatus: string;
  memberDashLastDate: string;
  memberDashLogs: Record<string, any>;
  memberStats: Record<string, { sets: number; days: number }>;
  logDate: string;
  week: number;
  canManage: boolean;
  assignDraft: { type: string; programId: string; notes: string };
  programs: any[];
  assignableTeamPrograms?: any[];
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onBack: () => void;
  onOpenWorkout: () => void;
  onApplyAssignment: () => void;
  onCustomizeProgram?: (sourceProgramId: string) => void;
  onOpenProgramsToCreate?: () => void;
  sectionExercises: (workout: any, section: string) => any[];
  statusLabel: (s: string) => string;
  assignmentCompliance?: AssignmentComplianceSummary;
  performanceLogs?: any[];
  workoutHistory?: MemberWorkoutHistoryDay[];
  weightUnit?: string;
  performanceLoading?: boolean;
  onRefreshPerformance?: () => void;
  onRestoreMemberHistory?: () => void;
  restoreBusy?: boolean;
  isOwner?: boolean;
  classifications?: GroupClassification[];
  memberClassificationIds?: Record<string, string[]>;
  onSetMemberTrainingSource?: (member: any, source: string) => void;
  onSetMemberRole?: (member: any, role: string) => void;
  onSetParticipation?: (member: any, active: boolean) => void;
  onRemoveMember?: (member: any) => void;
  onToggleMemberClassification?: (member: any, classificationId: string, active: boolean) => void;
};

export default function TeamMemberDetail(props: TeamMemberDetailProps) {
  const [tab, setTab] = useState<MemberDetailTab>('assigned');
  const {
    member,
    canManage,
    onBack,
    onCustomizeProgram,
    onOpenProgramsToCreate,
    programs,
    assignmentCompliance,
    performanceLogs = [],
    workoutHistory = [],
    weightUnit = 'lb',
    performanceLoading = false,
    onRefreshPerformance,
    onRestoreMemberHistory,
    restoreBusy = false,
    isOwner = false,
    classifications = [],
    memberClassificationIds = {},
    onSetMemberTrainingSource,
    onSetMemberRole,
    onSetParticipation,
    onRemoveMember,
    onToggleMemberClassification,
  } = props;
  const teamPrograms = programs.filter((p: any) => p.visibility === 'team');
  const memberName = member.display_name || 'Member';
  const assignments = assignmentCompliance || emptyAssignmentCompliance();
  const participating = member.is_active_participant !== false;

  return (
    <div className="team-member-detail card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>{memberName}</h2>
        <button type="button" className="btn small secondary" onClick={onBack}>
          Back
        </button>
      </div>
      {canManage && (
        <div className="team-member-manage" style={{ marginTop: 12 }}>
          <p className="muted">Membership</p>
          <div className="actions" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {onSetMemberTrainingSource && (
              <select
                className="team-member-plan"
                value={member.training_source || 'team'}
                onChange={(e) => onSetMemberTrainingSource(member, e.target.value)}
                aria-label={`Plan source for ${memberName}`}
              >
                <option value="team">Group plan</option>
                <option value="personal">Personal</option>
              </select>
            )}
            {isOwner && onSetMemberRole && member.role !== 'owner' && (
              <select
                className="team-member-plan"
                value={roleForUi(member.role)}
                onChange={(e) => onSetMemberRole(member, e.target.value)}
                aria-label={`Role for ${memberName}`}
              >
                <option value="manager">Manager</option>
                <option value="member">Member</option>
              </select>
            )}
            {onSetParticipation && (
              <label className="remember-row">
                <input
                  type="checkbox"
                  checked={participating}
                  onChange={(e) => onSetParticipation(member, e.target.checked)}
                />{' '}
                Active participant
              </label>
            )}
            {onRemoveMember && (
              <button type="button" className="btn small red" onClick={() => onRemoveMember(member)}>
                Remove
              </button>
            )}
          </div>
          {classifications.length > 0 && onToggleMemberClassification && (
            <div className="member-classification-picks" style={{ marginTop: 8 }}>
              {classifications.map((c) => (
                <label key={c.id} className="classification-chip-toggle remember-row">
                  <input
                    type="checkbox"
                    checked={(memberClassificationIds[member.id] || []).includes(c.id)}
                    onChange={(e) => onToggleMemberClassification(member, c.id, e.target.checked)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="team-member-detail-tabs">
        {(['overview', 'assigned', 'history', 'progress'] as MemberDetailTab[]).map((id) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {id === 'overview'
              ? 'Overview'
              : id === 'assigned'
                ? 'Assigned Program'
                : id === 'history'
                  ? 'Workout History'
                  : 'Progress'}
          </button>
        ))}
      </div>
      {canManage && tab === 'assigned' && (
        <div className="actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {onOpenProgramsToCreate && (
            <button type="button" className="btn small green" onClick={onOpenProgramsToCreate}>
              Create a plan in Programs
            </button>
          )}
          {onCustomizeProgram && teamPrograms.length > 0 && (
            <select
              className="team-member-plan"
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) onCustomizeProgram(id);
                e.target.value = '';
              }}
            >
              <option value="">Customize from team program…</option>
              {teamPrograms.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {(tab === 'overview' || tab === 'assigned') && (
        <GroupMemberDashboard
          {...props}
          onBack={onBack}
          performanceLogs={[]}
          workoutHistory={[]}
          showAssignmentPanel={tab === 'assigned' || tab === 'overview'}
          hideHeader
          hidePerformance
        />
      )}

      {tab === 'history' && (
        <div className="team-member-tab-panel">
          <div className="topline" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <p className="muted">Completed training days from saved set logs (survives program changes).</p>
            {onRefreshPerformance && (
              <button type="button" className="btn small secondary" onClick={onRefreshPerformance} disabled={performanceLoading}>
                {performanceLoading ? 'Loading…' : 'Refresh'}
              </button>
            )}
          </div>
          {performanceLoading && workoutHistory.length === 0 ? (
            <p className="muted">Loading workout history…</p>
          ) : workoutHistory.length === 0 ? (
            <div className="card">
              <p className="muted">
                No completed sets found for this member yet. If they logged under a previous group program, open Progress and
                use Restore history, or confirm Progress still shows the sets on their own account.
              </p>
            </div>
          ) : (
            <div className="card member-workout-history">
              {workoutHistory.map((day) => (
                <div key={day.date} className="member-history-row">
                  <div>
                    <b>{day.label}</b>
                    <span className="muted">
                      {day.sets} set{day.sets === 1 ? '' : 's'}
                      {day.exercises.length ? ` · ${day.exercises.join(', ')}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'progress' && (
        <div className="team-member-tab-panel">
          <div className="topline" style={{ justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
            <p className="muted">Strength trends and PRs from completed logs — including older group programs.</p>
            <div className="actions" style={{ flexWrap: 'wrap' }}>
              {onRefreshPerformance && (
                <button type="button" className="btn small secondary" onClick={onRefreshPerformance} disabled={performanceLoading || restoreBusy}>
                  {performanceLoading ? 'Loading…' : 'Refresh'}
                </button>
              )}
              {onRestoreMemberHistory && (
                <button type="button" className="btn small green" onClick={onRestoreMemberHistory} disabled={performanceLoading || restoreBusy}>
                  {restoreBusy ? 'Restoring…' : 'Restore history'}
                </button>
              )}
            </div>
          </div>
          {performanceLoading && performanceLogs.length === 0 ? (
            <p className="muted">Loading progress…</p>
          ) : (
            <MemberPerformancePanel
              assignmentCompliance={assignments}
              history={workoutHistory}
              performanceLogs={performanceLogs}
              weightUnit={weightUnit}
              emptyHint="No completed strength sets found for this member. After replacing a manually built group program, tap Restore history to reconnect older logs, or check that this member’s Progress tab still has snapshots."
            />
          )}
        </div>
      )}
    </div>
  );
}
