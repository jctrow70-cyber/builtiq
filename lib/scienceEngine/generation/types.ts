export const GENERATION_SCHEMA_VERSION = '2.0';

export type GenerationMode = 'full_program' | 'single_session';
export type GenerationMethod = 'ai' | 'ai_repaired' | 'science_fallback';
export type ValidationSeverity = 'error' | 'warning' | 'info';
export type Laterality = 'bilateral' | 'unilateral' | 'alternating';
export type MeasurementType = 'reps' | 'time' | 'distance';
export type BlockType = 'straight_sets' | 'superset' | 'tri_set';
export type StrengthRole = 'primary' | 'secondary' | 'isolation' | 'accessory';

export type DesignerExercise = {
  exercise_id: string;
  name: string;
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  laterality: Laterality;
  measurement_type: MeasurementType;
  exercise_kind: 'compound' | 'isolation';
  program_roles: string[];
  fatigue_cost: 'low' | 'medium' | 'high';
  skill_level: 'low' | 'medium' | 'high';
  warmup_eligible: boolean;
  power_eligible: boolean;
  default_rep_min: number;
  default_rep_max: number;
  contraindications: string[];
};

export type GenerationContext = {
  schema_version: typeof GENERATION_SCHEMA_VERSION;
  request: {
    user_request: string;
    program_name: string;
    weeks: number;
    mode: GenerationMode;
  };
  athlete: {
    primary_goal: string;
    secondary_goal: string | null;
    experience_level: string;
    age: number | null;
    sex: string | null;
    training_days_per_week: number;
    preferred_days: string[];
    session_minutes: number;
    equipment: string[];
    training_split: string;
    superset_preference: string;
    variety_preference: string;
    training_feel: string[];
    priority_muscles: string[];
    low_priority_muscles: string[];
    preferred_exercises: string[];
    excluded_exercise_ids: string[];
    excluded_exercise_names: string[];
    pain_areas: string[];
    limitations: string[];
    notes: string;
  };
  schedule: {
    days: Array<{ day_label: string; requested_type: string }>;
  };
  constraints: {
    session_minutes: number;
    rir_min: number;
    rir_max: number;
    working_sets_per_exercise: { min: number; max: number };
    typical_strength_moves: { min: number; max: number };
    warmup_minutes: { min: number; max: number };
    no_medical_diagnosis: true;
    excluded_exercise_ids: string[];
    equipment_must_match: boolean;
    laterality_rule: 'unilateral_reps_are_per_side';
  };
  weekly_volume_targets: Array<{
    muscle: string;
    target_working_sets: number;
    min_sets: number;
    max_sets: number;
    priority: string;
    preferred_exposures: [number, number];
  }>;
  recent_training: {
    window_days: number;
    lifts: Array<{
      exercise_id: string | null;
      name: string;
      sessions: number;
      last_date: string;
      best_weight: string | null;
    }>;
  };
  previous_program: null;
  recovery: null;
  candidate_library: DesignerExercise[];
  warmup_library: DesignerExercise[];
};

export type AiRampSet = {
  percent_of_working: number;
  reps: number;
};

export type AiStrengthExercise = {
  exercise_id: string;
  role: StrengthRole;
  working_sets: number;
  rep_min: number;
  rep_max: number;
  target_rir: number;
  rest_seconds: number;
  reps_per_side: boolean;
  measurement_type: MeasurementType;
  ramp_sets: AiRampSet[];
  why: string;
};

export type AiPrepItem = {
  exercise_id: string;
  sets: number;
  prescription: string;
  why: string;
};

export type AiWorkoutPlan = {
  day_label: string;
  name: string;
  emphasis: string;
  estimated_minutes: number;
  warmup: AiPrepItem[];
  potentiation: AiPrepItem[];
  strength: Array<{
    type: BlockType;
    exercises: AiStrengthExercise[];
  }>;
  cooldown: AiPrepItem[];
};

export type AiWeekProgram = {
  schema_version: string;
  summary: string;
  coaching_notes: string;
  program_rationale: {
    weekly_idea: string;
    fatigue_plan: string;
    consistency_plan: string;
  };
  weekly_targets: Array<{ muscle: string; planned_working_sets: number }>;
  workouts: AiWorkoutPlan[];
  progression: {
    strategy: string;
    primary_exercise_ids: string[];
    accessory_rotation_allowed: boolean;
    weekly_rules: Array<{
      week: number;
      load_change: string;
      set_change: number;
      rir_change: number;
      is_deload: boolean;
      notes: string;
    }>;
  };
  quality_review: {
    passed: boolean;
    notes: string;
    self_check: {
      days_complementary: boolean;
      primaries_not_cloned: boolean;
      warmup_matches_session: boolean;
      fits_session_minutes: boolean;
    };
  };
};

export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  day_label?: string;
  exercise_id?: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type GenerationRun = {
  method: GenerationMethod;
  model: string;
  promptVersion: string;
  scienceVersion: string;
  program: AiWeekProgram | null;
  context: GenerationContext;
  validation: ValidationResult;
  repairAttempts: number;
  aiError: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  rawOutput: unknown;
};
