import { inferExerciseType } from './exerciseTypes';
import { exerciseSection, sectionExercises } from '../programDesign/workoutPreview';

export const WORKOUT_TEMPLATE_SECTIONS = [
  { id: 'warmup', label: 'Warm Up / Prep' },
  { id: 'strength', label: 'Strength' },
  { id: 'cooldown', label: 'Cooldown / Stretch' },
];

export const SECTION_SORT_BASE: Record<string, number> = { warmup: 0, strength: 100, cooldown: 200 };

export type AddPanelMode = 'normal' | 'superset';
export type AddPanelStep = 'search' | 'custom' | 'configure';

export type AddPanelFilters = {
  muscle: string;
  equipment: string;
  exerciseType: string;
  guidesOnly: boolean;
};

export type AddPanelConfig = {
  mode: AddPanelMode;
  supersetGroupId: string | null;
  setCount: number;
  targetReps: string;
  targetWeight: string;
};

export type AddPanelState = {
  section: string;
  step: AddPanelStep;
  query: string;
  filters: AddPanelFilters;
  picked: any | null;
  config: AddPanelConfig;
  custom: { name: string; category: string; muscle_group: string; equipment: string; movement_pattern: string };
  replaceTarget: any | null;
};

export function emptyAddPanelFilters(): AddPanelFilters {
  return { muscle: '', equipment: '', exerciseType: '', guidesOnly: false };
}

export function emptyAddPanelConfig(): AddPanelConfig {
  return { mode: 'normal', supersetGroupId: null, setCount: 3, targetReps: '8-12', targetWeight: '' };
}

export function emptyAddPanelCustom() {
  return { name: '', category: 'strength', muscle_group: '', equipment: '', movement_pattern: '' };
}

export function sectionDefaultSets(section: string) {
  return section === 'warmup' || section === 'cooldown' ? 1 : 3;
}

export function addPanelSectionLabel(section: string) {
  return WORKOUT_TEMPLATE_SECTIONS.find((s) => s.id === section)?.label || section;
}

export function nextExerciseSortOrder(workout: any, section: string) {
  const list = sectionExercises(workout, section);
  const base = SECTION_SORT_BASE[section] ?? 100;
  return list.length ? Math.max(...list.map((e: any) => e.sort_order || 0)) + 1 : base;
}

export function makeSupersetGroupId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nextSupersetLabel(workout: any, section: string) {
  const exs = sectionExercises(workout, section).filter((e: any) => e.superset_group_id);
  const nums = exs.map((e: any) => {
    const m = String(e.superset_label || '').match(/Superset\s+([A-Z])/i);
    return m ? m[1].charCodeAt(0) - 64 : 0;
  });
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `Superset ${String.fromCharCode(64 + n)}`;
}

export function groupSectionBlocks(exercises: any[]) {
  const blocks: any[] = [];
  const groups = new Map<string, any>();
  (exercises || []).forEach((ex: any) => {
    const gid = ex.superset_group_id;
    if (!gid) {
      blocks.push({ type: 'single', exercises: [ex], anchor: ex.sort_order || 0 });
      return;
    }
    if (!groups.has(gid)) {
      groups.set(gid, {
        type: 'superset',
        groupId: gid,
        label: ex.superset_label || 'Superset',
        exercises: [],
        anchor: ex.sort_order || 0,
      });
    }
    const g = groups.get(gid);
    g.exercises.push(ex);
    g.anchor = Math.min(g.anchor, ex.sort_order || 0);
    if (ex.superset_label) g.label = ex.superset_label;
  });
  groups.forEach((g) => {
    g.exercises.sort((a: any, c: any) => (a.superset_order || 0) - (c.superset_order || 0));
    blocks.push(g);
  });
  blocks.sort((a: any, b: any) => (a.anchor || 0) - (b.anchor || 0));
  return blocks;
}

export function getSupersetGroupsForSection(workout: any, section: string) {
  const exs = sectionExercises(workout, section);
  const groups: any[] = [];
  const seen = new Set();
  exs.forEach((ex: any) => {
    if (!ex.superset_group_id || seen.has(ex.superset_group_id)) return;
    seen.add(ex.superset_group_id);
    const members = exs
      .filter((e: any) => e.superset_group_id === ex.superset_group_id)
      .sort((a: any, b: any) => (a.superset_order || 0) - (b.superset_order || 0));
    if (members.length >= 1) {
      groups.push({
        id: ex.superset_group_id,
        label: ex.superset_label || members.map((e: any) => e.name).join(' + '),
        count: members.length,
        sortOrder: Math.min(...members.map((m: any) => m.sort_order || 0)),
      });
    }
  });
  return groups.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function catalogPayloadFromItem(catalogItem: any, section: string) {
  return {
    name: catalogItem.name,
    muscle_group: catalogItem.muscle_group || '',
    catalog_exercise_id: catalogItem.id,
    exercise_type: inferExerciseType(catalogItem.name, catalogItem.muscle_group, section, catalogItem.exercise_type),
  };
}

export function matchingExercise(targetWorkout: any, sourceExercise: any) {
  const exs = targetWorkout?.st_exercises || [];
  if (sourceExercise.catalog_exercise_id) {
    const byCat = exs.find(
      (e: any) =>
        e.sort_order === sourceExercise.sort_order && e.catalog_exercise_id === sourceExercise.catalog_exercise_id
    );
    if (byCat) return byCat;
  }
  const bySortName = exs.find((e: any) => e.sort_order === sourceExercise.sort_order && e.name === sourceExercise.name);
  if (bySortName) return bySortName;
  return (
    (sourceExercise.catalog_exercise_id && exs.find((e: any) => e.catalog_exercise_id === sourceExercise.catalog_exercise_id)) ||
    exs.find((e: any) => e.name === sourceExercise.name) ||
    null
  );
}

export function matchingSet(targetExercise: any, sourceSet: any) {
  if (!targetExercise || !sourceSet) return null;
  return (
    (targetExercise.st_planned_sets || []).find((s: any) => s.id === sourceSet.id) ||
    (targetExercise.st_planned_sets || []).find((s: any) => s.sort_order === sourceSet.sort_order) ||
    (targetExercise.st_planned_sets || []).find(
      (s: any) => s.set_type === sourceSet.set_type && s.set_number === sourceSet.set_number
    ) ||
    null
  );
}

export function siblingWorkouts(all: any[], current: any, remainingWeeks: boolean) {
  if (!remainingWeeks) return [current];
  return (all || []).filter(
    (w: any) => w.day_label === current.day_label && Number(w.week) >= Number(current.week)
  );
}

export type ExerciseMovePlan =
  | { kind: 'superset_order'; a: any; b: any; myOrder: number; otherOrder: number }
  | { kind: 'sort_order'; rows: Array<{ source: any; sort_order: number }> }
  | { kind: 'noop' };

/** Same reorder rules as Training: swap inside a superset first, otherwise swap section blocks. */
export function planExerciseMove(workout: any, exercise: any, dir: number): ExerciseMovePlan {
  const section = exerciseSection(exercise);
  const gid = exercise.superset_group_id;
  if (gid) {
    const groupMembers = sectionExercises(workout, section)
      .filter((x: any) => x.superset_group_id === gid)
      .sort((a: any, b: any) => (a.superset_order || 0) - (b.superset_order || 0));
    const idx = groupMembers.findIndex((x: any) => x.id === exercise.id);
    const innerSwap = idx + dir;
    if (idx >= 0 && innerSwap >= 0 && innerSwap < groupMembers.length) {
      const other = groupMembers[innerSwap];
      return {
        kind: 'superset_order',
        a: exercise,
        b: other,
        myOrder: exercise.superset_order || idx + 1,
        otherOrder: other.superset_order || innerSwap + 1,
      };
    }
  }
  const exercises = sectionExercises(workout, section);
  const blocks = groupSectionBlocks(exercises);
  const blockIdx = blocks.findIndex((b: any) =>
    b.type === 'superset' ? b.exercises.some((x: any) => x.id === exercise.id) : b.exercises[0]?.id === exercise.id
  );
  const swapIdx = blockIdx + dir;
  if (blockIdx < 0 || swapIdx < 0 || swapIdx >= blocks.length) return { kind: 'noop' };
  const reordered = [...blocks];
  const tmp = reordered[blockIdx];
  reordered[blockIdx] = reordered[swapIdx];
  reordered[swapIdx] = tmp;
  const base = SECTION_SORT_BASE[section] ?? 100;
  let sort = base;
  const rows: Array<{ source: any; sort_order: number }> = [];
  reordered.forEach((b: any) => {
    b.exercises.forEach((ex: any) => {
      rows.push({ source: ex, sort_order: sort });
      sort += 1;
    });
  });
  return { kind: 'sort_order', rows };
}

export function openAddPanelState(section: string, supersetGroupId?: string | null): AddPanelState {
  const pending = !!supersetGroupId;
  return {
    section,
    step: 'search',
    query: '',
    filters: emptyAddPanelFilters(),
    picked: null,
    config: pending
      ? { ...emptyAddPanelConfig(), mode: 'superset', supersetGroupId: supersetGroupId || null, setCount: sectionDefaultSets(section) }
      : { ...emptyAddPanelConfig(), setCount: sectionDefaultSets(section) },
    custom: emptyAddPanelCustom(),
    replaceTarget: null,
  };
}

export function openReplacePanelState(ex: any): AddPanelState {
  return {
    section: exerciseSection(ex),
    step: 'search',
    query: ex?.name || '',
    filters: emptyAddPanelFilters(),
    picked: null,
    config: emptyAddPanelConfig(),
    custom: emptyAddPanelCustom(),
    replaceTarget: ex,
  };
}
