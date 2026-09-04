'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionHeader from '../ui/SectionHeader';
import SegmentedControl from '../ui/SegmentedControl';
import CreateProgramFlow from './CreateProgramFlow';
import AIProgramSetupWizard from './AIProgramSetupWizard';
import ProgramCalendarEditor from './ProgramCalendarEditor';
import { canEditGroupProgram } from '../../../lib/groups';
import { cycleLengthOf, formatCycleLength, formatProgramRange, nextMondayFrom, programDateRange } from '../../../lib/programDesign/cycle';
import { alreadyFollowing, followProgram, shareProgramWithGroup } from '../../../lib/programDesign/followProgram';
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
  onFollowed?: (programId: string) => void;
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
}: {
  program: ProgramDesignRecord;
  badge?: string;
  extra?: string;
  followLabel?: string;
  onOpen: () => void;
  onFollow?: () => void;
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
  const [sharedPrograms, setSharedPrograms] = useState<(ProgramDesignRecord & { groupName?: string })[]>([]);
  const [personalPrograms, setPersonalPrograms] = useState<ProgramDesignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('home');
  const [editing, setEditing] = useState<ProgramDesignRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const groupId = selectedTeamId || teams[0]?.id || null;
  const activeGroup = teams.find((t) => t.id === groupId) || null;
  const canEditGroup = canEditGroupProgram(activeGroup?.my_role);
  const canCreate = scope === 'personal' || canEditGroup;

  async function loadPersonal() {
    const { data, error: loadError } = await fetchDesignPrograms(supabase, {
      scope: 'personal',
      ownerUserId: userId,
    });
    if (loadError) throw new Error(loadError);
    setPersonalPrograms(data);
    return data;
  }

  async function loadShared(mine: ProgramDesignRecord[]) {
    const rows: (ProgramDesignRecord & { groupName?: string })[] = [];
    for (const team of teams) {
      const { data } = await fetchDesignPrograms(supabase, {
        scope: 'group',
        ownerUserId: userId,
        teamId: team.id,
      });
      for (const program of data) {
        const visible =
          canEditGroupProgram(team.my_role) ||
          program.status === 'published' ||
          program.status === 'active' ||
          program.status === 'scheduled';
        if (!visible) continue;
        rows.push({ ...program, groupName: team.name });
      }
    }
    const followable = rows.filter((p) => !alreadyFollowing(p, mine, followedProgramId));
    setSharedPrograms(followable);
  }

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const mine = await loadPersonal();
      if (scope === 'personal') {
        setPrograms(mine);
        await loadShared(mine);
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
    grouped.active[0] ||
    null;

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
    setEditing(data);
    setView('ai-setup');
  }

  async function handleFollow(source: ProgramDesignRecord) {
    setFollowBusy(true);
    setError('');
    const result = await followProgram(supabase, {
      userId,
      source,
      personalPrograms,
      followedProgramId,
    });
    setFollowBusy(false);
    if (result.error || !result.programId) {
      setError(result.error || 'Could not follow this program');
      return;
    }
    onFollowed?.(result.programId);
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
    alert('Shared with the group. Members can follow it from Programs.');
  }

  if (view === 'create') {
    return (
      <section className="pd-screen">
        <CreateProgramFlow
          scope={scope}
          groupName={activeGroup?.name}
          defaultStart={nextMondayFrom()}
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
          onFollow={() => handleFollow(editing)}
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
            ? 'Design the week for your group, then push it to the members you choose.'
            : 'Plan the week, then follow a program in Training.'
        }
        actions={
          canCreate ? (
            <button type="button" className="btn green" onClick={() => setView('create')}>
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
                    {team.name}
                  </option>
                ))}
              </select>
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
                badge="Following"
                onOpen={() => {
                  setEditing(following);
                  setView('editor');
                }}
              />
            ) : (
              <p className="muted pd-empty">
                You are not following a program yet. Follow a personal plan or a program shared by your group.
                Training will keep using your current published plan until you choose one.
              </p>
            )}
          </div>

          {scope === 'personal' && sharedPrograms.length > 0 && (
            <div className="pd-section">
              <h2>Shared with you</h2>
              <p className="muted">Programs from your groups. Follow one to use it in Training — your copy stays yours.</p>
              {sharedPrograms.map((program) => (
                <ProgramRow
                  key={program.id}
                  program={program}
                  extra={program.groupName}
                  badge="Shared"
                  followLabel="Follow"
                  onOpen={() => {
                    setEditing(program);
                    setView('editor');
                  }}
                  onFollow={() => void handleFollow(program)}
                />
              ))}
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
                {rows.map((program) => (
                  <ProgramRow
                    key={program.id}
                    program={program}
                    onOpen={() => {
                      setEditing(program);
                      setView('editor');
                    }}
                    onFollow={program.id !== followedProgramId ? () => void handleFollow(program) : undefined}
                    followLabel="Follow"
                  />
                ))}
              </div>
            );
          })}

          {scope === 'group' &&
            programs
              .filter((p) => lifecycleStatusOf(p) === 'active' || p.status === 'published')
              .filter((p) => p.id !== following?.id)
              .map((program) => (
                <ProgramRow
                  key={`group-${program.id}`}
                  program={program}
                  extra={activeGroup?.name}
                  onOpen={() => {
                    setEditing(program);
                    setView('editor');
                  }}
                  onFollow={() => void handleFollow(program)}
                  followLabel="Follow"
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
