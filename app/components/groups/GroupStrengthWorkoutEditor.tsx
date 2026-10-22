'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { plannedSets, sectionExercises } from '../../../lib/programDesign/workoutPreview';
import { fetchAllExerciseCatalog, insertUserCatalogExercise } from '../../../lib/training/catalogFetch';
import { normalizeEquipmentList } from '../../../lib/training/equipmentFilter';
import { compatibleEquipmentOptions, resolveExerciseEquipment } from '../../../lib/training/exerciseEquipment';
import {
  addDraftExercise,
  addDraftSet,
  draftSupersetGroups,
  emptyDraftWorkout,
  moveDraftExercise,
  removeDraftExercise,
  removeDraftSet,
  replaceDraftExercise,
  updateDraftExercise,
  updateDraftSet,
  type DraftExercise,
  type DraftSet,
  type DraftWorkout,
} from '../../../lib/training/draftWorkout';
import { SET_TYPES, isRampEffortSetType } from '../../../lib/training/setTypes';
import {
  emptyAddPanelConfig,
  groupSectionBlocks,
  openAddPanelState,
  openReplacePanelState,
  sectionDefaultSets,
  WORKOUT_TEMPLATE_SECTIONS,
  type AddPanelState,
} from '../../../lib/training/workoutTemplate';
import AddExercisePanel from '../training/AddExercisePanel';

type GroupStrengthWorkoutEditorProps = {
  supabase: SupabaseClient;
  title: string;
  onTitle: (title: string) => void;
  workout: DraftWorkout;
  onWorkout: (workout: DraftWorkout) => void;
};

/**
 * Group shelf workouts are written only by st_save_group_strength_workout.
 * WorkoutTemplateEditor inserts st_exercises directly, and those writes are rejected
 * on a shelf program. This editor keeps the same catalog panel, sections, equipment,
 * supersets, and set fields, and holds them in memory until that RPC saves them.
 */
export default function GroupStrengthWorkoutEditor({ supabase, title, onTitle, workout, onWorkout }: GroupStrengthWorkoutEditorProps) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [panel, setPanel] = useState<AddPanelState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || null;
      if (cancelled) return;
      setUserId(uid);
      const [{ data: cat, error: catalogError }, { data: profile }] = await Promise.all([
        fetchAllExerciseCatalog(supabase).then(async (result) => (result.error ? fetchAllExerciseCatalog(supabase) : result)),
        uid
          ? supabase.from('st_profiles').select('available_equipment, units_preference').eq('user_id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setCatalog(cat || []);
      if (catalogError) setError(typeof catalogError === 'string' ? catalogError : 'Could not load exercises.');
      setEquipment(normalizeEquipmentList(profile?.available_equipment));
      setWeightUnit(profile?.units_preference === 'metric' ? 'kg' : 'lb');
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  function confirmAdd() {
    if (!panel?.picked) return;
    const result = addDraftExercise(workout, { section: panel.section, picked: panel.picked, config: panel.config });
    if (result.error) {
      setError(result.error);
      return;
    }
    setError('');
    onWorkout(result.workout);
    if (result.openAnother && result.supersetGroupId) {
      setPanel({
        ...openAddPanelState(panel.section, result.supersetGroupId),
        config: { ...emptyAddPanelConfig(), mode: 'superset', supersetGroupId: result.supersetGroupId, setCount: sectionDefaultSets(panel.section) },
      });
      return;
    }
    setPanel(null);
  }

  async function createCustom() {
    if (!panel || !userId) return;
    const name = panel.custom.name.trim();
    if (!name) {
      setError('Enter exercise name.');
      return;
    }
    setError('');
    const { data, error: insertError } = await insertUserCatalogExercise(supabase, {
      userId,
      name,
      category: panel.custom.category || panel.section,
      muscleGroup: panel.custom.muscle_group,
      equipment: panel.custom.equipment,
    });
    if (insertError || !data) {
      setError(insertError?.message || 'Could not create exercise');
      return;
    }
    const { data: cat } = await fetchAllExerciseCatalog(supabase);
    setCatalog(cat || []);
    setPanel({
      ...panel,
      step: 'configure',
      picked: data,
      config: { ...panel.config, setCount: sectionDefaultSets(panel.section) },
    });
  }

  function renderExercise(exercise: DraftExercise, canMoveUp: boolean, canMoveDown: boolean) {
    const catalogItem = exercise.catalog_exercise_id ? catalogById.get(exercise.catalog_exercise_id) : null;
    const options = compatibleEquipmentOptions(catalogItem, exercise.equipment || undefined);
    const currentEquipment = resolveExerciseEquipment(exercise, catalogItem);
    const sets = plannedSets(exercise) as DraftSet[];
    return (
      <div key={exercise.id} className="card exercise-card">
        <div className="exercise-head">
          <div className="exercise-meta">
            <input
              aria-label={`Exercise name ${exercise.name}`}
              value={exercise.name}
              onChange={(event) => onWorkout(updateDraftExercise(workout, exercise.id, { name: event.target.value }))}
            />
            {exercise.muscle_group ? <p className="muted">{exercise.muscle_group}</p> : null}
            <label>
              Equipment
              <select
                aria-label={`Equipment for ${exercise.name}`}
                value={currentEquipment}
                onChange={(event) => onWorkout(updateDraftExercise(workout, exercise.id, { equipment: event.target.value }))}
              >
                {!currentEquipment ? <option value="">Choose equipment</option> : null}
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {currentEquipment && !options.includes(currentEquipment) ? <option value={currentEquipment}>{currentEquipment}</option> : null}
              </select>
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn small secondary" onClick={() => setPanel(openReplacePanelState(exercise))}>
              Change
            </button>
            <button type="button" className="btn small secondary" aria-label={`Move ${exercise.name} up`} disabled={!canMoveUp} onClick={() => onWorkout(moveDraftExercise(workout, exercise.id, -1))}>
              ↑
            </button>
            <button type="button" className="btn small secondary" aria-label={`Move ${exercise.name} down`} disabled={!canMoveDown} onClick={() => onWorkout(moveDraftExercise(workout, exercise.id, 1))}>
              ↓
            </button>
            <button type="button" className="btn small secondary" onClick={() => onWorkout(addDraftSet(workout, exercise.id))}>
              + Set
            </button>
            <button type="button" className="btn small red" onClick={() => onWorkout(removeDraftExercise(workout, exercise.id))}>
              Remove
            </button>
          </div>
        </div>
        <div className="pd-planned-sets">
          {sets.map((set) => (
            <div key={set.id} className="set-log-card">
              <div className="set-log-grid">
                <div className="set-log-head">
                  <span className="set-log-num">Set {set.set_number}</span>
                  <select
                    aria-label={`Set type for ${exercise.name} set ${set.set_number}`}
                    value={set.set_type}
                    onChange={(event) => onWorkout(updateDraftSet(workout, exercise.id, set.id, 'set_type', event.target.value))}
                  >
                    {SET_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="log-field-row log-field-row-compact log-field-row-metrics">
                  <label className="log-field-card">
                    <span>Reps</span>
                    <input
                      aria-label={`Reps for ${exercise.name} set ${set.set_number}`}
                      value={set.target_reps}
                      placeholder="8-12"
                      onChange={(event) => onWorkout(updateDraftSet(workout, exercise.id, set.id, 'target_reps', event.target.value))}
                    />
                  </label>
                  <label className="log-field-card">
                    <span>Weight ({weightUnit})</span>
                    <input
                      aria-label={`Weight for ${exercise.name} set ${set.set_number}`}
                      value={set.target_weight}
                      placeholder={weightUnit}
                      onChange={(event) => onWorkout(updateDraftSet(workout, exercise.id, set.id, 'target_weight', event.target.value))}
                    />
                  </label>
                  {isRampEffortSetType(set.set_type) ? (
                    <label className="log-field-card">
                      <span>Effort</span>
                      <input value="Ramp" disabled />
                    </label>
                  ) : (
                    <label className="log-field-card">
                      <span>RIR</span>
                      <input
                        aria-label={`RIR for ${exercise.name} set ${set.set_number}`}
                        inputMode="decimal"
                        value={set.target_rir ?? ''}
                        onChange={(event) => onWorkout(updateDraftSet(workout, exercise.id, set.id, 'target_rir', event.target.value))}
                      />
                    </label>
                  )}
                  <label className="log-field-card">
                    <span>Rest (sec)</span>
                    <input
                      aria-label={`Rest for ${exercise.name} set ${set.set_number}`}
                      inputMode="numeric"
                      value={set.rest_seconds ?? ''}
                      onChange={(event) => onWorkout(updateDraftSet(workout, exercise.id, set.id, 'rest_seconds', event.target.value))}
                    />
                  </label>
                </div>
                <button type="button" className="btn small red" aria-label={`Remove set ${set.set_number} from ${exercise.name}`} onClick={() => onWorkout(removeDraftSet(workout, exercise.id, set.id))}>
                  Remove set
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="group-strength-editor"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
      }}
    >
      <label>
        Workout name
        <input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Workout" />
      </label>
      {error ? <p className="team-sheet-error">{error}</p> : null}
      {WORKOUT_TEMPLATE_SECTIONS.map((section) => {
        const exercises = sectionExercises(workout, section.id) as DraftExercise[];
        const blocks = groupSectionBlocks(exercises);
        return (
          <section key={section.id} className="group-strength-section">
            <div className="topline">
              <h3>{section.label}</h3>
              <button type="button" className="btn small secondary" onClick={() => setPanel(openAddPanelState(section.id))}>
                Add exercise
              </button>
            </div>
            {blocks.length === 0 ? <p className="muted">No {section.label.toLowerCase()} exercises.</p> : null}
            {blocks.map((block) => {
              const items = block.exercises as DraftExercise[];
              return (
                <div key={block.type === 'superset' ? block.groupId : items[0]?.id} className={block.type === 'superset' ? 'superset-block' : undefined}>
                  {block.type === 'superset' ? <p className="muted">{block.label || 'Superset'}</p> : null}
                  {items.map((exercise) => {
                    const index = exercises.findIndex((item) => item.id === exercise.id);
                    return renderExercise(exercise, index > 0, index >= 0 && index < exercises.length - 1);
                  })}
                </div>
              );
            })}
          </section>
        );
      })}
      {panel ? (
        <AddExercisePanel
          panel={panel}
          catalog={catalog}
          equipment={equipment}
          supersetGroups={draftSupersetGroups(workout, panel.section)}
          onChange={setPanel}
          onPick={(item) => {
            if (panel.replaceTarget) {
              onWorkout(replaceDraftExercise(workout, panel.replaceTarget.id, item));
              setPanel(null);
              return;
            }
            setPanel({ ...panel, step: 'configure', picked: item, config: { ...panel.config, setCount: sectionDefaultSets(panel.section) } });
          }}
          onCreateCustom={() => void createCustom()}
          onConfirm={confirmAdd}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

export function initialGroupStrengthDraft(): DraftWorkout {
  return emptyDraftWorkout();
}
