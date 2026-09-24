/**
 * BIQ-0212: Deterministic catalog-enrichment quality pass.
 * Review-artifact only. Does not write production catalog rows.
 *
 * Proposed patterns may extend the current engine taxonomy
 * (core_rotation, core_lateral_flexion, core_anti_lateral_flexion, olympic, power, tibialis).
 */

export type Laterality = 'bilateral' | 'unilateral' | 'alternating';
export type MeasurementType = 'reps' | 'time' | 'distance';
export type FatigueCost = 'low' | 'medium' | 'high';
export type SkillDemand = 'low' | 'medium' | 'high';
export type ExerciseKind = 'compound' | 'isolation';
export type Confidence = 'high' | 'medium' | 'review';
export type VolumePolicy =
  | 'strength_hypertrophy'
  | 'core'
  | 'power_reduced'
  | 'zero_non_hypertrophy';

export type VolumeCredit = { muscle: string; credit: number };

export type QualityInput = {
  name: string;
  category?: string | null;
  masterMovement?: string | null;
  primarySource?: string | null;
  secondarySource?: string | null;
};

export type QualityClassification = {
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  involved_muscles: string[];
  unmapped_muscle_labels: string[];
  hypertrophy_volume_credits: VolumeCredit[];
  volume_policy: VolumePolicy;
  laterality: Laterality;
  measurement_type: MeasurementType;
  exercise_kind: ExerciseKind;
  fatigue_cost: FatigueCost;
  skill_demand: SkillDemand;
  program_roles: string[];
  default_rep_min: number;
  default_rep_max: number;
  warmup_eligible: boolean;
  power_eligible: boolean;
  ramp_eligible: boolean;
  cooldown_eligible: boolean;
  demand_notes: string;
  review_required: boolean;
  review_reasons: string[];
  confidence: Confidence;
  anomalies: string[];
  primary_assignment: 'assigned' | 'none_intentional' | 'missing';
};

type Override = Partial<QualityClassification> & {
  notes?: string;
};

export const ENGINE_MOVEMENT_PATTERNS = [
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

export const PROPOSED_PATTERN_EXTENSIONS = [
  'core_rotation',
  'core_lateral_flexion',
  'core_anti_lateral_flexion',
  'olympic',
  'power',
] as const;

const SKIP_LABELS = /^(full body|cardio|ankles|arms|shoulders)$/i;

const EXTRA_MUSCLE: Record<string, string> = {
  hips: 'hip_flexors',
  hip: 'hip_flexors',
  'hip rotators': 'glutes',
  ql: 'spinal_erectors',
  'upper chest': 'chest',
  traps: 'upper_back',
  trap: 'upper_back',
  'mid back': 'upper_back',
  'middle back': 'upper_back',
  'lower traps': 'upper_back',
  'upper traps': 'upper_back',
  grip: 'forearms',
  brachialis: 'biceps',
  'glute medius': 'glutes',
  'glute med': 'glutes',
  soleus: 'calves',
  gastrocnemius: 'calves',
  'tibialis anterior': 'tibialis',
  tibialis: 'tibialis',
  'rotator cuff': 'rotator_cuff',
  serratus: 'serratus',
  pecs: 'chest',
  pec: 'chest',
  lats: 'lats',
  lat: 'lats',
  chest: 'chest',
  'upper back': 'upper_back',
  'front delts': 'front_delts',
  'side delts': 'side_delts',
  'rear delts': 'rear_delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  adductors: 'adductors',
  'hip flexors': 'hip_flexors',
  abs: 'abs',
  obliques: 'obliques',
  'spinal erectors': 'spinal_erectors',
  core: 'abs',
};

function unique(values: string[]): string[] {
  return values.filter((value, index, arr) => value && arr.indexOf(value) === index);
}

export function normalizeExerciseName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function muscleOf(raw: string): string | null {
  const key = String(raw || '').toLowerCase().trim();
  if (!key || SKIP_LABELS.test(key)) return null;
  if (EXTRA_MUSCLE[key]) return EXTRA_MUSCLE[key];
  const compact = key.replace(/[_\s]+/g, ' ');
  return EXTRA_MUSCLE[compact] || null;
}

function musclesOf(raw: unknown): { mapped: string[]; unmapped: string[] } {
  const values = Array.isArray(raw)
    ? raw.map(String)
    : String(raw || '')
        .split(/[;|,]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const mapped: string[] = [];
  const unmapped: string[] = [];
  values.forEach((value) => {
    if (SKIP_LABELS.test(value)) return;
    const hit = muscleOf(value);
    if (hit && !mapped.includes(hit)) mapped.push(hit);
    else if (!hit) unmapped.push(value);
  });
  return { mapped, unmapped };
}

function creditsOf(...pairs: Array<[string, number] | null | undefined>): VolumeCredit[] {
  const out: VolumeCredit[] = [];
  pairs.forEach((pair) => {
    if (!pair || !pair[0]) return;
    if (!out.some((row) => row.muscle === pair[0])) out.push({ muscle: pair[0], credit: pair[1] });
  });
  return out;
}

const EXACT: Record<string, Override> = {
  'jefferson curl': {
    movement_pattern: 'hinge',
    primary_muscles: ['hamstrings'],
    secondary_muscles: ['spinal_erectors'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'medium',
    warmup_eligible: true,
    power_eligible: false,
    ramp_eligible: false,
    cooldown_eligible: true,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'accessory'],
    default_rep_min: 5,
    default_rep_max: 10,
    review_required: false,
    review_reasons: [],
    notes: 'Loaded segmental spinal flexion / hinge mobility. Not an elbow-flexion curl. Not a medical diagnosis.',
  },
  'nordic hamstring curl': {
    movement_pattern: 'knee_flexion',
    primary_muscles: ['hamstrings'],
    secondary_muscles: ['glutes', 'calves'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'high',
    skill_demand: 'medium',
    warmup_eligible: false,
    power_eligible: false,
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['hamstrings', 1]),
    program_roles: ['isolation', 'accessory'],
    default_rep_min: 3,
    default_rep_max: 6,
    notes: 'High-cost eccentric knee flexion. Not a machine/cable leg-curl fatigue analog.',
  },
  'side plank': {
    movement_pattern: 'core_anti_lateral_flexion',
    primary_muscles: ['obliques'],
    secondary_muscles: ['abs', 'glutes'],
    laterality: 'unilateral',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    warmup_eligible: false,
    ramp_eligible: false,
    volume_policy: 'core',
    hypertrophy_volume_credits: creditsOf(['obliques', 1]),
    program_roles: ['isolation', 'accessory'],
    default_rep_min: 20,
    default_rep_max: 45,
    notes: 'Anti-lateral-flexion hold. Not core_anti_extension.',
  },
  'copenhagen plank': {
    movement_pattern: 'core_anti_lateral_flexion',
    primary_muscles: ['adductors'],
    secondary_muscles: ['obliques', 'abs'],
    laterality: 'unilateral',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    warmup_eligible: false,
    ramp_eligible: false,
    cooldown_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['adductors', 1]),
    program_roles: ['isolation', 'accessory'],
    default_rep_min: 15,
    default_rep_max: 40,
    review_required: false,
    review_reasons: [],
    notes: 'Adductor-biased side-support hold. Not a front-plank anti-extension drill.',
  },
  'suitcase carry': {
    movement_pattern: 'carry',
    primary_muscles: [],
    secondary_muscles: ['obliques', 'abs', 'forearms', 'upper_back', 'glutes'],
    laterality: 'unilateral',
    measurement_type: 'distance',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    warmup_eligible: false,
    power_eligible: false,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 20,
    default_rep_max: 40,
    notes: 'One-sided carry / anti-lateral-flexion stability. Not ordinary rotation. No hypertrophy primary.',
  },
  'farmer carry': {
    movement_pattern: 'carry',
    primary_muscles: [],
    secondary_muscles: ['forearms', 'upper_back', 'abs', 'glutes'],
    laterality: 'bilateral',
    measurement_type: 'distance',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'low',
    warmup_eligible: false,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 20,
    default_rep_max: 40,
    notes: 'Bilateral loaded locomotion. Muscles are involved; no simple hypertrophy primary.',
  },
  'front rack carry': {
    movement_pattern: 'carry',
    primary_muscles: [],
    secondary_muscles: ['abs', 'upper_back', 'front_delts', 'glutes'],
    laterality: 'bilateral',
    measurement_type: 'distance',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 20,
    default_rep_max: 40,
  },
  'overhead carry': {
    movement_pattern: 'carry',
    primary_muscles: [],
    secondary_muscles: ['side_delts', 'front_delts', 'abs', 'obliques', 'upper_back'],
    laterality: 'unilateral',
    measurement_type: 'distance',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['accessory'],
    primary_assignment: 'none_intentional',
    review_required: false,
    review_reasons: [],
    default_rep_min: 20,
    default_rep_max: 40,
    notes: 'One-arm overhead carry. Distance measured. No hypertrophy primary.',
  },
  'b-stance romanian deadlift': {
    movement_pattern: 'hinge',
    primary_muscles: ['hamstrings'],
    secondary_muscles: ['glutes', 'spinal_erectors'],
    laterality: 'unilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['hamstrings', 1], ['glutes', 0.5]),
    program_roles: ['secondary', 'accessory'],
    notes: 'Staggered/asymmetrical hinge. Not bilateral just because "single" is absent.',
  },
  'b-stance hip thrust': {
    movement_pattern: 'hinge',
    primary_muscles: ['glutes'],
    secondary_muscles: ['hamstrings'],
    laterality: 'unilateral',
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['glutes', 1], ['hamstrings', 0.5]),
    program_roles: ['secondary', 'accessory'],
  },
  'step-up': {
    movement_pattern: 'lunge',
    primary_muscles: ['quads'],
    secondary_muscles: ['glutes', 'hamstrings'],
    laterality: 'unilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['quads', 1], ['glutes', 0.5]),
    program_roles: ['secondary', 'accessory'],
  },
  'step-down': {
    movement_pattern: 'lunge',
    primary_muscles: ['quads'],
    secondary_muscles: ['glutes'],
    laterality: 'unilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['quads', 1], ['glutes', 0.5]),
    program_roles: ['secondary', 'accessory'],
    notes: 'Usually a control/eccentric step pattern, not a ramp movement.',
  },
  'lateral step-up': {
    movement_pattern: 'lunge',
    primary_muscles: ['glutes'],
    secondary_muscles: ['quads', 'adductors'],
    laterality: 'unilateral',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['glutes', 1], ['quads', 0.5]),
    program_roles: ['secondary', 'accessory'],
  },
  'pogo jump': {
    movement_pattern: 'jump',
    primary_muscles: ['calves'],
    secondary_muscles: ['quads'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    warmup_eligible: false,
    power_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['power'],
    default_rep_min: 4,
    default_rep_max: 8,
    notes: 'Reactive plyometric jump. Not squat-pattern strength work.',
  },
  'squat jump': {
    movement_pattern: 'jump',
    primary_muscles: ['quads'],
    secondary_muscles: ['glutes', 'calves'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    power_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['power'],
    default_rep_min: 3,
    default_rep_max: 6,
    notes: 'Plyometric jump. Underlying squat mechanics are involvement, not hypertrophy pattern.',
  },
  'push press': {
    movement_pattern: 'power',
    primary_muscles: ['front_delts'],
    secondary_muscles: ['triceps', 'quads', 'glutes', 'side_delts'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    skill_demand: 'medium',
    power_eligible: true,
    ramp_eligible: true,
    volume_policy: 'power_reduced',
    hypertrophy_volume_credits: creditsOf(['front_delts', 0.5]),
    program_roles: ['power', 'secondary'],
    default_rep_min: 2,
    default_rep_max: 5,
    notes: 'Explosive press. High systemic cost; reduced hypertrophy credit.',
  },
  'upright row': {
    movement_pattern: 'shoulder_abduction',
    primary_muscles: ['side_delts'],
    secondary_muscles: ['upper_back', 'biceps'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['side_delts', 1]),
    program_roles: ['isolation', 'accessory'],
    review_required: false,
    review_reasons: [],
    notes: 'High-pull / abduction pattern. Not the same vertical_pull as pull-up or lat pulldown.',
  },
  't-bar row': {
    movement_pattern: 'horizontal_pull',
    primary_muscles: ['lats'],
    secondary_muscles: ['upper_back', 'biceps', 'rear_delts'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['lats', 1], ['upper_back', 0.5]),
    program_roles: ['secondary', 'accessory'],
  },
  'bent-over row': {
    movement_pattern: 'horizontal_pull',
    primary_muscles: ['lats'],
    secondary_muscles: ['upper_back', 'rear_delts', 'biceps', 'spinal_erectors'],
    laterality: 'bilateral',
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['lats', 1], ['upper_back', 0.5]),
    program_roles: ['primary', 'secondary'],
  },
  'seated calf raise': {
    movement_pattern: 'calf_raise',
    primary_muscles: ['calves'],
    secondary_muscles: [],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['calves', 1]),
    program_roles: ['isolation', 'accessory'],
  },
  'tibialis raise': {
    movement_pattern: 'other',
    primary_muscles: ['tibialis'],
    secondary_muscles: [],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['tibialis', 1]),
    program_roles: ['isolation', 'accessory'],
    notes: 'Dorsiflexion isolation. tibialis is an extended muscle id, not in the current engine enum.',
  },
  'overhead press': {
    movement_pattern: 'vertical_push',
    primary_muscles: ['front_delts'],
    secondary_muscles: ['triceps', 'side_delts'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['front_delts', 1], ['triceps', 0.5]),
    program_roles: ['primary', 'secondary'],
    notes: 'Chest may assist slightly but receives no hypertrophy volume credit.',
  },
  'ab wheel rollout': {
    movement_pattern: 'core_anti_extension',
    primary_muscles: ['abs'],
    secondary_muscles: ['lats', 'hip_flexors'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: false,
    volume_policy: 'core',
    hypertrophy_volume_credits: creditsOf(['abs', 1]),
    program_roles: ['isolation', 'accessory'],
    notes: 'Lats stabilize; they and side delts do not receive hypertrophy credit.',
  },
  'front raise': {
    movement_pattern: 'other',
    primary_muscles: ['front_delts'],
    secondary_muscles: [],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['front_delts', 1]),
    program_roles: ['isolation', 'accessory'],
    notes: 'Shoulder flexion. Chest is not a hypertrophy target.',
  },
  'cable front raise': {
    movement_pattern: 'other',
    primary_muscles: ['front_delts'],
    secondary_muscles: [],
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['front_delts', 1]),
    program_roles: ['isolation', 'accessory'],
  },
  'plate front raise': {
    movement_pattern: 'other',
    primary_muscles: ['front_delts'],
    secondary_muscles: [],
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    ramp_eligible: false,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['front_delts', 1]),
    program_roles: ['isolation', 'accessory'],
  },
  'y raise': {
    movement_pattern: 'shoulder_abduction',
    primary_muscles: ['upper_back'],
    secondary_muscles: ['rear_delts', 'rotator_cuff'],
    laterality: 'bilateral',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    warmup_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'isolation', 'accessory'],
    default_rep_min: 10,
    default_rep_max: 20,
    review_required: false,
    review_reasons: [],
    notes: 'Scapular raise / prehab. Muscles involved; zero hypertrophy working-set credit.',
  },
  'landmine press': {
    movement_pattern: 'horizontal_push',
    primary_muscles: ['chest'],
    secondary_muscles: ['front_delts', 'triceps'],
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['chest', 1], ['front_delts', 0.5], ['triceps', 0.5]),
    program_roles: ['secondary', 'accessory'],
    notes: 'Diagonal landmine press. Chest is the hypertrophy primary; not left unmapped from a "shoulders" label.',
  },
  'half-kneeling landmine press': {
    movement_pattern: 'vertical_push',
    primary_muscles: ['front_delts'],
    secondary_muscles: ['chest', 'triceps', 'abs'],
    laterality: 'unilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['front_delts', 1], ['triceps', 0.5]),
    program_roles: ['secondary', 'accessory'],
    notes: 'Half-kneeling stance is asymmetrical. Front delts are the press primary; chest is involvement only.',
  },
  'neck isometric': {
    movement_pattern: 'other',
    primary_muscles: ['neck'],
    secondary_muscles: ['upper_back'],
    laterality: 'bilateral',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    warmup_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'isolation', 'accessory'],
    notes: 'Neck stability isometric. neck is an extended muscle id; zero hypertrophy working-set credit.',
  },
  'cable y raise': {
    movement_pattern: 'shoulder_abduction',
    primary_muscles: ['upper_back'],
    secondary_muscles: ['rear_delts', 'serratus'],
    laterality: 'bilateral',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    warmup_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'isolation', 'accessory'],
    default_rep_min: 10,
    default_rep_max: 20,
    review_required: false,
    review_reasons: [],
  },
  'active hang': {
    movement_pattern: 'other',
    primary_muscles: [],
    secondary_muscles: ['lats', 'upper_back', 'forearms'],
    laterality: 'bilateral',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    warmup_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 15,
    default_rep_max: 45,
    notes: 'Scapular/grip hang. Not a vertical-pull working movement and not ramp-eligible.',
  },
  'dead hang': {
    movement_pattern: 'other',
    primary_muscles: [],
    secondary_muscles: ['forearms', 'lats'],
    laterality: 'bilateral',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    warmup_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 15,
    default_rep_max: 45,
  },
  'plank': {
    movement_pattern: 'core_anti_extension',
    primary_muscles: ['abs'],
    secondary_muscles: ['glutes'],
    laterality: 'bilateral',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    ramp_eligible: false,
    volume_policy: 'core',
    hypertrophy_volume_credits: creditsOf(['abs', 1]),
    program_roles: ['isolation', 'accessory'],
    default_rep_min: 20,
    default_rep_max: 60,
  },
  'plank shoulder tap': {
    movement_pattern: 'core_anti_rotation',
    primary_muscles: ['abs'],
    secondary_muscles: ['obliques'],
    laterality: 'alternating',
    measurement_type: 'time',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    ramp_eligible: false,
    volume_policy: 'core',
    hypertrophy_volume_credits: creditsOf(['abs', 1]),
    program_roles: ['isolation', 'accessory'],
    default_rep_min: 20,
    default_rep_max: 40,
  },
  'pallof press': {
    movement_pattern: 'core_anti_rotation',
    primary_muscles: ['abs'],
    secondary_muscles: ['obliques'],
    laterality: 'unilateral',
    measurement_type: 'reps',
    exercise_kind: 'isolation',
    fatigue_cost: 'low',
    skill_demand: 'low',
    ramp_eligible: false,
    volume_policy: 'core',
    hypertrophy_volume_credits: creditsOf(['abs', 1]),
    program_roles: ['isolation', 'accessory'],
  },
  'jump rope': {
    movement_pattern: 'jump',
    primary_muscles: [],
    secondary_muscles: ['calves', 'abs'],
    laterality: 'bilateral',
    measurement_type: 'time',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'low',
    power_eligible: true,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['power', 'accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 30,
    default_rep_max: 90,
  },
  'treadmill walk': {
    movement_pattern: 'other',
    primary_muscles: [],
    secondary_muscles: ['calves', 'glutes'],
    laterality: 'alternating',
    measurement_type: 'time',
    exercise_kind: 'compound',
    fatigue_cost: 'low',
    skill_demand: 'low',
    warmup_eligible: true,
    ramp_eligible: false,
    cooldown_eligible: true,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['warmup', 'accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 300,
    default_rep_max: 900,
  },
  'treadmill run': {
    movement_pattern: 'other',
    primary_muscles: [],
    secondary_muscles: ['quads', 'calves', 'glutes'],
    laterality: 'alternating',
    measurement_type: 'time',
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    skill_demand: 'low',
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['accessory'],
    primary_assignment: 'none_intentional',
    default_rep_min: 180,
    default_rep_max: 600,
  },
  'arnold press': {
    movement_pattern: 'vertical_push',
    primary_muscles: ['front_delts'],
    secondary_muscles: ['side_delts', 'triceps'],
    exercise_kind: 'compound',
    fatigue_cost: 'medium',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['front_delts', 1], ['triceps', 0.5]),
    program_roles: ['secondary', 'accessory'],
  },
  'block pull': {
    movement_pattern: 'hinge',
    primary_muscles: ['glutes'],
    secondary_muscles: ['hamstrings', 'upper_back', 'spinal_erectors'],
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    ramp_eligible: true,
    volume_policy: 'strength_hypertrophy',
    hypertrophy_volume_credits: creditsOf(['glutes', 1], ['hamstrings', 0.5]),
    program_roles: ['primary', 'secondary'],
  },
};

function olympicOverride(extra?: Override): Override {
  return {
    movement_pattern: 'olympic',
    laterality: 'bilateral',
    measurement_type: 'reps',
    exercise_kind: 'compound',
    fatigue_cost: 'high',
    skill_demand: 'high',
    power_eligible: true,
    ramp_eligible: true,
    warmup_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    program_roles: ['power'],
    default_rep_min: 1,
    default_rep_max: 3,
    primary_assignment: 'none_intentional',
    notes: 'Olympic/power lift. High technical and systemic demand; zero hypertrophy set credit.',
    ...extra,
  };
}

Object.assign(EXACT, {
  snatch: olympicOverride({
    primary_muscles: [],
    secondary_muscles: ['glutes', 'quads', 'hamstrings', 'upper_back', 'front_delts'],
  }),
  'power clean': olympicOverride({
    primary_muscles: [],
    secondary_muscles: ['glutes', 'quads', 'hamstrings', 'upper_back', 'front_delts'],
  }),
  'hang clean': olympicOverride({
    primary_muscles: [],
    secondary_muscles: ['glutes', 'quads', 'hamstrings', 'upper_back'],
  }),
  'clean & jerk': olympicOverride({
    primary_muscles: [],
    secondary_muscles: ['glutes', 'quads', 'hamstrings', 'upper_back', 'front_delts', 'triceps'],
    default_rep_max: 2,
  }),
  'push jerk': olympicOverride({
    movement_pattern: 'olympic',
    primary_muscles: [],
    secondary_muscles: ['front_delts', 'triceps', 'quads', 'glutes'],
  }),
  'split jerk': olympicOverride({
    laterality: 'unilateral',
    primary_muscles: [],
    secondary_muscles: ['front_delts', 'triceps', 'quads', 'glutes'],
    notes: 'Split-stance catch. Olympic lift, not a hypertrophy vertical press.',
  }),
});

function isMobilityStretch(name: string, category: string): boolean {
  return (
    /mobility|stretch|prehab/.test(category) ||
    /\b(stretch|mobility|pigeon|90\/90|cat-?cow|childs pose|inchworm|worlds greatest|foam roll|couch stretch)\b/.test(name)
  );
}

function isCardioConditioning(name: string, category: string, master: string): boolean {
  return (
    /cardio|conditioning/.test(category) ||
    /cardio|conditioning|locomotion/.test(master) ||
    /\b(treadmill|elliptical|bike sprint|battle rope|jump rope|bear crawl|crab walk)\b/.test(name)
  );
}

function isOlympicName(name: string): boolean {
  return (
    /\b(snatch|hang clean|power clean|clean & jerk|clean and jerk|push jerk|split jerk)\b/.test(name) ||
    (/\bclean\b/.test(name) && !/clean & press|clean and press/.test(name))
  );
}

function isElbowFlexionCurl(name: string): boolean {
  if (/\b(jefferson|nordic|leg curl|hamstring curl)\b/.test(name)) return false;
  return (
    /\b(biceps curl|hammer curl|preacher|concentration curl|incline curl|spider curl|bayesian|drag curl|ez-?bar curl)\b/.test(name) ||
    (/\bcurl\b/.test(name) &&
      /\b(bicep|hammer|preacher|incline|concentration|cable|barbell|dumbbell)\b/.test(name) &&
      !/\b(leg|hamstring|nordic|jefferson)\b/.test(name))
  );
}

function inferPattern(name: string, category: string, master: string): string {
  if (/jefferson curl/.test(name)) return 'hinge';
  if (/upright row/.test(name)) return 'shoulder_abduction';
  if (/\bpogo\b/.test(name) || /\bsquat jump\b/.test(name)) return 'jump';
  if (isOlympicName(name)) return 'olympic';
  if (/\bpush press\b/.test(name)) return 'power';
  if (/\b(suitcase carry|farmer carry|front rack carry|overhead carry)\b/.test(name) || /\bcarry\b/.test(name)) {
    return 'carry';
  }
  if (/\bcopenhagen\b/.test(name) || /\bside plank\b/.test(name)) return 'core_anti_lateral_flexion';
  if (/\bplank shoulder tap\b/.test(name) || /\bpallof\b/.test(name) || /\bbird dog\b/.test(name)) {
    return 'core_anti_rotation';
  }
  if (/^plank$/.test(name) || /\b(rollout|ab wheel|dead bug)\b/.test(name)) return 'core_anti_extension';
  if (/\b(side bend)\b/.test(name) || /lateral flexion/.test(master)) return 'core_lateral_flexion';
  if (/\b(cable crunch|crunch|sit-?up|hanging knee raise|hanging leg raise)\b/.test(name) || /spinal flexion/.test(master)) {
    return 'core_flexion';
  }
  if (/\b(chop|lift|russian twist|bicycle crunch|windmill)\b/.test(name) && !/hip rotation/.test(master)) {
    return 'core_rotation';
  }
  if (/\b(box jump|broad jump|vertical jump|depth jump|tuck jump|jump rope)\b/.test(name)) return 'jump';
  if (/\b(throw|slam|toss|chest pass|med ball)\b/.test(name) || /throw/.test(master)) return 'throw';
  if (isMobilityStretch(name, category) && !/jefferson/.test(name)) return 'other';
  if (/anti-lateral flexion/.test(master)) return 'core_anti_lateral_flexion';
  if (/anti-rotation/.test(master)) return 'core_anti_rotation';
  if (/anti-extension/.test(master)) return 'core_anti_extension';
  if (/adduction isometric/.test(master)) return 'core_anti_lateral_flexion';
  if (/segmental flexion/.test(master)) return 'hinge';
  if (/scapular raise/.test(master)) return 'shoulder_abduction';
  if (/plantar flexion/.test(master) || /calf raise|calf press/.test(name)) return 'calf_raise';
  if (/dorsiflexion/.test(master)) return 'other';
  if (/knee flexion/.test(master) || /\b(leg curl|hamstring curl|nordic)\b/.test(name)) return 'knee_flexion';
  if (isElbowFlexionCurl(name) || (/elbow flexion/.test(master) && isElbowFlexionCurl(name))) return 'elbow_flexion';
  if (/\b(pushdown|skull crusher|tricep|overhead extension|kickback)\b/.test(name)) return 'elbow_extension';
  if (/\b(lateral raise|side raise)\b/.test(name)) return 'shoulder_abduction';
  if (/\b(pull-?up|chin-?up|lat pulldown|pulldown)\b/.test(name) && !/upright/.test(name)) return 'vertical_pull';
  if (/\b(overhead press|shoulder press|military press|arnold press)\b/.test(name)) return 'vertical_push';
  if (/\blandmine press\b/.test(name)) return /kneeling/.test(name) ? 'vertical_push' : 'horizontal_push';
  if (/\b(lunge|split squat|step-?up|step-?down|bulgarian)\b/.test(name)) return 'lunge';
  if (/\b(squat)\b/.test(name) && !/jump/.test(name)) return 'squat';
  if (/\b(deadlift|rdl|romanian|hip thrust|good morning|pull-through|back extension)\b/.test(name)) return 'hinge';
  if (/\b(row)\b/.test(name) && !/upright/.test(name)) return 'horizontal_pull';
  if (/\b(bench press|chest press|push-?up|chest fly|dip)\b/.test(name)) {
    return /dip/.test(name) ? 'vertical_push' : 'horizontal_push';
  }
  if (/vertical push/.test(master)) return 'vertical_push';
  if (/horizontal push/.test(master)) return 'horizontal_push';
  if (/vertical pull/.test(master) && !/upright|hang/.test(name)) return 'vertical_pull';
  if (/horizontal pull/.test(master)) return 'horizontal_pull';
  if (/hinge|hip extension/.test(master) && !/flexion/.test(master)) return 'hinge';
  if (/squat/.test(master) && !/jump/.test(name)) return 'squat';
  if (/lunge|step/.test(master)) return 'lunge';
  if (/carry/.test(master)) return 'carry';
  if (/jump/.test(master)) return 'jump';
  return 'other';
}

function inferLaterality(name: string, category: string): Laterality {
  if (/\b(alternating|walking lunge|bird dog|bicycle|treadmill|heel walk)\b/.test(name)) return 'alternating';
  if (
    /\b(b-?stance|step-?up|step-?down|split squat|bulgarian|pistol|suitcase|copenhagen|side plank|side bend|windmill|clamshell|cossack|curtsy|single-arm|single-leg|one-arm|one-leg|split jerk)\b/.test(
      name
    ) ||
    /unilateral/.test(category)
  ) {
    if (/\b(walking|alternating)\b/.test(name)) return 'alternating';
    return 'unilateral';
  }
  if (/\blunge\b/.test(name) && !/walking|alternating/.test(name)) return 'unilateral';
  if (/\bpallof\b/.test(name)) return 'unilateral';
  return 'bilateral';
}

function inferMeasurement(name: string, category: string, pattern: string): MeasurementType {
  if (/\bcarry\b/.test(name) || pattern === 'carry') return 'distance';
  if (/\b(heel walk|bear crawl|crab walk)\b/.test(name)) return 'distance';
  if (
    /\b(plank|hang|wall sit|hold|isometric|jump rope|treadmill|elliptical|bike sprint|battle rope)\b/.test(name) ||
    /isometric/.test(category)
  ) {
    return 'time';
  }
  if (/cardio/.test(category) && /\b(walk|run|bike|elliptical)\b/.test(name)) return 'time';
  return 'reps';
}

function inferKind(name: string, category: string, pattern: string): ExerciseKind {
  if (['carry', 'jump', 'throw', 'olympic', 'power', 'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'].includes(pattern)) {
    if (/\b(raise|curl|fly|pushdown|kickback|shrug)\b/.test(name) && pattern !== 'power' && !/nordic|jefferson/.test(name) && pattern !== 'knee_flexion') {
      if (isElbowFlexionCurl(name) || /\b(lateral raise|front raise|y raise|fly|pushdown)\b/.test(name)) return 'isolation';
    }
    if (pattern === 'knee_flexion' && /nordic|leg curl|hamstring curl/.test(name)) return 'isolation';
    return 'compound';
  }
  if (/compound/.test(category)) return 'compound';
  return 'isolation';
}

function inferFatigue(name: string, category: string, pattern: string, kind: ExerciseKind): FatigueCost {
  if (isMobilityStretch(name, category) && !/nordic|copenhagen/.test(name)) return 'low';
  if (/\bnordic\b/.test(name)) return 'high';
  if (isOlympicName(name) || /\bpush press\b/.test(name)) return 'high';
  if (/\b(back squat|front squat|deadlift|bench press|overhead press|bent-over row|romanian|hip thrust|bulgarian|walking lunge|pull-?up|chin-?up|block pull)\b/.test(name)) {
    return 'high';
  }
  if (pattern === 'jump' || pattern === 'throw' || pattern === 'power') return 'medium';
  if (pattern === 'carry') return 'medium';
  if (/\btreadmill walk\b/.test(name) || /\bactive hang|dead hang\b/.test(name)) return 'low';
  if (pattern.startsWith('core_') && /\b(ab wheel|rollout|copenhagen)\b/.test(name)) return 'medium';
  if (pattern.startsWith('core_')) return 'low';
  if (kind === 'isolation') return 'low';
  return 'medium';
}

function inferSkill(name: string, category: string, pattern: string): SkillDemand {
  if (isOlympicName(name) || /\b(muscle-?up|pistol|windmill|jefferson curl)\b/.test(name)) return 'high';
  if (pattern === 'olympic' || pattern === 'power') return pattern === 'olympic' ? 'high' : 'medium';
  if (isMobilityStretch(name, category) || /\b(curl|raise|pushdown|stretch|plank|pallof)\b/.test(name)) return 'low';
  if (/\bnordic|copenhagen|upright row\b/.test(name)) return 'medium';
  return 'medium';
}

function inferRoles(opts: {
  name: string;
  category: string;
  kind: ExerciseKind;
  warmup: boolean;
  power: boolean;
  pattern: string;
}): string[] {
  const roles: string[] = [];
  if (opts.warmup) roles.push('warmup');
  if (opts.power) roles.push('power');
  if (opts.pattern === 'carry' || isCardioConditioning(opts.name, opts.category, '')) {
    roles.push('accessory');
    return unique(roles);
  }
  if (opts.kind === 'isolation' || opts.pattern.startsWith('core_')) {
    roles.push('isolation', 'accessory');
    return unique(roles);
  }
  if (/\b(bench press|back squat|front squat|deadlift|overhead press|bent-over row|pull-?up|chin-?up|hip thrust|block pull)\b/.test(opts.name)) {
    roles.push('primary', 'secondary');
    return unique(roles);
  }
  roles.push('secondary', 'accessory');
  return unique(roles);
}

function inferRamp(opts: {
  name: string;
  category: string;
  pattern: string;
  kind: ExerciseKind;
  warmup: boolean;
  fatigue: FatigueCost;
}): boolean {
  if (opts.warmup && isMobilityStretch(opts.name, opts.category)) return false;
  if (isMobilityStretch(opts.name, opts.category) && !/jefferson/.test(opts.name)) return false;
  if (isCardioConditioning(opts.name, opts.category, '')) return false;
  if (/\b(hang|jump rope|treadmill|plank|pallof|dead bug|carry|step-down)\b/.test(opts.name)) return false;
  if (opts.pattern.startsWith('core_') || opts.pattern === 'carry' || opts.pattern === 'jump' || opts.pattern === 'throw' || opts.pattern === 'other') {
    if (opts.pattern === 'other' && /\bpress|row|squat|deadlift\b/.test(opts.name)) {
      // fall through
    } else {
      return false;
    }
  }
  if (opts.kind === 'isolation') return false;
  if (opts.pattern === 'olympic' || opts.pattern === 'power') return true;
  if (['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'].includes(opts.pattern)) {
    return opts.fatigue !== 'low';
  }
  return false;
}

function inferPrimaryFallback(name: string, pattern: string, mappedPrimary: string[], mappedSecondary: string[]): string[] {
  if (mappedPrimary.length) return mappedPrimary;
  if (/\b(t-?bar row|bent-over row|landmine row|inverted row|chest-supported row)\b/.test(name)) return ['lats'];
  if (/\blandmine press\b/.test(name)) return /kneeling/.test(name) ? ['front_delts'] : ['chest'];
  if (/\bneck\b/.test(name)) return ['neck'];
  if (/calf raise|calf press/.test(name)) return ['calves'];
  if (/tibialis/.test(name)) return ['tibialis'];
  if (/\by raise\b/.test(name)) return ['upper_back'];
  if (/\b(face pull|reverse fly|rear delt)\b/.test(name)) return ['rear_delts'];
  if (/\b(hip abduction|clamshell)\b/.test(name)) return ['glutes'];
  if (/\b(hip adduction|copenhagen)\b/.test(name)) return ['adductors'];
  if (pattern === 'elbow_flexion') return ['biceps'];
  if (pattern === 'elbow_extension') return ['triceps'];
  if (pattern === 'shoulder_abduction' && /front raise/.test(name)) return ['front_delts'];
  if (pattern === 'shoulder_abduction') return ['side_delts'];
  if (pattern === 'calf_raise') return ['calves'];
  if (pattern === 'core_flexion' || pattern === 'core_anti_extension') return ['abs'];
  if (pattern === 'core_anti_rotation') return ['abs'];
  if (pattern === 'core_rotation' || pattern === 'core_lateral_flexion' || pattern === 'core_anti_lateral_flexion') {
    return ['obliques'];
  }
  if (pattern === 'vertical_push') return ['front_delts'];
  if (pattern === 'horizontal_push') return ['chest'];
  if (pattern === 'vertical_pull' || pattern === 'horizontal_pull') return ['lats'];
  if (pattern === 'squat' || pattern === 'lunge') return ['quads'];
  if (pattern === 'hinge') return mappedSecondary.includes('hamstrings') ? ['hamstrings'] : ['glutes'];
  if (pattern === 'knee_flexion') return ['hamstrings'];
  return [];
}

function conservativeCredits(opts: {
  policy: VolumePolicy;
  pattern: string;
  primary: string[];
  kind: ExerciseKind;
  explicit?: VolumeCredit[];
}): VolumeCredit[] {
  if (opts.explicit) return opts.explicit;
  if (opts.policy === 'zero_non_hypertrophy') return [];
  if (opts.policy === 'power_reduced') {
    return opts.primary.slice(0, 1).map((muscle) => ({ muscle, credit: 0.5 }));
  }
  if (opts.policy === 'core' || opts.kind === 'isolation') {
    return opts.primary.slice(0, 1).map((muscle) => ({ muscle, credit: 1 }));
  }
  const credits = creditsOf(opts.primary[0] ? [opts.primary[0], 1] : null);
  if (opts.pattern === 'horizontal_push') {
    credits.push({ muscle: 'triceps', credit: 0.5 }, { muscle: 'front_delts', credit: 0.5 });
  } else if (opts.pattern === 'vertical_push') {
    credits.push({ muscle: 'triceps', credit: 0.5 });
  } else if (opts.pattern === 'horizontal_pull') {
    if (opts.primary[0] === 'lats') credits.push({ muscle: 'upper_back', credit: 0.5 });
    credits.push({ muscle: 'biceps', credit: 0.5 });
  } else if (opts.pattern === 'vertical_pull') {
    credits.push({ muscle: 'biceps', credit: 0.5 });
  } else if (opts.pattern === 'squat' || opts.pattern === 'lunge') {
    if (opts.primary[0] !== 'glutes') credits.push({ muscle: 'glutes', credit: 0.5 });
    else credits.push({ muscle: 'quads', credit: 0.5 });
  } else if (opts.pattern === 'hinge') {
    if (opts.primary[0] === 'hamstrings') credits.push({ muscle: 'glutes', credit: 0.5 });
    else if (opts.primary[0] === 'glutes') credits.push({ muscle: 'hamstrings', credit: 0.5 });
  }
  const seen = new Set<string>();
  return credits.filter((row) => {
    if (seen.has(row.muscle)) return false;
    seen.add(row.muscle);
    return true;
  });
}

function inferVolumePolicy(name: string, category: string, pattern: string, warmup: boolean, power: boolean): VolumePolicy {
  if (warmup || isMobilityStretch(name, category)) return 'zero_non_hypertrophy';
  if (isCardioConditioning(name, category, '') || pattern === 'carry') return 'zero_non_hypertrophy';
  if (pattern === 'olympic' || pattern === 'jump' || pattern === 'throw') return 'zero_non_hypertrophy';
  if (/\b(hang|y raise)\b/.test(name)) return 'zero_non_hypertrophy';
  if (pattern === 'power' || (power && isOlympicName(name))) return pattern === 'power' ? 'power_reduced' : 'zero_non_hypertrophy';
  if (pattern === 'power') return 'power_reduced';
  if (pattern.startsWith('core_')) return 'core';
  return 'strength_hypertrophy';
}

function inferReps(opts: {
  name: string;
  pattern: string;
  kind: ExerciseKind;
  power: boolean;
  measurement: MeasurementType;
  category: string;
}): { min: number; max: number } {
  if (opts.measurement === 'time') {
    if (/treadmill|elliptical|bike/.test(opts.name)) return { min: 180, max: 600 };
    return { min: 20, max: 45 };
  }
  if (opts.measurement === 'distance') return { min: 20, max: 40 };
  if (opts.power || opts.pattern === 'olympic' || opts.pattern === 'power' || opts.pattern === 'jump' || opts.pattern === 'throw') {
    return { min: 1, max: 5 };
  }
  if (/\bnordic\b/.test(opts.name)) return { min: 3, max: 6 };
  if (isMobilityStretch(opts.name, opts.category)) return { min: 1, max: 8 };
  if (opts.kind === 'isolation' || opts.pattern.startsWith('core_')) return { min: 8, max: 15 };
  return { min: 5, max: 10 };
}

function noneIntentionalPrimary(name: string, pattern: string, category: string, policy: VolumePolicy): boolean {
  if (policy === 'zero_non_hypertrophy' && (pattern === 'carry' || pattern === 'olympic' || pattern === 'jump' || /\b(hang|treadmill|jump rope|battle rope)\b/.test(name))) {
    return true;
  }
  if (isCardioConditioning(name, category, '') || isMobilityStretch(name, category)) return true;
  return false;
}

function collectAnomalies(input: QualityInput, out: QualityClassification): string[] {
  const n = normalizeExerciseName(input.name);
  const anomalies: string[] = [];
  if (/\bcurl\b/.test(n) && out.movement_pattern === 'elbow_flexion' && /\b(jefferson|nordic|leg curl|hamstring)\b/.test(n)) {
    anomalies.push('curl_token_mapped_to_elbow_flexion');
  }
  if (/\b(pogo|squat jump|box jump|broad jump)\b/.test(n) && out.movement_pattern === 'squat') {
    anomalies.push('jump_mapped_as_squat');
  }
  if (/\bupright row\b/.test(n) && out.movement_pattern === 'vertical_pull') {
    anomalies.push('upright_row_mapped_as_vertical_pull');
  }
  if (/\bside plank\b/.test(n) && out.movement_pattern === 'core_anti_extension') {
    anomalies.push('side_plank_mapped_as_anti_extension');
  }
  if (/\bcopenhagen\b/.test(n) && out.movement_pattern === 'core_anti_extension') {
    anomalies.push('copenhagen_mapped_as_anti_extension');
  }
  if (/\bsuitcase carry\b/.test(n) && (out.movement_pattern === 'rotation' || out.movement_pattern === 'core_rotation')) {
    anomalies.push('suitcase_carry_mapped_as_rotation');
  }
  if (/\b(b-?stance|step-?up|step-?down|suitcase|side plank|copenhagen)\b/.test(n) && out.laterality === 'bilateral') {
    anomalies.push('asymmetric_exercise_marked_bilateral');
  }
  if (/\b(farmer carry|suitcase carry|front rack carry|overhead carry|treadmill|jump rope|active hang|dead hang)\b/.test(n) && out.measurement_type === 'reps') {
    anomalies.push('locomotion_or_isometric_defaulted_to_reps');
  }
  if (/\b(active hang|farmer carry|treadmill|jump rope)\b/.test(n) && out.ramp_eligible) {
    anomalies.push('inappropriate_ramp_candidate');
  }
  if (/\bnordic\b/.test(n) && out.fatigue_cost === 'low') anomalies.push('nordic_low_fatigue');
  if (/\bpush press\b/.test(n) && out.fatigue_cost === 'low') anomalies.push('push_press_low_fatigue');
  if (out.primary_assignment === 'missing') anomalies.push('missing_primary_muscle');
  if (out.volume_policy === 'zero_non_hypertrophy' && out.hypertrophy_volume_credits.length) {
    anomalies.push('zero_policy_has_hypertrophy_credits');
  }
  if (/\b(overhead press|front raise)\b/.test(n) && out.hypertrophy_volume_credits.some((row) => row.muscle === 'chest')) {
    anomalies.push('press_or_raise_chest_volume_credit');
  }
  if (/\bab wheel\b/.test(n) && out.hypertrophy_volume_credits.some((row) => row.muscle === 'side_delts' || row.muscle === 'lats')) {
    anomalies.push('ab_wheel_accessory_volume_credit');
  }
  return anomalies;
}

export function classifyExercise(input: QualityInput): QualityClassification {
  const name = normalizeExerciseName(input.name);
  const category = String(input.category || '').toLowerCase();
  const master = String(input.masterMovement || '').toLowerCase();
  const sourcePrimary = musclesOf(input.primarySource);
  const sourceSecondary = musclesOf(input.secondarySource);
  const exact = EXACT[name] || {};

  const warmup =
    exact.warmup_eligible ??
    (isMobilityStretch(name, category) && !/copenhagen|nordic/.test(name));
  const pattern = exact.movement_pattern || inferPattern(name, category, master);
  const power =
    exact.power_eligible ??
    (pattern === 'olympic' ||
      pattern === 'power' ||
      pattern === 'jump' ||
      pattern === 'throw' ||
      /power|plyo/.test(category) ||
      isOlympicName(name));
  const kind = exact.exercise_kind || inferKind(name, category, pattern);
  const laterality = exact.laterality || inferLaterality(name, category);
  const measurement = exact.measurement_type || inferMeasurement(name, category, pattern);
  const fatigue = exact.fatigue_cost || inferFatigue(name, category, pattern, kind);
  const skill = exact.skill_demand || inferSkill(name, category, pattern);
  const policy = exact.volume_policy || inferVolumePolicy(name, category, pattern, warmup, power);
  let primary = exact.primary_muscles || inferPrimaryFallback(name, pattern, sourcePrimary.mapped, sourceSecondary.mapped);
  let secondary = exact.secondary_muscles || unique(sourceSecondary.mapped.filter((m) => !primary.includes(m)));
  if (!exact.secondary_muscles && sourcePrimary.mapped.length && exact.primary_muscles) {
    secondary = unique([...secondary, ...sourcePrimary.mapped.filter((m) => !primary.includes(m))]);
  }

  const intentionalNone = exact.primary_assignment === 'none_intentional' || noneIntentionalPrimary(name, pattern, category, policy);
  if (intentionalNone && !exact.primary_muscles?.length) {
    primary = [];
    if (!exact.secondary_muscles) {
      secondary = unique([...sourcePrimary.mapped, ...sourceSecondary.mapped]);
    }
  }

  const involved = unique([...primary, ...secondary]);
  const credits = conservativeCredits({
    policy,
    pattern,
    primary,
    kind,
    explicit: exact.hypertrophy_volume_credits,
  });
  const ramp =
    exact.ramp_eligible ??
    inferRamp({ name, category, pattern, kind, warmup, fatigue });
  const cooldown = exact.cooldown_eligible ?? isMobilityStretch(name, category);
  const roles =
    exact.program_roles ||
    inferRoles({ name, category, kind, warmup, power, pattern });
  const reps =
    exact.default_rep_min != null && exact.default_rep_max != null
      ? { min: exact.default_rep_min, max: exact.default_rep_max }
      : inferReps({ name, pattern, kind, power, measurement, category });

  let primaryAssignment: QualityClassification['primary_assignment'] = 'assigned';
  if (!primary.length && intentionalNone) primaryAssignment = 'none_intentional';
  else if (!primary.length) primaryAssignment = 'missing';

  const reviewReasons = [...(exact.review_reasons || [])];
  if (primaryAssignment === 'missing' && /compound|isolation|unilateral|bodyweight|accessory/.test(category) && !isMobilityStretch(name, category) && !isCardioConditioning(name, category, master)) {
    reviewReasons.push('strength_exercise_missing_primary');
  }
  if (pattern === 'other' && /compound/.test(category) && !isCardioConditioning(name, category, master) && !intentionalNone) {
    reviewReasons.push('compound_pattern_unresolved');
  }

  const notes = [
    exact.notes,
    `${kind} ${pattern.replace(/_/g, ' ')}`,
    `${fatigue} fatigue`,
    `${skill} skill`,
    laterality,
    `${measurement} measurement`,
    `volume policy ${policy}`,
    primaryAssignment === 'none_intentional' ? 'no hypertrophy primary by design' : null,
    credits.length ? `hypertrophy credits ${credits.map((c) => `${c.muscle}:${c.credit}`).join(', ')}` : 'zero hypertrophy volume credit',
  ]
    .filter(Boolean)
    .join('; ');

  const draft: QualityClassification = {
    movement_pattern: pattern,
    primary_muscles: primary,
    secondary_muscles: secondary,
    involved_muscles: involved,
    unmapped_muscle_labels: unique([...sourcePrimary.unmapped, ...sourceSecondary.unmapped]),
    hypertrophy_volume_credits: credits,
    volume_policy: policy,
    laterality,
    measurement_type: measurement,
    exercise_kind: kind,
    fatigue_cost: fatigue,
    skill_demand: skill,
    program_roles: roles,
    default_rep_min: reps.min,
    default_rep_max: reps.max,
    warmup_eligible: warmup,
    power_eligible: power,
    ramp_eligible: ramp,
    cooldown_eligible: cooldown,
    demand_notes: notes,
    review_required: Boolean(exact.review_required) || reviewReasons.length > 0,
    review_reasons: unique(reviewReasons),
    confidence: 'high',
    anomalies: [],
    primary_assignment: primaryAssignment,
  };

  draft.anomalies = collectAnomalies(input, draft);
  if (draft.anomalies.length) {
    draft.review_required = true;
    draft.review_reasons = unique([...draft.review_reasons, ...draft.anomalies]);
  }
  draft.confidence = draft.review_required ? 'review' : draft.unmapped_muscle_labels.length ? 'medium' : 'high';
  if (draft.review_required) draft.confidence = 'review';
  return draft;
}

export function formatVolumeCredits(credits: VolumeCredit[]): string {
  return credits.map((row) => `${row.muscle}:${row.credit}`).join('; ');
}

export const HIGHLIGHT_NAMES = [
  'Jefferson Curl',
  'Nordic Hamstring Curl',
  'Side Plank',
  'Copenhagen Plank',
  'Suitcase Carry',
  'Farmer Carry',
  'B-Stance Romanian Deadlift',
  'Step-Up',
  'Step-Down',
  'Pogo Jump',
  'Squat Jump',
  'Push Press',
  'Upright Row',
  'T-Bar Row',
  'Seated Calf Raise',
  'Tibialis Raise',
  'Overhead Press',
  'Ab Wheel Rollout',
  'Front Raise',
];
