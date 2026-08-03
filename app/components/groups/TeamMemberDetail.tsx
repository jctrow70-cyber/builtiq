'use client';

import { useState } from 'react';
import GroupMemberDashboard from './GroupMemberDashboard';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';

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
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onBack: () => void;
  onOpenWorkout: () => void;
  onApplyAssignment: () => void;
  onCustomizeProgram?: (sourceProgramId: string) => void;
  onGenerateForMember?: () => void;
  sectionExercises: (workout: any, section: string) => any[];
  statusLabel: (s: string) => string;
  assignmentCompliance?: AssignmentComplianceSummary;
  performanceLogs?: any[];
  workoutHistory?: MemberWorkoutHistoryDay[];
  weightUnit?: string;
};

export default function TeamMemberDetail(props: TeamMemberDetailProps) {
  const [tab, setTab] = useState<MemberDetailTab>('overview');
  const { member, canManage, onBack, onCustomizeProgram, onGenerateForMember, programs } = props;
  const teamPrograms = programs.filter((p: any) => p.visibility === 'team');

  return (
    <div className="team-member-detail card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>{member.display_name || 'Member'}</h2>
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
      <GroupMemberDashboard
        {...props}
        onBack={onBack}
        memberTodayWorkout={tab === 'history' || tab === 'progress' ? null : props.memberTodayWorkout}
        performanceLogs={tab === 'overview' ? [] : props.performanceLogs || []}
        workoutHistory={tab === 'overview' || tab === 'assigned' ? [] : props.workoutHistory || []}
        showAssignmentPanel={tab === 'assigned' || tab === 'overview'}
        hideHeader
      />
    </div>
  );
}
