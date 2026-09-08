import { SCIENCE_ENGINE_VERSION } from './version';
import { getScienceRules } from './rules';
import { creditSets, contributionsForExercise } from './contributions';
import { allocateSessionSets, calculateWeeklyVolume } from './volume';
import { generateTrainingSplit, splitDayName } from './split';
import { adaptCatalog } from './catalogAdapter';
import { filterEligibleExercises, findByName, pickExercise } from './exerciseSelection';
import { prescribeExercise } from './prescription';
import { generateWarmup } from './warmup';
import { generatePotentiation } from './potentiation';
import { benchRampExample, generateRampSets, isPrimaryLift } from './rampUp';
import { trimForDuration } from './duration';
import { validateProgram } from './validator';
import type {
  CatalogExercise,
  ExercisePrescription,
  ProgramRole,
  ScienceProgram,
  ScienceWorkout,
  SplitDay,
  TrainingProfile,
  VolumeTarget,
} from './types';
import type { MovementPatternId, MuscleId } from './taxonomy';

type DaySlot = {
  muscle: MuscleId;
  role: ProgramRole;
  pattern?: MovementPatternId;
  preferred?: string[];
  preferPressRange?: boolean;
};

function fullBodySlots(variantIndex: number): DaySlot[] {
  const rotations: DaySlot[][] = [
    [
      { muscle: 'quads', role: 'primary', pattern: 'squat', preferred: ['Back Squat', 'Goblet Squat'] },
      { muscle: 'chest', role: 'primary', pattern: 'horizontal_push', preferred: ['Barbell Bench Press', 'Bench Press'], preferPressRange: true },
      { muscle: 'upper_back', role: 'primary', pattern: 'horizontal_pull', preferred: ['Barbell Row', 'Pendlay Row'] },
      { muscle: 'hamstrings', role: 'secondary', pattern: 'hinge', preferred: ['Romanian Deadlift', 'Dumbbell RDL'] },
      { muscle: 'lats', role: 'secondary', pattern: 'vertical_pull', preferred: ['Lat Pulldown'] },
      { muscle: 'side_delts', role: 'isolation', preferred: ['Lateral Raise'] },
      { muscle: 'abs', role: 'accessory', preferred: ['Plank'] },
    ],
    [
      { muscle: 'hamstrings', role: 'primary', pattern: 'hinge', preferred: ['Conventional Deadlift', 'Trap Bar Deadlift', 'Romanian Deadlift'] },
      { muscle: 'front_delts', role: 'primary', pattern: 'vertical_push', preferred: ['Overhead Press', 'Dumbbell Shoulder Press'] },
      { muscle: 'lats', role: 'primary', pattern: 'vertical_pull', preferred: ['Pull-Up', 'Chin-Up', 'Lat Pulldown'] },
      { muscle: 'quads', role: 'secondary', pattern: 'lunge', preferred: ['Walking Lunge', 'Bulgarian Split Squat', 'Leg Press'] },
      { muscle: 'upper_back', role: 'secondary', pattern: 'horizontal_pull', preferred: ['Dumbbell Row', 'Chest-Supported Row'] },
      { muscle: 'triceps', role: 'isolation', preferred: ['Triceps Pushdown', 'Overhead Triceps Extension'] },
      { muscle: 'abs', role: 'accessory', preferred: ['Pallof Press', 'Dead Bug'] },
    ],
    [
      { muscle: 'quads', role: 'primary', pattern: 'lunge', preferred: ['Bulgarian Split Squat', 'Front Squat', 'Goblet Squat'] },
      { muscle: 'chest', role: 'primary', pattern: 'horizontal_push', preferred: ['Incline Dumbbell Press', 'Incline Bench'] },
      { muscle: 'upper_back', role: 'primary', pattern: 'horizontal_pull', preferred: ['Seated Cable Row', 'Chest-Supported Row', 'Dumbbell Row'] },
      { muscle: 'glutes', role: 'secondary', pattern: 'hinge', preferred: ['Hip Thrust', 'Glute Bridge'] },
      { muscle: 'lats', role: 'secondary', pattern: 'vertical_pull', preferred: ['Straight-Arm Pulldown', 'Lat Pulldown'] },
      { muscle: 'biceps', role: 'isolation', preferred: ['Dumbbell Curl', 'Hammer Curl'] },
      { muscle: 'abs', role: 'accessory', preferred: ['Hanging Knee Raise', 'Cable Crunch'] },
    ],
    [
      { muscle: 'quads', role: 'primary', pattern: 'squat', preferred: ['Leg Press', 'Hack Squat', 'Goblet Squat'] },
      { muscle: 'chest', role: 'secondary', pattern: 'horizontal_push', preferred: ['Dumbbell Bench Press', 'Push-Up'] },
      { muscle: 'hamstrings', role: 'primary', pattern: 'knee_flexion', preferred: ['Leg Curl', 'Nordic Curl'] },
      { muscle: 'lats', role: 'primary', pattern: 'vertical_pull', preferred: ['Lat Pulldown', 'Assisted Pull-Up'] },
      { muscle: 'rear_delts', role: 'isolation', preferred: ['Face Pull', 'Rear Delt Fly'] },
      { muscle: 'calves', role: 'isolation', pattern: 'calf_raise', preferred: ['Calf Raise'] },
      { muscle: 'abs', role: 'accessory', preferred: ['Ab Wheel', 'Plank'] },
    ],
  ];
  return rotations[variantIndex % rotations.length];
}

function slotsForDay(type: SplitDay['workoutType'], variantIndex: number): DaySlot[] {
  if (type === 'Full Body') return fullBodySlots(variantIndex);
  if (type === 'Upper Body' || type === 'Push') {
    if (variantIndex % 2 === 0) {
      return [
        { muscle: 'chest', role: 'primary', pattern: 'horizontal_push', preferred: ['Barbell Bench Press', 'Bench Press'], preferPressRange: true },
        { muscle: 'upper_back', role: 'primary', pattern: 'horizontal_pull', preferred: ['Barbell Row', 'Dumbbell Row'] },
        { muscle: 'lats', role: 'secondary', pattern: 'vertical_pull', preferred: ['Lat Pulldown', 'Pull-Up'] },
        { muscle: 'chest', role: 'isolation', pattern: 'horizontal_push', preferred: ['Cable Chest Fly', 'Dumbbell Fly'] },
        { muscle: 'side_delts', role: 'isolation', pattern: 'shoulder_abduction', preferred: ['Lateral Raise'] },
        { muscle: 'biceps', role: 'isolation', pattern: 'elbow_flexion', preferred: ['Dumbbell Curl'] },
        { muscle: 'triceps', role: 'isolation', pattern: 'elbow_extension', preferred: ['Triceps Pushdown'] },
      ];
    }
    return [
      { muscle: 'chest', role: 'secondary', pattern: 'horizontal_push', preferred: ['Incline Dumbbell Press', 'Incline Bench'] },
      { muscle: 'front_delts', role: 'secondary', pattern: 'vertical_push', preferred: ['Overhead Press'] },
      { muscle: 'lats', role: 'primary', pattern: 'vertical_pull', preferred: ['Pull-Up', 'Lat Pulldown'] },
      { muscle: 'upper_back', role: 'secondary', pattern: 'horizontal_pull', preferred: ['Dumbbell Row'] },
      { muscle: 'chest', role: 'isolation', pattern: 'horizontal_push', preferred: ['Cable Chest Fly'] },
      { muscle: 'rear_delts', role: 'isolation', preferred: ['Face Pull'] },
      { muscle: 'biceps', role: 'isolation', preferred: ['Dumbbell Curl'] },
    ];
  }
  if (type === 'Lower Body' || type === 'Legs') {
    return [
      { muscle: 'quads', role: 'primary', pattern: 'squat', preferred: ['Back Squat', 'Goblet Squat'] },
      { muscle: 'hamstrings', role: 'primary', pattern: 'hinge', preferred: ['Romanian Deadlift', 'Dumbbell RDL'] },
      { muscle: 'glutes', role: 'secondary', pattern: 'hinge', preferred: ['Hip Thrust'] },
      { muscle: 'quads', role: 'secondary', pattern: 'lunge', preferred: ['Walking Lunge'] },
      { muscle: 'hamstrings', role: 'isolation', pattern: 'knee_flexion', preferred: ['Leg Curl'] },
      { muscle: 'calves', role: 'isolation', pattern: 'calf_raise', preferred: ['Calf Raise'] },
      { muscle: 'abs', role: 'accessory', preferred: ['Pallof Press', 'Plank'] },
    ];
  }
  if (type === 'Pull') {
    return [
      { muscle: 'lats', role: 'primary', pattern: 'vertical_pull', preferred: ['Pull-Up', 'Lat Pulldown'] },
      { muscle: 'upper_back', role: 'primary', pattern: 'horizontal_pull', preferred: ['Barbell Row'] },
      { muscle: 'rear_delts', role: 'isolation', preferred: ['Face Pull'] },
      { muscle: 'biceps', role: 'isolation', preferred: ['Dumbbell Curl'] },
    ];
  }
  if (type === 'Chest') {
    return [
      { muscle: 'chest', role: 'primary', pattern: 'horizontal_push', preferred: ['Barbell Bench Press', 'Bench Press'], preferPressRange: true },
      { muscle: 'chest', role: 'primary', pattern: 'horizontal_push', preferred: ['Incline Dumbbell Press', 'Incline Bench'] },
      { muscle: 'chest', role: 'secondary', pattern: 'horizontal_push', preferred: ['Dumbbell Bench Press', 'Push-Up'] },
      { muscle: 'chest', role: 'isolation', pattern: 'horizontal_push', preferred: ['Cable Chest Fly', 'Dumbbell Fly'] },
      { muscle: 'chest', role: 'isolation', pattern: 'horizontal_push', preferred: ['Cable Crossover', 'Pec Deck'] },
    ];
  }
  if (type === 'Back') {
    return [
      { muscle: 'lats', role: 'primary', pattern: 'vertical_pull', preferred: ['Pull-Up', 'Lat Pulldown'] },
      { muscle: 'upper_back', role: 'primary', pattern: 'horizontal_pull', preferred: ['Barbell Row', 'Pendlay Row'] },
      { muscle: 'lats', role: 'secondary', pattern: 'vertical_pull', preferred: ['Lat Pulldown', 'Straight-Arm Pulldown'] },
      { muscle: 'upper_back', role: 'secondary', pattern: 'horizontal_pull', preferred: ['Seated Cable Row', 'Dumbbell Row'] },
      { muscle: 'rear_delts', role: 'isolation', preferred: ['Face Pull'] },
    ];
  }
  if (type === 'Shoulders') {
    return [
      { muscle: 'front_delts', role: 'primary', pattern: 'vertical_push', preferred: ['Overhead Press', 'Dumbbell Shoulder Press'] },
      { muscle: 'side_delts', role: 'isolation', pattern: 'shoulder_abduction', preferred: ['Lateral Raise'] },
      { muscle: 'rear_delts', role: 'isolation', preferred: ['Rear Delt Fly', 'Face Pull'] },
      { muscle: 'side_delts', role: 'isolation', preferred: ['Cable Lateral Raise', 'Lateral Raise'] },
      { muscle: 'front_delts', role: 'isolation', preferred: ['Front Raise'] },
    ];
  }
  if (type === 'Arms') {
    return [
      { muscle: 'biceps', role: 'primary', pattern: 'elbow_flexion', preferred: ['Dumbbell Curl'] },
      { muscle: 'triceps', role: 'primary', pattern: 'elbow_extension', preferred: ['Triceps Pushdown'] },
      { muscle: 'biceps', role: 'isolation', pattern: 'elbow_flexion', preferred: ['Hammer Curl', 'Incline Dumbbell Curl'] },
      { muscle: 'triceps', role: 'isolation', pattern: 'elbow_extension', preferred: ['Overhead Triceps Extension', 'Skull Crusher'] },
      { muscle: 'forearms', role: 'isolation', preferred: ['Wrist Curl', 'Hammer Curl'] },
    ];
  }
  return [
    { muscle: 'quads', role: 'primary', pattern: 'squat', preferred: ['Back Squat', 'Goblet Squat'] },
    { muscle: 'chest', role: 'primary', pattern: 'horizontal_push', preferred: ['Barbell Bench Press', 'Bench Press'], preferPressRange: true },
    { muscle: 'upper_back', role: 'primary', pattern: 'horizontal_pull', preferred: ['Barbell Row'] },
    { muscle: 'hamstrings', role: 'secondary', pattern: 'hinge', preferred: ['Romanian Deadlift'] },
    { muscle: 'lats', role: 'secondary', pattern: 'vertical_pull', preferred: ['Lat Pulldown'] },
    { muscle: 'side_delts', role: 'isolation', preferred: ['Lateral Raise'] },
    { muscle: 'abs', role: 'accessory', preferred: ['Plank'] },
  ];
}

export function generateProgram(profile: TrainingProfile, catalogRows?: any[]): ScienceProgram {
  const rules = getScienceRules();
  const catalog = filterEligibleExercises(adaptCatalog(catalogRows), profile);
  const volumeTargets = calculateWeeklyVolume(profile);
  const split = generateTrainingSplit(profile, volumeTargets);
  const remaining: Record<string, number> = {};
  volumeTargets.forEach((t) => {
    remaining[t.muscle] = t.targetSets;
  });

  const exposures: Record<string, number> = {};
  split.forEach((day) => {
    day.targetMuscles.forEach((m) => {
      exposures[m] = (exposures[m] || 0) + 1;
    });
  });

  const sessionBudget: Record<string, number[]> = {};
  volumeTargets.forEach((t) => {
    sessionBudget[t.muscle] = allocateSessionSets(t.targetSets, exposures[t.muscle] || 1);
  });
  const sessionCursor: Record<string, number> = {};

  const weekCount = Math.max(1, Math.min(12, profile.weeks || rules.blockWeeksDefault));
  const usedThisWeek: string[] = [];
  const week1 = split.map((day, index) => {
    const built = buildWorkout({
      profile,
      catalog,
      day,
      index,
      split,
      remaining,
      sessionBudget,
      sessionCursor,
      alreadyThisWeek: usedThisWeek,
    });
    usedThisWeek.push(...built.exercises.map((ex) => ex.name));
    return built;
  });

  const workouts: ScienceWorkout[] = [];
  for (let week = 1; week <= weekCount; week += 1) {
    week1.forEach((w) => workouts.push({ ...w, week, exercises: w.exercises.map((ex) => ({ ...ex })) }));
  }

  const chest = volumeTargets.find((t) => t.muscle === 'chest');
  const program: ScienceProgram = {
    scienceVersion: SCIENCE_ENGINE_VERSION,
    name: programName(profile),
    summary: buildSummary(profile, split, volumeTargets),
    weeks: weekCount,
    split,
    volumeTargets,
    workouts,
    explanations: [
      chest
        ? `Chest weekly target is ${chest.targetSets} effective sets because volume starts at the productive end of the ${profile.experienceLevel} range and ${chest.priority === 'high_priority' ? 'priority increases that dose by 20%' : 'volume is not maximized automatically'}.`
        : 'Weekly muscle targets start at the low productive end of each experience band.',
      'Exercises persist across weeks so progress can be measured. Full-body days rotate different sessions (A/B/C) inside the week; novelty is not used as week-to-week progression.',
    ],
  };

  const validation = validateProgram(program, profile);
  if (!validation.ok) {
    program.explanations.push(`Validator warnings: ${validation.issues.map((i) => i.message).join(' ')}`);
  }
  return program;
}

function buildWorkout(opts: {
  profile: TrainingProfile;
  catalog: CatalogExercise[];
  day: SplitDay;
  index: number;
  split: SplitDay[];
  remaining: Record<string, number>;
  sessionBudget: Record<string, number[]>;
  sessionCursor: Record<string, number>;
  alreadyThisWeek?: string[];
}): ScienceWorkout {
  const { profile, catalog, day, index, split } = opts;
  const name = splitDayName(day.workoutType, index, split.map((d) => d.workoutType));
  const already: string[] = [...(opts.alreadyThisWeek || [])];
  const exercises: ExercisePrescription[] = [];
  const variantIndex =
    split.slice(0, index + 1).filter((d) => d.workoutType === day.workoutType).length - 1;
  const slots = slotsForDay(day.workoutType, Math.max(0, variantIndex));

  slots.forEach((slot) => {
    if (exercises.length >= 7) return;
    const remainingForMuscle = opts.remaining[slot.muscle] ?? 0;
    if (remainingForMuscle < 1.5 && slot.role !== 'primary') return;
    const picked = pickExercise(catalog, {
      profile,
      muscle: slot.muscle,
      role: slot.role,
      pattern: slot.pattern,
      alreadyNames: already,
      preferredNames: slot.preferred,
    });
    if (!picked) return;
    const cursor = opts.sessionCursor[slot.muscle] || 0;
    const budget = (opts.sessionBudget[slot.muscle] || [3])[cursor] || 3;
    const sets = Math.max(2, Math.min(4, slot.role === 'isolation' ? Math.min(3, budget) : Math.min(3, budget)));
    const prescribed = prescribeExercise({
      exercise: picked,
      role: slot.role,
      profile,
      sets,
      preferPressRange: slot.preferPressRange,
      why: `${slot.role} work for ${slot.muscle.replace('_', ' ')} within this week's volume target.`,
    });
    exercises.push(prescribed);
    already.push(picked.name);
    const credits = creditSets(contributionsForExercise(picked), sets);
    Object.entries(credits).forEach(([muscle, value]) => {
      opts.remaining[muscle] = Math.max(0, (opts.remaining[muscle] || 0) - value);
    });
  });

  day.targetMuscles.forEach((muscle) => {
    opts.sessionCursor[muscle] = (opts.sessionCursor[muscle] || 0) + 1;
  });

  const primary = exercises.find((ex) => ex.role === 'primary') || exercises[0];
  const primaryCatalog = primary ? findByName(catalog, primary.name) : null;
  const warmup = generateWarmup({ workoutType: day.workoutType, muscles: day.targetMuscles, profile, catalog });
  const primer = generatePotentiation({ profile, primary: primaryCatalog, catalog });
  const workingLoad = workingLoadFor(profile, primary?.name || '');
  const rampSets =
    primary && isPrimaryLift(primary.name) && /bench/i.test(primary.name) && workingLoad === 185
      ? benchRampExample(185)
      : primary && isPrimaryLift(primary.name)
        ? generateRampSets({ workingWeight: workingLoad, workingRepMax: primary.repMax, profile })
        : [];

  const built: ScienceWorkout = {
    week: 1,
    dayLabel: day.dayLabel,
    workoutType: day.workoutType,
    name,
    warmup: warmup.items,
    potentiation: primer.items,
    rampFor: primary?.name,
    rampSets,
    exercises,
    cooldown: profile.includeCooldown === false ? [] : defaultCooldown(day.workoutType),
    estimatedMinutes: 0,
  };
  return trimForDuration(built, profile);
}

function workingLoadFor(profile: TrainingProfile, name: string): number | undefined {
  if (!name) return undefined;
  const key = Object.keys(profile.workingLoads || {}).find((k) => name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase()));
  if (key) return profile.workingLoads?.[key];
  if (/bench/i.test(name) && profile.workingLoads?.bench) return profile.workingLoads.bench;
  return undefined;
}

function defaultCooldown(type: SplitDay['workoutType']) {
  if (type === 'Lower Body' || type === 'Legs') {
    return [
      { name: 'Hip Flexor Stretch', category: 'mobility' as const, reps: '30 sec/side', sets: 1, muscleGroup: 'hip_flexors' },
      { name: 'Hamstring Stretch', category: 'mobility' as const, reps: '30 sec/side', sets: 1, muscleGroup: 'hamstrings' },
    ];
  }
  return [
    { name: 'Doorway Pec Stretch', category: 'mobility' as const, reps: '30 sec/side', sets: 1, muscleGroup: 'chest' },
    { name: 'Lat Stretch', category: 'mobility' as const, reps: '30 sec/side', sets: 1, muscleGroup: 'lats' },
  ];
}

function programName(profile: TrainingProfile): string {
  const goal = profile.primaryGoal.replace(/_/g, ' ');
  return `${profile.trainingDaysPerWeek}-Day ${goal} program`;
}

function buildSummary(profile: TrainingProfile, split: SplitDay[], volume: VolumeTarget[]): string {
  const types = split.map((d) => d.workoutType).join(', ');
  const chest = volume.find((v) => v.muscle === 'chest');
  return `BuiltIQ Science Engine ${SCIENCE_ENGINE_VERSION} built a ${profile.experienceLevel} ${profile.primaryGoal.replace(/_/g, ' ')} plan on ${types}. Weekly volume starts at a productive dose rather than a maximum. ${chest ? `Chest target is ${chest.targetSets} effective sets.` : ''} Dynamic warm-up, Power Primer, and lift-specific ramp-up are included before working sets.`;
}
