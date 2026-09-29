export const EXERCISE_TYPES = ['strength', 'cardio', 'mobility', 'bodyweight', 'timed', 'custom'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Whole-word cardio activities. Does not match strength "Row" or "Bicycle Crunch". */
const CARDIO_ACTIVITY_RE =
  /\b(?:walk(?:ing|s)?|run(?:ning|s)?|jog(?:ging|s)?|sprint(?:ing|s)?|rowing|rower|ergometer|cycl(?:e|ing)|bik(?:e|ing)|elliptical|swim(?:ming|s)?|assault)\b/i;

const CARDIO_CATEGORIES = /cardio|conditioning/;
const MOBILITY_CATEGORIES = /^(mobility|stretching)$/;
const STRENGTH_LIKE_CATEGORIES =
  /^(strength|compound|isolation|unilateral|core|power|bodyweight|accessory|plyometric|prehab|isometric)$/;

function normalizeCategory(category = '') {
  return String(category || '').trim().toLowerCase();
}

export function isCardioActivityName(name = '') {
  return CARDIO_ACTIVITY_RE.test(String(name || ''));
}

export function isAuthoritativeCardioCategory(category = '') {
  return CARDIO_CATEGORIES.test(normalizeCategory(category));
}

export function isStrengthLikeCategory(category = '') {
  return STRENGTH_LIKE_CATEGORIES.test(normalizeCategory(category));
}

export function inferExerciseType(name = '', muscle = '', category = '', catalogType?: string): ExerciseType {
  const cat = normalizeCategory(category);
  const muscleName = String(muscle || '').toLowerCase();

  if (MOBILITY_CATEGORIES.test(cat)) return 'mobility';
  if (isAuthoritativeCardioCategory(cat) || muscleName === 'cardio') return 'cardio';

  const stored = String(catalogType || '').toLowerCase();
  const storedValid = EXERCISE_TYPES.includes(stored as ExerciseType);

  if (storedValid) {
    const staleCardio =
      stored === 'cardio' && isStrengthLikeCategory(cat) && !isCardioActivityName(name) && muscleName !== 'cardio';
    if (!staleCardio) return stored as ExerciseType;
  }

  if (cat === 'warmup' && isCardioActivityName(name)) return 'cardio';
  if (isCardioActivityName(name)) return 'cardio';
  if (/plank|carry|hold|timed/i.test(name)) return 'timed';
  if (/push-up|pull-up|chin-up|dip|burpee|bodyweight/i.test(name)) return 'bodyweight';
  return 'strength';
}

export function exerciseTypeOf(ex: any, catalogItem?: any): ExerciseType {
  const masterCategory =
    catalogItem?.coaching_metadata?.master_category ||
    ex?.st_exercise_catalog?.coaching_metadata?.master_category ||
    catalogItem?.category ||
    '';
  const fromEx = String(ex?.exercise_type || '').toLowerCase();
  if (EXERCISE_TYPES.includes(fromEx as ExerciseType)) {
    const staleCardio =
      fromEx === 'cardio' &&
      (isStrengthLikeCategory(masterCategory) || isStrengthLikeCategory(exerciseSection(ex))) &&
      !isCardioActivityName(ex?.name) &&
      String(ex?.muscle_group || '').toLowerCase() !== 'cardio';
    if (!staleCardio) return fromEx as ExerciseType;
  }
  const fromCat = catalogItem?.exercise_type || ex?.st_exercise_catalog?.exercise_type;
  return inferExerciseType(ex?.name, ex?.muscle_group || catalogItem?.muscle_group, masterCategory || exerciseSection(ex), fromCat);
}

export function isCardioType(type: ExerciseType) {
  return type === 'cardio';
}

export function isStrengthLike(type: ExerciseType) {
  return type === 'strength' || type === 'bodyweight' || type === 'custom';
}

const MOBILITY_STRETCH_CATEGORIES = new Set(['mobility', 'stretching']);

/** Mobility and stretching work does not use last-session progression hints. */
export function isMobilityStretchExercise(ex: any, catalogItem?: any, exType?: ExerciseType): boolean {
  const type = exType || exerciseTypeOf(ex, catalogItem);
  if (type === 'mobility') return true;
  const cat = String(catalogItem?.category || ex?.st_exercise_catalog?.category || '').toLowerCase();
  return MOBILITY_STRETCH_CATEGORIES.has(cat);
}

export function assignmentTypeLabel(t: string) {
  if (t === 'team') return 'Group Plan';
  if (t === 'personal') return 'Personal Plan';
  if (t === 'individual_team') return 'Individual Group Plan';
  if (t === 'manual') return 'Manual';
  return t || 'Group Plan';
}

function exerciseSection(ex: any) {
  return ex?.section || 'strength';
}

export function supersetSlotLabel(groupIndex: number, slotOrder: number) {
  const letter = String.fromCharCode(64 + Math.max(1, slotOrder || 1));
  return `${groupIndex || 1}${letter}`;
}
