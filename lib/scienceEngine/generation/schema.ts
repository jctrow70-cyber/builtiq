/** Strict Structured Output schema. Design fields only — science owns validation, ramps, and progression. */

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
  required: ['schema_version', 'summary', 'coaching_notes', 'workouts', 'progression'],
  properties: {
    schema_version: { type: 'string' },
    summary: { type: 'string' },
    coaching_notes: { type: 'string' },
    workouts: { type: 'array', items: workout },
    progression: {
      type: 'object',
      additionalProperties: false,
      required: ['strategy', 'primary_exercise_ids'],
      properties: {
        strategy: { type: 'string' },
        primary_exercise_ids: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

export const WEEK_PROGRAM_SCHEMA_NAME = 'builtiq_week_program';
