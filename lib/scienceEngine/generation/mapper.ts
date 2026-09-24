import { estimateSessionFromAi } from '../duration';
import { prescribeExercise } from '../prescription';
import type { CatalogExercise, ExercisePrescription, ScienceProgram, ScienceWorkout, TrainingProfile, WarmupItem } from '../types';
import { findByExerciseId } from './matchById';
import { lateralityOf, measurementTypeOf } from './library';
import { isRampEligiblePrimary, standardRampSets } from './ramps';
import type { AiPrepItem, AiStrengthExercise, AiWeekProgram, AiWorkoutPlan, DesignerExercise } from './types';

export function mapAiWeekToScience(
  ai: AiWeekProgram,
  seed: ScienceProgram,
  profile: TrainingProfile,
  catalogById: Map<string, CatalogExercise>,
  library: Map<string, DesignerExercise>
): ScienceProgram {
  const week1 = seed.split.map((day, index) => {
    const row = ai.workouts.find((w) => w.day_label === day.dayLabel) || ai.workouts[index];
    return row ? workoutFromAi(row, day.dayLabel, day.workoutType, profile, catalogById, library) : emptyDay(day.dayLabel, day.workoutType);
  });

  const workouts: ScienceWorkout[] = [];
  for (let week = 1; week <= seed.weeks; week += 1) {
    week1.forEach((w) =>
      workouts.push({
        ...w,
        week,
        exercises: w.exercises.map((ex) => ({ ...ex })),
        warmup: w.warmup.map((item) => ({ ...item })),
        potentiation: w.potentiation.map((ex) => ({ ...ex })),
        cooldown: w.cooldown.map((item) => ({ ...item })),
      })
    );
  }

  return {
    ...seed,
    summary: ai.summary || seed.summary,
    explanations: [
      ai.coaching_notes,
      ai.program_rationale?.weekly_idea,
      'Weeks after week 1 repeat this week-1 template. Logged-performance progression is not applied yet.',
    ].filter(Boolean) as string[],
    workouts,
  };
}

function workoutFromAi(
  row: AiWorkoutPlan,
  dayLabel: string,
  workoutType: ScienceWorkout['workoutType'],
  profile: TrainingProfile,
  catalogById: Map<string, CatalogExercise>,
  library: Map<string, DesignerExercise>
): ScienceWorkout {
  const exercises: ExercisePrescription[] = [];
  let groupNum = 0;
  (row.strength || []).forEach((block) => {
    const grouped = block.type !== 'straight_sets' && block.exercises.length >= 2;
    if (grouped) groupNum += 1;
    const groupId = grouped ? `ai-${dayLabel}-${groupNum}` : undefined;
    const label = grouped ? `Superset ${String.fromCharCode(64 + groupNum)}` : undefined;
    block.exercises.forEach((raw, i) => {
      const prescribed = mapStrength(raw, profile, catalogById, library);
      if (!prescribed) return;
      if (grouped) {
        prescribed.supersetGroupId = groupId;
        prescribed.supersetLabel = label;
        prescribed.supersetOrder = i + 1;
      }
      exercises.push(prescribed);
    });
  });

  const primary = exercises.find((ex) => ex.role === 'primary') || exercises[0];
  return {
    week: 1,
    dayLabel,
    workoutType,
    name: row.name || workoutType,
    emphasis: row.emphasis || '',
    warmup: (row.warmup || []).map((item) => mapPrep(item, catalogById, 'activation')).filter(Boolean) as WarmupItem[],
    potentiation: (row.potentiation || [])
      .map((item) => mapPrimer(item, profile, catalogById))
      .filter(Boolean) as ExercisePrescription[],
    rampFor: primary?.name,
    rampSets: [],
    exercises,
    cooldown: (row.cooldown || []).map((item) => mapPrep(item, catalogById, 'mobility')).filter(Boolean) as WarmupItem[],
    estimatedMinutes: estimateSessionFromAi(row, library),
  };
}

function mapStrength(
  raw: AiStrengthExercise,
  profile: TrainingProfile,
  catalogById: Map<string, CatalogExercise>,
  library: Map<string, DesignerExercise>
): ExercisePrescription | null {
  const catalog = findByExerciseId(catalogById, raw.exercise_id);
  const meta = library.get(raw.exercise_id);
  if (!catalog || !meta) return null;
  const prescribed = prescribeExercise({
    exercise: catalog,
    role: raw.role,
    profile,
    sets: Math.max(1, Math.min(6, Number(raw.working_sets) || 3)),
    why: raw.why && raw.why.trim() ? raw.why : `${raw.role} ${meta.movement_pattern} for ${meta.primary_muscles.join(', ') || meta.name}.`,
  });
  prescribed.exerciseId = catalog.id;
  prescribed.repMin = raw.rep_min;
  prescribed.repMax = Math.max(raw.rep_min, raw.rep_max);
  prescribed.targetRir = raw.target_rir;
  prescribed.restSeconds = raw.rest_seconds || prescribed.restSeconds;
  prescribed.laterality = meta.laterality;
  prescribed.measurementType = meta.measurement_type;
  const ramps = raw.ramp_sets?.length
    ? raw.ramp_sets
    : isRampEligiblePrimary(meta, raw.role, prescribed.repMax)
      ? standardRampSets(profile, prescribed.repMax)
      : [];
  if (ramps.length) {
    prescribed.setDetails = [
      ...ramps.map((ramp, i) => ({
        setNumber: i + 1,
        setType: 'warmup' as const,
        reps: String(ramp.reps),
      })),
      ...Array.from({ length: prescribed.sets }, (_, i) => ({
        setNumber: ramps.length + i + 1,
        setType: 'working' as const,
        reps: raw.reps_per_side && meta.laterality !== 'bilateral' ? `${prescribed.repMin}-${prescribed.repMax}/side` : `${prescribed.repMin}-${prescribed.repMax}`,
        rir: prescribed.targetRir,
      })),
    ];
  } else if (raw.reps_per_side && meta.laterality !== 'bilateral') {
    prescribed.setDetails = Array.from({ length: prescribed.sets }, (_, i) => ({
      setNumber: i + 1,
      setType: 'working' as const,
      reps: `${prescribed.repMin}-${prescribed.repMax}/side`,
      rir: prescribed.targetRir,
    }));
  }
  return prescribed;
}

function mapPrep(item: AiPrepItem, catalogById: Map<string, CatalogExercise>, category: WarmupItem['category']): WarmupItem | null {
  const catalog = findByExerciseId(catalogById, item.exercise_id);
  if (!catalog) return null;
  return {
    name: catalog.name,
    category,
    reps: item.prescription || String(catalog.defaultRepMax),
    sets: Math.max(1, Number(item.sets) || 1),
    exerciseId: catalog.id,
    muscleGroup: catalog.primaryMuscles[0],
    why: item.why,
    role: 'warmup',
    laterality: lateralityOf(catalog),
    measurementType: measurementTypeOf(catalog),
  };
}

function mapPrimer(item: AiPrepItem, profile: TrainingProfile, catalogById: Map<string, CatalogExercise>): ExercisePrescription | null {
  const catalog = findByExerciseId(catalogById, item.exercise_id);
  if (!catalog) return null;
  const prescribed = prescribeExercise({
    exercise: catalog,
    role: 'power',
    profile,
    sets: Math.max(1, Math.min(3, Number(item.sets) || 2)),
    why: item.why || 'Optional potentiation for this session.',
  });
  prescribed.exerciseId = catalog.id;
  prescribed.laterality = lateralityOf(catalog);
  prescribed.measurementType = measurementTypeOf(catalog);
  return prescribed;
}

function emptyDay(dayLabel: string, workoutType: ScienceWorkout['workoutType']): ScienceWorkout {
  return {
    week: 1,
    dayLabel,
    workoutType,
    name: workoutType,
    emphasis: '',
    warmup: [],
    potentiation: [],
    rampSets: [],
    exercises: [],
    cooldown: [],
    estimatedMinutes: 0,
  };
}
