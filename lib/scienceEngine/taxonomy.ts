export const MUSCLE_IDS = [
  'chest',
  'upper_back',
  'lats',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'hip_flexors',
  'abs',
  'obliques',
  'spinal_erectors',
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];

export const MAJOR_MUSCLES: MuscleId[] = [
  'chest',
  'upper_back',
  'lats',
  'quads',
  'hamstrings',
  'glutes',
];

export const MOVEMENT_PATTERNS = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'knee_flexion',
  'elbow_flexion',
  'elbow_extension',
  'shoulder_abduction',
  'calf_raise',
  'core_flexion',
  'core_anti_extension',
  'core_anti_rotation',
  'rotation',
  'carry',
  'jump',
  'throw',
  'other',
] as const;

export type MovementPatternId = (typeof MOVEMENT_PATTERNS)[number];

export const MUSCLE_ALIASES: Record<string, MuscleId> = {
  chest: 'chest',
  pec: 'chest',
  pecs: 'chest',
  'upper chest': 'chest',
  'upper_back': 'upper_back',
  'upper back': 'upper_back',
  traps: 'upper_back',
  trap: 'upper_back',
  rhomboids: 'upper_back',
  back: 'upper_back',
  lats: 'lats',
  lat: 'lats',
  'latissimus dorsi': 'lats',
  shoulders: 'side_delts',
  shoulder: 'side_delts',
  delts: 'side_delts',
  deltoid: 'side_delts',
  'front delts': 'front_delts',
  'front delt': 'front_delts',
  'anterior deltoid': 'front_delts',
  'side delts': 'side_delts',
  'side delt': 'side_delts',
  'lateral deltoid': 'side_delts',
  'rear delts': 'rear_delts',
  'rear delt': 'rear_delts',
  'posterior deltoid': 'rear_delts',
  biceps: 'biceps',
  bicep: 'biceps',
  triceps: 'triceps',
  tricep: 'triceps',
  forearms: 'forearms',
  forearm: 'forearms',
  quads: 'quads',
  quad: 'quads',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  hamstring: 'hamstrings',
  glutes: 'glutes',
  glute: 'glutes',
  calves: 'calves',
  calf: 'calves',
  adductors: 'adductors',
  adductor: 'adductors',
  'hip flexors': 'hip_flexors',
  'hip flexor': 'hip_flexors',
  abs: 'abs',
  abdominals: 'abs',
  core: 'abs',
  obliques: 'obliques',
  oblique: 'obliques',
  'spinal erectors': 'spinal_erectors',
  erectors: 'spinal_erectors',
  'lower back': 'spinal_erectors',
};

export const FOCUS_TO_MUSCLE: Record<string, MuscleId> = {
  Chest: 'chest',
  chest: 'chest',
  Hamstrings: 'hamstrings',
  hamstrings: 'hamstrings',
  Quads: 'quads',
  quads: 'quads',
  Lats: 'lats',
  lats: 'lats',
  Traps: 'upper_back',
  traps: 'upper_back',
  Back: 'upper_back',
  back: 'upper_back',
  Shoulders: 'side_delts',
  shoulders: 'side_delts',
  Glutes: 'glutes',
  glutes: 'glutes',
  Arms: 'biceps',
  arms: 'biceps',
  Core: 'abs',
  core: 'abs',
};

export const PATTERN_ALIASES: Record<string, MovementPatternId> = {
  horizontal_push: 'horizontal_push',
  push_horizontal: 'horizontal_push',
  push: 'horizontal_push',
  vertical_push: 'vertical_push',
  push_vertical: 'vertical_push',
  horizontal_pull: 'horizontal_pull',
  pull_horizontal: 'horizontal_pull',
  pull: 'horizontal_pull',
  vertical_pull: 'vertical_pull',
  pull_vertical: 'vertical_pull',
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  carry: 'carry',
  rotation: 'rotation',
  isolation: 'other',
  jump: 'jump',
  throw: 'throw',
};

export const UI_MUSCLE_GROUPS: Record<string, MuscleId[]> = {
  Back: ['upper_back', 'lats'],
  Shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  Arms: ['biceps', 'triceps', 'forearms'],
  Core: ['abs', 'obliques', 'spinal_erectors'],
};

export function normalizeMuscleId(raw?: string | null): MuscleId | null {
  const key = String(raw || '')
    .toLowerCase()
    .trim();
  if (!key) return null;
  if ((MUSCLE_IDS as readonly string[]).includes(key)) return key as MuscleId;
  return MUSCLE_ALIASES[key] || null;
}

export function normalizeMovementPattern(raw?: string | null): MovementPatternId {
  const key = String(raw || '')
    .toLowerCase()
    .trim();
  if ((MOVEMENT_PATTERNS as readonly string[]).includes(key)) return key as MovementPatternId;
  return PATTERN_ALIASES[key] || 'other';
}

export function musclesFromFocusLabels(labels: string[]): MuscleId[] {
  const out: MuscleId[] = [];
  labels.forEach((label) => {
    const id = FOCUS_TO_MUSCLE[label] || FOCUS_TO_MUSCLE[String(label).toLowerCase()] || normalizeMuscleId(label);
    if (id && !out.includes(id)) out.push(id);
    if (String(label).toLowerCase() === 'arms' && !out.includes('triceps')) out.push('triceps');
    if (String(label).toLowerCase() === 'shoulders') {
      (['front_delts', 'rear_delts'] as MuscleId[]).forEach((m) => {
        if (!out.includes(m)) out.push(m);
      });
    }
    if (String(label).toLowerCase() === 'back' && !out.includes('lats')) out.push('lats');
  });
  return out;
}
