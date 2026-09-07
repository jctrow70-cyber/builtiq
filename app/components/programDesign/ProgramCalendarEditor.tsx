'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionHeader from '../ui/SectionHeader';
import WeeklyHealthCalendar from './WeeklyHealthCalendar';
import AddActivitySheet from './AddActivitySheet';
import ImportWorkoutsSheet from './ImportWorkoutsSheet';
import PushToMembersSheet from './PushToMembersSheet';
import { cycleLengthOf, formatProgramRange, programDateRange } from '../../../lib/programDesign/cycle';
import { lifecycleLabel, lifecycleStatusOf } from '../../../lib/programDesign/lifecycle';
import {
  activitiesFromLegacyWorkouts,
  copyWeekActivities,
  createProgramActivity,
  deleteProgramActivity,
  fetchLegacyWorkouts,
  fetchProgramActivities,
  nextSortOrder,
  setProgramLifecycle,
  updateProgramActivity,
} from '../../../lib/programDesign/programDesignApi';
import type {
  ActivityDraft,
  ProgramActivity,
  ProgramDesignRecord,
  ProgramLifecycleStatus,
} from '../../../lib/programDesign/types';

type ProgramCalendarEditorProps = {
  supabase: SupabaseClient;
  program: ProgramDesignRecord;
  programs: ProgramDesignRecord[];
  ownerUserId: string;
  canEdit: boolean;
  isFollowing?: boolean;
  groups?: { id: string; name: string; my_role?: string | null }[];
  /** When set, owners/managers can push this program to group members. */
  pushTeamId?: string | null;
  onBack: () => void;
  onProgramChange: (program: ProgramDesignRecord) => void;
  onFollow?: () => Promise<void>;
  onShareWithGroup?: (teamId: string) => Promise<void>;
};

export default function ProgramCalendarEditor({
  supabase,
  program,
  programs,
  ownerUserId,
  canEdit,
  isFollowing,
  groups = [],
  pushTeamId = null,
  onBack,
  onProgramChange,
  onFollow,
  onShareWithGroup,
}: ProgramCalendarEditorProps) {
  const [week, setWeek] = useState(1);
  const [activities, setActivities] = useState<ProgramActivity[]>([]);
  const [tableReady, setTableReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheetDay, setSheetDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProgramActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);

  const totalWeeks = cycleLengthOf(program);
  const { start, end } = programDateRange(program);
  const status = lifecycleStatusOf(program);

  async function reload() {
    setLoading(true);
    setError('');
    const [{ data, error: loadError, tableReady: ready }, legacy] = await Promise.all([
      fetchProgramActivities(supabase, program.id),
      fetchLegacyWorkouts(supabase, program.id),
    ]);
    setTableReady(ready);
    if (loadError) setError(loadError);
    const planned = data || [];
    const linked = new Set(planned.map((a) => a.workout_id).filter(Boolean));
    const bridged = activitiesFromLegacyWorkouts(
      program.id,
      (legacy.data || []).filter((w) => !linked.has(w.id))
    );
    setActivities([...planned, ...bridged]);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [program.id]);

  const hasStrengthActivities = useMemo(
    () => activities.some((a) => a.activity_type === 'strength' && a.workout_id && a.week_number === week),
    [activities, week]
  );

  const dayLabel = useMemo(() => {
    if (sheetDay == null) return '';
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][sheetDay] || 'Day';
  }, [sheetDay]);

  async function saveActivity(draft: ActivityDraft) {
    if (!canEdit) return;
    if (editing && editing.id.startsWith('legacy-')) return;
    const isNewStrength = !editing && draft.activity_type === 'strength';
    if (editing) {
      const { error: updateError } = await updateProgramActivity(supabase, editing.id, draft);
      if (updateError) throw new Error(updateError);
    } else if (sheetDay != null) {
      const { error: createError } = await createProgramActivity(
        supabase,
        program.id,
        week,
        sheetDay,
        draft,
        nextSortOrder(activities, week, sheetDay)
      );
      if (createError) throw new Error(createError);
    }
    setSheetDay(null);
    setEditing(null);
    await reload();
    if (isNewStrength) {
      setImportOpen(true);
    }
  }

  async function removeActivity() {
    if (!editing || editing.id.startsWith('legacy-')) return;
    const { error: deleteError } = await deleteProgramActivity(supabase, editing.id);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    setSheetDay(null);
    setEditing(null);
    await reload();
  }

  async function copyCurrentWeek() {
    if (!canEdit) return;
    const target = week + 1;
    if (target > totalWeeks) {
      setError('There is no next week to copy into.');
      return;
    }
    setBusy(true);
    const { error: copyError } = await copyWeekActivities(supabase, program.id, week, [target]);
    setBusy(false);
    if (copyError) {
      setError(copyError);
      return;
    }
    setWeek(target);
    await reload();
  }

  async function copyToRemaining() {
    if (!canEdit) return;
    const targets = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w > week);
    if (!targets.length) {
      setError('This is the last week in the cycle.');
      return;
    }
    setBusy(true);
    const { error: copyError } = await copyWeekActivities(supabase, program.id, week, targets);
    setBusy(false);
    if (copyError) {
      setError(copyError);
      return;
    }
    await reload();
  }

  async function changeStatus(next: ProgramLifecycleStatus) {
    if (!canEdit) return;
    if (next === 'active') {
      const conflict = programs.find(
        (p) =>
          p.id !== program.id &&
          p.visibility === 'personal' &&
          p.owner_user_id === ownerUserId &&
          lifecycleStatusOf(p) === 'active'
      );
      if (conflict && !window.confirm(`${conflict.name} is already active. Make this the active program instead?`)) {
        return;
      }
    }
    setBusy(true);
    const { error: statusError } = await setProgramLifecycle(supabase, programs, program.id, next, ownerUserId);
    setBusy(false);
    if (statusError) {
      setError(statusError);
      return;
    }
    onProgramChange({ ...program, status: next });
  }

  return (
    <div className="pd-editor">
      <button type="button" className="pd-back" onClick={onBack}>
        ← Back to programs
      </button>
      <SectionHeader
        title={program.name}
        subtitle={`${formatProgramRange(start, end)} · Week ${week} of ${totalWeeks}`}
        actions={<span className="ui-badge">{lifecycleLabel(status)}</span>}
      />

      <div className="pd-week-bar">
        <button type="button" className="btn small secondary" disabled={week <= 1} onClick={() => setWeek((w) => w - 1)}>
          Previous
        </button>
        <p className="pd-week-label">Week {week}</p>
        <button
          type="button"
          className="btn small secondary"
          disabled={week >= totalWeeks}
          onClick={() => setWeek((w) => w + 1)}
        >
          Next
        </button>
      </div>

      {canEdit && (
        <div className="pd-week-actions">
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => void copyCurrentWeek()}>
            Copy week
          </button>
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => void copyToRemaining()}>
            Copy to remaining weeks
          </button>
          {hasStrengthActivities && (
            <button type="button" className="btn small accent" disabled={busy} onClick={() => setImportOpen(true)}>
              Import exercises from program
            </button>
          )}
        </div>
      )}

      {!tableReady && (
        <p className="pd-note">
          Calendar activities will save after the Program Design migration is applied in Supabase.
        </p>
      )}
      {error && <p className="pd-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading this week…</p>
      ) : (
        <WeeklyHealthCalendar
          startMonday={start}
          weekNumber={week}
          activities={activities}
          onAddActivity={(day) => {
            if (!canEdit) return;
            setEditing(null);
            setSheetDay(day);
          }}
          onOpenActivity={(activity) => {
            setEditing(activity);
            setSheetDay(activity.day_of_week);
          }}
        />
      )}

      <div className="pd-status-row">
        {onFollow && !isFollowing && (
          <button type="button" className="btn green" disabled={busy} onClick={() => void onFollow()}>
            {canEdit && program.visibility === 'team' ? 'Pull in & edit' : 'Follow this program'}
          </button>
        )}
        {isFollowing && <span className="ui-badge">{canEdit && program.visibility === 'team' ? 'Editing in Training' : 'Following'}</span>}
        {canEdit && pushTeamId && (
          <button type="button" className="btn green" disabled={busy} onClick={() => setPushOpen(true)}>
            Push to members
          </button>
        )}
        {onShareWithGroup && canEdit && groups.length > 0 && (
          <select
            aria-label="Share with group"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) void onShareWithGroup(id);
              e.target.value = '';
            }}
          >
            <option value="">Share with group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {canEdit && (
        <div className="pd-status-row">
          {status === 'draft' && (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void changeStatus('scheduled')}>
              Schedule
            </button>
          )}
          {(status === 'draft' || status === 'scheduled') && (
            <button type="button" className="btn green" disabled={busy} onClick={() => void changeStatus('active')}>
              Set as active
            </button>
          )}
          {status === 'active' && (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void changeStatus('completed')}>
              Mark completed
            </button>
          )}
          {status !== 'archived' && (
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => void changeStatus('archived')}>
              Archive
            </button>
          )}
        </div>
      )}

      {sheetDay != null && (
        <AddActivitySheet
          dayLabel={dayLabel}
          existing={editing}
          onClose={() => {
            setSheetDay(null);
            setEditing(null);
          }}
          onSave={saveActivity}
          onDelete={editing ? removeActivity : undefined}
        />
      )}

      {importOpen && (
        <ImportWorkoutsSheet
          supabase={supabase}
          userId={ownerUserId}
          targetProgramId={program.id}
          strengthActivities={activities.filter((a) => a.week_number === week)}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void reload();
          }}
        />
      )}

      {pushOpen && pushTeamId && (
        <PushToMembersSheet
          supabase={supabase}
          teamId={pushTeamId}
          programId={program.id}
          programName={program.name}
          programStatus={program.status}
          onClose={() => setPushOpen(false)}
          onPushed={() => {
            onProgramChange({ ...program, status: program.status === 'draft' ? 'published' : program.status });
          }}
        />
      )}
    </div>
  );
}
