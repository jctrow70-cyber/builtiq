export const EXERCISE_TYPES = ['strength', 'cardio', 'mobility', 'bodyweight', 'timed', 'custom'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

const CARDIO_NAME_RE = /walk|run|bike|row|elliptical|swim|assault|jog|sprint|cycle/i;

export function inferExerciseType(name = '', muscle = '', category = '', catalogType?: string): ExerciseType {
  const t = String(catalogType || '').toLowerCase();
  if (EXERCISE_TYPES.includes(t as ExerciseType)) return t as ExerciseType;
  if (category === 'mobility') return 'mobility';
  if (category === 'warmup' && CARDIO_NAME_RE.test(name)) return 'cardio';
  if (CARDIO_NAME_RE.test(name) || muscle.toLowerCase() === 'cardio') return 'cardio';
  if (/plank|carry|hold|timed/i.test(name)) return 'timed';
  if (/push-up|pull-up|chin-up|dip|burpee|bodyweight/i.test(name)) return 'bodyweight';
  return 'strength';
}

export function exerciseTypeOf(ex: any, catalogItem?: any): ExerciseType {
  const fromEx = String(ex?.exercise_type || '').toLowerCase();
  if (EXERCISE_TYPES.includes(fromEx as ExerciseType)) return fromEx as ExerciseType;
  const fromCat = catalogItem?.exercise_type || ex?.st_exercise_catalog?.exercise_type;
  if (fromCat && EXERCISE_TYPES.includes(String(fromCat).toLowerCase() as ExerciseType)) {
    return String(fromCat).toLowerCase() as ExerciseType;
  }
  return inferExerciseType(ex?.name, ex?.muscle_group, exerciseSection(ex), fromCat);
}

export function isCardioType(type: ExerciseType) {
  return type === 'cardio';
}

export function isStrengthLike(type: ExerciseType) {
  return type === 'strength' || type === 'bodyweight' || type === 'custom';
}

export function assignmentTypeLabel(t: string) {
  if (t === 'team') return 'Team Plan';
  if (t === 'personal') return 'Personal Plan';
  if (t === 'individual_team') return 'Individual Team Plan';
  if (t === 'manual') return 'Manual';
  return t || 'Team Plan';
}

function exerciseSection(ex: any) {
  return ex?.section || 'strength';
}

export function supersetSlotLabel(groupIndex: number, slotOrder: number) {
  const letter = String.fromCharCode(64 + Math.max(1, slotOrder || 1));
  return `${groupIndex || 1}${letter}`;
}
