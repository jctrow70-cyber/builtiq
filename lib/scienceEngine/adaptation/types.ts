/**
 * Phase 2A types.
 * 2A.1 persists the data foundation.
 * 2A.2 produces deterministic next-exposure decisions and does not write prescriptions.
 * 2A.3 applies those decisions to future planned sets.
 */

export type WeekStatus = 'template' | 'activated' | 'in_progress' | 'completed' | 'locked';

export type SessionStatus = 'not_started' | 'in_progress' | 'completed' | 'partial' | 'skipped';

export type ExerciseSessionStatus = 'not_started' | 'completed' | 'partial' | 'skipped';

export type ExerciseAttemptOutcome = 'did_not_perform' | 'could_not_complete' | 'completed';

export type WorkoutFeel = 'easy' | 'good' | 'hard' | 'very_hard';

export type PainFlag = 'none' | 'discomfort' | 'pain_limiting' | 'stopped_due_to_pain';

export type SkipReason = 'time' | 'travel' | 'motivation' | 'illness' | 'pain' | 'equipment' | 'other';

export type AdaptationActor = 'engine' | 'ai' | 'user';

export type ProgressionConfidence = 'high' | 'performance_only' | 'hold';

export type IncrementSource = 'user' | 'gym' | 'equipment_default';

export type IncrementRounding = 'nearest_increment' | 'none';

export const ADAPTATION_ENGINE_VERSION = '2a2.0.0';

export type ProgressionDecisionKind =
  | 'progress_load'
  | 'build_reps'
  | 'hold'
  | 'reduce_load'
  | 'insufficient_data'
  | 'review_required'
  | 'pain_hold';

export type DecisionConfidence = ProgressionConfidence | 'insufficient' | 'review';

export type LoadMode = 'external' | 'bodyweight' | 'weighted_bodyweight' | 'assisted';

export type MeasurementType = 'reps' | 'time' | 'distance' | 'calories' | string;

export type Laterality = 'bilateral' | 'unilateral' | string;

export type SetSide = 'left' | 'right' | 'both' | null;

export const WEEK_STATUSES: WeekStatus[] = ['template', 'activated', 'in_progress', 'completed', 'locked'];
export const SESSION_STATUSES: SessionStatus[] = ['not_started', 'in_progress', 'completed', 'partial', 'skipped'];
export const EXERCISE_SESSION_STATUSES: ExerciseSessionStatus[] = ['not_started', 'completed', 'partial', 'skipped'];
export const WORKOUT_FEELS: WorkoutFeel[] = ['easy', 'good', 'hard', 'very_hard'];
export const PAIN_FLAGS: PainFlag[] = ['none', 'discomfort', 'pain_limiting', 'stopped_due_to_pain'];

export type AdaptationEventDraft = {
  user_id: string;
  program_id?: string | null;
  from_week?: number | null;
  to_week?: number | null;
  exercise_catalog_id?: string | null;
  decision: string;
  reason_codes: string[];
  before_json?: Record<string, unknown>;
  after_json?: Record<string, unknown>;
  actor: AdaptationActor;
  science_version?: string | null;
  increment_source?: IncrementSource | null;
  increment_reason?: string | null;
  increment_value?: number | null;
  increment_unit?: string | null;
};
