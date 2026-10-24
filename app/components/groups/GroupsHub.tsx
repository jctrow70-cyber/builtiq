'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  buildTeamProgramRows,
  groupPermissionFlags,
  roleForUi,
  type GroupClassification,
  type MemberPerformanceBundle,
  type MemberRosterMeta,
} from '../../../lib/groups';
import type { AssignProgramTarget } from './TeamAssignProgramModal';
import AssignTrainingWizard, { type AssignTrainingSubmit } from './AssignTrainingWizard';
import type { AssignmentWizardResume } from '../../../lib/groups/assignmentWizard';
import { canOpenMemberTraining } from '../../../lib/groups/memberDirectory';
import { canAssignInGroup } from '../../../lib/groups/permissions';
import { emptyAssignmentCompliance } from '../../../lib/groups/memberPerformance';
import TeamCreateJoinSheet, { type CreateGroupPayload } from './TeamCreateJoinSheet';
import GroupClassificationsPanel from './GroupClassificationsPanel';
import GroupInviteMembersPanel from './GroupInviteMembersPanel';
import GroupMemberProfileSheet from './GroupMemberProfileSheet';
import GroupMembersDirectory from './GroupMembersDirectory';
import GroupTrainingHome from './GroupTrainingHome';
import MemberPerformancePanel from './MemberPerformancePanel';
import type { MemberProfileSection } from './MemberTrainingWorkspace';
import { useGroupTrainingBoard } from './useGroupTrainingBoard';
import TeamProgressTab from './TeamProgressTab';
import TeamProgramsTab from './TeamProgramsTab';
import TeamSelector from './TeamSelector';
import TeamSettingsTab from './TeamSettingsTab';
import TeamWorkspaceTabs, { type TeamWorkspaceTab } from './TeamWorkspaceTabs';
import { visibleGroupWorkspaceTabs } from '../../../lib/groups/workspaceTabs';
import GroupMessages, { MessageIconMark } from './GroupMessages';
import type { GroupPermissionFlags } from '../../../lib/groups/groupPermissions';
import { canStartDirectConversation, groupCommunicationFlags } from '../../../lib/groups/communication';
import { supabase } from '../../../lib/supabaseClient';

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
  onLogGroupWorkout?: (input: {
    memberUserId: string;
    expectationId: string;
    workoutId: string;
    programId: string;
    scheduledDate: string;
    sourceKey: string;
    teamId?: string | null;
  }) => void;
  groupLogResume?: { teamId: string; memberUserId: string; scheduledDate: string; returnTo?: 'group-calendar' | 'member-profile' } | null;
  onLogGroupActivity?: (input: {
    teamId: string;
    memberUserId: string;
    workoutId: string;
    seriesId: string;
    originalDate: string;
    scheduledDate: string;
    returnTo: 'group-calendar' | 'member-profile';
  }) => void;
  onGroupLogResumeConsumed?: () => void;
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
  assignmentResume?: AssignmentWizardResume | null;
  onAssignmentResumeConsumed?: () => void;
  onCreateAssignmentProgram?: (draft: AssignmentWizardResume) => void;
  onSubmitAssignment?: (payload: AssignTrainingSubmit) => Promise<void>;
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
  pendingConversation?: { teamId: string; conversationId: string } | null;
  onPendingConversationHandled?: () => void;
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
    onLogGroupWorkout,
    onLogGroupActivity,
    groupLogResume = null,
    onGroupLogResumeConsumed,
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
    assignmentResume = null,
    onAssignmentResumeConsumed,
    onCreateAssignmentProgram,
    onSubmitAssignment,
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
    pendingConversation = null,
    onPendingConversationHandled,
    sectionExercises,
    statusLabel,
  } = props;

  const [workspaceTab, setWorkspaceTab] = useState<TeamWorkspaceTab>('calendar');
  const [sheetMode, setSheetMode] = useState<'create' | 'join' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [composeUserId, setComposeUserId] = useState<string | null>(null);
  const [openedConversationId, setOpenedConversationId] = useState<string | null>(null);
  const [wizardSeed, setWizardSeed] = useState<{ memberUserId?: string | null; programId?: string | null } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileDate, setProfileDate] = useState<string | null>(null);
  const [profileSection, setProfileSection] = useState<MemberProfileSection>('calendar');
  const [membersVisited, setMembersVisited] = useState(false);

  const canAssign = canAssignInGroup(activeTeam?.my_role, activeTeam ? groupPermissionFlags(activeTeam) : null);
  const trainingPrograms = useMemo(
    () => [...(assignWorkoutPrograms || []), ...(teamPrograms || []), groupProgramForAssign].filter(Boolean),
    [assignWorkoutPrograms, teamPrograms, groupProgramForAssign]
  );
  const customizePrograms = useMemo(
    () =>
      programs
        .filter((program: any) => program?.visibility === 'team' && program?.id)
        .map((program: any) => ({ id: program.id, name: program.name || 'Program' })),
    [programs]
  );
  const training = useGroupTrainingBoard({
    teamId: activeTeam?.id || null,
    sessionUserId,
    canSeeAllTraining: canManage || canAssign,
    members,
    memberAssignments,
    programs: trainingPrograms,
    defaultProgramId: activeTeam?.default_program_id,
  });

  useEffect(() => {
    if (!groupLogResume?.memberUserId || !groupLogResume.scheduledDate) return;
    setWorkspaceTab('calendar');
    setProfileSection('calendar');
    if (groupLogResume.returnTo === 'group-calendar') {
      setProfileUserId(null);
      setProfileDate(null);
      setCalendarFocusDate(groupLogResume.scheduledDate);
    } else if (
      canOpenMemberTraining({
        viewerUserId: sessionUserId,
        subjectUserId: groupLogResume.memberUserId,
        canManage,
        canAssign,
      })
    ) {
      setCalendarFocusDate(null);
      setProfileUserId(groupLogResume.memberUserId);
      setProfileDate(groupLogResume.scheduledDate);
      const member = members.find((item: any) => item.user_id === groupLogResume.memberUserId);
      if (member && (canManage || member.user_id === sessionUserId)) onOpenMember(member);
    }
    onGroupLogResumeConsumed?.();
  }, [groupLogResume]);

  const groupLogResumeRef = useRef(groupLogResume);
  groupLogResumeRef.current = groupLogResume;

  useEffect(() => {
    if (groupLogResumeRef.current?.memberUserId) return;
    setWorkspaceTab('calendar');
    onWorkspaceTabChange?.('calendar');
    setProfileUserId(null);
    setProfileDate(null);
    setMembersVisited(false);
    setSettingsOpen(false);
    setMessagesOpen(false);
    setComposeUserId(null);
    setOpenedConversationId(null);
  }, [activeTeam?.id]);

  useEffect(() => {
    if (!activeTeam?.id) {
      setUnreadConversations(0);
      return;
    }
    let cancelled = false;
    const teamId = activeTeam.id;
    async function refreshUnread() {
      const { data, error } = await supabase.rpc('st_group_unread_conversation_count', { p_team_id: teamId });
      if (!cancelled && !error) setUnreadConversations(Number(data) || 0);
    }
    void refreshUnread();
    const channel = supabase
      .channel(`group-unread:${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'st_messages' }, () => {
        void refreshUnread();
      })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeTeam?.id]);

  useEffect(() => {
    if (!pendingConversation || pendingConversation.teamId !== activeTeam?.id) return;
    setComposeUserId(null);
    setOpenedConversationId(pendingConversation.conversationId);
    setMessagesOpen(true);
    onPendingConversationHandled?.();
  }, [pendingConversation, activeTeam?.id, onPendingConversationHandled]);

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

  useEffect(() => {
    if (!assignmentResume || assignmentResume.teamId !== activeTeam?.id) return;
    setWizardSeed(null);
    setWizardOpen(true);
    setWorkspaceTab('calendar');
  }, [assignmentResume, activeTeam?.id]);

  useEffect(() => {
    if (workspaceTab === 'programs' && !canManage) setWorkspaceTab('calendar');
  }, [canManage, workspaceTab]);

  useEffect(() => {
    if (workspaceTab === 'members') setMembersVisited(true);
  }, [workspaceTab]);

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

  const handleWorkspaceTabChange = (tab: TeamWorkspaceTab) => {
    setWorkspaceTab(tab);
    onWorkspaceTabChange?.(tab);
  };

  const openTrainingSheet = (userId: string, section: MemberProfileSection, date?: string | null) => {
    if (!userId) return;
    const member = members.find((item: any) => item.user_id === userId);
    if (
      !canOpenMemberTraining({
        viewerUserId: sessionUserId,
        subjectUserId: userId,
        canManage,
        canAssign,
      })
    ) {
      if (member) onOpenMember(member);
      return;
    }
    setProfileSection(section);
    setProfileDate(date || null);
    setProfileUserId(userId);
    if (member && (canManage || userId === sessionUserId)) onOpenMember(member);
  };

  const closeTrainingSheet = () => {
    setProfileUserId(null);
    setProfileDate(null);
  };

  const profileRow = training.board?.members.find((member) => member.userId === profileUserId) || null;
  const profileSource = members.find((member: any) => member.user_id === profileUserId) || null;

  const renderWorkspaceContent = () => {
    const currentProgram = programRows.find((row) => row.isDefault) || programRows.find((row) => row.status !== 'draft') || null;
    return (
      <>
        <div hidden={workspaceTab !== 'calendar'}>
          <GroupTrainingHome
            canManage={canManage}
            current={currentProgram}
            canAssign={canAssign}
            onOpenAssignWizard={(seed) => {
              setWizardSeed(seed || null);
              setWizardOpen(true);
            }}
            onManagePlans={canManage ? () => handleWorkspaceTabChange('programs') : undefined}
            teamName={activeTeam?.name}
            sessionUserId={sessionUserId}
            teamId={activeTeam?.id || null}
            onOpenMember={(userId) => openTrainingSheet(userId, 'calendar')}
            onLogGroupActivity={onLogGroupActivity}
            calendarFocusDate={calendarFocusDate}
            onCalendarFocusHandled={() => setCalendarFocusDate(null)}
            members={members}
            classifications={classifications}
            memberClassificationIds={memberClassificationIds}
            reloadKey={training.reloadKey}
            notice={training.notice}
            onTrainingChanged={training.reload}
          />
        </div>
        {(membersVisited || workspaceTab === 'members') && activeTeam && (
          <div hidden={workspaceTab !== 'members'}>
            {memberWorkoutPanel ? (
              memberWorkoutPanel
            ) : (
              <>
                <GroupMembersDirectory
                  teamId={activeTeam.id}
                  sessionUserId={sessionUserId}
                  members={members}
                  memberStats={memberStats}
                  memberRosterMeta={memberRosterMeta}
                  classifications={classifications}
                  memberClassificationIds={memberClassificationIds}
                  canManage={canManage}
                  canAssign={canAssign}
                  canViewActivity={canViewGroupProgress}
                  isOwner={isOwner}
                  board={training.board}
                  trainingReady={training.trainingReady}
                  onRefresh={onRefreshMembers}
                  onOpenMember={(userId) => openTrainingSheet(userId, 'calendar')}
                  onSetMemberRole={onSetMemberRole}
                  onSetParticipation={onSetParticipation}
                  onRemoveMember={onRemoveMember}
                  onToggleMemberClassification={onToggleMemberClassification}
                />
                {canManage && (
                  <>
                    <GroupInviteMembersPanel
                      teamId={activeTeam.id}
                      teamName={activeTeam.name}
                      accessToken={accessToken}
                      canManage={canManage}
                      canInviteManagers={isOwner || !!activeTeam.managers_can_invite_managers}
                      classifications={classifications}
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
            )}
          </div>
        )}
        {workspaceTab === 'programs' && canManage && activeTeam && (
        <div className="card group-training-card">
          <div className="group-training-library-head">
            <div>
              <h2>Program library</h2>
              <p className="muted">Publish plans here. Assign Training adds a plan or a workout. Building a program stays in Programs.</p>
            </div>
          </div>
          {currentProgram && (
            <p className="muted group-training-current">
              Current group program · <b>{currentProgram.name}</b>
              <button type="button" className="btn small secondary" style={{ marginLeft: 8 }} onClick={() => onEditTeamProgram(currentProgram.id)}>
                View
              </button>
            </p>
          )}
          <div className="group-training-library">
            <TeamProgramsTab
              canManage={canManage}
              programRows={programRows}
              groupName={activeTeam.name}
              onOpenPrograms={() => onOpenGroupsProgramWizard('create')}
              onDuplicate={(id) => onDuplicateProgram(id)}
              onEdit={onEditTeamProgram}
              onPublish={onPublishTeamProgram}
              onAssign={(id) => {
                setWizardSeed({ programId: id });
                setWizardOpen(true);
              }}
              onDelete={onDeleteProgram}
              defaultProgramId={activeTeam.default_program_id}
            />
          </div>
        </div>
        )}
        {workspaceTab === 'progress' && activeTeam && (
        <TeamProgressTab
          teamId={activeTeam.id}
          canViewGroupProgress={canViewGroupProgress}
          sessionUserId={sessionUserId}
          members={members}
          memberStats={memberStats}
          memberRosterMeta={memberRosterMeta}
          teamActiveCount={teamActiveCount}
          teamTotalSets={teamTotalSets}
          onOpenMember={(member) => openTrainingSheet(member.user_id, 'progress')}
          onRestoreHistory={onRestoreTeamHistory}
          restoreBusy={restoreTeamHistoryBusy}
        />
        )}
      </>
    );
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
                className="btn secondary team-header-messages"
                aria-label={
                  unreadConversations > 0
                    ? `Messages, ${unreadConversations} conversations with unread messages`
                    : 'Messages'
                }
                onClick={() => {
                  setComposeUserId(null);
                  setOpenedConversationId(null);
                  setMessagesOpen(true);
                }}
              >
                <MessageIconMark />
                <span className="team-header-messages-label">Messages</span>
                {unreadConversations > 0 && <span className="team-message-badge">{unreadConversations}</span>}
              </button>
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

      <TeamWorkspaceTabs tabs={visibleGroupWorkspaceTabs(canManage)} active={workspaceTab} onChange={handleWorkspaceTabChange} />

      {renderWorkspaceContent()}

      {profileUserId && profileRow && profileSource && activeTeam && (
        <GroupMemberProfileSheet
          teamId={activeTeam.id}
          teamName={activeTeam.name || ''}
          sessionUserId={sessionUserId}
          member={profileRow}
          sourceMember={profileSource}
          canManage={canManage}
          canAssign={canAssign}
          section={profileSection}
          onSection={setProfileSection}
          initialDate={profileDate}
          switchMembers={(training.board?.members || []).map((member) => ({ userId: member.userId, name: member.name }))}
          onSwitchMember={(userId) => openTrainingSheet(userId, profileSection)}
          progressPanel={
            memberDashboard && (canManage || memberDashboard.user_id === sessionUserId) ? (
              <MemberPerformancePanel
                assignmentCompliance={memberPerformance?.assignmentCompliance || emptyAssignmentCompliance()}
                history={memberPerformance?.history || []}
                performanceLogs={memberPerformance?.logs || []}
                weightUnit={weightUnit}
                emptyHint="No group-attributed completed sets in this window."
                teamId={activeTeam.id}
                userId={memberDashboard.user_id}
              />
            ) : undefined
          }
          panelUserId={memberDashboard?.user_id || null}
          groupLogs={
            memberDashboard && (canManage || memberDashboard.user_id === sessionUserId)
              ? performanceLoading
                ? null
                : memberPerformance?.logs || []
              : null
          }
          programs={trainingPrograms}
          customizePrograms={customizePrograms}
          onCustomize={onCustomizeProgramForMember}
          onEditProgram={onEditTeamProgram}
          onOpenAssignWizard={(seed) => {
            setWizardSeed(seed || null);
            setWizardOpen(true);
          }}
          onTrainingChanged={training.reload}
          onClose={closeTrainingSheet}
          onMessage={
            canStartDirectConversation({
              callerRole: activeTeam.my_role,
              callerActive: true,
              targetRole: profileSource.role,
              targetActive: true,
              samePerson: profileSource.user_id === sessionUserId,
              flags: groupCommunicationFlags(activeTeam),
            })
              ? () => {
                  setOpenedConversationId(null);
                  setComposeUserId(profileSource.user_id);
                  setMessagesOpen(true);
                }
              : undefined
          }
          onLogGroupWorkout={onLogGroupWorkout}
          onLogGroupActivity={onLogGroupActivity}
          reloadKey={training.reloadKey}
        />
      )}

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

      {messagesOpen && activeTeam && (
        <GroupMessages
          teamId={activeTeam.id}
          teamName={activeTeam.name || 'Group'}
          currentUserId={sessionUserId}
          role={activeTeam.my_role}
          team={activeTeam}
          members={members}
          initialConversationId={openedConversationId}
          initialUserId={composeUserId}
          onClose={() => {
            setMessagesOpen(false);
            setComposeUserId(null);
            setOpenedConversationId(null);
          }}
          onUnreadChange={() => {
            void supabase.rpc('st_group_unread_conversation_count', { p_team_id: activeTeam.id }).then(({ data, error }) => {
              if (!error) setUnreadConversations(Number(data) || 0);
            });
          }}
        />
      )}

      <TeamCreateJoinSheet
        mode={sheetMode}
        onClose={() => setSheetMode(null)}
        onCreate={onCreateGroup}
        onJoin={onJoinGroup}
      />

      {wizardOpen && activeTeam && onSubmitAssignment && onCreateAssignmentProgram && (
        <AssignTrainingWizard
          teamId={activeTeam.id}
          members={members}
          programs={[...(assignWorkoutPrograms || []), ...(teamPrograms || []), ...(programs || []), groupProgramForAssign].filter(Boolean)}
          classifications={classifications}
          memberClassificationIds={memberClassificationIds}
          memberAssignments={memberAssignments}
          defaultProgramId={activeTeam.default_program_id}
          defaultProgramName={programRows.find((row) => row.isDefault)?.name || null}
          resume={assignmentResume}
          seed={wizardSeed}
          onClose={() => {
            setWizardOpen(false);
            setWizardSeed(null);
            onAssignmentResumeConsumed?.();
          }}
          onCreateProgram={onCreateAssignmentProgram}
          onSubmit={onSubmitAssignment}
        />
      )}
    </section>
  );
}
