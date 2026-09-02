'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionHeader from '../ui/SectionHeader';
import SegmentedControl from '../ui/SegmentedControl';
import CreateProgramFlow from './CreateProgramFlow';
import ProgramCalendarEditor from './ProgramCalendarEditor';
import { canEditGroupProgram } from '../../../lib/groups';
import { cycleLengthOf, formatCycleLength, formatProgramRange, nextMondayFrom, programDateRange } from '../../../lib/programDesign/cycle';
import { groupProgramsByLifecycle, lifecycleLabel, lifecycleStatusOf } from '../../../lib/programDesign/lifecycle';
import { createDesignProgram, fetchDesignPrograms } from '../../../lib/programDesign/programDesignApi';
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
  onSelectTeam: (id: string) => void;
};

type View = 'home' | 'create' | 'editor';

const LIST_SECTIONS: ProgramLifecycleStatus[] = ['scheduled', 'draft', 'completed', 'archived'];

function ProgramRow({
  program,
  badge,
  onOpen,
}: {
  program: ProgramDesignRecord;
  badge?: string;
  onOpen: () => void;
}) {
  const { start, end } = programDateRange(program);
  return (
    <button type="button" className="pd-program-row" onClick={onOpen}>
      <div>
        <b>{program.name}</b>
        <p className="muted">
          {formatProgramRange(start, end)} · {formatCycleLength(cycleLengthOf(program))}
        </p>
      </div>
      <span className="ui-badge">{badge || lifecycleLabel(lifecycleStatusOf(program))}</span>
    </button>
  );
}

export default function ProgramDesignHome({
  supabase,
  userId,
  teams,
  selectedTeamId,
  onSelectTeam,
}: ProgramDesignHomeProps) {
  const [scope, setScope] = useState<ProgramScope>('personal');
  const [programs, setPrograms] = useState<ProgramDesignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('home');
  const [editing, setEditing] = useState<ProgramDesignRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const groupId = selectedTeamId || teams[0]?.id || null;
  const activeGroup = teams.find((t) => t.id === groupId) || null;
  const canEditGroup = canEditGroupProgram(activeGroup?.my_role);
  const canCreate = scope === 'personal' || canEditGroup;

  async function reload() {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await fetchDesignPrograms(supabase, {
      scope,
      ownerUserId: userId,
      teamId: groupId,
    });
    if (loadError) setError(loadError);
    setPrograms(data);
    setLoading(false);
  }

  useEffect(() => {
    if (scope === 'group' && !groupId) {
      setPrograms([]);
      setLoading(false);
      return;
    }
    void reload();
  }, [scope, groupId, userId]);

  const grouped = useMemo(() => groupProgramsByLifecycle(programs), [programs]);
  const activeProgram = grouped.active[0] || null;

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
    setView('editor');
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

  if (view === 'editor' && editing) {
    return (
      <section className="pd-screen">
        <ProgramCalendarEditor
          supabase={supabase}
          program={editing}
          programs={programs}
          ownerUserId={userId}
          canEdit={scope === 'personal' || canEditGroup}
          onBack={() => {
            setEditing(null);
            setView('home');
            void reload();
          }}
          onProgramChange={(next) => {
            setEditing(next);
            setPrograms((prev) => prev.map((p) => (p.id === next.id ? next : p)));
          }}
        />
      </section>
    );
  }

  return (
    <section className="pd-screen">
      <SectionHeader
        title="Program Design"
        subtitle="Plan the week. Training is where you do the work."
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
            <p className="muted">Join or create a group in Groups to design shared programs.</p>
          ) : (
            <>
              <label htmlFor="pd-group-select">Group</label>
              <select
                id="pd-group-select"
                value={groupId || ''}
                onChange={(e) => onSelectTeam(e.target.value)}
              >
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

      {!loading && scope === 'group' && teams.length === 0 ? null : !loading && (
        <>
          <div className="pd-section">
            <h2>Active program</h2>
            {activeProgram ? (
              <ProgramRow
                program={activeProgram}
                badge="Active"
                onOpen={() => {
                  setEditing(activeProgram);
                  setView('editor');
                }}
              />
            ) : (
              <p className="muted pd-empty">
                No active program. Create one, then set it active when you are ready. Training will keep using your
                current published plan until that connection is finished.
              </p>
            )}
          </div>

          {LIST_SECTIONS.map((section) => {
            const rows = grouped[section];
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
                  />
                ))}
              </div>
            );
          })}

          {!programs.length && (
            <p className="muted pd-empty">
              {scope === 'group'
                ? 'No programs for this group yet.'
                : 'Create a program to start building your weekly health calendar.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
