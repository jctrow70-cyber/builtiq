import type { MovementPatternId, MuscleId } from './taxonomy';

export type PrimaryGoal =
  | 'general_fitness'
  | 'hypertrophy'
  | 'strength'
  | 'strength_hypertrophy'
  | 'muscular_endurance'
  | 'athletic_performance'
  | 'fat_loss_support';

export type ExperienceLevel = 'beginner' | 'novice' | 'intermediate' | 'advanced';

export type WarmupStyle = 'minimal' | 'dynamic' | 'athletic' | 'mobility_focused';
export type WarmupDurationPref = 'quick' | 'standard' | 'extended';
export type PotentiationPref = 'off' | 'automatic' | 'athletic';
export type MusclePriority = 'high_priority' | 'normal' | 'maintenance';
export type ExerciseTypeKind = 'compound' | 'isolation';
export type ProgramRole = 'primary' | 'secondary' | 'accessory' | 'isolation' | 'warmup' | 'power' | 'conditioning';
export type StabilityLevel = 'low' | 'medium' | 'high';
export type FatigueLevel = 'low' | 'medium' | 'high';
export type SkillLevel = 'low' | 'medium' | 'high';
export type WarmupCategory = 'raise' | 'mobility' | 'activation' | 'integration' | 'potentiation' | 'specific_ramp';
export type WarmupFatigue = 'very_low' | 'low' | 'moderate';
export type ImpactLevel = 'none' | 'low' | 'moderate' | 'high';
export type Plane = 'sagittal' | 'frontal' | 'transverse' | 'multiplanar';
export type SplitDayType =
  | 'Full Body'
  | 'Upper Body'
  | 'Lower Body'
  | 'Push'
  | 'Pull'
  | 'Legs'
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Arms';
export type SetKind = 'warmup' | 'working' | 'backoff' | 'dropset' | 'amrap';

export type ProgressionDecision =
  | 'PROGRESS_LOAD'
  | 'PROGRESS_REPS'
  | 'MAINTAIN'
  | 'EVALUATE_UNDERPERFORMANCE'
  | 'REDUCE_LOAD'
  | 'REDUCE_VOLUME'
  | 'SUBSTITUTE'
  | 'DELOAD';

export type MuscleVolumeDecision =
  | 'MAINTAIN_VOLUME'
  | 'INCREASE_VOLUME'
  | 'DECREASE_VOLUME'
  | 'MAINTENANCE_VOLUME';

export type WeekStatus = 'progressing' | 'maintain' | 'fatigue_detected' | 'stalled' | 'low_adherence';

export type TrainingProfile = {
  userId?: string;
  primaryGoal: PrimaryGoal;
  secondaryGoal?: PrimaryGoal | null;
  experienceLevel: ExperienceLevel;
  trainingDaysPerWeek: number;
  preferredDays?: string[];
  preferredSessionMinutes: number;
  availableEquipment: string[];
  preferredExercises: string[];
  excludedExercises: string[];
  injuryLimitations: string[];
  painAreas: string[];
  priorityMuscles: MuscleId[];
  lowPriorityMuscles: MuscleId[];
  trainingStylePreference?: string;
  warmupStyle: WarmupStyle;
  warmupDuration: WarmupDurationPref;
  potentiationPreference: PotentiationPref;
  age?: number | null;
  sexOptional?: string | null;
  focusLabels?: string[];
  explicitDayTypes?: Record<string, string>;
  includeCooldown?: boolean;
  workingLoads?: Record<string, number>;
  weeks?: number;
};

export type CatalogExercise = {
  id?: string;
  name: string;
  movementPattern: MovementPatternId;
  exerciseType: ExerciseTypeKind;
  programRoles: ProgramRole[];
  equipment: string[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  stabilityRequirement: StabilityLevel;
  fatigueCost: FatigueLevel;
  skillRequirement: SkillLevel;
  suitableForBeginner: boolean;
  unilateral: boolean;
  defaultRepMin: number;
  defaultRepMax: number;
  videoUrl?: string | null;
  warmupSuitable: boolean;
  warmupCategory?: WarmupCategory | null;
  planes: Plane[];
  warmupFatigue: WarmupFatigue;
  impactLevel: ImpactLevel;
  raw?: any;
};

export type MuscleContribution = {
  muscle: MuscleId;
  contribution: number;
};

export type VolumeTarget = {
  muscle: MuscleId;
  priority: MusclePriority;
  minSets: number;
  maxSets: number;
  targetSets: number;
};

export type SplitDay = {
  dayLabel: string;
  workoutType: SplitDayType;
  targetMuscles: MuscleId[];
};

export type PrescribedSet = {
  setNumber: number;
  setType: SetKind;
  weight?: string;
  reps: string;
  rir?: number;
};

export type ExercisePrescription = {
  exerciseId?: string;
  name: string;
  role: ProgramRole;
  muscleGroup: string;
  primaryMuscles: MuscleId[];
  movementPattern: MovementPatternId;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  loadIncrement: number;
  coachingNote?: string;
  why?: string;
  setDetails?: PrescribedSet[];
  supersetGroupId?: string | null;
  supersetLabel?: string | null;
  supersetOrder?: number | null;
};

export type WarmupItem = {
  name: string;
  category: WarmupCategory;
  reps: string;
  sets: number;
  exerciseId?: string;
  muscleGroup?: string;
  why?: string;
};

export type RampSet = {
  percent: number;
  reps: number;
  weight?: string;
};

export type SessionPrep = {
  raise: WarmupItem[];
  mobility: WarmupItem[];
  activation: WarmupItem[];
  integration: WarmupItem[];
  potentiation: ExercisePrescription[];
  rampSets: RampSet[];
  warmupFatigueScore: number;
  potentiationFatigueScore: number;
  durationMinutes: number;
};

export type ScienceWorkout = {
  week: number;
  dayLabel: string;
  workoutType: SplitDayType;
  name: string;
  emphasis?: string;
  warmup: WarmupItem[];
  potentiation: ExercisePrescription[];
  rampFor?: string;
  rampSets: RampSet[];
  exercises: ExercisePrescription[];
  cooldown: WarmupItem[];
  estimatedMinutes: number;
};

export type ScienceProgram = {
  scienceVersion: string;
  name: string;
  summary: string;
  weeks: number;
  split: SplitDay[];
  volumeTargets: VolumeTarget[];
  workouts: ScienceWorkout[];
  explanations: string[];
};

export type PerWorkingSet = {
  weight: number;
  reps: number;
  rir: number;
  completed?: boolean;
};

export type ProgressionInput = {
  exerciseName: string;
  repMin: number;
  repMax: number;
  targetRir: number;
  loadIncrement: number;
  workingSets: PerWorkingSet[];
  painScore?: number | null;
  consecutivePoorExposures?: number;
};

export type ProgressionResult = {
  decision: ProgressionDecision;
  reason: string;
  nextLoad?: number;
  nextRepMin?: number;
  nextRepMax?: number;
  nextRir?: number;
  nextSets?: number;
};

export type ValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type WeeklyReview = {
  status: WeekStatus;
  prescribedWorkouts: number;
  completedWorkouts: number;
  exerciseAdjustments: ProgressionResult[];
  volumeAdjustments: { muscle: MuscleId; decision: MuscleVolumeDecision; currentSets: number; nextWeekSets: number; reason: string }[];
  deloadRecommended: boolean;
  reasons: string[];
};
