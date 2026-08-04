'use client';

import { useEffect, useState, type ReactNode } from 'react';
import GroupMemberDashboard from './GroupMemberDashboard';
import MemberPerformancePanel from './MemberPerformancePanel';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';

export type MemberDetailTab = 'overview' | 'assigned' | 'history' | 'progress';

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
  /** Which detail tab to open (e.g. Progress when opened from Groups → Progress). */
  initialTab?: MemberDetailTab;
};

export default function TeamMemberDetail(props: TeamMemberDetailProps) {
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
    initialTab = 'assigned',
    assignmentCompliance,
    performanceLogs = [],
    workoutHistory = [],
    weightUnit = 'lb',
  } = props;
  const [tab, setTab] = useState<MemberDetailTab>(initialTab);
  const teamPrograms = programs.filter((p: any) => p.visibility === 'team');
  const memberName = member.display_name || 'Member';

  useEffect(() => {
    setTab(initialTab);
  }, [member?.user_id, initialTab]);

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

  const showProgressPanel = tab === 'progress' || tab === 'history';

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
      {showProgressPanel ? (
        <div className="team-member-progress-panel" style={{ marginTop: 10 }}>
          <p className="muted" style={{ marginBottom: 8 }}>
            {tab === 'progress'
              ? 'Strength PRs, volume trends, and recent completed workouts for this member.'
              : 'Completed sets from this member’s saved lift history.'}
          </p>
          <MemberPerformancePanel
            assignmentCompliance={
              assignmentCompliance || {
                total: 0,
                completed: 0,
                pending: 0,
                started: 0,
                skipped: 0,
                overdue: 0,
                completionPct: 0,
              }
            }
            history={workoutHistory}
            performanceLogs={performanceLogs}
            weightUnit={weightUnit}
          />
        </div>
      ) : (
        <GroupMemberDashboard
          {...props}
          onBack={onBack}
          performanceLogs={tab === 'overview' ? [] : performanceLogs}
          workoutHistory={[]}
          showAssignmentPanel={tab === 'assigned' || tab === 'overview'}
          hideHeader
        />
      )}
    </div>
  );
}
