'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import AddExercisePanel from './AddExercisePanel';
import WarmupExerciseCard from './WarmupExerciseCard';
import { fetchAllExerciseCatalog } from '../../../lib/training/catalogFetch';
import { catalogResultMeta, searchCatalog, workoutSearchCatalogItems } from '../../../lib/training/catalogSearch';
import { normalizeEquipmentList } from '../../../lib/training/equipmentFilter';
import { getExerciseGuidePayload, getExerciseThumb, hasExerciseGuide, type ExerciseGuidePayload } from '../../../lib/training/exerciseMedia';
import { exerciseTypeOf } from '../../../lib/training/exerciseTypes';
import { SET_TYPES } from '../../../lib/training/setTypes';
import {
  catalogPayloadFromItem,
  emptyAddPanelConfig,
  getSupersetGroupsForSection,
  groupSectionBlocks,
  makeSupersetGroupId,
  matchingExercise,
  matchingSet,
  nextExerciseSortOrder,
  nextSupersetLabel,
  openAddPanelState,
  openReplacePanelState,
  sectionDefaultSets,
  siblingWorkouts,
  WORKOUT_TEMPLATE_SECTIONS,
  type AddPanelState,
} from '../../../lib/training/workoutTemplate';
import { exerciseSection, plannedSets, sectionExercises } from '../../../lib/programDesign/workoutPreview';

type WorkoutTemplateEditorProps = {
  supabase: SupabaseClient;
  workout: any;
  allWorkouts: any[];
  canEdit: boolean;
  onBack: () => void;
  onReload: () => Promise<void>;
};

export default function WorkoutTemplateEditor({
  supabase,
  workout,
  allWorkouts,
  canEdit,
  onBack,
  onReload,
}: WorkoutTemplateEditorProps) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [panel, setPanel] = useState<AddPanelState | null>(null);
  const [applyRemaining, setApplyRemaining] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nameSearch, setNameSearch] = useState<{ exerciseId: string; query: string } | null>(null);
  const [guide, setGuide] = useState<ExerciseGuidePayload | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const namePickRef = useRef(false);

  const searchCatalogPool = useMemo(() => workoutSearchCatalogItems(catalog, userId), [catalog, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || null;
      if (cancelled) return;
      setUserId(uid);
      const [{ data: cat }, { data: profile }] = await Promise.all([
        fetchAllExerciseCatalog(supabase),
        uid ? supabase.from('st_profiles').select('available_equipment, units_preference').eq('user_id', uid).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setCatalog(cat || []);
      setEquipment(normalizeEquipmentList(profile?.available_equipment));
      setWeightUnit(profile?.units_preference === 'metric' ? 'kg' : 'lb');
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const targets = siblingWorkouts(allWorkouts, workout, canEdit && applyRemaining);

  function catalogItemFor(ex: any) {
    return catalog.find((c: any) => c.id === ex.catalog_exercise_id) || null;
  }

  async function persistError(message: string) {
    setError(message);
    setBusy(false);
  }

  async function reload() {
    setBusy(false);
    await onReload();
  }

  async function replaceWithCatalog(ex: any, item: any) {
    if (!canEdit) return;
    setBusy(true);
    setError('');
    const payload = catalogPayloadFromItem(item, exerciseSection(ex));
    for (const tw of targets) {
      const match = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      if (!match) continue;
      const { error: updateError } = await supabase.from('st_exercises').update(payload).eq('id', match.id);
      if (updateError) return persistError(updateError.message);
    }
    setPanel(null);
    await reload();
  }

  async function pickFromPanel(item: any) {
    if (!panel) return;
    if (panel.replaceTarget) {
      await replaceWithCatalog(panel.replaceTarget, item);
      return;
    }
    setPanel({
      ...panel,
      step: 'configure',
      picked: item,
      config: { ...panel.config, setCount: sectionDefaultSets(panel.section) },
    });
  }

  async function createCustom() {
    if (!panel || !userId) return;
    const name = panel.custom.name.trim();
    if (!name) {
      setError('Enter exercise name.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('st_exercise_catalog')
      .insert({
        user_id: userId,
        name,
        category: panel.custom.category || panel.section,
        muscle_group: panel.custom.muscle_group.trim() || null,
        equipment: panel.custom.equipment.trim() || null,
        is_system: false,
        is_archived: false,
      })
      .select()
      .single();
    if (insertError || !data) return persistError(insertError?.message || 'Could not create exercise');
    const { data: cat } = await fetchAllExerciseCatalog(supabase);
    setCatalog(cat || []);
    setBusy(false);
    setPanel({
      ...panel,
      step: 'configure',
      picked: data,
      config: { ...panel.config, setCount: sectionDefaultSets(panel.section) },
    });
  }

  async function confirmAdd() {
    if (!canEdit || !panel?.picked) return;
    const { section, picked, config } = panel;
    let groupId: string | null = null;
    let supersetLabel: string | null = null;
    let slotOrder: number | null = null;
    let existing: any[] = [];
    if (config.mode === 'superset') {
      groupId = !config.supersetGroupId || config.supersetGroupId === '__new__' ? makeSupersetGroupId() : config.supersetGroupId;
      existing = sectionExercises(workout, section).filter((e: any) => e.superset_group_id === groupId);
      if (existing.length >= 3) {
        setError('That superset already has 3 exercises.');
        return;
      }
      if (!existing.length) {
        supersetLabel = nextSupersetLabel(workout, section);
        slotOrder = 1;
      } else {
        supersetLabel = existing[0].superset_label;
        slotOrder = existing.length + 1;
      }
    }
    let sortOrder = nextExerciseSortOrder(workout, section);
    if (groupId && existing.length) sortOrder = existing[0].sort_order ?? sortOrder;
    const setCount = Math.max(1, Number(config.setCount) || sectionDefaultSets(section));
    const exType = exerciseTypeOf(picked, picked);
    setBusy(true);
    setError('');
    for (const tw of targets) {
      const { data: ex, error: exError } = await supabase
        .from('st_exercises')
        .insert({
          workout_id: tw.id,
          section,
          sort_order: sortOrder,
          name: picked.name,
          muscle_group: picked.muscle_group || '',
          catalog_exercise_id: picked.id,
          exercise_type: exType,
          superset_group_id: groupId,
          superset_label: supersetLabel,
          superset_order: slotOrder,
        })
        .select()
        .single();
      if (exError || !ex) return persistError(exError?.message || 'Could not add exercise');
      const rows = Array.from({ length: setCount }, (_, i) => ({
        exercise_id: ex.id,
        sort_order: i,
        set_number: i + 1,
        set_type: 'working',
        target_weight: config.targetWeight || '',
        target_reps: config.targetReps || '',
      }));
      if (rows.length) {
        const { error: setError } = await supabase.from('st_planned_sets').insert(rows);
        if (setError) return persistError(setError.message);
      }
    }
    const newCount = existing.length + 1;
    if (config.mode === 'superset' && groupId && newCount < 3) {
      setBusy(false);
      await onReload();
      setPanel({
        ...openAddPanelState(section, groupId),
        config: { ...emptyAddPanelConfig(), mode: 'superset', supersetGroupId: groupId, setCount: sectionDefaultSets(section) },
      });
      return;
    }
    setPanel(null);
    await reload();
  }

  async function addSet(ex: any) {
    if (!canEdit) return;
    const active = plannedSets(ex);
    const n = active.length ? Math.max(...active.map((s: any) => s.set_number || 0)) + 1 : 1;
    const sort = active.length ? Math.max(...active.map((s: any) => s.sort_order || 0)) + 1 : 0;
    const sample = active[0];
    setBusy(true);
    setError('');
    for (const tw of targets) {
      const match = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      if (!match) continue;
      const { error: insertError } = await supabase.from('st_planned_sets').insert({
        exercise_id: match.id,
        sort_order: sort,
        set_number: n,
        set_type: 'working',
        target_reps: sample?.target_reps || '',
        target_rir: sample?.target_rir ?? null,
        target_weight: sample?.target_weight || '',
      });
      if (insertError) return persistError(insertError.message);
    }
    await reload();
  }

  async function updateSet(ex: any, set: any, field: string, value: any) {
    if (!canEdit) return;
    setError('');
    for (const tw of targets) {
      const matchEx = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      const matchSet = matchEx ? (tw.id === workout.id ? set : matchingSet(matchEx, set)) : null;
      if (!matchSet) continue;
      const { error: updateError } = await supabase.from('st_planned_sets').update({ [field]: value }).eq('id', matchSet.id);
      if (updateError) return persistError(updateError.message);
    }
    await onReload();
  }

  async function removeSet(ex: any, set: any) {
    if (!canEdit) return;
    setBusy(true);
    setError('');
    for (const tw of targets) {
      const matchEx = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      const matchSet = matchEx ? (tw.id === workout.id ? set : matchingSet(matchEx, set)) : null;
      if (!matchSet) continue;
      const { error: updateError } = await supabase.from('st_planned_sets').update({ is_deleted: true }).eq('id', matchSet.id);
      if (updateError) return persistError(updateError.message);
    }
    await reload();
  }

  async function removeExercise(ex: any) {
    if (!canEdit) return;
    if (!window.confirm('Remove this exercise from the plan? Past logged sets stay in history.')) return;
    setBusy(true);
    setError('');
    for (const tw of targets) {
      const match = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      if (!match) continue;
      const { error: deleteError } = await supabase.from('st_exercises').delete().eq('id', match.id);
      if (deleteError) return persistError(deleteError.message);
    }
    await reload();
  }

  async function renameExercise(ex: any, name: string) {
    if (!canEdit || !name.trim()) return;
    setError('');
    for (const tw of targets) {
      const match = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      if (!match) continue;
      const { error: updateError } = await supabase.from('st_exercises').update({ name: name.trim() }).eq('id', match.id);
      if (updateError) return persistError(updateError.message);
    }
    await onReload();
  }

  async function updateMuscle(ex: any, muscle: string) {
    if (!canEdit) return;
    for (const tw of targets) {
      const match = tw.id === workout.id ? ex : matchingExercise(tw, ex);
      if (!match) continue;
      await supabase.from('st_exercises').update({ muscle_group: muscle }).eq('id', match.id);
    }
    await onReload();
  }

  async function breakSuperset(ex: any) {
    if (!canEdit || !ex.superset_group_id) return;
    setBusy(true);
    setError('');
    for (const tw of targets) {
      const members = (tw.st_exercises || []).filter(
        (e: any) => e.superset_group_id === ex.superset_group_id && exerciseSection(e) === exerciseSection(ex)
      );
      for (const row of members) {
        const { error: updateError } = await supabase
          .from('st_exercises')
          .update({ superset_group_id: null, superset_label: null, superset_order: null })
          .eq('id', row.id);
        if (updateError) return persistError(updateError.message);
      }
    }
    await reload();
  }

  async function renameSuperset(ex: any, label: string) {
    if (!canEdit || !ex.superset_group_id || !label.trim()) return;
    for (const tw of targets) {
      const members = (tw.st_exercises || []).filter((e: any) => e.superset_group_id === ex.superset_group_id);
      for (const row of members) {
        await supabase.from('st_exercises').update({ superset_label: label.trim() }).eq('id', row.id);
      }
    }
    await onReload();
  }

  const ids = (workout.st_exercises || []).map((e: any) => e.id);

  return (
    <div className="pd-template-editor">
      <button type="button" className="pd-back" onClick={onBack}>
        ← Back to workouts
      </button>
      <div className="card training-workout-panel">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">{workout.day_label}</p>
            <h2>
              {workout.day_label} · {workout.workout_type || 'Workout'}
            </h2>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn small secondary"
              onClick={() => setCollapsed((prev) => {
                const next = { ...prev };
                ids.forEach((id: string) => {
                  next[id] = false;
                });
                return next;
              })}
            >
              Expand all
            </button>
            <button
              type="button"
              className="btn small secondary"
              onClick={() => setCollapsed((prev) => {
                const next = { ...prev };
                ids.forEach((id: string) => {
                  next[id] = true;
                });
                return next;
              })}
            >
              Collapse all
            </button>
            <span className="muted">{(workout.st_exercises || []).length} exercises</span>
          </div>
        </div>
        <p className="muted">
          {canEdit
            ? 'Same editor as Training. Search the exercise library to add or change lifts. Completed history is not rewritten.'
            : 'This plan is read-only.'}
        </p>
        {canEdit && (
          <div className="applybox-compact">
            <label htmlFor="pd-apply-scope">Apply changes to</label>
            <select id="pd-apply-scope" value={applyRemaining ? 'future' : 'current'} onChange={(e) => setApplyRemaining(e.target.value === 'future')}>
              <option value="future">This day in remaining weeks</option>
              <option value="current">This workout only</option>
            </select>
          </div>
        )}
      </div>

      {WORKOUT_TEMPLATE_SECTIONS.map((sec) => {
        const exercises = sectionExercises(workout, sec.id);
        const blocks = groupSectionBlocks(exercises);
        return (
          <div className={`section-block${sec.id === 'cooldown' ? ' section-cooldown' : ''}`} key={sec.id}>
            <div className="section-head">
              <h2>{sec.label}</h2>
              <div className="section-head-actions">
                <span className="badge">{exercises.length}</span>
              </div>
            </div>
            {blocks.map((block: any) =>
              sec.id === 'warmup' || sec.id === 'cooldown'
                ? block.exercises.map((ex: any) => {
                    const catItem = catalogItemFor(ex);
                    const thumb = getExerciseThumb(catItem);
                    const showGuide = hasExerciseGuide(catItem);
                    const payload = getExerciseGuidePayload(catItem, ex.name);
                    return (
                      <WarmupExerciseCard
                        key={ex.id}
                        name={ex.name || 'Exercise'}
                        sets={plannedSets(ex)}
                        thumbUrl={thumb}
                        showGuide={showGuide && !!payload}
                        guideLabel={payload?.hasVideo ? 'Watch form' : 'Form guide'}
                        onOpenGuide={payload ? () => setGuide(payload) : undefined}
                        canEdit={canEdit}
                        onChange={canEdit ? () => setPanel(openReplacePanelState(ex)) : undefined}
                        onAddSet={canEdit ? () => void addSet(ex) : undefined}
                        onRemove={canEdit ? () => void removeExercise(ex) : undefined}
                      />
                    );
                  })
                : block.type === 'superset'
                  ? (
                    <div className="superset-block" key={block.groupId}>
                      <div className="superset-head">
                        <div className="superset-head-left">
                          <span className="superset-tag">Superset</span>
                          {canEdit ? (
                            <input
                              className="superset-label-input"
                              defaultValue={block.label || 'Superset'}
                              onBlur={(e) => {
                                if (e.target.value.trim() && e.target.value !== block.label) {
                                  void renameSuperset(block.exercises[0], e.target.value);
                                }
                              }}
                            />
                          ) : (
                            <span className="badge superset-badge">{block.label || 'Superset'}</span>
                          )}
                        </div>
                        <div className="superset-head-actions">
                          <span className="muted">{block.exercises.length} exercises</span>
                          {canEdit && block.exercises.length < 3 && (
                            <button type="button" className="btn small secondary" onClick={() => setPanel(openAddPanelState(sec.id, block.groupId))}>
                              + Add
                            </button>
                          )}
                          {canEdit && (
                            <button type="button" className="btn small secondary" onClick={() => void breakSuperset(block.exercises[0])}>
                              Break
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="superset-exercises">
                        {block.exercises.map((ex: any) => (
                          <TemplateExerciseCard
                            key={ex.id}
                            ex={ex}
                            catalogItem={catalogItemFor(ex)}
                            searchPool={searchCatalogPool}
                            inSuperset
                            canEdit={canEdit}
                            collapsed={!!collapsed[ex.id]}
                            nameSearch={nameSearch}
                            namePickRef={namePickRef}
                            weightUnit={weightUnit}
                            busy={busy}
                            onToggleCollapse={() => setCollapsed((prev) => ({ ...prev, [ex.id]: !prev[ex.id] }))}
                            onNameSearch={setNameSearch}
                            onRename={(name) => void renameExercise(ex, name)}
                            onPickCatalog={(item) => void replaceWithCatalog(ex, item)}
                            onMuscle={(v) => void updateMuscle(ex, v)}
                            onOpenGuide={setGuide}
                            onChange={() => setPanel(openReplacePanelState(ex))}
                            onAddSet={() => void addSet(ex)}
                            onRemove={() => void removeExercise(ex)}
                            onUpdateSet={(set, field, value) => void updateSet(ex, set, field, value)}
                            onRemoveSet={(set) => void removeSet(ex, set)}
                          />
                        ))}
                      </div>
                    </div>
                    )
                  : (
                    <TemplateExerciseCard
                      key={block.exercises[0].id}
                      ex={block.exercises[0]}
                      catalogItem={catalogItemFor(block.exercises[0])}
                      searchPool={searchCatalogPool}
                      canEdit={canEdit}
                      collapsed={!!collapsed[block.exercises[0].id]}
                      nameSearch={nameSearch}
                      namePickRef={namePickRef}
                      weightUnit={weightUnit}
                      busy={busy}
                      onToggleCollapse={() =>
                        setCollapsed((prev) => ({ ...prev, [block.exercises[0].id]: !prev[block.exercises[0].id] }))
                      }
                      onNameSearch={setNameSearch}
                      onRename={(name) => void renameExercise(block.exercises[0], name)}
                      onPickCatalog={(item) => void replaceWithCatalog(block.exercises[0], item)}
                      onMuscle={(v) => void updateMuscle(block.exercises[0], v)}
                      onOpenGuide={setGuide}
                      onChange={() => setPanel(openReplacePanelState(block.exercises[0]))}
                      onAddSet={() => void addSet(block.exercises[0])}
                      onRemove={() => void removeExercise(block.exercises[0])}
                      onUpdateSet={(set, field, value) => void updateSet(block.exercises[0], set, field, value)}
                      onRemoveSet={(set) => void removeSet(block.exercises[0], set)}
                    />
                    )
            )}
            {canEdit && (
              <div className="section-add-row">
                <button type="button" className="btn secondary" onClick={() => setPanel(openAddPanelState(sec.id))}>
                  + Add Exercise
                </button>
              </div>
            )}
            {!exercises.length && !canEdit && <p className="muted section-empty">No {sec.label.toLowerCase()} exercises.</p>}
          </div>
        );
      })}

      {error && <p className="pd-error">{error}</p>}

      {panel && (
        <AddExercisePanel
          panel={panel}
          catalog={searchCatalogPool}
          equipment={equipment}
          supersetGroups={getSupersetGroupsForSection(workout, panel.section).filter((g: any) => g.count < 3)}
          pendingGroupCount={
            panel.config.mode === 'superset' && panel.config.supersetGroupId && panel.config.supersetGroupId !== '__new__'
              ? sectionExercises(workout, panel.section).filter((e: any) => e.superset_group_id === panel.config.supersetGroupId).length
              : undefined
          }
          onChange={setPanel}
          onPick={(item) => void pickFromPanel(item)}
          onCreateCustom={() => void createCustom()}
          onConfirm={() => void confirmAdd()}
          onOpenGuide={setGuide}
          onClose={() => setPanel(null)}
        />
      )}

      {guide && (
        <div className="panel-overlay" onClick={() => setGuide(null)}>
          <div className="exercise-guide-panel card" onClick={(e) => e.stopPropagation()}>
            <div className="topline" style={{ justifyContent: 'space-between' }}>
              <h2>{guide.title}</h2>
              <button type="button" className="btn small secondary" onClick={() => setGuide(null)}>
                Close
              </button>
            </div>
            {guide.embedUrl && (
              <div className="guide-embed-wrap">
                <iframe className="guide-embed" src={guide.embedUrl} title={`${guide.title} demo`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            )}
            {!guide.embedUrl && guide.videoUrl && <video className="guide-video" src={guide.videoUrl} controls playsInline />}
            {guide.images?.length > 0 && (
              <div className="guide-images">
                {guide.images.map((src) => (
                  <img key={src} className="guide-image" src={src} alt={guide.title} loading="eager" referrerPolicy="no-referrer" />
                ))}
              </div>
            )}
            {guide.instructions && (
              <>
                <h3 className="guide-section-title">How to perform</h3>
                <div className="panel-instructions guide-instructions">{guide.instructions}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateExerciseCard({
  ex,
  catalogItem,
  searchPool,
  inSuperset = false,
  canEdit,
  collapsed,
  nameSearch,
  namePickRef,
  weightUnit,
  busy,
  onToggleCollapse,
  onNameSearch,
  onRename,
  onPickCatalog,
  onMuscle,
  onOpenGuide,
  onChange,
  onAddSet,
  onRemove,
  onUpdateSet,
  onRemoveSet,
}: {
  ex: any;
  catalogItem: any;
  searchPool: any[];
  inSuperset?: boolean;
  canEdit: boolean;
  collapsed: boolean;
  nameSearch: { exerciseId: string; query: string } | null;
  namePickRef: { current: boolean };
  weightUnit: string;
  busy: boolean;
  onToggleCollapse: () => void;
  onNameSearch: (next: { exerciseId: string; query: string } | null) => void;
  onRename: (name: string) => void;
  onPickCatalog: (item: any) => void;
  onMuscle: (value: string) => void;
  onOpenGuide: (payload: ExerciseGuidePayload) => void;
  onChange: () => void;
  onAddSet: () => void;
  onRemove: () => void;
  onUpdateSet: (set: any, field: string, value: any) => void;
  onRemoveSet: (set: any) => void;
}) {
  const exType = exerciseTypeOf(ex, catalogItem);
  const thumb = getExerciseThumb(catalogItem);
  const showGuide = hasExerciseGuide(catalogItem);
  const payload = getExerciseGuidePayload(catalogItem, ex.name);
  const isEditingName = nameSearch?.exerciseId === ex.id;
  const nameQuery = isEditingName ? nameSearch!.query : ex.name || '';
  const nameResults =
    isEditingName && nameQuery.trim() ? searchCatalog(searchPool, { query: nameQuery, limit: 8 }) : [];
  const sets = plannedSets(ex);
  const cardKey = `${ex.id}:${ex.catalog_exercise_id || 'n'}:${ex.name}`;

  return (
    <div className={`card exercise-card${inSuperset ? ' in-superset' : ''}${collapsed ? ' exercise-collapsed' : ''}`} data-exercise-id={ex.id}>
      <div className="exercise-head" data-exercise-head={ex.id}>
        <div className="exercise-head-main">
          {thumb &&
            (showGuide && payload ? (
              <button type="button" className="exercise-card-thumb-btn" title={payload.hasVideo ? 'Watch form' : 'Form guide'} onClick={() => onOpenGuide(payload)}>
                <img className="exercise-card-thumb" src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ) : (
              <img className="exercise-card-thumb" src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ))}
          <div className="exercise-meta">
            {canEdit ? (
              <div className="exercise-title-row">
                <div className="typeahead-wrap exercise-name-wrap">
                  <textarea
                    className="exercise-name"
                    rows={1}
                    key={`${cardKey}-name`}
                    value={nameQuery}
                    title="Type to search catalog — pick a match or blur to save custom name"
                    onFocus={() => onNameSearch({ exerciseId: ex.id, query: ex.name || '' })}
                    onChange={(e) => onNameSearch({ exerciseId: ex.id, query: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      setTimeout(() => {
                        if (namePickRef.current) {
                          namePickRef.current = false;
                          return;
                        }
                        onNameSearch(null);
                        if (v && v !== ex.name) onRename(v);
                      }, 180);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') onNameSearch(null);
                    }}
                  />
                  {isEditingName && nameQuery.trim() && nameResults.length > 0 && (
                    <div className="typeahead-menu exercise-name-menu">
                      {nameResults.map((item: any) => (
                        <button
                          type="button"
                          key={item.id}
                          className="typeahead-item catalog-search-item"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            namePickRef.current = true;
                            onNameSearch(null);
                            onPickCatalog(item);
                          }}
                        >
                          {getExerciseThumb(item) && (
                            <img className="catalog-search-thumb" src={getExerciseThumb(item) || ''} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          )}
                          <span className="catalog-search-body">
                            <b>{item.name}</b>
                            <span className="muted">{catalogResultMeta(item)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {isEditingName && nameQuery.trim() && !nameResults.length && (
                    <div className="typeahead-menu exercise-name-menu">
                      <p className="muted typeahead-empty">No catalog matches — blur to keep a custom name</p>
                    </div>
                  )}
                </div>
                <input
                  className="exercise-muscle"
                  key={`${cardKey}-muscle`}
                  placeholder="Muscle"
                  defaultValue={ex.muscle_group || ''}
                  onBlur={(e) => {
                    if ((e.target.value || '') !== (ex.muscle_group || '')) onMuscle(e.target.value);
                  }}
                />
                <span className="badge exercise-type-badge">{exType}</span>
              </div>
            ) : (
              <div className="exercise-title-row">
                <h3 className="exercise-name-text">{ex.name}</h3>
                <span className="badge exercise-muscle-badge">{ex.muscle_group || 'Muscle'}</span>
                <span className="badge exercise-type-badge">{exType}</span>
              </div>
            )}
            {canEdit && !ex.catalog_exercise_id && (
              <p className="muted exercise-link-hint">No catalog link — edit name or use Change to get form guide</p>
            )}
            {collapsed && (
              <p className="muted exercise-collapse-summary">
                {sets.length} set{sets.length === 1 ? '' : 's'}
                {inSuperset ? ' · superset' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="exercise-head-actions">
          <button type="button" className="btn small secondary exercise-collapse-btn" onClick={onToggleCollapse} aria-expanded={!collapsed}>
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          {!collapsed && showGuide && payload && (
            <button type="button" className="btn small secondary" onClick={() => onOpenGuide(payload)}>
              {payload.hasVideo ? 'Watch form' : 'Form guide'}
            </button>
          )}
          {!collapsed && canEdit && (
            <div className="actions">
              <button type="button" className="btn small secondary" title="Search catalog and replace this exercise" onClick={onChange}>
                Change
              </button>
              <button type="button" className="btn small secondary" onClick={onAddSet} disabled={busy}>
                + Set
              </button>
              <button type="button" className="btn small red" onClick={onRemove} disabled={busy}>
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="pd-planned-sets">
          {sets.map((set: any) => (
            <div key={set.id} className="set-log-card">
              <div className="set-log-grid">
                <div className="set-log-head">
                  <span className="set-log-num">Set {set.set_number}</span>
                  <select
                    className="set-type-select"
                    value={set.set_type || 'working'}
                    disabled={!canEdit || busy}
                    aria-label="Set type"
                    onChange={(e) => onUpdateSet(set, 'set_type', e.target.value)}
                  >
                    {SET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="log-field-row log-field-row-compact log-field-row-metrics">
                  <label className="log-field-card log-field-card-normal">
                    <span>Reps</span>
                    <input
                      className="log-input-card"
                      disabled={!canEdit || busy}
                      placeholder="8-12"
                      defaultValue={set.target_reps || ''}
                      key={`${set.id}-reps-${set.target_reps || ''}`}
                      onBlur={(e) => onUpdateSet(set, 'target_reps', e.target.value)}
                    />
                  </label>
                  <label className="log-field-card log-field-card-normal">
                    <span>Weight ({weightUnit})</span>
                    <input
                      className="log-input-card"
                      defaultValue={set.target_weight || ''}
                      disabled={!canEdit || busy}
                      placeholder={weightUnit}
                      key={`${set.id}-wt-${set.target_weight || ''}`}
                      onBlur={(e) => onUpdateSet(set, 'target_weight', e.target.value || null)}
                    />
                  </label>
                  <label className="log-field-card log-field-card-compact">
                    <span>RIR</span>
                    <input
                      className="log-input-card log-input-compact"
                      defaultValue={set.target_rir ?? ''}
                      disabled={!canEdit || busy}
                      placeholder="RIR"
                      inputMode="decimal"
                      key={`${set.id}-rir-${set.target_rir ?? ''}`}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        onUpdateSet(set, 'target_rir', e.target.value === '' || !Number.isFinite(n) ? null : n);
                      }}
                    />
                  </label>
                </div>
                {canEdit && (
                  <div className="set-log-rail">
                    <button type="button" className="btn small red set-remove-btn" disabled={busy} onClick={() => onRemoveSet(set)} aria-label="Remove set">
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
