/**
 * Science 1.4.13 quality corrections from the Et plan 4 audit.
 * The saved program is not modified. This file replays its prescription as a fixture.
 */
import { catalogExerciseFromRow, FALLBACK_CATALOG } from '../catalogAdapter';
import { toDesignerExercise } from './library';
import { RAMP_REST_SECONDS, RAMP_SET_SECONDS } from '../durationConstants';
import { classifySessionDuration, estimateWorkoutBreakdown } from '../duration';
import { generateProgram } from '../generateProgram';
import { prepItemSeconds } from '../prescriptionTime';
import { trainingProfileFromSources } from '../profile';
import { validateProgram } from '../validator';
import { buildGenerationContext } from './context';
import { buildDesignerInstructions } from './prompt';
import { repairAiProgram } from './repairAiProgram';
import { validateAiProgram } from './validateAiProgram';
import type { AiStrengthExercise, AiWeekProgram, AiWorkoutPlan } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function idOf(name: string): string {
  const hit = FALLBACK_CATALOG.find((ex) => ex.name === name);
  if (!hit?.id) throw new Error(`Fallback catalog missing ${name}`);
  return String(hit.id);
}

function rawRow(name: string, pattern: string, category: string, targets: Array<{ role: string; muscle: string; percentage: number }>) {
  return {
    id: `audit-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    movement_pattern: pattern,
    category,
    equipment: 'dumbbell',
    muscle_targets: targets,
    is_archived: false,
  };
}

function lift(name: string, role: AiStrengthExercise['role'], extra?: Partial<AiStrengthExercise>): AiStrengthExercise {
  return {
    exercise_id: idOf(name),
    role,
    working_sets: 3,
    rep_min: role === 'primary' ? 5 : 8,
    rep_max: role === 'primary' ? 8 : 12,
    target_rir: 2,
    rest_seconds: role === 'primary' ? 120 : 60,
    reps_per_side: false,
    measurement_type: 'reps',
    why: `${role} ${name}`,
    ...extra,
  };
}

function day(label: string, strength: AiWorkoutPlan['strength']): AiWorkoutPlan {
  return {
    day_label: label,
    name: 'Athletic Push + Hinge',
    emphasis: 'Upper push and hinge',
    estimated_minutes: 45,
    warmup: [
      { exercise_id: idOf('Scapular Push-Up'), sets: 2, prescription: '8-10', why: 'Scap prep' },
      { exercise_id: idOf('Band Row'), sets: 1, prescription: '12', why: 'Pull prep' },
    ],
    potentiation: [{ exercise_id: idOf('Broad Jump'), sets: 2, prescription: '3-5', why: 'Explosive prep' }],
    strength,
    cooldown: [
      { exercise_id: idOf('Hamstring Stretch'), sets: 1, prescription: '30 sec/side', why: 'Ease hamstrings' },
      { exercise_id: idOf('Doorway Pec Stretch'), sets: 1, prescription: '30 sec/side', why: 'Ease chest' },
    ],
  };
}

const athleticNotes =
  'Athletic performance. Intermediate. Hybrid. Monday and Friday. 45 minutes. Identical workouts. Upper-body push emphasis. Lower-body pull emphasis. Prioritize chest, hamstrings, and glutes. De-emphasize upper back, lats, and quads.';

export async function runQualityCorrectionChecks() {
  const hammer = catalogExerciseFromRow(
    rawRow('Hammer Curl', 'isolation', 'strength', [
      { role: 'primary', muscle: 'Brachialis', percentage: 60 },
      { role: 'secondary', muscle: 'Biceps', percentage: 20 },
      { role: 'secondary', muscle: 'Forearms', percentage: 20 },
    ])
  );
  const knee = catalogExerciseFromRow(
    rawRow('Hanging Knee Raise', 'isolation', 'strength', [
      { role: 'primary', muscle: 'Abs', percentage: 60 },
      { role: 'secondary', muscle: 'Hip Flexors', percentage: 20 },
    ])
  );
  const face = catalogExerciseFromRow(
    rawRow('Face Pull', 'pull_horizontal', 'strength', [
      { role: 'primary', muscle: 'Rear Delts', percentage: 60 },
      { role: 'secondary', muscle: 'Upper Back', percentage: 20 },
    ])
  );
  const rdl = catalogExerciseFromRow(
    rawRow('Romanian Deadlift', 'hinge', 'strength', [
      { role: 'primary', muscle: 'Hamstrings', percentage: 60 },
      { role: 'secondary', muscle: 'Glutes', percentage: 20 },
      { role: 'secondary', muscle: 'Back', percentage: 20 },
    ])
  );
  assert(hammer && hammer.movementPattern === 'elbow_flexion' && hammer.exerciseType === 'isolation', `Hammer Curl classified as ${hammer?.movementPattern}/${hammer?.exerciseType}`);
  assert(knee && knee.movementPattern === 'core_flexion' && knee.exerciseType === 'isolation', `Knee raise classified as ${knee?.movementPattern}/${knee?.exerciseType}`);
  assert(face && face.movementPattern === 'horizontal_pull' && face.exerciseType === 'isolation' && face.fatigueCost === 'low', `Face Pull classified as ${face?.movementPattern}/${face?.exerciseType}/${face?.fatigueCost}`);
  assert(toDesignerExercise(face!).program_roles.includes('accessory') || toDesignerExercise(face!).program_roles.includes('isolation'), 'Face Pull should be an accessory, not a heavy primary');
  assert(!rdl?.secondaryMuscles.includes('upper_back') && rdl?.secondaryMuscles.includes('spinal_erectors'), `RDL Back mapped to ${rdl?.secondaryMuscles.join(', ')}`);
  assert(rdl?.fatigueCost === 'high', `RDL fatigue should be high when metadata is missing, got ${rdl?.fatigueCost}`);
  assert(hammer?.secondaryMuscles.includes('biceps'), 'Hammer Curl biceps credit is preserved');

  assert(prepItemSeconds({ prescription: '30-45 sec per side', sets: 1 }) === prepItemSeconds({ prescription: '30-45 sec', sets: 2 }), 'Per-side timed work counts both sides');
  const legacyRamp = 4 * (RAMP_SET_SECONDS + RAMP_REST_SECONDS);
  const persistedRamp = 4 * (RAMP_SET_SECONDS + 120);
  const shared = {
    warmupItems: [
      { name: "World's Greatest Stretch", category: 'mobility' as const, reps: '30-45 sec per side', sets: 2 },
      { name: 'Scapular Push-Up', category: 'activation' as const, reps: '8-10', sets: 2 },
      { name: 'Wall Slide', category: 'mobility' as const, reps: '8-10', sets: 2 },
    ],
    potentiation: [
      {
        name: 'Broad Jump',
        sets: 2,
        restSeconds: 75,
        role: 'power' as const,
        muscleGroup: 'glutes',
        primaryMuscles: [],
        movementPattern: 'jump' as const,
        repMin: 3,
        repMax: 5,
        targetRir: null,
        loadIncrement: 0,
      },
    ],
    exercises: [
      prescription('Bench Press', 3, 120, 'horizontal_push'),
      prescription('Romanian Deadlift', 3, 120, 'hinge'),
      prescription('Overhead Press', 2, 90, 'vertical_push'),
      prescription('Face Pull', 2, 90, 'horizontal_pull'),
      prescription('Hammer Curl', 2, 90, 'elbow_flexion', 'ss-arms'),
      prescription('Hanging Knee Raise', 2, 90, 'core_flexion', 'ss-arms'),
    ],
    cooldownItems: [
      { sets: 1, reps: '30-45 sec per side' },
      { sets: 1, reps: '45-60 sec per side' },
      { sets: 1, reps: '45-60 sec per side' },
    ],
  };
  const before = estimateWorkoutBreakdown({ ...shared, rampCount: 4 });
  const after = estimateWorkoutBreakdown({ ...shared, rampCount: 4, rampRests: [120, 120, 120, 120] });
  assert(before.rampSeconds === legacyRamp, `Default ramp rest should stay ${RAMP_REST_SECONDS}s`);
  assert(after.rampSeconds === persistedRamp, 'Estimator must use the persisted ramp rest');
  assert(after.minutes >= 58 && after.minutes > before.minutes, `Et plan fixture was ${before.minutes} min at default ramp rest and ${after.minutes} min at the saved 120s ramp rest`);
  assert(classifySessionDuration(after.minutes, 45).over === 'error', `A ${after.minutes}-minute session must not pass a 45-minute request`);

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 45, superset_preference: 'sometimes' },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      focusMuscles: ['Chest', 'Hamstrings', 'Glutes'],
      sessionMinutes: 45,
      weeks: 4,
      intakeNotes: athleticNotes,
      supersetPreference: 'sometimes',
      primaryGoal: 'athletic_performance',
      experienceLevel: 'intermediate',
    },
  });
  const program = generateProgram(profile, FALLBACK_CATALOG);
  const check = validateProgram(program, profile);
  assert(check.ok, `New athletic program invalid: ${check.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ')}`);
  const week = program.workouts.filter((workout) => workout.week === 1);
  assert(week.length === 2, 'New program should have Monday and Friday');
  const names = week.map((workout) => workout.exercises.map((exercise) => `${exercise.name} ${exercise.sets}x${exercise.repMin}-${exercise.repMax} rest ${exercise.restSeconds}`).join(' | '));
  assert(names[0] === names[1], `New program days diverged: ${names.join(' vs ')}`);
  week.forEach((workout) => {
    assert(classifySessionDuration(workout.estimatedMinutes, 45).over !== 'error', `${workout.dayLabel} estimated ${workout.estimatedMinutes} min`);
    assert(
      workout.exercises.some((exercise) => /romanian|\brdl\b/i.test(exercise.name)),
      `${workout.dayLabel} hamstring priority used ${workout.exercises.map((exercise) => exercise.name).join(', ')}`
    );
    assert(
      !workout.exercises.some((exercise) => /conventional deadlift|trap bar deadlift/i.test(exercise.name)),
      `${workout.dayLabel} replaced the hamstring hinge with a conventional deadlift`
    );
  });
  const context = buildGenerationContext({
    profile,
    program,
    catalog: FALLBACK_CATALOG,
    userPrompt: athleticNotes,
    programName: 'Athletic quality',
    mode: 'full_program',
  }).context;
  const catalogById = new Map(FALLBACK_CATALOG.map((exercise) => [String(exercise.id), exercise]));
  const emptyEmphasis = validateAiProgram(
    {
      schema_version: '2.0',
      summary: 'Thin emphasis',
      workouts: [
        day('Mon', [
          { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 3, rest_seconds: 120 })] },
          { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary', { working_sets: 3, rest_seconds: 120 })] },
        ]),
      ],
    },
    context,
    catalogById
  );
  assert(
    emptyEmphasis.issues.some((issue) => issue.code === 'EMPHASIS_THIN'),
    'One push and one hinge should be flagged as a thin emphasis'
  );
  assert(
    !emptyEmphasis.issues.some((issue) => /lats|quads|upper_back/.test(issue.message) && /outside the requested emphasis \(0/.test(issue.message)),
    'Zero work on a de-emphasized muscle must not warn'
  );
  const excess = validateAiProgram(
    {
      schema_version: '2.0',
      summary: 'Too much pull',
      workouts: [
        day('Mon', [
          { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary')] },
          { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary')] },
          { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary')] },
          { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
          { type: 'straight_sets', exercises: [lift('Face Pull', 'accessory', { working_sets: 4, rest_seconds: 60 })] },
          { type: 'straight_sets', exercises: [lift('Barbell Row', 'secondary', { working_sets: 4, rest_seconds: 90 })] },
        ]),
        day('Fri', [
          { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary')] },
          { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary')] },
          { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary')] },
          { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
          { type: 'straight_sets', exercises: [lift('Face Pull', 'accessory', { working_sets: 4, rest_seconds: 60 })] },
          { type: 'straight_sets', exercises: [lift('Barbell Row', 'secondary', { working_sets: 4, rest_seconds: 90 })] },
        ]),
      ],
    },
    context,
    catalogById
  );
  assert(excess.issues.some((issue) => issue.code === 'EMPHASIS_EXCESS' && /upper_back/.test(issue.message)), 'Meaningful upper-back volume should be detected');
  const specializedGap = validateAiProgram(
    {
      schema_version: '2.0',
      summary: 'Specialized push and hinge',
      workouts: ['Mon', 'Wed', 'Fri'].map((label) =>
        day(label, [
          { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary')] },
          { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary')] },
          { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary')] },
          { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
        ])
      ),
    },
    context,
    catalogById
  );
  assert(
    !specializedGap.issues.some((issue) => issue.severity === 'error' && issue.code === 'PATTERN_GAP'),
    `Specialized week hard-failed a pattern gap: ${specializedGap.issues.map((issue) => issue.message).join('; ')}`
  );
  assert(
    !specializedGap.issues.some((issue) => issue.code === 'PATTERN_GAP' && /squat|pull/i.test(issue.message)),
    `Specialized week treated a waived pattern as required: ${specializedGap.issues.map((issue) => issue.message).join('; ')}`
  );
  const prompt = buildDesignerInstructions(context);
  assert(/do not add rows/i.test(prompt), 'Specialized prompt should leave upper-body pulling optional');
  assert(/about 3 quality working sets/i.test(prompt), 'Athletic sessions should leave room beyond two heavy 4-set lifts');
  assert(/romanian deadlift/i.test(prompt), 'Specialized prompt should ask for hamstring-biased hinge work');
  const generalPrompt = buildDesignerInstructions({
    ...context,
    hard_requirements: {
      ...context.hard_requirements!,
      upperPush: false,
      lowerPull: false,
    },
  });
  assert(/Spread knee-dominant/.test(generalPrompt), 'A general program should still cover the main patterns');

  const crowded: AiWeekProgram = {
    schema_version: '2.0',
    summary: 'Too long',
    workouts: [
      day('Mon', [
        { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 3, rep_min: 5, rep_max: 7, rest_seconds: 120 })] },
        { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary', { working_sets: 3, rep_min: 6, rep_max: 8, rest_seconds: 120 })] },
        { type: 'superset', exercises: [lift('Overhead Press', 'secondary', { working_sets: 2, rest_seconds: 90 }), lift('Face Pull', 'accessory', { working_sets: 2, rest_seconds: 60 })] },
        { type: 'straight_sets', exercises: [lift('Hammer Curl', 'accessory', { working_sets: 3, rest_seconds: 60 })] },
        { type: 'straight_sets', exercises: [lift('Lateral Raise', 'accessory', { working_sets: 3, rest_seconds: 60 })] },
        { type: 'straight_sets', exercises: [lift('Dumbbell Curl', 'accessory', { working_sets: 3, rest_seconds: 60 })] },
      ]),
      day('Fri', [
        { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 3, rep_min: 5, rep_max: 7, rest_seconds: 120 })] },
        { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary', { working_sets: 3, rep_min: 6, rep_max: 8, rest_seconds: 120 })] },
        { type: 'straight_sets', exercises: [lift('Hammer Curl', 'accessory', { working_sets: 4, rest_seconds: 60 })] },
      ]),
    ],
  };
  const repaired = repairAiProgram(crowded, context, catalogById);
  const facePull = repaired.program.workouts
    .flatMap((workout) => workout.strength.flatMap((block) => block.exercises))
    .find((exercise) => exercise.exercise_id === idOf('Face Pull'));
  if (facePull) assert(facePull.rest_seconds === 60, `Face Pull rest was raised to ${facePull.rest_seconds}`);
  assert(!repaired.repairs.some((repair) => repair.code === 'SUPERSET_HEAVY_PAIR'), 'Face Pull must not be split as a heavy compound');
  const keptPrimaries = repaired.program.workouts.every((workout) => {
    const namesInDay = workout.strength.flatMap((block) => block.exercises).filter((exercise) => exercise.role === 'primary');
    return namesInDay.some((exercise) => exercise.exercise_id === idOf('Barbell Bench Press') && exercise.rest_seconds === 120) &&
      namesInDay.some((exercise) => exercise.exercise_id === idOf('Romanian Deadlift') && exercise.rest_seconds === 120);
  });
  assert(keptPrimaries, 'Repair must keep primary lifts and their rest');
  assert(
    repaired.repairs.some((repair) => repair.code === 'DURATION_OVER' && /Removed /.test(repair.action)),
    `Repair should remove lower-priority work, got ${repaired.repairs.map((repair) => repair.action).join('; ')}`
  );
  const signatures = repaired.program.workouts.map((workout) =>
    workout.strength.flatMap((block) => block.exercises).map((exercise) => `${exercise.exercise_id}:${exercise.working_sets}:${exercise.rest_seconds}`).join('|')
  );
  assert(signatures[0] === signatures[1], `Identical days diverged after repair: ${signatures.join(' vs ')}`);

  const concentrated = repairAiProgram(
    {
      schema_version: '2.0',
      summary: 'Four-set primaries crowded out the glute accessory',
      workouts: [
        day('Mon', [
          { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 4, rep_min: 5, rep_max: 7, rest_seconds: 120 })] },
          { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary', { working_sets: 4, rep_min: 6, rep_max: 8, rest_seconds: 120 })] },
          { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary', { working_sets: 2, rest_seconds: 90 })] },
          { type: 'straight_sets', exercises: [lift('Hip Thrust', 'accessory', { working_sets: 2, rest_seconds: 75 })] },
          { type: 'straight_sets', exercises: [lift('Pallof Press', 'accessory', { working_sets: 2, rest_seconds: 45 })] },
        ]),
        day('Fri', [
          { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 4, rep_min: 5, rep_max: 7, rest_seconds: 120 })] },
          { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'primary', { working_sets: 4, rep_min: 6, rep_max: 8, rest_seconds: 120 })] },
          { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary', { working_sets: 2, rest_seconds: 90 })] },
          { type: 'straight_sets', exercises: [lift('Hip Thrust', 'accessory', { working_sets: 2, rest_seconds: 75 })] },
          { type: 'straight_sets', exercises: [lift('Pallof Press', 'accessory', { working_sets: 2, rest_seconds: 45 })] },
        ]),
      ],
    },
    context,
    catalogById
  );
  const concentratedActions = concentrated.repairs.map((repair) => repair.action);
  const hipRemovedAt = concentratedActions.findIndex((action) => /Removed Hip Thrust/.test(action));
  const primaryReducedAt = concentratedActions.findIndex((action) => /Reduced (Barbell Bench Press|Romanian Deadlift) to 3 sets/.test(action));
  assert(primaryReducedAt >= 0, `Extra primary sets should come down before a glute accessory is lost: ${concentratedActions.join('; ')}`);
  if (hipRemovedAt >= 0) {
    assert(primaryReducedAt < hipRemovedAt, `Hip Thrust was removed before a 4-set primary was reduced: ${concentratedActions.join('; ')}`);
  }
  const keptRest = concentrated.program.workouts.every((workout) =>
    workout.strength
      .flatMap((block) => block.exercises)
      .filter((exercise) => exercise.role === 'primary')
      .every((exercise) => exercise.rest_seconds === 120)
  );
  assert(keptRest, 'Primary rest stays at 120 seconds when extra sets are reduced');

  console.log('BIQ-0259 quality correction checks passed');
  console.log(`Et plan fixture duration: default ramp rest ${before.minutes} min, persisted 120s ramp rest ${after.minutes} min`);
  console.log(
    `New athletic week: ${week
      .map(
        (workout) =>
          `${workout.dayLabel} ${workout.estimatedMinutes} min ${workout.exercises
            .map((exercise) => `${exercise.name} ${exercise.sets}x${exercise.repMin}-${exercise.repMax} RIR ${exercise.targetRir} rest ${exercise.restSeconds}`)
            .join(', ')}`
      )
      .join(' || ')}`
  );
  console.log(`Repair: ${repaired.repairs.map((repair) => repair.action).join('; ')}`);
}

if (process.argv[1]?.replace(/\\/g, '/').includes('qualityCorrectionCheck')) {
  runQualityCorrectionChecks();
}

function prescription(name: string, sets: number, rest: number, pattern: 'horizontal_push' | 'vertical_push' | 'hinge' | 'horizontal_pull' | 'elbow_flexion' | 'core_flexion', superset?: string) {
  return {
    name,
    sets,
    restSeconds: rest,
    role: 'accessory' as const,
    muscleGroup: '',
    primaryMuscles: [],
    movementPattern: pattern,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    loadIncrement: 0,
    supersetGroupId: superset,
  };
}
