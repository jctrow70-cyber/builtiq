'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionHeader from '../ui/SectionHeader';
import SegmentedControl from '../ui/SegmentedControl';
import CreateProgramFlow from './CreateProgramFlow';
import AIProgramSetupWizard from './AIProgramSetupWizard';
import ProgramCalendarEditor from './ProgramCalendarEditor';
import { canEditGroupProgram, canEditProgramRecord, isGroupOwner, roleLabel } from '../../../lib/groups';
import {
  canOptInToGroupProgram,
  describeEnrollmentRole,
  isAutoEnrolledMemberRole,
  isGroupEnrollmentMarker,
  isGroupSourcedProgram,
  isLiveGroupProgram,
  isPersonalizedGroupFollow,
  liveTemplateId,
  personalLibraryBuckets,
  programEditAudience,
  suggestedNextGroupStart,
} from '../../../lib/programDesign/enrollment';
import { cycleLengthOf, formatCycleLength, formatProgramRange, generationWeeksOf, nextMondayFrom, programDateRange } from '../../../lib/programDesign/cycle';
import {
  alreadyFollowing,
  customizeFollowedProgramForMe,
  followProgram,
  shareProgramWithGroup,
  syncMemberGroupEnrollment,
  unfollowProgram,
} from '../../../lib/programDesign/followProgram';
import { groupProgramsByLifecycle, lifecycleLabel, lifecycleStatusOf } from '../../../lib/programDesign/lifecycle';
import { fetchDesignPrograms, createDesignProgram, createProgramActivity } from '../../../lib/programDesign/programDesignApi';
import { fetchFullProgram } from '../../../lib/training/programFetch';
import { deleteProgramRecord } from '../../../lib/training/programStatus';
import type {
  GroupOption,
  ProgramDesignRecord,
  ProgramLifecycleStatus,
  ProgramScope,
  ProgramsLaunchIntent,
} from '../../../lib/programDesign/types';

type ProgramDesignHomeProps = {
  supabase: SupabaseClient;
  userId: string;
  teams: GroupOption[];
  selectedTeamId: string | null;
  followedProgramId?: string | null;
  onSelectTeam: (id: string) => void;
  onFollowed?: (programId: string | null, opts?: { openTraining?: boolean }) => void;
  launch?: ProgramsLaunchIntent | null;
  onLaunchConsumed?: () => void;
};

type View = 'home' | 'create' | 'ai-setup' | 'editor';

const LIST_SECTIONS: ProgramLifecycleStatus[] = ['active', 'scheduled', 'draft', 'completed', 'archived'];

function offerUseInTraining(
  program: ProgramDesignRecord,
  followedProgramId: string | null,
): boolean {
  if (followedProgramId === program.id) return false;
  const life = lifecycleStatusOf(program);
  return life !== 'draft' && life !== 'archived';
}

function ProgramRow({
  program,
  badge,
  extra,
  onOpen,
  onFollow,
  onUnfollow,
  onRemove,
  removing,
}: {
  program: ProgramDesignRecord;
  badge?: string;
  extra?: string;
  onOpen: () => void;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onRemove?: () => void;
  removing?: boolean;
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
            Use in Training
          </button>
        )}
        {onUnfollow && (
          <button type="button" className="btn small secondary" onClick={onUnfollow}>
            Unfollow
          </button>
        )}
        {onRemove && (
          <button type="button" className="btn small secondary" disabled={removing} onClick={onRemove}>
            {removing ? 'Removing…' : 'Remove'}
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
  launch = null,
  onLaunchConsumed,
}: ProgramDesignHomeProps) {
  const [scope, setScope] = useState<ProgramScope>(launch?.scope || 'personal');
  const [handoffHint, setHandoffHint] = useState<string | null>(launch?.hint || null);
  const [programs, setPrograms] = useState<ProgramDesignRecord[]>([]);
  const [sharedPrograms, setSharedPrograms] = useState<(ProgramDesignRecord & { groupName?: string; groupRole?: string | null })[]>([]);
  const [personalPrograms, setPersonalPrograms] = useState<ProgramDesignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('home');
  const [editing, setEditing] = useState<ProgramDesignRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [createDefaultStart, setCreateDefaultStart] = useState(nextMondayFrom());
  const [sequencingHint, setSequencingHint] = useState<string | null>(null);
  const [buildBanner, setBuildBanner] = useState<string | null>(null);
  const [liveGroupPrograms, setLiveGroupPrograms] = useState<ProgramDesignRecord[]>([]);
  const appliedLaunchKey = useRef('');
  const skipNextListLoading = useRef(false);

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
    const catalog: ProgramDesignRecord[] = [];
    for (const team of teams) {
      const { data } = await fetchDesignPrograms(supabase, {
        scope: 'group',
        ownerUserId: userId,
        teamId: team.id,
      });
      catalog.push(...data);

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
    setLiveGroupPrograms(catalog);
    return followedId;
  }

  function dropProgramFromLists(programId: string) {
    setPrograms((prev) => prev.filter((p) => p.id !== programId));
    setPersonalPrograms((prev) => prev.filter((p) => p.id !== programId));
    setSharedPrograms((prev) => prev.filter((p) => p.id !== programId));
    setLiveGroupPrograms((prev) => prev.filter((p) => p.id !== programId));
  }

  async function reload(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true || skipNextListLoading.current;
    skipNextListLoading.current = false;
    if (!silent) setLoading(true);
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
        setLiveGroupPrograms(data);
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
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [scope, groupId, userId, followedProgramId, teams.length]);

  const personalBuckets = useMemo(() => personalLibraryBuckets(programs), [programs]);
  const following =
    liveGroupPrograms.find((p) => p.id === followedProgramId) ||
    personalPrograms.find((p) => p.id === followedProgramId) ||
    programs.find((p) => p.id === followedProgramId) ||
    sharedPrograms.find((p) => p.id === followedProgramId) ||
    null;
  const followingGroupSourced = isGroupSourcedProgram(following);
  const followingJustMe = isPersonalizedGroupFollow(following);
  const groupFilterLabel = activeGroup?.name ? `For ${activeGroup.name}` : 'For a group';
  const followingGroupName = following?.team_id
    ? teams.find((t) => t.id === following.team_id)?.name
    : undefined;
  const followingExtra = !following
    ? undefined
    : followingJustMe
      ? 'Just me copy · group plan unchanged'
      : followingGroupSourced
        ? followingGroupName
          ? `Group plan · ${followingGroupName}`
          : 'Group plan'
        : 'For me';

  async function beginCreate(nextScope: ProgramScope = scope) {
    setError('');
    if (nextScope !== scope) setScope(nextScope);

    if (nextScope === 'group') {
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

  async function openProgramById(programId: string) {
    const loaded = await fetchFullProgram(supabase, programId);
    if (!loaded.error && loaded.data) {
      setEditing(loaded.data as ProgramDesignRecord);
      setView('editor');
      return;
    }
    const found =
      programs.find((p) => p.id === programId) ||
      liveGroupPrograms.find((p) => p.id === programId) ||
      personalPrograms.find((p) => p.id === programId) ||
      sharedPrograms.find((p) => p.id === programId) ||
      null;
    if (found) {
      setEditing(found);
      setView('editor');
      return;
    }
    setError(loaded.error || 'Could not open that program');
  }

  const launchKey = launch
    ? `${launch.scope}:${launch.action}:${launch.programId || ''}:${launch.hint || ''}`
    : '';
  useEffect(() => {
    if (!launch || loading) return;
    if (appliedLaunchKey.current === launchKey) return;
    appliedLaunchKey.current = launchKey;
    const next = launch;
    onLaunchConsumed?.();
    setScope(next.scope);
    if (next.hint) setHandoffHint(next.hint);
    if (next.action === 'create') void beginCreate(next.scope);
    else if (next.action === 'edit' && next.programId) void openProgramById(next.programId);
  }, [launchKey, loading]);

  async function handleCreate(input: { name: string; startDate: string; cycleWeeks: number; inclusivePlan: boolean }) {
    setCreating(true);
    setError('');
    const { data, error: createError } = await createDesignProgram(supabase, {
      ownerUserId: userId,
      name: input.name,
      startDate: input.startDate,
      cycleWeeks: input.cycleWeeks,
      scope,
      teamId: groupId,
      inclusivePlan: input.inclusivePlan,
    });
    setCreating(false);
    if (createError || !data) {
      setError(createError || 'Could not create program');
      return;
    }
    setPrograms((prev) => [data, ...prev]);
    if (scope === 'personal') {
      setPersonalPrograms((prev) => [data, ...prev]);
    }
    setEditing(data);
    setView('ai-setup');
  }

  async function handleFollow(source: ProgramDesignRecord, opts?: { editSource?: boolean; openTraining?: boolean }): Promise<{ error: string | null }> {
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
      const message = result.error || 'Could not follow this program';
      setError(message);
      return { error: message };
    }
    onFollowed?.(result.programId, { openTraining: opts?.openTraining });
    await reload();
    return { error: null };
  }

  async function handleEditAudience(next: 'group' | 'me') {
    if (!editing) return;
    const current = programEditAudience(editing);
    if (current === next) return;
    setFollowBusy(true);
    setError('');
    try {
      if (next === 'me') {
        if (!isLiveGroupProgram(editing)) return;
        const { program: copy, error: copyError } = await customizeFollowedProgramForMe(supabase, userId, editing);
        if (copyError || !copy) {
          setError(copyError || 'Could not make a private copy');
          return;
        }
        setEditing(copy);
        setPersonalPrograms((prev) => [copy, ...prev.filter((p) => p.id !== copy.id)]);
        setPrograms((prev) => [copy, ...prev.filter((p) => p.id !== copy.id)]);
        onFollowed?.(copy.id, { openTraining: false });
        setScope('personal');
        return;
      }
      if (!canEditGroup) {
        setError('Only owners and editors can change the group plan for everyone.');
        return;
      }
      const liveId = liveTemplateId(editing);
      if (!liveId) return;
      let live =
        liveGroupPrograms.find((p) => p.id === liveId) ||
        programs.find((p) => p.id === liveId) ||
        personalPrograms.find((p) => p.id === liveId) ||
        null;
      if (!live || !isLiveGroupProgram(live)) {
        const loaded = await fetchFullProgram(supabase, liveId);
        if (loaded.error || !loaded.data) {
          setError(loaded.error || 'Could not open the group plan');
          return;
        }
        live = loaded.data as ProgramDesignRecord;
      }
      const result = await followProgram(supabase, {
        userId,
        source: live,
        personalPrograms,
        followedProgramId,
        editSource: true,
      });
      if (result.error || !result.programId) {
        setError(result.error || 'Could not follow the group plan');
        return;
      }
      setEditing(live);
      setScope('group');
      if (live.team_id) onSelectTeam(live.team_id);
      onFollowed?.(result.programId, { openTraining: false });
    } finally {
      setFollowBusy(false);
    }
  }

  function canRemoveProgram(program: ProgramDesignRecord): boolean {
    if (followBusy) return false;
    if (program.visibility === 'team' || program.visibility === 'group') {
      const team = teams.find((t) => t.id === program.team_id) || activeGroup;
      return canEditGroupProgram(team?.my_role);
    }
    return !program.owner_user_id || program.owner_user_id === userId;
  }

  async function handleRemove(program: ProgramDesignRecord) {
    if (!canRemoveProgram(program)) return;
    const team = teams.find((t) => t.id === program.team_id);
    if (team?.default_program_id && team.default_program_id === program.id) {
      setError('This is the group active program. Assign a different group plan before removing it.');
      return;
    }
    const life = lifecycleStatusOf(program);
    const inTraining = followedProgramId === program.id;
    const label = program.name || 'Program';
    const msg =
      life === 'draft'
        ? `Remove draft “${label}”? This cannot be undone.`
        : inTraining
          ? `Remove “${label}”? Training will stop using this plan. Completed workout history is kept.`
          : `Remove “${label}”? Completed workout history is kept, but the program template will be removed.`;
    if (!window.confirm(msg)) return;
    setRemovingId(program.id);
    setError('');
    const { error: removeError } = await deleteProgramRecord(supabase, program.id);
    setRemovingId(null);
    if (removeError) {
      setError(removeError);
      return;
    }
    dropProgramFromLists(program.id);
    if (editing?.id === program.id) {
      setEditing(null);
      setView('home');
    }
    if (inTraining) {
      skipNextListLoading.current = true;
      onFollowed?.(null);
    }
  }

  async function handleUnfollow() {
    const ok = window.confirm(
      followingGroupSourced
        ? 'Unfollow this group program? Training will stop using it until you follow a plan again. (A new group plan may enroll you later if you are a member.)'
        : 'Unfollow this program? Training will stop using it until you follow another plan.'
    );
    if (!ok) return;
    setFollowBusy(true);
    const { error: unfollowError } = await unfollowProgram(supabase, userId, {
      source: following,
      personalPrograms,
    });
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
    alert('Shared with the group. Members are enrolled automatically when the plan is active; editors can use it in Training.');
  }

  function openRow(program: ProgramDesignRecord) {
    setEditing(program);
    setView('editor');
  }

  function renderProgramRows(
    rows: ProgramDesignRecord[],
    opts?: {
      extra?: (program: ProgramDesignRecord) => string | undefined;
      badge?: (program: ProgramDesignRecord) => string | undefined;
      offerFollow?: boolean;
    }
  ) {
    return rows
      .filter((program) => program.id !== following?.id)
      .map((program) => (
        <ProgramRow
          key={program.id}
          program={program}
          extra={opts?.extra?.(program)}
          badge={opts?.badge?.(program)}
          onOpen={() => openRow(program)}
          onFollow={
            opts?.offerFollow && offerUseInTraining(program, followedProgramId)
              ? () => void handleFollow(program)
              : undefined
          }
          onRemove={canRemoveProgram(program) ? () => void handleRemove(program) : undefined}
          removing={removingId === program.id}
        />
      ));
  }

  function renderLifecycleBlocks(
    source: ProgramDesignRecord[],
    opts?: {
      extra?: (program: ProgramDesignRecord) => string | undefined;
      offerFollow?: boolean;
      scheduledHint?: string | null;
    }
  ) {
    const buckets = groupProgramsByLifecycle(source);
    return LIST_SECTIONS.map((section) => {
      const rows = buckets[section].filter((p) => p.id !== following?.id);
      if (!rows.length) return null;
      return (
        <div key={section} className="pd-section">
          <h2>
            {section === 'active'
              ? 'Active programs'
              : section === 'draft'
              ? 'Draft programs'
              : section === 'scheduled'
                ? 'Scheduled programs'
                : section === 'completed'
                  ? 'Completed programs'
                  : 'Archived programs'}
          </h2>
          {section === 'scheduled' && opts?.scheduledHint ? <p className="muted">{opts.scheduledHint}</p> : null}
          {renderProgramRows(rows, { extra: opts?.extra, offerFollow: opts?.offerFollow })}
        </div>
      );
    });
  }

  if (view === 'create') {
    return (
      <section className="pd-screen">
        {handoffHint && <p className="pd-note">{handoffHint}</p>}
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
          programId={editing.id}
          weeks={generationWeeksOf(editing)}
          startDate={editing.start_date}
          isFollowing={!!alreadyFollowing(editing, personalPrograms, followedProgramId)}
          onComplete={async (weekPlan, result) => {
            setError('');
            for (const day of weekPlan) {
              let sortOrder = 0;
              for (const act of day.activities) {
                if (act.activity_type === 'rest') continue;
                await createProgramActivity(supabase, editing.id, 1, day.dayIndex, act, sortOrder);
                sortOrder++;
              }
            }
            if (result?.coachMessage) setBuildBanner(result.coachMessage);
            else if (result?.workoutCount) setBuildBanner(`Built ${result.workoutCount} workouts.`);
            else setBuildBanner('Your workouts are ready. Review and edit them below.');
            setView('editor');
          }}
          onFollow={async () => {
            const result = await handleFollow(editing, { openTraining: false });
            if (result.error) throw new Error(result.error);
          }}
          onCancel={() => {
            setView('editor');
          }}
        />
      </section>
    );
  }

  if (view === 'editor' && editing) {
    const followingThis = followedProgramId === editing.id;
    const editingRole = teams.find((t) => t.id === editing.team_id)?.my_role || groupRole;
    const showGroupAudience = programEditAudience(editing) === 'group';
    return (
      <section className="pd-screen">
        <ProgramCalendarEditor
          supabase={supabase}
          program={editing}
          programs={programs}
          ownerUserId={userId}
          canEdit={!followBusy && canEditProgramRecord(editing, editingRole)}
          canEditGroupTemplate={canEditGroup}
          isFollowing={followingThis}
          groups={teams}
          pushTeamId={
            canEditGroup && (scope === 'group' || editing.visibility === 'team')
              ? editing.team_id || groupId
              : null
          }
          audienceBusy={followBusy}
          onEditAudienceChange={showGroupAudience ? handleEditAudience : undefined}
          onBack={() => {
            setEditing(null);
            setBuildBanner(null);
            setView('home');
            void reload();
          }}
          onProgramChange={(next) => {
            setEditing(next);
            setPrograms((prev) => prev.map((p) => (p.id === next.id ? next : p)));
          }}
          onFollow={async () => {
            await handleFollow(editing, { openTraining: false });
          }}
          onShareWithGroup={handleShareWithGroup}
          onBuildWorkouts={() => setView('ai-setup')}
          justBuiltMessage={buildBanner}
        />
      </section>
    );
  }

  return (
    <section className="pd-screen">
      <SectionHeader
        title="Programs"
        subtitle={
          scope === 'group'
            ? activeGroup?.name
              ? `Plans for ${activeGroup.name}. Members see the live group plan.`
              : 'Join or create a group to make a shared plan.'
            : 'Plans you own. Training uses the one you follow.'
        }
        actions={
          canCreate ? (
            <button type="button" className="btn green" onClick={() => void beginCreate()}>
              {scope === 'group'
                ? activeGroup?.name
                  ? `Create a plan for ${activeGroup.name}`
                  : 'Create a group plan'
                : 'Create a plan for me'}
            </button>
          ) : undefined
        }
      />

      <SegmentedControl
        ariaLabel="Who this program list is for"
        value={scope}
        onChange={(v) => setScope(v as ProgramScope)}
        options={[
          { value: 'personal', label: 'For me' },
          { value: 'group', label: groupFilterLabel },
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
      {handoffHint && (
        <p className="pd-note">
          {handoffHint}{' '}
          <button type="button" className="pd-back" style={{ margin: 0 }} onClick={() => setHandoffHint(null)}>
            Dismiss
          </button>
        </p>
      )}
      {loading && <p className="muted">Loading programs…</p>}
      {followBusy && <p className="muted">Updating the program you follow…</p>}

      {!loading && (
        <>
          <div className="pd-section pd-training-using">
            <h2>Training is using</h2>
            {following ? (
              <ProgramRow
                program={following}
                badge="In Training"
                extra={followingExtra}
                onOpen={() => {
                  setEditing(following);
                  setView('editor');
                }}
                onUnfollow={() => void handleUnfollow()}
                onRemove={canRemoveProgram(following) ? () => void handleRemove(following) : undefined}
                removing={removingId === following.id}
              />
            ) : (
              <p className="muted pd-empty">
                Training has no plan yet.
                {memberAutoEnroll
                  ? ' As a member, you are enrolled automatically the first time a group plan is active. After you unfollow, Training stays clear until you follow again (or a new group plan enrolls you).'
                  : ' Create a plan for you, or use a group plan in Training (editors are not enrolled automatically).'}
              </p>
            )}
          </div>

          {scope === 'personal' && sharedPrograms.length > 0 && (
            <div className="pd-section">
              <h2>{sharedPrograms.some((p) => canOptInToGroupProgram(p.groupRole)) ? 'Available from your groups' : 'Shared with you'}</h2>
              <p className="muted">
                {sharedPrograms.some((p) => canOptInToGroupProgram(p.groupRole))
                  ? 'Editors and owners can use a group plan in Training. Members are enrolled automatically by plan dates.'
                  : 'Programs from your groups. Training uses the live group plan, so owner and editor updates show up for everyone.'}
              </p>
              {sharedPrograms.map((program) => {
                const optIn = canOptInToGroupProgram(program.groupRole);
                return (
                  <ProgramRow
                    key={program.id}
                    program={program}
                    extra={`${program.groupName || 'Group'}${program.groupRole ? ` · ${roleLabel(program.groupRole)}` : ''}`}
                    badge={optIn ? 'Available' : 'Shared'}
                    onOpen={() => openRow(program)}
                    onFollow={
                      offerUseInTraining(program, followedProgramId)
                        ? () => void handleFollow(program)
                        : undefined
                    }
                    onRemove={canRemoveProgram(program) ? () => void handleRemove(program) : undefined}
                    removing={removingId === program.id}
                  />
                );
              })}
            </div>
          )}

          {scope === 'personal' && personalBuckets.myPlans.filter((p) => p.id !== following?.id).length > 0 && (
            <div className="pd-section">
              <h2>My plans</h2>
              <p className="muted">Programs you created for yourself.</p>
              {renderLifecycleBlocks(personalBuckets.myPlans, { offerFollow: true })}
            </div>
          )}

          {scope === 'personal' && personalBuckets.justMeCopies.filter((p) => p.id !== following?.id).length > 0 && (
            <div className="pd-section">
              <h2>Just me copies</h2>
              <p className="muted">Private copies of a group plan. The group plan is unchanged.</p>
              {renderProgramRows(personalBuckets.justMeCopies, {
                extra: () => 'Just me · group plan unchanged',
                offerFollow: true,
              })}
            </div>
          )}

          {scope === 'personal' && personalBuckets.leftoverCopies.filter((p) => p.id !== following?.id).length > 0 && (
            <div className="pd-section">
              <h2>Older group copies</h2>
              <p className="muted">
                Leftover snapshots from before Just me. Training uses the live group plan unless you already made a Just me copy.
              </p>
              {renderProgramRows(personalBuckets.leftoverCopies, {
                extra: () => 'Personal snapshot — Training uses the live group plan',
                offerFollow: false,
              })}
            </div>
          )}

          {scope === 'group' &&
            renderLifecycleBlocks(programs.filter((p) => !isGroupEnrollmentMarker(p)), {
              offerFollow: editorOptIn,
              extra: (program) =>
                program.source_program_id ? 'Personal snapshot — Training uses the live group plan' : undefined,
              scheduledHint: isGroupOwner(groupRole)
                ? 'Stack plans by start and end dates. When one ends, the next scheduled plan picks up for members.'
                : null,
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
                  onOpen={() => openRow(program)}
                  onFollow={
                    editorOptIn && offerUseInTraining(program, followedProgramId)
                      ? () => void handleFollow(program)
                      : undefined
                  }
                  onRemove={canRemoveProgram(program) ? () => void handleRemove(program) : undefined}
                  removing={removingId === program.id}
                />
              ))}

          {!programs.length && scope === 'personal' && !sharedPrograms.length && (
            <p className="muted pd-empty">Create a program, or use one your group shared in Training.</p>
          )}
        </>
      )}
    </section>
  );
}
