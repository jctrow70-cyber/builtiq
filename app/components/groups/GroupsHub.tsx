'use client';

import { useEffect, useState } from 'react';
import { roleForUi, roleLabel } from '../../../lib/groups';
import GroupCreateJoinPanel from './GroupCreateJoinPanel';
import GroupMemberDashboard from './GroupMemberDashboard';
import GroupAssignWorkoutPanel from './GroupAssignWorkoutPanel';

export type GroupsHubProps = {
  sessionUserId: string;
  teams: any[];
  selectedTeamId: string | null;
  activeTeam: any | null;
  members: any[];
  memberStats: Record<string, { sets: number; days: number }>;
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
  groupProgramForAssign: any | null;
  compliancePct: number;
  teamActiveCount: number;
  teamTotalSets: number;
  teamPlanCount: number;
  canManage: boolean;
  isOwner: boolean;
  logDate: string;
  week: number;
  onSelectTeam: (teamId: string) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onJoinGroup: (code: string) => Promise<void>;
  onRefreshMembers: () => void;
  onOpenMember: (member: any) => void;
  onCloseMemberDashboard: () => void;
  onOpenMemberWorkout: (member: any) => void;
  onSetMyTrainingSource: (source: 'team' | 'personal') => void;
  onSetMemberTrainingSource: (member: any, source: string) => void;
  onSetMemberRole: (member: any, role: string) => void;
  onRemoveMember: (member: any) => void;
  onSetParticipation: (member: any, active: boolean) => void;
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onApplyAssignment: () => void;
  onAssignWorkout: (payload: {
    workoutId: string;
    targetType: 'group' | 'members';
    memberUserIds: string[];
    scheduledDate: string;
    dueDate: string;
    title: string;
    notes: string;
  }) => Promise<void>;
  onOpenTraining: () => void;
  onGoProgramSetup: () => void;
  onSetModeTeam: () => void;
  sectionExercises: (workout: any, section: string) => any[];
  statusLabel: (s: string) => string;
};

function GroupCard({
  team,
  memberCount,
  onSelect,
}: {
  team: any;
  memberCount?: number;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="group-card-btn" onClick={onSelect}>
      <div className="group-card-head">
        <b>{team.name}</b>
        <span className="badge">{roleLabel(team.my_role)}</span>
      </div>
      <p className="muted">
        {memberCount != null ? `${memberCount} member${memberCount === 1 ? '' : 's'}` : 'Tap to open'}
        {(team.training_source || 'team') === 'personal' ? ' · Personal plan' : ' · Group plan'}
      </p>
    </button>
  );
}

export default function GroupsHub(props: GroupsHubProps) {
  const {
    sessionUserId,
    teams,
    selectedTeamId,
    activeTeam,
    members,
    memberStats,
    memberDashboard,
    memberDashProgram,
    memberDashLogs,
    memberDashLastDate,
    memberTodayWorkout,
    memberWorkoutStatus,
    memberAssignment,
    assignDraft,
    programs,
    groupProgramForAssign,
    compliancePct,
    teamActiveCount,
    teamTotalSets,
    teamPlanCount,
    canManage,
    isOwner,
    logDate,
    week,
    onSelectTeam,
    onCreateGroup,
    onJoinGroup,
    onRefreshMembers,
    onOpenMember,
    onCloseMemberDashboard,
    onOpenMemberWorkout,
    onSetMyTrainingSource,
    onSetMemberTrainingSource,
    onSetMemberRole,
    onRemoveMember,
    onSetParticipation,
    onAssignDraftChange,
    onApplyAssignment,
    onAssignWorkout,
    onOpenTraining,
    onGoProgramSetup,
    onSetModeTeam,
    sectionExercises,
    statusLabel,
  } = props;

  const multiGroup = teams.length > 1;
  const [view, setView] = useState<'list' | 'detail'>(multiGroup ? 'list' : 'detail');

  useEffect(() => {
    if (teams.length <= 1) setView('detail');
  }, [teams.length]);

  if (teams.length === 0) {
    return (
      <section className="groups-hub">
        <div className="card">
          <h2>My Groups</h2>
          <p className="muted">
            Create a group for your team, family, or clients — or join one with an invite code. Group workouts and
            assignments show up in Training when your manager assigns them.
          </p>
        </div>
        <GroupCreateJoinPanel onCreate={onCreateGroup} onJoin={onJoinGroup} />
      </section>
    );
  }

  if (view === 'list' && multiGroup) {
    return (
      <section className="groups-hub">
        <div className="card">
          <div className="topline" style={{ justifyContent: 'space-between' }}>
            <h2>My Groups</h2>
            <span className="badge">{teams.length} groups</span>
          </div>
          <p className="muted">Select a group to manage or view your plan.</p>
        </div>
        <div className="groups-hub-list">
          {teams.map((t: any) => (
            <GroupCard
              key={t.id}
              team={t}
              memberCount={t.id === activeTeam?.id ? members.length : undefined}
              onSelect={() => {
                onSelectTeam(t.id);
                onSetModeTeam();
                setView('detail');
              }}
            />
          ))}
        </div>
        <GroupCreateJoinPanel onCreate={onCreateGroup} onJoin={onJoinGroup} compact />
      </section>
    );
  }

  const selfMember = members.find((m: any) => m.user_id === sessionUserId);
  const selfStats = selfMember ? memberStats[selfMember.user_id] || { sets: 0, days: 0 } : { sets: 0, days: 0 };

  return (
    <section className="groups-hub">
      {multiGroup && (
        <button type="button" className="btn small secondary groups-hub-back" onClick={() => setView('list')}>
          ← All groups
        </button>
      )}

      <div className="card">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>{activeTeam?.name || 'Group'}</h2>
          {canManage && <span className="badge">Manage</span>}
        </div>
        <div className="stat stat-mode" style={{ marginTop: 8 }}>
          <span className="muted">Group</span>
          <select
            className="mode-team-select"
            value={activeTeam?.id || ''}
            onChange={(e) => {
              onSelectTeam(e.target.value);
              onSetModeTeam();
            }}
            aria-label="Select group"
          >
            {teams.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {activeTeam && (
            <span className="muted mode-team-meta">{roleLabel(activeTeam.my_role)}</span>
          )}
        </div>
        {activeTeam && (
          <p className="muted" style={{ marginTop: 8 }}>
            Invite code: <b>{activeTeam.invite_code}</b>
            {canManage && ' · Share this code so others can join'}
          </p>
        )}
      </div>

      {activeTeam && (
        <div className="card team-plan-card">
          <div className="topline" style={{ justifyContent: 'space-between' }}>
            <h2>My training plan</h2>
            <span className="badge">
              {(activeTeam.training_source || 'team') === 'team' ? 'Group program' : 'Personal program'}
            </span>
          </div>
          <div className="tabs">
            <button
              type="button"
              className={(activeTeam.training_source || 'team') !== 'personal' ? 'active' : ''}
              onClick={() => onSetMyTrainingSource('team')}
            >
              Group workout
            </button>
            <button
              type="button"
              className={activeTeam.training_source === 'personal' ? 'active' : ''}
              onClick={() => onSetMyTrainingSource('personal')}
            >
              Personal plan
            </button>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={onOpenTraining}>
              Open Training
            </button>
            {canManage && (
              <button type="button" className="btn secondary" onClick={onGoProgramSetup}>
                Group program setup
              </button>
            )}
          </div>
        </div>
      )}

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
            Log workouts in Training. Your manager can see group compliance from their dashboard.
          </p>
        </div>
      )}

      {canManage && (
        <div className="card team-compliance-card">
          <div className="topline" style={{ justifyContent: 'space-between' }}>
            <h2>Compliance (this week)</h2>
            <span className="badge">{compliancePct}%</span>
          </div>
          <div className="dash-metrics">
            <div>
              <b>
                {teamActiveCount}/{members.length || 0}
              </b>
              <span className="muted">Members active</span>
            </div>
            <div>
              <b>{teamTotalSets}</b>
              <span className="muted">Total sets</span>
            </div>
            <div>
              <b>{teamPlanCount}</b>
              <span className="muted">On group plan</span>
            </div>
            <div>
              <b>{members.length - teamPlanCount}</b>
              <span className="muted">Personal plan</span>
            </div>
          </div>
        </div>
      )}

      {canManage &&
        memberDashboard &&
        memberDashboard.user_id !== sessionUserId && (
          <GroupMemberDashboard
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
            onAssignDraftChange={onAssignDraftChange}
            onBack={onCloseMemberDashboard}
            onOpenWorkout={() => onOpenMemberWorkout(memberDashboard)}
            onApplyAssignment={onApplyAssignment}
            sectionExercises={sectionExercises}
            statusLabel={statusLabel}
          />
        )}

      <div className="card team-roster-card">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Members</h2>
          <button type="button" className="btn small secondary" onClick={onRefreshMembers}>
            Refresh
          </button>
        </div>
        <p className="muted">
          {canManage
            ? 'Click a member for their training dashboard.'
            : 'Tap your name to open Training.'}
        </p>
        {members.length === 0 && <p className="muted">No members yet. Share your invite code.</p>}
        {members.map((m: any) => {
          const stats = memberStats[m.user_id] || { sets: 0, days: 0 };
          const isSelf = m.user_id === sessionUserId;
          const participating = m.is_active_participant !== false;
          return (
            <div key={m.id} className="team-member-row">
              <button type="button" className="team-member-main" onClick={() => onOpenMember(m)}>
                <div>
                  <b>
                    {m.display_name || 'Member'}
                    {isSelf ? ' (you)' : ''}
                  </b>
                  <span className="muted">
                    {roleLabel(m.role)} · {(m.training_source || 'team') === 'team' ? 'Group' : 'Personal'} ·{' '}
                    {stats.sets} sets
                    {!participating ? ' · observer' : ''}
                  </span>
                </div>
                <span className="muted">{stats.days}d</span>
              </button>
              <div className="team-member-actions">
                {canManage && !isSelf && (
                  <select
                    className="team-member-plan"
                    value={m.training_source || 'team'}
                    onChange={(e) => onSetMemberTrainingSource(m, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Plan for ${m.display_name || 'member'}`}
                  >
                    <option value="team">Group</option>
                    <option value="personal">Personal</option>
                  </select>
                )}
                {isOwner && !isSelf && (
                  <select
                    className="team-member-plan"
                    value={roleForUi(m.role)}
                    onChange={(e) => onSetMemberRole(m, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Role for ${m.display_name || 'member'}`}
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                  </select>
                )}
                {canManage && !isSelf && (
                  <>
                    <label className="team-member-participation remember-row">
                      <input
                        type="checkbox"
                        checked={participating}
                        onChange={(e) => onSetParticipation(m, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      className="btn small red"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMember(m);
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canManage && (
        <GroupAssignWorkoutPanel
          groupProgram={groupProgramForAssign}
          members={members}
          onAssign={onAssignWorkout}
        />
      )}

      {canManage && <GroupCreateJoinPanel onCreate={onCreateGroup} onJoin={onJoinGroup} compact />}
    </section>
  );
}
