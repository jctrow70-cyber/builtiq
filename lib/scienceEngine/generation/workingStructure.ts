import type { MuscleId } from '../taxonomy';
import type { AiStrengthExercise, AiWorkoutPlan, DesignerExercise } from './types';

export type WorkingStructure = {
  openMuscle: MuscleId | null;
  closeMuscle: MuscleId | null;
  middlePushPullSuperset: boolean;
  middleCore: boolean;
};

const GLUTE_NAME = /glute|hip thrust|kickback|hip abduction|frog pump|pull-through/i;
const GLUTE_ANCHOR_EXCLUDE = /deadlift|\brdl\b|squat|lunge|step-?up|good morning/i;
const CORE_NAME = /plank|pallof|dead bug|crunch|carry|core|ab wheel|hollow|chop|woodchop|bird.?dog|russian twist|sit-?up|leg raise|deadbug/i;
const CORE_PATTERN = /^(core|rotation)/i;

export function parseWorkingStructure(text: string): WorkingStructure | null {
  const raw = String(text || '');
  const startEndGlute =
    /start and end[^.!?\n]{0,100}glute/i.test(raw) ||
    /start[^.!?\n]{0,60}glute[^.!?\n]{0,100}end[^.!?\n]{0,60}glute/i.test(raw) ||
    /working portion with glute/i.test(raw);
  const pushPull = /push\s*\/\s*pull(\s+superset)?|push-pull(\s+superset)?|push and pull superset/i.test(raw);
  const core = /\bcore exercise\b|\ba core\b|include a core/i.test(raw);
  const middle = /in the middle|middle (include|do|portion)/i.test(raw);
  if (!startEndGlute && !(pushPull && middle) && !(core && middle)) return null;
  return {
    openMuscle: startEndGlute ? 'glutes' : null,
    closeMuscle: startEndGlute ? 'glutes' : null,
    middlePushPullSuperset: Boolean(pushPull && (middle || startEndGlute)),
    middleCore: Boolean(core && (middle || startEndGlute)),
  };
}

export function hasWorkingStructure(structure?: WorkingStructure | null): boolean {
  if (!structure) return false;
  return Boolean(
    structure.openMuscle || structure.closeMuscle || structure.middlePushPullSuperset || structure.middleCore
  );
}

export function flattenWorking(workout: AiWorkoutPlan): AiStrengthExercise[] {
  return (workout.strength || []).flatMap((block) => block.exercises || []);
}

export function trainsFocusMuscle(meta: DesignerExercise | undefined, muscle: MuscleId | null): boolean {
  if (!meta || !muscle) return false;
  if (meta.primary_muscles.includes(muscle)) return true;
  if (muscle === 'glutes') return GLUTE_NAME.test(meta.name) || meta.secondary_muscles.includes('glutes');
  if (muscle === 'abs') return isCoreExercise(meta);
  return meta.secondary_muscles.includes(muscle);
}

/** Open/close anchors must be the requested muscle, not an incidental secondary credit. */
export function isFocusAnchor(meta: DesignerExercise | undefined, muscle: MuscleId | null): boolean {
  if (!meta || !muscle) return false;
  if (muscle === 'glutes') {
    if (GLUTE_NAME.test(meta.name)) return true;
    if (GLUTE_ANCHOR_EXCLUDE.test(meta.name)) return false;
    return meta.primary_muscles.includes('glutes');
  }
  if (meta.primary_muscles.includes(muscle)) return true;
  if (muscle === 'abs') return isCoreExercise(meta);
  return false;
}

export function isPushPattern(pattern: string): boolean {
  return pattern === 'horizontal_push' || pattern === 'vertical_push';
}

export function isPullPattern(pattern: string): boolean {
  return pattern === 'horizontal_pull' || pattern === 'vertical_pull';
}

export function isCoreMovement(opts: { name?: string; movement_pattern?: string; primary_muscles?: string[] }): boolean {
  const muscles = opts.primary_muscles || [];
  if (muscles.some((muscle) => muscle === 'abs' || muscle === 'obliques')) return true;
  if (CORE_PATTERN.test(String(opts.movement_pattern || ''))) return true;
  return CORE_NAME.test(String(opts.name || ''));
}

export function isCoreExercise(meta: DesignerExercise | undefined): boolean {
  if (!meta) return false;
  return isCoreMovement({
    name: meta.name,
    movement_pattern: meta.movement_pattern,
    primary_muscles: meta.primary_muscles,
  });
}

export function structureProtectedIds(
  workout: AiWorkoutPlan,
  structure: WorkingStructure | null | undefined,
  library: Map<string, DesignerExercise>
): Set<string> {
  const ids = new Set<string>();
  if (!hasWorkingStructure(structure)) return ids;
  const working = flattenWorking(workout);
  const first = working[0];
  const last = working[working.length - 1];
  if (first && isFocusAnchor(library.get(first.exercise_id), structure?.openMuscle || 'glutes')) {
    ids.add(first.exercise_id);
  }
  if (last && isFocusAnchor(library.get(last.exercise_id), structure?.closeMuscle || 'glutes')) {
    ids.add(last.exercise_id);
  }
  (workout.strength || []).forEach((block) => {
    if (block.type === 'straight_sets' || (block.exercises || []).length < 2) return;
    const metas = (block.exercises || []).map((ex) => library.get(ex.exercise_id));
    const push = metas.some((meta) => meta && isPushPattern(meta.movement_pattern));
    const pull = metas.some((meta) => meta && isPullPattern(meta.movement_pattern));
    if (push && pull) block.exercises.forEach((ex) => ids.add(ex.exercise_id));
  });
  working.forEach((ex) => {
    if (isCoreExercise(library.get(ex.exercise_id))) ids.add(ex.exercise_id);
  });
  return ids;
}

export function inspectWorkingStructure(
  workout: AiWorkoutPlan,
  structure: WorkingStructure,
  library: Map<string, DesignerExercise>
): { ok: boolean; misses: string[] } {
  const misses: string[] = [];
  const working = flattenWorking(workout);
  if (!working.length) return { ok: false, misses: ['Working portion is empty'] };
  const first = library.get(working[0].exercise_id);
  const last = library.get(working[working.length - 1].exercise_id);
  if (structure.openMuscle && !isFocusAnchor(first, structure.openMuscle)) {
    misses.push(`Working portion starts with ${first?.name || 'an unknown lift'} instead of a ${structure.openMuscle} exercise`);
  }
  if (structure.closeMuscle && !isFocusAnchor(last, structure.closeMuscle)) {
    misses.push(`Working portion ends with ${last?.name || 'an unknown lift'} instead of a ${structure.closeMuscle} exercise`);
  }
  if (structure.middlePushPullSuperset) {
    const hasPair = (workout.strength || []).some((block) => {
      if (block.type === 'straight_sets' || (block.exercises || []).length < 2) return false;
      const metas = block.exercises.map((ex) => library.get(ex.exercise_id));
      return metas.some((meta) => meta && isPushPattern(meta.movement_pattern)) &&
        metas.some((meta) => meta && isPullPattern(meta.movement_pattern));
    });
    if (!hasPair) misses.push('Middle of the working portion needs a structured push/pull superset');
  }
  if (structure.middleCore) {
    const middle = working.slice(1, -1);
    const hasCore = middle.some((ex) => isCoreExercise(library.get(ex.exercise_id)));
    if (!hasCore) misses.push('Middle of the working portion needs a core exercise');
  }
  return { ok: misses.length === 0, misses };
}
