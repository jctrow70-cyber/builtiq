'use client';

import { useState, type ReactNode } from 'react';
import GroupMemberDashboard from './GroupMemberDashboard';
import MemberPerformancePanel from './MemberPerformancePanel';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';
import { emptyAssignmentCompliance } from '../../../lib/groups/memberPerformance';

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
  onGenerateForMember?: () => void;
  programWizardOpen?: boolean;
  programWizardPanel?: ReactNode | null;
  memberDraftEditing?: boolean;
  onCloseProgramWizard?: () => void;
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
};

export default function TeamMemberDetail(props: TeamMemberDetailProps) {
  const [tab, setTab] = useState<MemberDetailTab>('assigned');
  const {
    member,
    canManage,
    onBack,
    onCustomizeProgram,
    onGenerateForMember,
    programs,
    programWizardOpen = false,
    programWizardPanel = null,
    memberDraftEditing = false,
    onCloseProgramWizard,
    assignmentCompliance,
    performanceLogs = [],
    workoutHistory = [],
    weightUnit = 'lb',
    performanceLoading = false,
    onRefreshPerformance,
    onRestoreMemberHistory,
    restoreBusy = false,
  } = props;
  const teamPrograms = programs.filter((p: any) => p.visibility === 'team');
  const memberName = member.display_name || 'Member';
  const compliance = assignmentCompliance || emptyAssignmentCompliance();

  if (programWizardOpen && programWizardPanel) {
    return (
      <div className="team-member-detail card">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{memberName}</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              {memberDraftEditing
                ? 'Review the generated plan below. Publish when ready to assign.'
                : 'Generate a program for this member. Publish when ready to assign.'}
            </p>
          </div>
          <button type="button" className="btn small secondary" onClick={onCloseProgramWizard}>
            Cancel
          </button>
        </div>
        <div className="team-member-program-wizard">{programWizardPanel}</div>
      </div>
    );
  }

  return (
    <div className="team-member-detail card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>{memberName}</h2>
        <button type="button" className="btn small secondary" onClick={onBack}>
          Back
        </button>
      </div>
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
          {onGenerateForMember && (
            <button type="button" className="btn small green" onClick={onGenerateForMember}>
              Generate program
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
              assignmentCompliance={compliance}
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
