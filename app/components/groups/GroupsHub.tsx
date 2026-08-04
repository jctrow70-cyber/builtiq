'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildTeamProgramRows,
  type GroupClassification,
  type MemberPerformanceBundle,
  type MemberRosterMeta,
} from '../../../lib/groups';
import type { AssignProgramTarget } from './TeamAssignProgramModal';
import TeamAssignProgramModal from './TeamAssignProgramModal';
import TeamCreateJoinSheet from './TeamCreateJoinSheet';
import TeamMemberDetail from './TeamMemberDetail';
import TeamMembersTab from './TeamMembersTab';
import TeamProgressTab from './TeamProgressTab';
import TeamProgramsTab from './TeamProgramsTab';
import TeamSelector from './TeamSelector';
import TeamSettingsTab from './TeamSettingsTab';
import TeamWorkspaceTabs, { type TeamWorkspaceTab } from './TeamWorkspaceTabs';
import type { ReactNode } from 'react';

export type GroupsHubProps = {
  sessionUserId: string;
  teams: any[];
  selectedTeamId: string | null;
  activeTeam: any | null;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
  memberRosterMeta?: Record<string, MemberRosterMeta>;
  memberPerformance?: MemberPerformanceBundle | null;
  weightUnit?: string;
  memberDashboard: any | null;
  memberDashProgram: any | null;
  memberDashLogs: Record<string, any>;
  memberDashLastDate: string;
  memberTodayWorkout: any;
  memberWorkoutStatus: string;
  memberAssignment: any;
  memberAssignments: Record<string, any>;
  assignDraft: { type: string; programId: string; notes: string };
  programs: any[];
  assignableTeamPrograms?: any[];
  teamPrograms: any[];
  groupProgramForAssign: any | null;
  classifications: GroupClassification[];
  memberClassificationIds: Record<string, string[]>;
  compliancePct: number;
  teamActiveCount: number;
  teamTotalSets: number;
  teamPlanCount: number;
  canManage: boolean;
  isOwner: boolean;
  logDate: string;
  week: number;
  groupsProgramWizardOpen: boolean;
  teamProgramSetupPanel: ReactNode | null;
  memberWorkoutPanel?: ReactNode | null;
  memberProgramWizardUserId?: string | null;
  memberProgramDraftEditId?: string | null;
  onWorkspaceTabChange?: (tab: TeamWorkspaceTab) => void;
  onSelectTeam: (teamId: string) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onJoinGroup: (code: string) => Promise<void>;
  onRefreshMembers: () => void;
  onOpenMember: (member: any) => void;
  onCloseMemberDashboard: () => void;
  onOpenMemberWorkout: (member: any) => void;
  onSetMemberTrainingSource: (member: any, source: string) => void;
  onSetMemberRole: (member: any, role: string) => void;
  onRemoveMember: (member: any) => void;
  onSetParticipation: (member: any, active: boolean) => void;
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onApplyAssignment: () => void;
  onAssignWorkout: (payload: {
    workoutId: string;
    targetType: 'group' | 'members' | 'classification';
    memberUserIds: string[];
    classificationId: string;
    scheduledDate: string;
    dueDate: string;
    title: string;
    notes: string;
  }) => Promise<void>;
  onCreateClassification: (name: string) => Promise<void>;
  onDeleteClassification: (classification: GroupClassification) => Promise<void>;
  onToggleMemberClassification: (member: any, classificationId: string, active: boolean) => void;
  onSetModeTeam: () => void;
  onOpenGroupsProgramWizard: (mode: 'create' | 'generate') => void;
  onCloseGroupsProgramWizard: () => void;
  onDuplicateProgram: (programId: string) => Promise<void>;
  onEditTeamProgram: (programId: string) => void;
  onPublishTeamProgram: (programId: string) => void;
  onDeleteProgram: (programId: string) => void;
  onAssignTeamProgram: (
    programId: string,
    payload: { target: AssignProgramTarget; memberUserIds: string[]; setAsTeamDefault: boolean }
  ) => Promise<void>;
  onCustomizeProgramForMember: (memberUserId: string, sourceProgramId: string) => Promise<void>;
  onGenerateProgramForMember: (memberUserId: string) => void;
  onLeaveTeam: () => Promise<void>;
  onDeleteTeam: () => Promise<void>;
  sectionExercises: (workout: any, section: string) => any[];
  statusLabel: (s: string) => string;
};

export default function GroupsHub(props: GroupsHubProps) {
  const {
    sessionUserId,
    teams,
    activeTeam,
    members,
    memberStats,
    memberRosterMeta = {},
    memberPerformance = null,
    weightUnit = 'lb',
    memberDashboard,
    memberDashProgram,
    memberDashLogs,
    memberDashLastDate,
    memberTodayWorkout,
    memberWorkoutStatus,
    memberAssignment,
    assignDraft,
    programs,
    assignableTeamPrograms,
    teamPrograms,
    groupProgramForAssign,
    classifications,
    memberClassificationIds,
    memberAssignments,
    compliancePct,
    teamActiveCount,
    teamTotalSets,
    canManage,
    isOwner,
    logDate,
    week,
    groupsProgramWizardOpen,
    teamProgramSetupPanel,
    memberWorkoutPanel = null,
    memberProgramWizardUserId = null,
    memberProgramDraftEditId = null,
    onWorkspaceTabChange,
    onSelectTeam,
    onCreateGroup,
    onJoinGroup,
    onRefreshMembers,
    onOpenMember,
    onCloseMemberDashboard,
    onOpenMemberWorkout,
    onSetMemberTrainingSource,
    onSetMemberRole,
    onRemoveMember,
    onSetParticipation,
    onAssignDraftChange,
    onApplyAssignment,
    onAssignWorkout,
    onCreateClassification,
    onDeleteClassification,
    onToggleMemberClassification,
    onSetModeTeam,
    onOpenGroupsProgramWizard,
    onCloseGroupsProgramWizard,
    onDuplicateProgram,
    onEditTeamProgram,
    onPublishTeamProgram,
    onDeleteProgram,
    onAssignTeamProgram,
    onCustomizeProgramForMember,
    onGenerateProgramForMember,
    onLeaveTeam,
    onDeleteTeam,
    sectionExercises,
    statusLabel,
  } = props;

  const [workspaceTab, setWorkspaceTab] = useState<TeamWorkspaceTab>('members');
  const [sheetMode, setSheetMode] = useState<'create' | 'join' | null>(null);
  const [assignProgramId, setAssignProgramId] = useState<string | null>(null);

  useEffect(() => {
    setWorkspaceTab('members');
  }, [activeTeam?.id]);

  const programRows = useMemo(
    () =>
      buildTeamProgramRows(
        teamPrograms,
        activeTeam?.default_program_id,
        memberAssignments,
        members
      ),
    [teamPrograms, activeTeam?.default_program_id, memberAssignments, members]
  );

  const assignProgram = assignProgramId
    ? programRows.find((p) => p.id === assignProgramId) || teamPrograms.find((p: any) => p.id === assignProgramId)
    : null;

  if (teams.length === 0) {
    return (
      <section className="groups-hub teams-workspace">
        <div className="card">
          <h2>Teams</h2>
          <p className="muted">
            Create a team for your family, athletes, or clients — or join one with an invite code. Team workouts and
            assignments show up in Training when your editor assigns them.
          </p>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn green" onClick={() => setSheetMode('create')}>
              Create Team
            </button>
            <button type="button" className="btn secondary" onClick={() => setSheetMode('join')}>
              Join Team
            </button>
          </div>
        </div>
        <TeamCreateJoinSheet
          mode={sheetMode}
          onClose={() => setSheetMode(null)}
          onCreate={onCreateGroup}
          onJoin={onJoinGroup}
        />
      </section>
    );
  }

  const selfMember = members.find((m: any) => m.user_id === sessionUserId);
  const selfStats = selfMember ? memberStats[selfMember.user_id] || { sets: 0, days: 0 } : { sets: 0, days: 0 };

  const handleWorkspaceTabChange = (tab: TeamWorkspaceTab) => {
    setWorkspaceTab(tab);
    onWorkspaceTabChange?.(tab);
  };

  const memberInlineWizardOpen =
    !!memberProgramWizardUserId &&
    memberDashboard?.user_id === memberProgramWizardUserId &&
    (groupsProgramWizardOpen || (!!memberProgramDraftEditId && memberProgramDraftEditId.length > 0));

  const renderWorkspaceContent = () => {
    if (workspaceTab === 'members') {
      if (memberWorkoutPanel) return memberWorkoutPanel;
      if (memberDashboard && memberDashboard.user_id !== sessionUserId && canManage) {
        return (
          <TeamMemberDetail
            member={memberDashboard}
            memberAssignment={memberAssignment}
            memberDashProgram={memberDashProgram}
            memberTodayWorkout={memberTodayWorkout}
            memberWorkoutStatus={memberWorkoutStatus}
            memberDashLastDate={memberDashLastDate}
            memberDashLogs={memberDashLogs}
            memberStats={memberStats}
            logDate={logDate}
            week={week}
            canManage={canManage}
            assignDraft={assignDraft}
            programs={programs}
            assignableTeamPrograms={assignableTeamPrograms}
            onAssignDraftChange={onAssignDraftChange}
            onBack={onCloseMemberDashboard}
            onOpenWorkout={() => onOpenMemberWorkout(memberDashboard)}
            onApplyAssignment={onApplyAssignment}
            onCustomizeProgram={(sourceId) => onCustomizeProgramForMember(memberDashboard.user_id, sourceId)}
            onGenerateForMember={() => onGenerateProgramForMember(memberDashboard.user_id)}
            programWizardOpen={memberInlineWizardOpen}
            programWizardPanel={memberInlineWizardOpen ? teamProgramSetupPanel : null}
            memberDraftEditing={!!memberProgramDraftEditId && memberProgramDraftEditId.length > 0}
            onCloseProgramWizard={onCloseGroupsProgramWizard}
            sectionExercises={sectionExercises}
            statusLabel={statusLabel}
            assignmentCompliance={memberPerformance?.assignmentCompliance}
            performanceLogs={memberPerformance?.logs || []}
            workoutHistory={memberPerformance?.history || []}
            weightUnit={weightUnit}
          />
        );
      }
      return (
        <>
          {!canManage && selfMember && (
            <div className="card">
              <h2>Your activity</h2>
              <div className="dash-metrics">
                <div>
                  <b>{selfStats.sets}</b>
                  <span className="muted">Sets this week</span>
                </div>
                <div>
                  <b>{selfStats.days}</b>
                  <span className="muted">Active days</span>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                Log workouts in Training.
              </p>
            </div>
          )}
          <TeamMembersTab
            sessionUserId={sessionUserId}
            members={members}
            memberStats={memberStats}
            memberRosterMeta={memberRosterMeta}
            memberAssignments={memberAssignments}
            defaultProgram={groupProgramForAssign}
            classifications={classifications}
            memberClassificationIds={memberClassificationIds}
            canManage={canManage}
            isOwner={isOwner}
            statusLabel={statusLabel}
            onRefresh={onRefreshMembers}
            onOpenMember={onOpenMember}
            onSetMemberTrainingSource={onSetMemberTrainingSource}
            onSetMemberRole={onSetMemberRole}
            onRemoveMember={onRemoveMember}
            onSetParticipation={onSetParticipation}
            onToggleMemberClassification={onToggleMemberClassification}
          />
        </>
      );
    }

    if (workspaceTab === 'programs') {
      return (
        <TeamProgramsTab
          canManage={canManage}
          programRows={programRows}
          wizardOpen={groupsProgramWizardOpen && !memberProgramWizardUserId}
          teamProgramSetupPanel={teamProgramSetupPanel}
          onOpenCreateWizard={() => onOpenGroupsProgramWizard('create')}
          onOpenGenerateWizard={() => onOpenGroupsProgramWizard('generate')}
          onCloseWizard={onCloseGroupsProgramWizard}
          onDuplicate={(id) => onDuplicateProgram(id)}
          onEdit={onEditTeamProgram}
          onPublish={onPublishTeamProgram}
          onAssign={(id) => setAssignProgramId(id)}
          onDelete={onDeleteProgram}
          defaultProgramId={activeTeam?.default_program_id}
        />
      );
    }

    if (workspaceTab === 'progress') {
      return (
        <TeamProgressTab
          canManage={canManage}
          members={members}
          memberStats={memberStats}
          memberRosterMeta={memberRosterMeta}
          compliancePct={compliancePct}
          teamActiveCount={teamActiveCount}
          teamTotalSets={teamTotalSets}
          onOpenMember={onOpenMember}
        />
      );
    }

    if (workspaceTab === 'settings' && activeTeam) {
      return (
        <TeamSettingsTab
          activeTeam={activeTeam}
          members={members}
          canManage={canManage}
          isOwner={isOwner}
          isSelfOwner={activeTeam.my_role === 'owner'}
          classifications={classifications}
          groupProgramForAssign={groupProgramForAssign}
          memberClassificationIds={memberClassificationIds}
          onCreateClassification={onCreateClassification}
          onDeleteClassification={onDeleteClassification}
          onAssignWorkout={onAssignWorkout}
          onLeaveTeam={onLeaveTeam}
          onDeleteTeam={onDeleteTeam}
        />
      );
    }

    return null;
  };

  return (
    <section className="groups-hub teams-workspace">
      <div className="card team-workspace-head">
        <TeamSelector
          teams={teams}
          activeTeam={activeTeam}
          memberCount={members.length}
          onSelectTeam={(id) => {
            onSelectTeam(id);
            onSetModeTeam();
          }}
          onCreateTeam={() => setSheetMode('create')}
          onJoinTeam={() => setSheetMode('join')}
        />
      </div>

      <TeamWorkspaceTabs active={workspaceTab} onChange={handleWorkspaceTabChange} />

      {renderWorkspaceContent()}

      <TeamCreateJoinSheet
        mode={sheetMode}
        onClose={() => setSheetMode(null)}
        onCreate={onCreateGroup}
        onJoin={onJoinGroup}
      />

      {assignProgram && (
        <TeamAssignProgramModal
          program={{ id: assignProgram.id, name: assignProgram.name }}
          members={members}
          onClose={() => setAssignProgramId(null)}
          onAssign={(payload) => onAssignTeamProgram(assignProgram.id, payload)}
        />
      )}
    </section>
  );
}
