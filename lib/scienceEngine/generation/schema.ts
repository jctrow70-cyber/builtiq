/** Strict Structured Output schema. No example exercise names. */

const prepItem = {
  type: 'object',
  additionalProperties: false,
  required: ['exercise_id', 'sets', 'prescription', 'why'],
  properties: {
    exercise_id: { type: 'string' },
    sets: { type: 'integer' },
    prescription: { type: 'string' },
    why: { type: 'string' },
  },
};

const rampSet = {
  type: 'object',
  additionalProperties: false,
  required: ['percent_of_working', 'reps'],
  properties: {
    percent_of_working: { type: 'number' },
    reps: { type: 'integer' },
  },
};

const strengthExercise = {
  type: 'object',
  additionalProperties: false,
  required: [
    'exercise_id',
    'role',
    'working_sets',
    'rep_min',
    'rep_max',
    'target_rir',
    'rest_seconds',
    'reps_per_side',
    'measurement_type',
    'ramp_sets',
    'why',
  ],
  properties: {
    exercise_id: { type: 'string' },
    role: { type: 'string', enum: ['primary', 'secondary', 'isolation', 'accessory'] },
    working_sets: { type: 'integer' },
    rep_min: { type: 'integer' },
    rep_max: { type: 'integer' },
    target_rir: { type: 'integer' },
    rest_seconds: { type: 'integer' },
    reps_per_side: { type: 'boolean' },
    measurement_type: { type: 'string', enum: ['reps', 'time', 'distance'] },
    ramp_sets: { type: 'array', items: rampSet },
    why: { type: 'string' },
  },
};

const strengthBlock = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'exercises'],
  properties: {
    type: { type: 'string', enum: ['straight_sets', 'superset', 'tri_set'] },
    exercises: { type: 'array', items: strengthExercise },
  },
};

const workout = {
  type: 'object',
  additionalProperties: false,
  required: ['day_label', 'name', 'emphasis', 'estimated_minutes', 'warmup', 'potentiation', 'strength', 'cooldown'],
  properties: {
    day_label: { type: 'string' },
    name: { type: 'string' },
    emphasis: { type: 'string' },
    estimated_minutes: { type: 'integer' },
    warmup: { type: 'array', items: prepItem },
    potentiation: { type: 'array', items: prepItem },
    strength: { type: 'array', items: strengthBlock },
    cooldown: { type: 'array', items: prepItem },
  },
};

export const WEEK_PROGRAM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'summary',
    'coaching_notes',
    'program_rationale',
    'weekly_targets',
    'workouts',
    'progression',
    'quality_review',
  ],
  properties: {
    schema_version: { type: 'string' },
    summary: { type: 'string' },
    coaching_notes: { type: 'string' },
    program_rationale: {
      type: 'object',
      additionalProperties: false,
      required: ['weekly_idea', 'fatigue_plan', 'consistency_plan'],
      properties: {
        weekly_idea: { type: 'string' },
        fatigue_plan: { type: 'string' },
        consistency_plan: { type: 'string' },
      },
    },
    weekly_targets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['muscle', 'planned_working_sets'],
        properties: {
          muscle: { type: 'string' },
          planned_working_sets: { type: 'number' },
        },
      },
    },
    workouts: { type: 'array', items: workout },
    progression: {
      type: 'object',
      additionalProperties: false,
      required: ['strategy', 'primary_exercise_ids', 'accessory_rotation_allowed', 'weekly_rules'],
      properties: {
        strategy: { type: 'string' },
        primary_exercise_ids: { type: 'array', items: { type: 'string' } },
        accessory_rotation_allowed: { type: 'boolean' },
        weekly_rules: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['week', 'load_change', 'set_change', 'rir_change', 'is_deload', 'notes'],
            properties: {
              week: { type: 'integer' },
              load_change: { type: 'string' },
              set_change: { type: 'integer' },
              rir_change: { type: 'integer' },
              is_deload: { type: 'boolean' },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
    quality_review: {
      type: 'object',
      additionalProperties: false,
      required: ['passed', 'notes', 'self_check'],
      properties: {
        passed: { type: 'boolean' },
        notes: { type: 'string' },
        self_check: {
          type: 'object',
          additionalProperties: false,
          required: ['days_complementary', 'primaries_not_cloned', 'warmup_matches_session', 'fits_session_minutes'],
          properties: {
            days_complementary: { type: 'boolean' },
            primaries_not_cloned: { type: 'boolean' },
            warmup_matches_session: { type: 'boolean' },
            fits_session_minutes: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const;

export const WEEK_PROGRAM_SCHEMA_NAME = 'builtiq_week_program';
