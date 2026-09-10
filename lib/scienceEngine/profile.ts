import { musclesFromFocusLabels, normalizeMuscleId, type MuscleId } from './taxonomy';
import type { ExperienceLevel, PrimaryGoal, TrainingProfile, WarmupDurationPref, WarmupStyle, PotentiationPref } from './types';

const GOAL_MAP: Record<string, PrimaryGoal> = {
  general_health: 'general_fitness',
  general_fitness: 'general_fitness',
  muscle: 'hypertrophy',
  hypertrophy: 'hypertrophy',
  strength: 'strength',
  strength_hypertrophy: 'strength_hypertrophy',
  muscular_endurance: 'muscular_endurance',
  endurance: 'muscular_endurance',
  athletic_performance: 'athletic_performance',
  athlete: 'athletic_performance',
  fat_loss: 'fat_loss_support',
  fat_loss_support: 'fat_loss_support',
};

const EXPERIENCE_MAP: Record<string, ExperienceLevel> = {
  beginner: 'beginner',
  novice: 'novice',
  intermediate: 'intermediate',
  advanced: 'advanced',
  athlete: 'advanced',
};

function asGoal(raw?: string | null): PrimaryGoal {
  return GOAL_MAP[String(raw || '').toLowerCase().trim()] || 'general_fitness';
}

function asExperience(raw?: string | null): ExperienceLevel {
  return EXPERIENCE_MAP[String(raw || '').toLowerCase().trim()] || 'beginner';
}

function asList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return raw.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

function asMuscles(raw: unknown): MuscleId[] {
  return asList(raw)
    .map((v) => normalizeMuscleId(v))
    .filter((v): v is MuscleId => !!v);
}

export function trainingProfileFromSources(input: {
  profile?: any;
  trainingProfile?: any;
  config?: {
    days?: string[];
    dayTypes?: Record<string, string>;
    focusMuscles?: string[];
    availableEquipment?: string[];
    includeCooldown?: boolean;
    weeks?: number;
    sessionMinutes?: number;
    primaryGoal?: string;
    experienceLevel?: string;
    workingLoads?: Record<string, number>;
    excludedExercises?: string[];
    injuryLimitations?: string[];
    supersetPreference?: string;
    varietyPreference?: string;
    trainingFeel?: string[];
    trainingSplit?: string;
    intakeNotes?: string;
  };
}): TrainingProfile {
  const profile = input.profile || {};
  const tp = input.trainingProfile || {};
  const config = input.config || {};
  const days = (config.days || []).filter(Boolean);
  const focusFromConfig = config.focusMuscles !== undefined;
  const focusLabels = focusFromConfig ? config.focusMuscles || [] : tp.priority_muscles_labels || [];
  const priorityMuscles = focusFromConfig
    ? musclesFromFocusLabels(Array.isArray(focusLabels) ? focusLabels : [])
    : [
        ...asMuscles(tp.priority_muscles),
        ...musclesFromFocusLabels(Array.isArray(focusLabels) ? focusLabels : []),
      ].filter((m, i, arr) => arr.indexOf(m) === i);

  const warmupStyle = (tp.warmup_style || 'dynamic') as WarmupStyle;
  const warmupDuration = (tp.warmup_duration || 'standard') as WarmupDurationPref;
  const trainingFeel = asList(config.trainingFeel !== undefined ? config.trainingFeel : tp.training_feel);
  const potentiationPreference = potentiationFromIntake(
    (tp.potentiation_preference || 'automatic') as PotentiationPref,
    trainingFeel
  );

  return {
    userId: profile.user_id || tp.user_id,
    primaryGoal: asGoal(config.primaryGoal || tp.primary_goal || profile.primary_goal),
    secondaryGoal: tp.secondary_goal ? asGoal(tp.secondary_goal) : null,
    experienceLevel: asExperience(config.experienceLevel || tp.experience_level || profile.experience_level),
    trainingDaysPerWeek: days.length || Number(tp.training_days_per_week) || 4,
    preferredDays: days.length ? days : undefined,
    preferredSessionMinutes: Number(config.sessionMinutes) > 0 ? Number(config.sessionMinutes) : Number(tp.preferred_session_minutes) || 60,
    availableEquipment: asList(
      Array.isArray(config.availableEquipment) && config.availableEquipment.length
        ? config.availableEquipment
        : tp.available_equipment || profile.available_equipment
    ),
    preferredExercises: asList(tp.preferred_exercises),
    excludedExercises: [...asList(tp.excluded_exercises), ...asList(config.excludedExercises)].filter(
      (n, i, arr) => arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i
    ),
    injuryLimitations: [...asList(tp.injury_limitations), ...asList(config.injuryLimitations)].filter(
      (n, i, arr) => arr.indexOf(n) === i
    ),
    painAreas: asList(tp.pain_areas),
    priorityMuscles,
    lowPriorityMuscles: asMuscles(tp.low_priority_muscles),
    trainingStylePreference: tp.training_style_preference || '',
    warmupStyle: ['minimal', 'dynamic', 'athletic', 'mobility_focused'].includes(warmupStyle) ? warmupStyle : 'dynamic',
    warmupDuration: ['quick', 'standard', 'extended'].includes(warmupDuration) ? warmupDuration : 'standard',
    potentiationPreference: ['off', 'automatic', 'athletic'].includes(potentiationPreference)
      ? potentiationPreference
      : 'automatic',
    age: profile.birth_year ? new Date().getFullYear() - Number(profile.birth_year) : tp.age || null,
    sexOptional: tp.sex_optional || profile.sex || null,
    focusLabels: Array.isArray(focusLabels) ? focusLabels.map(String) : [],
    explicitDayTypes: config.dayTypes,
    includeCooldown: config.includeCooldown !== false,
    workingLoads: config.workingLoads || {},
    weeks: Number(config.weeks) >= 1 ? Math.min(12, Math.floor(Number(config.weeks))) : 6,
    supersetPreference: (config.supersetPreference || tp.superset_preference || 'sometimes') as TrainingProfile['supersetPreference'],
    varietyPreference: (config.varietyPreference || tp.variety_preference || 'balanced') as TrainingProfile['varietyPreference'],
    trainingFeel,
    trainingSplit: String(config.trainingSplit || tp.training_split || ''),
    intakeNotes: String(config.intakeNotes !== undefined ? config.intakeNotes : tp.intake_notes || ''),
  };
}

function potentiationFromIntake(saved: PotentiationPref, feel: string[]): PotentiationPref {
  if (feel.includes('low_impact')) return 'off';
  if (feel.includes('athletic')) return 'athletic';
  if (['off', 'automatic', 'athletic'].includes(saved)) return saved;
  return 'automatic';
}
