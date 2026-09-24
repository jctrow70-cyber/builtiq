import type {
  ExerciseAttemptOutcome,
  ExerciseSessionStatus,
  Laterality,
  LoadMode,
  MeasurementType,
  PainFlag,
  SessionStatus,
  SetSide,
} from './types';

export type LoggedSetInput = {
  planned_set_id?: string | null;
  is_extra_set?: boolean | null;
  is_deleted?: boolean | null;
  completed?: boolean | null;
  set_type?: string | null;
  snapshot_set_type?: string | null;
  snapshot_set_number?: number | null;
  snapshot_program_role?: string | null;
  snapshot_section?: string | null;
  snapshot_catalog_exercise_id?: string | null;
  snapshot_rep_min?: number | null;
  snapshot_rep_max?: number | null;
  snapshot_target_rir?: number | null;
  snapshot_target_reps?: string | null;
  snapshot_target_weight?: string | null;
  actual_weight?: string | number | null;
  actual_reps?: string | number | null;
  actual_rir?: number | string | null;
  actual_rpe?: string | number | null;
  actual_duration?: string | null;
  actual_distance?: string | null;
  side?: SetSide;
};

export type ExercisePrescriptionInput = {
  rep_min?: number | null;
  rep_max?: number | null;
  target_rir?: number | null;
  target_load?: number | null;
  working_set_count?: number | null;
};

export type ExerciseExposureInput = {
  log_date: string;
  catalog_exercise_id?: string | null;
  exercise_name?: string | null;
  program_role?: string | null;
  measurement_type?: MeasurementType | null;
  laterality?: Laterality | null;
  equipment?: string | null;
  movement_pattern?: string | null;
  loadable?: boolean;
  load_mode?: LoadMode | null;
  prescription?: ExercisePrescriptionInput | null;
  sets?: LoggedSetInput[];
  workout_status?: SessionStatus | null;
  exercise_status?: ExerciseSessionStatus | null;
  attempt_outcome?: ExerciseAttemptOutcome | null;
  pain_flag?: PainFlag | null;
  /** True when discomfort/pain is known to belong to this exercise. */
  pain_associated?: boolean;
  units?: 'lb' | 'kg';
  user_increment?: number | null;
  gym_increment?: number | null;
};

export type EvaluateProgressionInput = {
  current: ExerciseExposureInput;
  /** Older comparable sessions. Current may also appear; it will be de-duplicated. */
  history?: ExerciseExposureInput[];
};
