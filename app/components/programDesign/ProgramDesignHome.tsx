'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionHeader from '../ui/SectionHeader';
import SegmentedControl from '../ui/SegmentedControl';
import CreateProgramFlow from './CreateProgramFlow';
import AIProgramSetupWizard from './AIProgramSetupWizard';
import ProgramCalendarEditor from './ProgramCalendarEditor';
import { canEditGroupProgram, isGroupOwner, roleLabel } from '../../../lib/groups';
import {
  canOptInToGroupProgram,
  describeEnrollmentRole,
  isAutoEnrolledMemberRole,
  isGroupSourcedProgram,
  shouldPromptUnfollowForPersonalCreate,
  suggestedNextGroupStart,
} from '../../../lib/programDesign/enrollment';
import { cycleLengthOf, formatCycleLength, formatProgramRange, nextMondayFrom, programDateRange } from '../../../lib/programDesign/cycle';
import {
  alreadyFollowing,
  followProgram,
  shareProgramWithGroup,
  syncMemberGroupEnrollment,
  unfollowProgram,
} from '../../../lib/programDesign/followProgram';
import { groupProgramsByLifecycle, lifecycleLabel, lifecycleStatusOf } from '../../../lib/programDesign/lifecycle';
import { createDesignProgram, createProgramActivity, fetchDesignPrograms } from '../../../lib/programDesign/programDesignApi';
import type {
  GroupOption,
  ProgramDesignRecord,
  ProgramLifecycleStatus,
  ProgramScope,
} from '../../../lib/programDesign/types';

type ProgramDesignHomeProps = {
  supabase: SupabaseClient;
  userId: string;
  teams: GroupOption[];
  selectedTeamId: string | null;
  followedProgramId?: string | null;
  onSelectTeam: (id: string) => void;
  onFollowed?: (programId: string | null) => void;
};

type View = 'home' | 'create' | 'ai-setup' | 'editor';

const LIST_SECTIONS: ProgramLifecycleStatus[] = ['scheduled', 'draft', 'completed', 'archived'];

function ProgramRow({
  program,
  badge,
  extra,
  followLabel,
  onOpen,
  onFollow,
  onUnfollow,
}: {
  program: ProgramDesignRecord;
  badge?: string;
  extra?: string;
  followLabel?: string;
  onOpen: () => void;
  onFollow?: () => void;
  onUnfollow?: () => void;
}) {
  const { start, end } = programDateRange(program);
  return (
    <div className="pd-program-row">
      <button type="button" className="pd-program-row-main" onClick={onOpen}>
        <b>{program.name}</b>
        <p className="muted">
          {formatProgramRange(start, end)} · {formatCycleLength(cycleLengthOf(program))}
          {extra ? ` · ${extra}` : ''}
        </p>
      </button>
      <div className="pd-program-row-actions">
        <span className="ui-badge">{badge || lifecycleLabel(lifecycleStatusOf(program))}</span>
        {onFollow && (
          <button type="button" className="btn small green" onClick={onFollow}>
            {followLabel || 'Follow'}
          </button>
        )}
        {onUnfollow && (
          <button type="button" className="btn small secondary" onClick={onUnfollow}>
            Unfollow
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProgramDesignHome({
  supabase,
  userId,
  teams,
  selectedTeamId,
  followedProgramId = null,
  onSelectTeam,
  onFollowed,
}: ProgramDesignHomeProps) {
  const [scope, setScope] = useState<ProgramScope>('personal');
  const [programs, setPrograms] = useState<ProgramDesignRecord[]>([]);
  const [sharedPrograms, setSharedPrograms] = useState<(ProgramDesignRecord & { groupName?: string; groupRole?: string | null })[]>([]);
  const [personalPrograms, setPersonalPrograms] = useState<ProgramDesignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('home');
  const [editing, setEditing] = useState<ProgramDesignRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [createDefaultStart, setCreateDefaultStart] = useState(nextMondayFrom());
  const [sequencingHint, setSequencingHint] = useState<string | null>(null);

  const groupId = selectedTeamId || teams[0]?.id || null;
  const activeGroup = teams.find((t) => t.id === groupId) || null;
  const canEditGroup = canEditGroupProgram(activeGroup?.my_role);
  const canCreate = scope === 'personal' || canEditGroup;
  const groupRole = activeGroup?.my_role || null;
  const memberAutoEnroll = isAutoEnrolledMemberRole(groupRole);
  const editorOptIn = canOptInToGroupProgram(groupRole);

  async function loadPersonal() {
    const { data, error: loadError } = await fetchDesignPrograms(supabase, {
      scope: 'personal',
      ownerUserId: userId,
    });
    if (loadError) throw new Error(loadError);
    setPersonalPrograms(data);
    return data;
  }

  async function loadShared(mine: ProgramDesignRecord[], followedId: string | null) {
    const rows: (ProgramDesignRecord & { groupName?: string; groupRole?: string | null })[] = [];
    for (const team of teams) {
      const { data } = await fetchDesignPrograms(supabase, {
        scope: 'group',
        ownerUserId: userId,
        teamId: team.id,
      });

      if (isAutoEnrolledMemberRole(team.my_role)) {
        const sync = await syncMemberGroupEnrollment(supabase, {
          userId,
          role: team.my_role,
          groupPrograms: data,
          personalPrograms: mine,
          followedProgramId: followedId,
        });
        if (sync.error) setError(sync.error);
        if (sync.changed && sync.programId) {
          followedId = sync.programId;
          onFollowed?.(sync.programId);
        }
      }

      for (const program of data) {
        const visible =
          canEditGroupProgram(team.my_role) ||
          program.status === 'published' ||
          program.status === 'active' ||
          program.status === 'scheduled';
        if (!visible) continue;
        const enrolled = !!alreadyFollowing(program, mine, followedId);
        if (isAutoEnrolledMemberRole(team.my_role) && enrolled) continue;
        rows.push({ ...program, groupName: team.name, groupRole: team.my_role });
      }
    }
    const followable = rows.filter((p) => !alreadyFollowing(p, mine, followedId));
    setSharedPrograms(followable);
    return followedId;
  }

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const mine = await loadPersonal();
      let followedId = followedProgramId;
      if (scope === 'personal') {
        setPrograms(mine);
        followedId = (await loadShared(mine, followedId)) || followedId;
        if (followedId !== followedProgramId) {
          const refreshed = await loadPersonal();
          setPrograms(refreshed);
        }
      } else if (!groupId) {
        setPrograms([]);
      } else {
        const { data, error: loadError } = await fetchDesignPrograms(supabase, {
          scope: 'group',
          ownerUserId: userId,
          teamId: groupId,
        });
        if (loadError) throw new Error(loadError);
        setPrograms(data);
        if (isAutoEnrolledMemberRole(activeGroup?.my_role)) {
          const sync = await syncMemberGroupEnrollment(supabase, {
            userId,
            role: activeGroup?.my_role,
            groupPrograms: data,
            personalPrograms: mine,
            followedProgramId: followedId,
          });
          if (sync.error) setError(sync.error);
          if (sync.changed && sync.programId) onFollowed?.(sync.programId);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load programs');
    }
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [scope, groupId, userId, followedProgramId, teams.length]);

  const grouped = useMemo(() => groupProgramsByLifecycle(programs), [programs]);
  const following =
    personalPrograms.find((p) => p.id === followedProgramId) ||
    programs.find((p) => p.id === followedProgramId) ||
    null;
  const followingGroupSourced = isGroupSourcedProgram(following);

  async function beginCreate() {
    setError('');
    if (scope === 'personal' && shouldPromptUnfollowForPersonalCreate(following)) {
      const groupName =
        teams.find((t) => t.id === (following as any)?.team_id)?.name ||
        sharedPrograms.find((p) => p.id === following?.source_program_id)?.groupName ||
        'your group';
      const ok = window.confirm(
        `You're following a group program (${following?.name || 'group plan'} from ${groupName}).\n\nUnfollow the group program first to create a personal program?`
      );
      if (!ok) return;
      setFollowBusy(true);
      const { error: unfollowError } = await unfollowProgram(supabase, userId);
      setFollowBusy(false);
      if (unfollowError) {
        setError(unfollowError);
        return;
      }
      onFollowed?.(null);
    }

    if (scope === 'group') {
      const start = suggestedNextGroupStart(programs);
      setCreateDefaultStart(start);
      setSequencingHint(
        isGroupOwner(groupRole)
          ? `Owners can stack plans by date. Suggested start ${start} — after your latest group plan ends, the next one picks up for members.`
          : null
      );
    } else {
      setCreateDefaultStart(nextMondayFrom());
      setSequencingHint(null);
    }
    setView('create');
  }

  async function handleCreate(input: { name: string; startDate: string; cycleWeeks: number }) {
    setCreating(true);
    setError('');
    const { data, error: createError } = await createDesignProgram(supabase, {
      ownerUserId: userId,
      name: input.name,
      startDate: input.startDate,
      cycleWeeks: input.cycleWeeks,
      scope,
      teamId: groupId,
    });
    setCreating(false);
    if (createError || !data) {
      setError(createError || 'Could not create program');
      return;
    }
    setPrograms((prev) => [data, ...prev]);
    if (scope === 'personal') {
      // Follow the new personal plan immediately so Training won't re-enroll a
      // group member into the group schedule after they unfollowed to create this.
      const nextPersonal = [data, ...personalPrograms];
      setPersonalPrograms(nextPersonal);
      const followResult = await followProgram(supabase, {
        userId,
        source: data,
        personalPrograms: nextPersonal,
        followedProgramId: null,
      });
      if (followResult.error || !followResult.programId) {
        setError(followResult.error || 'Program created, but could not set it as the plan you follow');
      } else {
        onFollowed?.(followResult.programId);
      }
    }
    setEditing(data);
    setView('ai-setup');
  }

  async function handleFollow(source: ProgramDesignRecord, opts?: { editSource?: boolean }) {
    setFollowBusy(true);
    setError('');
    const result = await followProgram(supabase, {
      userId,
      source,
      personalPrograms,
      followedProgramId,
      editSource: opts?.editSource,
    });
    setFollowBusy(false);
    if (result.error || !result.programId) {
      setError(result.error || 'Could not follow this program');
      return;
    }
    onFollowed?.(result.programId);
    await reload();
  }

  async function handleUnfollow() {
    const ok = window.confirm(
      followingGroupSourced
        ? 'Unfollow this group program? Training will stop using it until you follow a plan again. (A new group plan may enroll you later if you are a member.)'
        : 'Unfollow this program? Training will stop using it until you follow another plan.'
    );
    if (!ok) return;
    setFollowBusy(true);
    const { error: unfollowError } = await unfollowProgram(supabase, userId);
    setFollowBusy(false);
    if (unfollowError) {
      setError(unfollowError);
      return;
    }
    onFollowed?.(null);
    await reload();
  }

  async function handleShareWithGroup(teamId: string) {
    if (!editing) return;
    setFollowBusy(true);
    const { error: shareError } = await shareProgramWithGroup(supabase, editing.id, teamId, editing.name);
    setFollowBusy(false);
    if (shareError) {
      setError(shareError);
      return;
    }
    alert('Shared with the group. Members are enrolled automatically when the plan is active; editors can pull it in.');
  }

  if (view === 'create') {
    return (
      <section className="pd-screen">
        <CreateProgramFlow
          scope={scope}
          groupName={activeGroup?.name}
          defaultStart={createDefaultStart}
          sequencingHint={sequencingHint}
          saving={creating}
          error={error}
          onCancel={() => {
            setError('');
            setView('home');
          }}
          onCreate={handleCreate}
        />
      </section>
    );
  }

  if (view === 'ai-setup' && editing) {
    return (
      <section className="pd-screen">
        <AIProgramSetupWizard
          supabase={supabase}
          programName={editing.name}
          onComplete={async (weekPlan) => {
            setError('');
            for (const day of weekPlan) {
              let sortOrder = 0;
              for (const act of day.activities) {
                if (act.activity_type === 'rest') continue;
                await createProgramActivity(supabase, editing.id, 1, day.dayIndex, act, sortOrder);
                sortOrder++;
              }
            }
            setView('editor');
          }}
          onCancel={() => {
            setView('editor');
          }}
        />
      </section>
    );
  }

  if (view === 'editor' && editing) {
    const followingThis = !!alreadyFollowing(editing, personalPrograms, followedProgramId);
    const editorPull = canEditGroup && editing.visibility === 'team';
    return (
      <section className="pd-screen">
        <ProgramCalendarEditor
          supabase={supabase}
          program={editing}
          programs={programs}
          ownerUserId={userId}
          canEdit={scope === 'personal' || canEditGroup}
          isFollowing={followingThis}
          groups={teams}
          pushTeamId={
            canEditGroup && (scope === 'group' || editing.visibility === 'team')
              ? editing.team_id || groupId
              : null
          }
          onBack={() => {
            setEditing(null);
            setView('home');
            void reload();
          }}
          onProgramChange={(next) => {
            setEditing(next);
            setPrograms((prev) => prev.map((p) => (p.id === next.id ? next : p)));
          }}
          onFollow={() => handleFollow(editing, { editSource: editorPull })}
          onShareWithGroup={handleShareWithGroup}
        />
      </section>
    );
  }

  return (
    <section className="pd-screen">
      <SectionHeader
        title="Program Design"
        subtitle={
          scope === 'group'
            ? 'Design dated plans for your group. Members enroll automatically; editors pull in to edit.'
            : 'Follow one program in Training — personal or group, not both.'
        }
        actions={
          canCreate ? (
            <button type="button" className="btn green" onClick={() => void beginCreate()}>
              {scope === 'group' ? '+ Create Group Program' : '+ Create Program'}
            </button>
          ) : undefined
        }
      />

      <SegmentedControl
        ariaLabel="Program library"
        value={scope}
        onChange={(v) => setScope(v as ProgramScope)}
        options={[
          { value: 'personal', label: 'Personal' },
          { value: 'group', label: 'Groups' },
        ]}
      />

      {scope === 'group' && (
        <div className="pd-group-picker">
          {teams.length === 0 ? (
            <p className="muted">Join or create a group in Groups to see shared programs.</p>
          ) : (
            <>
              <label htmlFor="pd-group-select">Group</label>
              <select id="pd-group-select" value={groupId || ''} onChange={(e) => onSelectTeam(e.target.value)}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {roleLabel(team.my_role)}
                  </option>
                ))}
              </select>
              <p className="muted" style={{ marginTop: 8 }}>
                {describeEnrollmentRole(groupRole)}
              </p>
            </>
          )}
        </div>
      )}

      {error && <p className="pd-error">{error}</p>}
      {loading && <p className="muted">Loading programs…</p>}
      {followBusy && <p className="muted">Updating the program you follow…</p>}

      {!loading && (
        <>
          <div className="pd-section">
            <h2>Following</h2>
            {following ? (
              <ProgramRow
                program={following}
                badge={followingGroupSourced ? (memberAutoEnroll ? 'Enrolled' : 'Following') : 'Following'}
                extra={
                  followingGroupSourced
                    ? memberAutoEnroll
                      ? 'Group plan · calendar updates with plan dates'
                      : 'Group plan'
                    : 'Personal'
                }
                onOpen={() => {
                  setEditing(following);
                  setView('editor');
                }}
                onUnfollow={() => void handleUnfollow()}
              />
            ) : (
              <p className="muted pd-empty">
                You are not following a program yet.
                {memberAutoEnroll
                  ? ' As a member, you are enrolled automatically the first time a group plan is active. After you unfollow, Training stays clear until you follow again (or a new group plan enrolls you).'
                  : ' Follow a personal plan or pull in a group plan (editors are not enrolled automatically).'}
              </p>
            )}
          </div>

          {scope === 'personal' && sharedPrograms.length > 0 && (
            <div className="pd-section">
              <h2>{sharedPrograms.some((p) => canOptInToGroupProgram(p.groupRole)) ? 'Available from your groups' : 'Shared with you'}</h2>
              <p className="muted">
                {sharedPrograms.some((p) => canOptInToGroupProgram(p.groupRole))
                  ? 'Editors and owners can pull a group plan into Training. Members are enrolled automatically by plan dates.'
                  : 'Programs from your groups. Follow one to use it in Training — your copy stays yours.'}
              </p>
              {sharedPrograms.map((program) => {
                const optIn = canOptInToGroupProgram(program.groupRole);
                return (
                  <ProgramRow
                    key={program.id}
                    program={program}
                    extra={`${program.groupName || 'Group'}${program.groupRole ? ` · ${roleLabel(program.groupRole)}` : ''}`}
                    badge={optIn ? 'Available' : 'Shared'}
                    followLabel={optIn && canEditGroupProgram(program.groupRole) ? 'Pull in & edit' : 'Follow'}
                    onOpen={() => {
                      setEditing(program);
                      setView('editor');
                    }}
                    onFollow={() =>
                      void handleFollow(program, {
                        editSource: optIn && canEditGroupProgram(program.groupRole),
                      })
                    }
                  />
                );
              })}
            </div>
          )}

          {LIST_SECTIONS.map((section) => {
            const rows = grouped[section].filter((p) => p.id !== following?.id);
            if (!rows.length) return null;
            return (
              <div key={section} className="pd-section">
                <h2>
                  {section === 'draft'
                    ? 'Draft programs'
                    : section === 'scheduled'
                      ? 'Scheduled programs'
                      : section === 'completed'
                        ? 'Completed programs'
                        : 'Archived programs'}
                </h2>
                {section === 'scheduled' && scope === 'group' && isGroupOwner(groupRole) && (
                  <p className="muted">
                    Stack plans by start and end dates. When one ends, the next scheduled plan picks up for members.
                  </p>
                )}
                {rows.map((program) => (
                  <ProgramRow
                    key={program.id}
                    program={program}
                    onOpen={() => {
                      setEditing(program);
                      setView('editor');
                    }}
                    onFollow={
                      program.id !== followedProgramId && (scope === 'personal' || editorOptIn)
                        ? () =>
                            void handleFollow(program, {
                              editSource: scope === 'group' && canEditGroup,
                            })
                        : undefined
                    }
                    followLabel={scope === 'group' && canEditGroup ? 'Pull in & edit' : 'Follow'}
                  />
                ))}
              </div>
            );
          })}

          {scope === 'group' &&
            programs
              .filter((p) => lifecycleStatusOf(p) === 'active' || p.status === 'published')
              .filter((p) => p.id !== following?.id && p.id !== following?.source_program_id)
              .map((program) => (
                <ProgramRow
                  key={`group-${program.id}`}
                  program={program}
                  extra={activeGroup?.name}
                  badge={memberAutoEnroll ? 'Active for members' : 'Available'}
                  onOpen={() => {
                    setEditing(program);
                    setView('editor');
                  }}
                  onFollow={
                    editorOptIn
                      ? () => void handleFollow(program, { editSource: canEditGroup })
                      : undefined
                  }
                  followLabel={canEditGroup ? 'Pull in & edit' : 'Follow'}
                />
              ))}

          {!programs.length && scope === 'personal' && !sharedPrograms.length && (
            <p className="muted pd-empty">Create a program, or follow one your group shared.</p>
          )}
        </>
      )}
    </section>
  );
}
