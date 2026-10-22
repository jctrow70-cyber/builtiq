import { plannedSets, sectionExercises } from '../programDesign/workoutPreview';
import type { SetTypeValue } from './setTypes';
import {
  catalogPayloadFromItem,
  getSupersetGroupsForSection,
  makeSupersetGroupId,
  nextExerciseSortOrder,
  nextSupersetLabel,
  planExerciseMove,
  sectionDefaultSets,
  type AddPanelConfig,
} from './workoutTemplate';

const SET_TYPE_VALUES = new Set<SetTypeValue>(['warmup', 'working', 'backoff', 'dropset', 'amrap']);

export type DraftSet = {
  id: string;
  sort_order: number;
  set_number: number;
  set_type: SetTypeValue;
  target_weight: string;
  target_reps: string;
  target_rir: number | null;
  rest_seconds: number | null;
  is_deleted?: boolean;
};

export type DraftExercise = {
  id: string;
  sort_order: number;
  name: string;
  muscle_group: string;
  notes: string;
  section: string;
  superset_group_id: string | null;
  superset_label: string | null;
  superset_order: number | null;
  catalog_exercise_id: string | null;
  equipment: string | null;
  exercise_type: string;
  st_planned_sets: DraftSet[];
};

export type DraftWorkout = {
  id: string;
  day_label: string;
  st_exercises: DraftExercise[];
};

export type GroupStrengthExercisePayload = {
  name: string;
  muscle_group: string | null;
  notes: string | null;
  section: string;
  sort_order: number;
  catalog_exercise_id: string | null;
  equipment: string | null;
  exercise_type: string;
  superset_key: string | null;
  sets: Array<{
    sort_order: number;
    set_number: number;
    set_type: SetTypeValue;
    target_weight: string | null;
    target_reps: string | null;
    target_rir: number | null;
    rest_seconds: number | null;
  }>;
};

function localId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyDraftWorkout(title = 'Workout'): DraftWorkout {
  return { id: localId(), day_label: title, st_exercises: [] };
}

export function defaultDraftSetType(section: string): SetTypeValue {
  return section === 'warmup' ? 'warmup' : 'working';
}

function blankSet(section: string, index: number, sample?: Partial<DraftSet>): DraftSet {
  return {
    id: localId(),
    sort_order: index,
    set_number: index + 1,
    set_type: sample?.set_type || defaultDraftSetType(section),
    target_weight: sample?.target_weight || '',
    target_reps: sample?.target_reps || '',
    target_rir: sample?.target_rir ?? null,
    rest_seconds: sample?.rest_seconds ?? null,
  };
}

function replaceExercise(workout: DraftWorkout, exerciseId: string, next: DraftExercise): DraftWorkout {
  return {
    ...workout,
    st_exercises: workout.st_exercises.map((exercise) => (exercise.id === exerciseId ? next : exercise)),
  };
}

export function addDraftExercise(
  workout: DraftWorkout,
  input: { section: string; picked: any; config: AddPanelConfig }
): { workout: DraftWorkout; supersetGroupId: string | null; openAnother: boolean; error: string | null } {
  const { section, picked, config } = input;
  let groupId: string | null = null;
  let supersetLabel: string | null = null;
  let slotOrder: number | null = null;
  let existing: DraftExercise[] = [];
  if (config.mode === 'superset') {
    groupId = !config.supersetGroupId || config.supersetGroupId === '__new__' ? makeSupersetGroupId() : config.supersetGroupId;
    existing = sectionExercises(workout, section).filter((exercise: DraftExercise) => exercise.superset_group_id === groupId);
    if (existing.length >= 3) return { workout, supersetGroupId: groupId, openAnother: false, error: 'That superset already has 3 exercises.' };
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
  const payload = catalogPayloadFromItem(picked, section);
  const setCount = Math.max(1, Number(config.setCount) || sectionDefaultSets(section));
  const exercise: DraftExercise = {
    id: localId(),
    sort_order: sortOrder,
    name: String(payload.name || picked?.name || '').trim(),
    muscle_group: payload.muscle_group || '',
    notes: '',
    section,
    superset_group_id: groupId,
    superset_label: supersetLabel,
    superset_order: slotOrder,
    catalog_exercise_id: payload.catalog_exercise_id || null,
    equipment: payload.equipment || null,
    exercise_type: payload.exercise_type || 'strength',
    st_planned_sets: Array.from({ length: setCount }, (_, index) =>
      blankSet(section, index, {
        target_reps: config.targetReps || '',
        target_weight: config.targetWeight || '',
        set_type: defaultDraftSetType(section),
      })
    ),
  };
  const openAnother = config.mode === 'superset' && !!groupId && existing.length + 1 < 3;
  return {
    workout: { ...workout, st_exercises: [...workout.st_exercises, exercise] },
    supersetGroupId: groupId,
    openAnother,
    error: null,
  };
}

export function replaceDraftExercise(workout: DraftWorkout, exerciseId: string, picked: any): DraftWorkout {
  const current = workout.st_exercises.find((exercise) => exercise.id === exerciseId);
  if (!current) return workout;
  const payload = catalogPayloadFromItem(picked, current.section, current);
  return replaceExercise(workout, exerciseId, {
    ...current,
    name: String(payload.name || picked?.name || current.name),
    muscle_group: payload.muscle_group || '',
    catalog_exercise_id: payload.catalog_exercise_id || null,
    equipment: payload.equipment || null,
    exercise_type: payload.exercise_type || current.exercise_type,
  });
}

export function updateDraftExercise(
  workout: DraftWorkout,
  exerciseId: string,
  patch: Partial<Pick<DraftExercise, 'name' | 'equipment' | 'muscle_group'>>
): DraftWorkout {
  const current = workout.st_exercises.find((exercise) => exercise.id === exerciseId);
  if (!current) return workout;
  return replaceExercise(workout, exerciseId, { ...current, ...patch });
}

export function removeDraftExercise(workout: DraftWorkout, exerciseId: string): DraftWorkout {
  return { ...workout, st_exercises: workout.st_exercises.filter((exercise) => exercise.id !== exerciseId) };
}

export function moveDraftExercise(workout: DraftWorkout, exerciseId: string, direction: number): DraftWorkout {
  const exercise = workout.st_exercises.find((item) => item.id === exerciseId);
  if (!exercise) return workout;
  const plan = planExerciseMove(workout, exercise, direction);
  if (plan.kind === 'noop') return workout;
  if (plan.kind === 'superset_order') {
    return {
      ...workout,
      st_exercises: workout.st_exercises.map((item) => {
        if (item.id === plan.a.id) return { ...item, superset_order: plan.otherOrder };
        if (item.id === plan.b.id) return { ...item, superset_order: plan.myOrder };
        return item;
      }),
    };
  }
  const sorts = new Map(plan.rows.map((row) => [row.source.id, row.sort_order]));
  return {
    ...workout,
    st_exercises: workout.st_exercises.map((item) => (sorts.has(item.id) ? { ...item, sort_order: sorts.get(item.id) as number } : item)),
  };
}

export function addDraftSet(workout: DraftWorkout, exerciseId: string): DraftWorkout {
  const exercise = workout.st_exercises.find((item) => item.id === exerciseId);
  if (!exercise) return workout;
  const active = plannedSets(exercise) as DraftSet[];
  const sample = active[active.length - 1];
  const next = blankSet(exercise.section, active.length, sample);
  return replaceExercise(workout, exerciseId, { ...exercise, st_planned_sets: [...exercise.st_planned_sets, next] });
}

export function updateDraftSet(
  workout: DraftWorkout,
  exerciseId: string,
  setId: string,
  field: keyof Pick<DraftSet, 'set_type' | 'target_reps' | 'target_weight' | 'target_rir' | 'rest_seconds'>,
  value: string | number | null
): DraftWorkout {
  const exercise = workout.st_exercises.find((item) => item.id === exerciseId);
  if (!exercise) return workout;
  return replaceExercise(workout, exerciseId, {
    ...exercise,
    st_planned_sets: exercise.st_planned_sets.map((set) => {
      if (set.id !== setId) return set;
      if (field === 'set_type') {
        const next = String(value || 'working') as SetTypeValue;
        return { ...set, set_type: SET_TYPE_VALUES.has(next) ? next : 'working' };
      }
      if (field === 'target_rir' || field === 'rest_seconds') {
        if (value === '' || value == null) return { ...set, [field]: null };
        const parsed = Number(value);
        return { ...set, [field]: Number.isFinite(parsed) ? parsed : null };
      }
      return { ...set, [field]: value == null ? '' : String(value) };
    }),
  });
}

export function removeDraftSet(workout: DraftWorkout, exerciseId: string, setId: string): DraftWorkout {
  const exercise = workout.st_exercises.find((item) => item.id === exerciseId);
  if (!exercise) return workout;
  const remaining = exercise.st_planned_sets
    .filter((set) => set.id !== setId && !set.is_deleted)
    .map((set, index) => ({ ...set, sort_order: index, set_number: index + 1 }));
  return replaceExercise(workout, exerciseId, { ...exercise, st_planned_sets: remaining });
}

export function validateGroupStrengthDraft(workout: DraftWorkout): string | null {
  if (!workout.st_exercises.length) return 'Add at least one exercise.';
  for (const exercise of workout.st_exercises) {
    if (!exercise.name.trim()) return 'Name each exercise.';
    const sets = plannedSets(exercise) as DraftSet[];
    if (!sets.length) return `Add a set for ${exercise.name}.`;
    if (sets.some((set) => !SET_TYPE_VALUES.has(set.set_type))) return 'Choose a set type.';
  }
  return null;
}

export function groupStrengthExercisePayload(workout: DraftWorkout): GroupStrengthExercisePayload[] {
  return [...workout.st_exercises]
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0) || (left.superset_order || 0) - (right.superset_order || 0))
    .map((exercise) => ({
      name: exercise.name.trim(),
      muscle_group: exercise.muscle_group.trim() || null,
      notes: exercise.notes.trim() || null,
      section: exercise.section || 'strength',
      sort_order: exercise.sort_order,
      catalog_exercise_id: exercise.catalog_exercise_id,
      equipment: exercise.equipment?.trim() || null,
      exercise_type: exercise.exercise_type || 'strength',
      superset_key: exercise.superset_group_id,
      sets: (plannedSets(exercise) as DraftSet[]).map((set) => ({
        sort_order: set.sort_order,
        set_number: set.set_number,
        set_type: set.set_type,
        target_weight: set.target_weight.trim() || null,
        target_reps: set.target_reps.trim() || null,
        target_rir: set.target_rir,
        rest_seconds: set.rest_seconds,
      })),
    }));
}

export function draftSupersetGroups(workout: DraftWorkout, section: string) {
  return getSupersetGroupsForSection(workout, section);
}
