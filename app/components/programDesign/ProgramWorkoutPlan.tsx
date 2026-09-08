'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProgramWorkoutTree } from '../../../lib/programDesign/programDesignApi';
import {
  WORKOUT_SECTIONS,
  exerciseSection,
  plannedSets,
  sectionExercises,
  summarizeExercise,
} from '../../../lib/programDesign/workoutPreview';

type ProgramWorkoutPlanProps = {
  supabase: SupabaseClient;
  programId: string;
  week: number;
  canEdit: boolean;
  openWorkoutId?: string | null;
  onOpenHandled?: () => void;
  onLoaded?: (info: { hasExercises: boolean; workoutCount: number }) => void;
};

export default function ProgramWorkoutPlan({
  supabase,
  programId,
  week,
  canEdit,
  openWorkoutId = null,
  onOpenHandled,
  onLoaded,
}: ProgramWorkoutPlanProps) {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await fetchProgramWorkoutTree(supabase, programId);
    if (loadError) setError(loadError);
    setWorkouts(data);
    const exerciseCount = data.reduce((n, w) => n + ((w.st_exercises || []).length), 0);
    onLoaded?.({ hasExercises: exerciseCount > 0, workoutCount: data.length });
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [programId]);

  useEffect(() => {
    if (!openWorkoutId) return;
    const match = workouts.find((w) => w.id === openWorkoutId);
    if (match) {
      setEditingId(openWorkoutId);
      onOpenHandled?.();
    }
  }, [openWorkoutId, workouts]);

  const weekWorkouts = useMemo(
    () => workouts.filter((w) => Number(w.week) === week).sort((a, b) => (a.day_order || 0) - (b.day_order || 0)),
    [workouts, week]
  );
  const editing = weekWorkouts.find((w) => w.id === editingId) || workouts.find((w) => w.id === editingId) || null;

  if (loading) return <p className="muted">Loading workouts…</p>;
  if (error) return <p className="pd-error">{error}</p>;
  if (!weekWorkouts.length) {
    return <p className="muted">No workouts in week {week} yet.</p>;
  }

  return (
    <div className="pd-workout-plan">
      {weekWorkouts.map((workout) => {
        const count = (workout.st_exercises || []).length;
        return (
          <article key={workout.id} className="pd-workout-card">
            <div className="pd-workout-card-head">
              <div>
                <p className="pd-eyebrow">{workout.day_label}</p>
                <h3>{workout.workout_type || 'Workout'}</h3>
                <p className="muted">
                  {count} exercise{count === 1 ? '' : 's'}
                </p>
              </div>
              <button type="button" className="btn small secondary" onClick={() => setEditingId(workout.id)}>
                {canEdit ? 'View / edit' : 'View'}
              </button>
            </div>
            <WorkoutPreview workout={workout} />
          </article>
        );
      })}
      {editing && (
        <WorkoutEditSheet
          supabase={supabase}
          workout={editing}
          canEdit={canEdit}
          onClose={() => setEditingId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function WorkoutPreview({ workout }: { workout: any }) {
  const sections = WORKOUT_SECTIONS.map((sec) => ({
    ...sec,
    list: sectionExercises(workout, sec.id),
  })).filter((sec) => sec.list.length);
  const known = new Set(WORKOUT_SECTIONS.map((s) => s.id));
  const other = (workout?.st_exercises || []).filter((e: any) => !known.has(exerciseSection(e)));
  if (other.length) sections.push({ id: 'other', label: 'Other', list: other });
  if (!sections.length) return <p className="muted">No exercises on this day yet.</p>;
  return (
    <div className="pd-workout-body">
      {sections.map((sec) => (
        <section key={sec.id} className="te-plan-section">
          <h3>{sec.label}</h3>
          {sec.list.map((ex: any) => (
            <div key={ex.id} className="te-plan-ex">
              <b>{ex.name}</b>
              <span className="muted">
                {ex.muscle_group ? `${ex.muscle_group} · ` : ''}
                {summarizeExercise(ex)}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function WorkoutEditSheet({
  supabase,
  workout,
  canEdit,
  onClose,
  onChanged,
}: {
  supabase: SupabaseClient;
  workout: any;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<any>(workout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addName, setAddName] = useState('');
  const [addSets, setAddSets] = useState(3);
  const [addReps, setAddReps] = useState('8-12');

  useEffect(() => {
    setDraft(workout);
  }, [workout]);

  const sections = WORKOUT_SECTIONS.map((sec) => ({
    ...sec,
    list: sectionExercises(draft, sec.id),
  })).filter((sec) => sec.list.length);
  const known = new Set(WORKOUT_SECTIONS.map((s) => s.id));
  const other = (draft?.st_exercises || []).filter((e: any) => !known.has(exerciseSection(e)));
  if (other.length) sections.push({ id: 'other', label: 'Other', list: other });

  async function updateSet(setId: string, field: string, value: string | number | null) {
    if (!canEdit) return;
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.from('st_planned_sets').update({ [field]: value }).eq('id', setId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDraft((prev: any) => ({
      ...prev,
      st_exercises: (prev.st_exercises || []).map((ex: any) => ({
        ...ex,
        st_planned_sets: (ex.st_planned_sets || []).map((s: any) => (s.id === setId ? { ...s, [field]: value } : s)),
      })),
    }));
  }

  async function addSet(ex: any) {
    if (!canEdit) return;
    const active = plannedSets(ex);
    const n = active.length ? Math.max(...active.map((s: any) => s.set_number || 0)) + 1 : 1;
    const sort = active.length ? Math.max(...active.map((s: any) => s.sort_order || 0)) + 1 : 0;
    const sample = active[0];
    setBusy(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('st_planned_sets')
      .insert({
        exercise_id: ex.id,
        sort_order: sort,
        set_number: n,
        set_type: 'working',
        target_reps: sample?.target_reps || '',
        target_rir: sample?.target_rir ?? null,
      })
      .select()
      .single();
    setBusy(false);
    if (insertError || !data) {
      setError(insertError?.message || 'Could not add set');
      return;
    }
    setDraft((prev: any) => ({
      ...prev,
      st_exercises: (prev.st_exercises || []).map((row: any) =>
        row.id === ex.id ? { ...row, st_planned_sets: [...(row.st_planned_sets || []), data] } : row
      ),
    }));
  }

  async function removeSet(setId: string) {
    if (!canEdit) return;
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.from('st_planned_sets').update({ is_deleted: true }).eq('id', setId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDraft((prev: any) => ({
      ...prev,
      st_exercises: (prev.st_exercises || []).map((ex: any) => ({
        ...ex,
        st_planned_sets: (ex.st_planned_sets || []).map((s: any) => (s.id === setId ? { ...s, is_deleted: true } : s)),
      })),
    }));
  }

  async function removeExercise(exId: string) {
    if (!canEdit) return;
    if (!window.confirm('Remove this exercise from the plan? Past logged sets stay in history.')) return;
    setBusy(true);
    setError('');
    const { error: deleteError } = await supabase.from('st_exercises').delete().eq('id', exId);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setDraft((prev: any) => ({
      ...prev,
      st_exercises: (prev.st_exercises || []).filter((ex: any) => ex.id !== exId),
    }));
  }

  async function addExercise() {
    if (!canEdit || !addName.trim()) return;
    const sort =
      (draft.st_exercises || []).reduce((n: number, ex: any) => Math.max(n, Number(ex.sort_order || 0)), -1) + 1;
    setBusy(true);
    setError('');
    const { data: ex, error: exError } = await supabase
      .from('st_exercises')
      .insert({
        workout_id: draft.id,
        section: 'strength',
        sort_order: sort,
        name: addName.trim(),
      })
      .select()
      .single();
    if (exError || !ex) {
      setBusy(false);
      setError(exError?.message || 'Could not add exercise');
      return;
    }
    const setCount = Math.max(1, Math.min(10, Number(addSets) || 3));
    const rows = Array.from({ length: setCount }, (_, i) => ({
      exercise_id: ex.id,
      sort_order: i,
      set_number: i + 1,
      set_type: 'working',
      target_reps: addReps.trim() || '8-12',
    }));
    const { data: sets, error: setsInsertError } = await supabase.from('st_planned_sets').insert(rows).select();
    setBusy(false);
    if (setsInsertError) {
      setError(setsInsertError.message);
      return;
    }
    setDraft((prev: any) => ({
      ...prev,
      st_exercises: [...(prev.st_exercises || []), { ...ex, st_planned_sets: sets || [] }],
    }));
    setAddName('');
  }

  async function handleClose() {
    await onChanged();
    onClose();
  }

  return (
    <div className="panel-overlay" onClick={() => void handleClose()}>
      <div className="pd-sheet card te-plan-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">{draft.day_label}</p>
            <h2>{draft.workout_type || 'Workout'}</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={() => void handleClose()}>
            Done
          </button>
        </div>
        <p className="muted">
          {canEdit
            ? 'Change the planned exercises and sets. Completed history is not rewritten.'
            : 'This plan is read-only.'}
        </p>

        {sections.map((sec) => (
          <section key={sec.id} className="te-plan-section">
            <h3>{sec.label}</h3>
            {sec.list.map((ex: any) => {
              const sets = plannedSets(ex);
              return (
                <div key={ex.id} className="pd-edit-ex">
                  <div className="pd-edit-ex-head">
                    <b>{ex.name}</b>
                    {canEdit && (
                      <button type="button" className="btn small secondary" disabled={busy} onClick={() => void removeExercise(ex.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                  {sets.map((set: any) => (
                    <div key={set.id} className="pd-edit-set">
                      <span className="muted">Set {set.set_number || ''}</span>
                      <input
                        aria-label="Target reps"
                        value={set.target_reps || ''}
                        disabled={!canEdit || busy}
                        placeholder="reps"
                        onChange={(e) =>
                          setDraft((prev: any) => ({
                            ...prev,
                            st_exercises: (prev.st_exercises || []).map((row: any) =>
                              row.id === ex.id
                                ? {
                                    ...row,
                                    st_planned_sets: (row.st_planned_sets || []).map((s: any) =>
                                      s.id === set.id ? { ...s, target_reps: e.target.value } : s
                                    ),
                                  }
                                : row
                            ),
                          }))
                        }
                        onBlur={(e) => void updateSet(set.id, 'target_reps', e.target.value)}
                      />
                      <input
                        aria-label="Target weight"
                        value={set.target_weight || ''}
                        disabled={!canEdit || busy}
                        placeholder="weight"
                        onChange={(e) =>
                          setDraft((prev: any) => ({
                            ...prev,
                            st_exercises: (prev.st_exercises || []).map((row: any) =>
                              row.id === ex.id
                                ? {
                                    ...row,
                                    st_planned_sets: (row.st_planned_sets || []).map((s: any) =>
                                      s.id === set.id ? { ...s, target_weight: e.target.value } : s
                                    ),
                                  }
                                : row
                            ),
                          }))
                        }
                        onBlur={(e) => void updateSet(set.id, 'target_weight', e.target.value || null)}
                      />
                      <input
                        aria-label="Target RIR"
                        value={set.target_rir ?? ''}
                        disabled={!canEdit || busy}
                        placeholder="RIR"
                        inputMode="decimal"
                        onChange={(e) =>
                          setDraft((prev: any) => ({
                            ...prev,
                            st_exercises: (prev.st_exercises || []).map((row: any) =>
                              row.id === ex.id
                                ? {
                                    ...row,
                                    st_planned_sets: (row.st_planned_sets || []).map((s: any) =>
                                      s.id === set.id ? { ...s, target_rir: e.target.value } : s
                                    ),
                                  }
                                : row
                            ),
                          }))
                        }
                        onBlur={(e) => void updateSet(set.id, 'target_rir', e.target.value === '' ? null : Number(e.target.value))}
                      />
                      {canEdit && (
                        <button type="button" className="btn small secondary" disabled={busy} onClick={() => void removeSet(set.id)}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => void addSet(ex)}>
                      Add set
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {canEdit && (
          <div className="pd-add-ex">
            <h3>Add exercise</h3>
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Exercise name" />
            <div className="row">
              <div>
                <label>Sets</label>
                <input type="number" min={1} max={10} value={addSets} onChange={(e) => setAddSets(Number(e.target.value))} />
              </div>
              <div>
                <label>Reps</label>
                <input value={addReps} onChange={(e) => setAddReps(e.target.value)} placeholder="8-12" />
              </div>
            </div>
            <button type="button" className="btn small green" disabled={busy || !addName.trim()} onClick={() => void addExercise()}>
              Add exercise
            </button>
          </div>
        )}

        {error && <p className="pd-error">{error}</p>}
      </div>
    </div>
  );
}
