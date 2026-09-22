import { getScienceRules } from '../rules';
import { calculateWeeklyVolume, preferredExposuresPerWeek } from '../volume';
import { maxStrengthMoves, minStrengthMoves } from '../duration';
import type { RecentLiftSummary } from '../recentTraining';
import type { CatalogExercise, ScienceProgram, TrainingProfile } from '../types';
import { buildDesignerLibraries } from './library';
import { GENERATION_SCHEMA_VERSION, type GenerationContext, type GenerationMode } from './types';

export function buildGenerationContext(opts: {
  profile: TrainingProfile;
  program: ScienceProgram;
  catalog: CatalogExercise[];
  userPrompt: string;
  programName: string;
  mode: GenerationMode;
  recentTraining?: RecentLiftSummary[];
}): { context: GenerationContext; catalogById: Map<string, CatalogExercise> } {
  const { profile, program, catalog, userPrompt, programName, mode } = opts;
  const rules = getScienceRules();
  const volume = program.volumeTargets.length ? program.volumeTargets : calculateWeeklyVolume(profile);
  const libraries = buildDesignerLibraries(catalog, profile);
  const minutes = profile.preferredSessionMinutes || 60;
  const warmupBand = rules.warmupMinutes[profile.warmupDuration] || rules.warmupMinutes.standard;

  const context: GenerationContext = {
    schema_version: GENERATION_SCHEMA_VERSION,
    request: {
      user_request: userPrompt,
      program_name: programName,
      weeks: program.weeks,
      mode,
    },
    athlete: {
      primary_goal: profile.primaryGoal,
      secondary_goal: profile.secondaryGoal || null,
      experience_level: profile.experienceLevel,
      age: profile.age ?? null,
      sex: profile.sexOptional || null,
      training_days_per_week: profile.trainingDaysPerWeek,
      preferred_days: profile.preferredDays || [],
      session_minutes: minutes,
      equipment: profile.availableEquipment,
      training_split: profile.trainingSplit || '',
      superset_preference: profile.supersetPreference || 'sometimes',
      variety_preference: profile.varietyPreference || 'balanced',
      training_feel: profile.trainingFeel || [],
      priority_muscles: profile.priorityMuscles,
      low_priority_muscles: profile.lowPriorityMuscles,
      preferred_exercises: profile.preferredExercises,
      excluded_exercise_ids: [],
      excluded_exercise_names: profile.excludedExercises,
      pain_areas: profile.painAreas,
      limitations: profile.injuryLimitations,
      notes: profile.intakeNotes || '',
    },
    schedule: {
      days: program.split.map((day) => ({
        day_label: day.dayLabel,
        requested_type: day.workoutType,
      })),
    },
    constraints: {
      session_minutes: minutes,
      rir_min: 0,
      rir_max: 4,
      working_sets_per_exercise: { min: 1, max: 6 },
      typical_strength_moves: { min: minStrengthMoves(minutes), max: maxStrengthMoves(minutes) },
      warmup_minutes: { min: warmupBand[0], max: warmupBand[1] },
      no_medical_diagnosis: true,
      excluded_exercise_ids: [],
      equipment_must_match: profile.availableEquipment.length > 0,
      laterality_rule: 'unilateral_reps_are_per_side',
    },
    weekly_volume_targets: volume.map((t) => ({
      muscle: t.muscle,
      target_working_sets: t.targetSets,
      min_sets: t.minSets,
      max_sets: t.maxSets,
      priority: t.priority,
      preferred_exposures: preferredExposuresPerWeek(t.targetSets),
    })),
    recent_training: {
      window_days: 56,
      lifts: (opts.recentTraining || []).map((row) => ({
        exercise_id: null,
        name: row.name,
        sessions: row.sessions,
        last_date: row.last_date,
        best_weight: row.best_weight || null,
      })),
    },
    previous_program: null,
    recovery: null,
    candidate_library: libraries.candidate_library,
    warmup_library: libraries.warmup_library,
  };

  return { context, catalogById: libraries.catalogById };
}
