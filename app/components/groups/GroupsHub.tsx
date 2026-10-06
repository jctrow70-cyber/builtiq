'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildTeamProgramRows,
  type GroupClassification,
  type MemberPerformanceBundle,
  type MemberRosterMeta,
} from '../../../lib/groups';
import type { AssignProgramTarget } from './TeamAssignProgramModal';
import TeamAssignProgramModal from './TeamAssignProgramModal';
import TeamCreateJoinSheet, { type CreateGroupPayload } from './TeamCreateJoinSheet';
import GroupAssignWorkoutPanel from './GroupAssignWorkoutPanel';
import GroupClassificationsPanel from './GroupClassificationsPanel';
import GroupInviteMembersPanel from './GroupInviteMembersPanel';
import GroupOverview from './GroupOverview';
import GroupTrainingHome from './GroupTrainingHome';
import TeamMemberDetail from './TeamMemberDetail';
import TeamMembersTab from './TeamMembersTab';
import TeamProgressTab from './TeamProgressTab';
import TeamProgramsTab from './TeamProgramsTab';
import TeamSelector from './TeamSelector';
import TeamSettingsTab from './TeamSettingsTab';
import TeamWorkspaceTabs, { type TeamWorkspaceTab } from './TeamWorkspaceTabs';
import type { GroupPermissionFlags } from '../../../lib/groups/groupPermissions';

export type GroupsHubProps = {
  sessionUserId: string;
  teams: any[];
  selectedTeamId: string | null;
  activeTeam: any | null;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
  memberRosterMeta?: Record<string, MemberRosterMeta>;
  memberPerformance?: MemberPerformanceBundle | null;
  performanceLoading?: boolean;
  restoreMemberHistoryBusy?: boolean;
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
  assignWorkoutPrograms?: any[];
  classifications: GroupClassification[];
  memberClassificationIds: Record<string, string[]>;
  canViewGroupProgress: boolean;
  teamActiveCount: number;
  teamTotalSets: number;
  teamPlanCount: number;
  canManage: boolean;
  isOwner: boolean;
  logDate: string;
  week: number;
  memberWorkoutPanel?: ReactNode | null;
  onWorkspaceTabChange?: (tab: TeamWorkspaceTab) => void;
  onSelectTeam: (teamId: string) => void;
  defaultTeamId?: string | null;
  onSetDefaultTeam?: (teamId: string) => void;
  onCreateGroup: (payload: CreateGroupPayload) => Promise<{ inviteCode?: string; inviteSummary?: string } | void>;
  onJoinGroup: (code: string) => Promise<void>;
  accessToken?: string | null;
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
    programId?: string | null;
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
  onRefreshMemberPerformance?: () => void;
  onRestoreMemberHistory?: () => void;
  onRestoreTeamHistory?: () => void;
  restoreTeamHistoryBusy?: boolean;
  onLeaveTeam: () => Promise<void>;
  onDeleteTeam: () => Promise<void>;
  onSaveGroupPermissions?: (flags: GroupPermissionFlags) => Promise<void>;
  onTransferOwnership?: (userId: string) => Promise<void>;
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
    performanceLoading = false,
    restoreMemberHistoryBusy = false,
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
    assignWorkoutPrograms = [],
    classifications,
    memberClassificationIds,
    memberAssignments,
    canViewGroupProgress,
    teamActiveCount,
    teamTotalSets,
    canManage,
    isOwner,
    logDate,
    week,
    memberWorkoutPanel = null,
    onWorkspaceTabChange,
    onSelectTeam,
    defaultTeamId = null,
    onSetDefaultTeam,
    onCreateGroup,
    onJoinGroup,
    accessToken = null,
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
    onDuplicateProgram,
    onEditTeamProgram,
    onPublishTeamProgram,
    onDeleteProgram,
    onAssignTeamProgram,
    onCustomizeProgramForMember,
    onGenerateProgramForMember,
    onRefreshMemberPerformance,
    onRestoreMemberHistory,
    onRestoreTeamHistory,
    restoreTeamHistoryBusy = false,
    onLeaveTeam,
    onDeleteTeam,
    onSaveGroupPermissions,
    onTransferOwnership,
    sectionExercises,
    statusLabel,
  } = props;

  const [workspaceTab, setWorkspaceTab] = useState<TeamWorkspaceTab>('overview');
  const [sheetMode, setSheetMode] = useState<'create' | 'join' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managePlans, setManagePlans] = useState(false);
  const [assignProgramId, setAssignProgramId] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState(0);

  useEffect(() => {
    setWorkspaceTab('overview');
    setSettingsOpen(false);
    setManagePlans(false);
  }, [activeTeam?.id]);

  useEffect(() => {
    if (!canManage || !accessToken || !activeTeam?.id) {
      setPendingInvites(0);
      return;
    }
    let cancelled = false;
    fetch(`/api/groups/invite?teamId=${encodeURIComponent(activeTeam.id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.invites) ? data.invites : [];
        setPendingInvites(rows.filter((row: { status?: string }) => row.status === 'pending').length);
      })
      .catch(() => {
        if (!cancelled) setPendingInvites(0);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, accessToken, activeTeam?.id]);

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
          <h2>Groups</h2>
          <p className="muted">
            Create a group for your family, athletes, or clients — or join one with an invite code. Group workouts and
            assignments show up in Training when a manager assigns them. Personal Training stays your own.
          </p>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn green" onClick={() => setSheetMode('create')}>
              Create Group
            </button>
            <button type="button" className="btn secondary" onClick={() => setSheetMode('join')}>
              Join Group
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

  const openMember = (member: any) => {
    setWorkspaceTab('members');
    onOpenMember(member);
  };

  const renderWorkspaceContent = () => {
    if (workspaceTab === 'overview' && activeTeam) {
      const current = programRows.find((row) => row.isDefault) || programRows.find((row) => row.status !== 'draft') || null;
      const quiet = members
        .filter((m: any) => (memberStats[m.user_id]?.sets || 0) === 0)
        .map((m: any) => m.display_name || 'Member');
      const overdueAssignments = Object.values(memberRosterMeta).reduce((sum, meta) => sum + (meta?.assignmentOverdue || 0), 0);
      const pendingAssignments = Object.values(memberRosterMeta).reduce((sum, meta) => sum + (meta?.assignmentPending || 0), 0);
      const selfPlan = memberAssignments[sessionUserId];
      return (
        <GroupOverview
          canManage={canManage}
          memberCount={members.length}
          activeThisWeek={teamActiveCount}
          setsThisWeek={teamTotalSets}
          planName={current?.name || groupProgramForAssign?.name}
          planStatus={current?.statusLabel}
          planWeeks={current?.weeks}
          noActivityNames={quiet}
          overdueAssignments={overdueAssignments}
          pendingAssignments={pendingAssignments}
          pendingInvites={pendingInvites}
          selfSets={selfStats.sets}
          selfDays={selfStats.days}
          selfPlanName={selfPlan?.st_programs?.name || groupProgramForAssign?.name}
          onViewTraining={() => handleWorkspaceTabChange('training')}
        />
      );
    }

    if (workspaceTab === 'members') {
      if (memberWorkoutPanel) return memberWorkoutPanel;
      if (memberDashboard && canManage) {
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
            onOpenProgramsToCreate={() => onGenerateProgramForMember(memberDashboard.user_id)}
            sectionExercises={sectionExercises}
            statusLabel={statusLabel}
            assignmentCompliance={memberPerformance?.assignmentCompliance}
            performanceLogs={memberPerformance?.logs || []}
            workoutHistory={memberPerformance?.history || []}
            weightUnit={weightUnit}
            performanceLoading={performanceLoading}
            onRefreshPerformance={onRefreshMemberPerformance}
            onRestoreMemberHistory={onRestoreMemberHistory}
            restoreBusy={restoreMemberHistoryBusy}
            isOwner={isOwner}
            classifications={classifications}
            memberClassificationIds={memberClassificationIds}
            onSetMemberTrainingSource={onSetMemberTrainingSource}
            onSetMemberRole={memberDashboard.role === 'owner' ? undefined : onSetMemberRole}
            onSetParticipation={onSetParticipation}
            onRemoveMember={memberDashboard.user_id === sessionUserId ? undefined : onRemoveMember}
            onToggleMemberClassification={onToggleMemberClassification}
          />
        );
      }
      return (
        <>
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
            onRefresh={onRefreshMembers}
            onOpenMember={onOpenMember}
          />
          {canManage && activeTeam && (
            <>
              <GroupInviteMembersPanel
                teamId={activeTeam.id}
                teamName={activeTeam.name}
                inviteCode={activeTeam.invite_code}
                accessToken={accessToken}
                canManage={canManage}
              />
              <GroupClassificationsPanel
                classifications={classifications}
                members={members}
                memberClassificationIds={memberClassificationIds}
                onCreate={onCreateClassification}
                onDelete={onDeleteClassification}
              />
            </>
          )}
        </>
      );
    }

    if (workspaceTab === 'training') {
      const current = programRows.find((row) => row.isDefault) || programRows.find((row) => row.status !== 'draft') || null;
      return (
        <GroupTrainingHome
          canManage={canManage}
          current={current}
          managingPlans={managePlans}
          onView={current ? () => onEditTeamProgram(current.id) : undefined}
          onAssign={current ? () => setAssignProgramId(current.id) : undefined}
          onManagePlans={canManage ? () => setManagePlans((open) => !open) : undefined}
          planLibrary={
            <TeamProgramsTab
              canManage={canManage}
              programRows={programRows}
              groupName={activeTeam?.name}
              onOpenPrograms={() => onOpenGroupsProgramWizard('create')}
              onDuplicate={(id) => onDuplicateProgram(id)}
              onEdit={onEditTeamProgram}
              onPublish={onPublishTeamProgram}
              onAssign={(id) => setAssignProgramId(id)}
              onDelete={onDeleteProgram}
              defaultProgramId={activeTeam?.default_program_id}
            />
          }
          assignmentTools={
            <GroupAssignWorkoutPanel
              groupProgram={groupProgramForAssign}
              publishedTeamPrograms={assignWorkoutPrograms}
              members={members}
              classifications={classifications}
              memberClassificationIds={memberClassificationIds}
              onAssign={onAssignWorkout}
            />
          }
        />
      );
    }

    if (workspaceTab === 'progress') {
      return (
        <TeamProgressTab
          canViewGroupProgress={canViewGroupProgress}
          sessionUserId={sessionUserId}
          members={members}
          memberStats={memberStats}
          memberRosterMeta={memberRosterMeta}
          teamActiveCount={teamActiveCount}
          teamTotalSets={teamTotalSets}
          onOpenMember={openMember}
          onRestoreHistory={onRestoreTeamHistory}
          restoreBusy={restoreTeamHistoryBusy}
        />
      );
    }

    return null;
  };

  return (
    <section className="groups-hub teams-workspace">
      <div className="card team-workspace-head">
        <div className="team-workspace-head-row">
          <TeamSelector
            teams={teams}
            activeTeam={activeTeam}
            defaultTeamId={defaultTeamId}
            memberCount={members.length}
            onSelectTeam={(id) => {
              onSelectTeam(id);
              onSetModeTeam();
            }}
            onSetDefaultTeam={onSetDefaultTeam}
            onCreateTeam={() => setSheetMode('create')}
            onJoinTeam={() => setSheetMode('join')}
          />
          {activeTeam && (
            <div className="team-header-actions">
              <button
                type="button"
                className="btn secondary team-header-settings"
                aria-label="Group settings"
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </button>
            </div>
          )}
        </div>
      </div>

      <TeamWorkspaceTabs active={workspaceTab} onChange={handleWorkspaceTabChange} />

      {renderWorkspaceContent()}

      {settingsOpen && activeTeam && (
        <div className="team-sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="team-sheet-panel card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Group settings">
            <div className="topline" style={{ justifyContent: 'space-between' }}>
              <h2>Settings</h2>
              <button type="button" className="btn small secondary" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>
            <TeamSettingsTab
              activeTeam={activeTeam}
              members={members}
              onLeaveTeam={async () => {
                await onLeaveTeam();
                setSettingsOpen(false);
              }}
              onDeleteTeam={onDeleteTeam}
              onSaveGroupPermissions={onSaveGroupPermissions}
              onTransferOwnership={onTransferOwnership}
            />
          </div>
        </div>
      )}

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
