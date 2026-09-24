import type { ProgressionDecisionKind, WeekStatus } from '../types';
import type { ProgressionDecisionResult } from '../decision';
import type { ReasonCode } from '../reasonCodes';

export const APPLY_ENGINE_VERSION = '2a3.0.1';

export type ApplicationStatus = 'mutated' | 'recorded_no_change' | 'not_applied';

export type ApplyAbortReason =
  | 'NO_ELIGIBLE_TARGET'
  | 'STALE_TARGET_PRESCRIPTION'
  | 'TARGET_HAS_PERFORMANCE'
  | 'TARGET_NOT_ELIGIBLE'
  | 'NON_AUTOMATIC_DECISION'
  | 'ALREADY_APPLIED'
  | 'OWNERSHIP_MISMATCH'
  | 'PROGRAM_MISMATCH'
  | 'HISTORY_GUARD'
  | null;

export type PlannedSetTarget = {
  id: string;
  exercise_id: string;
  set_type?: string | null;
  set_number?: number | null;
  target_weight?: string | number | null;
  target_reps?: string | null;
  rep_min?: number | null;
  rep_max?: number | null;
  target_rir?: number | null;
  is_deleted?: boolean | null;
};

export type CandidateExposure = {
  user_id: string;
  program_id: string;
  workout_id: string;
  exercise_id: string;
  catalog_exercise_id: string;
  exercise_name: string;
  program_role?: string | null;
  measurement_type?: string | null;
  laterality?: string | null;
  week: number;
  day_order: number;
  day_label?: string | null;
  week_status?: WeekStatus | null;
  has_performance: boolean;
  planned_sets: PlannedSetTarget[];
};

export type SourceExposureRef = {
  user_id: string;
  program_id: string;
  workout_id: string;
  exercise_id: string;
  catalog_exercise_id: string;
  week: number;
  day_order: number;
  log_date?: string | null;
  measurement_type?: string | null;
  program_role?: string | null;
  laterality?: string | null;
  exercise_name?: string | null;
};

export type LedgerEventRecord = {
  user_id: string;
  program_id: string;
  from_week: number | null;
  to_week: number | null;
  exercise_catalog_id: string | null;
  decision: string;
  reason_codes: string[];
  before_json: Record<string, unknown>;
  after_json: Record<string, unknown>;
  actor: 'engine';
  science_version: string | null;
  adaptation_engine_version: string | null;
  increment_source: string | null;
  increment_reason: string | null;
  increment_value: number | null;
  increment_unit: string | null;
  source_workout_id: string | null;
  source_exercise_id: string | null;
  source_log_date: string | null;
  target_workout_id: string | null;
  target_exercise_id: string | null;
  application_status: ApplicationStatus;
  application_key: string;
  target_fingerprint: string | null;
  confidence: string | null;
};

export type PlannedSetMutation = {
  planned_set_id: string;
  field: 'target_weight';
  from: string;
  to: string;
};

export type AdaptationApplicationResult = {
  status: ApplicationStatus;
  applied: boolean;
  mutated: boolean;
  abort_reason: ApplyAbortReason;
  decision: ProgressionDecisionKind;
  reason_codes: Array<ReasonCode | string>;
  explanation: { headline: string; why: string; next_line: string };
  target: CandidateExposure | null;
  before_load: string | null;
  after_load: string | null;
  application_key: string;
  target_fingerprint_expected: string | null;
  target_fingerprint_actual: string | null;
  event: LedgerEventRecord;
  mutations: PlannedSetMutation[];
};

export type ApplyProgressionInput = {
  source: SourceExposureRef;
  decision: ProgressionDecisionResult;
  candidates: CandidateExposure[];
  existing_events?: LedgerEventRecord[];
  expected_fingerprint?: string | null;
};

export const AUTOMATIC_DECISIONS: ProgressionDecisionKind[] = ['progress_load', 'build_reps', 'hold', 'reduce_load'];
export const NON_AUTOMATIC_DECISIONS: ProgressionDecisionKind[] = ['review_required', 'insufficient_data', 'pain_hold'];
export const ELIGIBLE_WEEK_STATUSES: WeekStatus[] = ['activated', 'in_progress', 'template'];
export const BLOCKED_WEEK_STATUSES: WeekStatus[] = ['completed', 'locked'];
