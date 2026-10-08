/**
 * Stage 2B adaptive volume, rest, ramp, and duration checks.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { creditSets, contributionsForExercise } from '../contributions';
import { classifySessionDuration } from '../duration';
import { assessProgrammingFeasibility, ProgrammingConflictError } from '../feasibility';
import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { validateProgram } from '../validator';
import type { CatalogExercise, ScienceProgram, ScienceWorkout, TrainingProfile } from '../types';
import type { MuscleId } from '../taxonomy';
import { lateralityOf } from './library';
import { buildGenerationContext } from './context';
import { libraryById } from './library';
import { runGenerationPipeline } from './orchestrator';
import { validateAiProgram } from './validateAiProgram';
import type { AiStrengthExercise, AiWeekProgram, AiWorkoutPlan, StrengthRole } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function profileFrom(input: Parameters<typeof trainingProfileFromSources>[0]): TrainingProfile {
  return trainingProfileFromSources(input);
}

function strengthDays(program: ScienceProgram): ScienceWorkout[] {
  return program.workouts.filter(
    (workout) => workout.week === 1 && workout.workoutType !== 'Cardio' && workout.workoutType !== 'Mobility'
  );
}

function weeklyCredits(program: ScienceProgram, catalog: CatalogExercise[]): Record<string, number> {
  const byName = new Map(catalog.map((row) => [row.name.toLowerCase(), row]));
  const credits: Record<string, number> = {};
  strengthDays(program).forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      const row = byName.get(exercise.name.toLowerCase());
      if (!row) return;
      const gained = creditSets(contributionsForExercise(row), exercise.sets);
      Object.entries(gained).forEach(([muscle, value]) => {
        credits[muscle] = Math.round(((credits[muscle] || 0) + value) * 10) / 10;
      });
    });
  });
  return credits;
}

function toAiWeek(program: ScienceProgram, catalog: CatalogExercise[]): AiWeekProgram {
  const byName = new Map(catalog.map((row) => [row.name.toLowerCase(), String(row.id || '')]));
  const idFor = (name: string, exerciseId?: string) => exerciseId || byName.get(name.toLowerCase()) || '';
  const prep = (name: string, sets: number, prescription: string, exerciseId?: string) => {
    const id = idFor(name, exerciseId);
    if (!id) return null;
    const meta = catalog.find((row) => String(row.id || '') === id);
    const text =
      meta && lateralityOf(meta) === 'bilateral' ? prescription.replace(/\s*\/side/gi, '') : prescription;
    return { exercise_id: id, sets, prescription: text, why: name };
  };
  const asRole = (role: string): StrengthRole =>
    role === 'primary' || role === 'secondary' || role === 'isolation' || role === 'accessory' ? role : 'accessory';

  return {
    schema_version: '2.0',
    summary: program.summary,
    coaching_notes: program.explanations.join(' '),
    workouts: strengthDays(program).map((workout) => {
      const blocks: AiWorkoutPlan['strength'] = [];
      const seen = new Set<string>();
      workout.exercises.forEach((exercise) => {
        if (exercise.supersetGroupId && seen.has(exercise.supersetGroupId)) return;
        const members = exercise.supersetGroupId
          ? workout.exercises.filter((row) => row.supersetGroupId === exercise.supersetGroupId)
          : [exercise];
        if (exercise.supersetGroupId) seen.add(exercise.supersetGroupId);
        const mapped = members
          .map((row) => toStrength(workout, row, idFor, asRole))
          .filter((row): row is AiStrengthExercise => !!row);
        if (!mapped.length) return;
        blocks.push({
          type: mapped.length > 1 ? 'superset' : 'straight_sets',
          exercises: mapped,
        });
      });
      return {
        day_label: workout.dayLabel,
        name: workout.name,
        emphasis: workout.emphasis || workout.name,
        estimated_minutes: workout.estimatedMinutes,
        warmup: workout.warmup
          .map((item) => prep(item.name, item.sets, item.reps, item.exerciseId))
          .filter((item): item is NonNullable<typeof item> => !!item),
        potentiation: workout.potentiation
          .map((item) => prep(item.name, item.sets, `${item.repMin}-${item.repMax}`, item.exerciseId))
          .filter((item): item is NonNullable<typeof item> => !!item),
        strength: blocks,
        cooldown: workout.cooldown
          .map((item) => prep(item.name, item.sets, item.reps, item.exerciseId))
          .filter((item): item is NonNullable<typeof item> => !!item),
      };
    }),
  };
}

function toStrength(
  workout: ScienceWorkout,
  exercise: ScienceWorkout['exercises'][number],
  idFor: (name: string, exerciseId?: string) => string,
  asRole: (role: string) => StrengthRole
): AiStrengthExercise | null {
  const exerciseId = idFor(exercise.name, exercise.exerciseId);
  if (!exerciseId) return null;
  const ramps =
    workout.rampFor === exercise.name
      ? workout.rampSets.map((ramp) => ({ percent_of_working: ramp.percent, reps: ramp.reps }))
      : [];
  return {
    exercise_id: exerciseId,
    role: asRole(exercise.role),
    working_sets: exercise.sets,
    rep_min: exercise.repMin,
    rep_max: exercise.repMax,
    target_rir: exercise.targetRir ?? 2,
    rest_seconds: exercise.restSeconds,
    reps_per_side: exercise.laterality === 'unilateral',
    measurement_type: exercise.measurementType || 'reps',
    ramp_sets: ramps,
    why: exercise.why || exercise.role,
  };
}

function targetOf(program: ScienceProgram, muscle: MuscleId) {
  return program.volumeTargets.find((target) => target.muscle === muscle);
}

async function inspect(label: string, profile: TrainingProfile, prompt: string) {
  const program = generateProgram(profile, FALLBACK_CATALOG);
  const validation = validateProgram(program, profile);
  const days = strengthDays(program);
  const credits = weeklyCredits(program, FALLBACK_CATALOG);
  const { context, catalogById } = buildGenerationContext({
    profile,
    program,
    catalog: FALLBACK_CATALOG,
    userPrompt: prompt,
    programName: label,
    mode: 'full_program',
  });
  const ai = validateAiProgram(toAiWeek(program, FALLBACK_CATALOG), context, catalogById);
  const report = {
    label,
    volume: ['chest', 'hamstrings', 'glutes', 'quads', 'upper_back', 'lats'].map((muscle) => {
      const target = targetOf(program, muscle as MuscleId);
      return {
        muscle,
        minimum: target?.minimumSets,
        preferred: target?.preferredSets,
        practicalMax: target?.practicalMaxSets,
        priority: target?.priority,
        effectiveSets: credits[muscle] || 0,
      };
    }),
    sessions: days.map((day) => ({
      day: day.dayLabel,
      name: day.name,
      minutes: day.estimatedMinutes,
      duration: classifySessionDuration(day.estimatedMinutes, profile.preferredSessionMinutes).over,
      ramps: day.rampSets.length,
      rampFor: day.rampFor || '',
      exercises: day.exercises.map((exercise) => ({
        name: exercise.name,
        role: exercise.role,
        sets: exercise.sets,
        reps: `${exercise.repMin}-${exercise.repMax}`,
        rest: exercise.restSeconds,
        pattern: exercise.movementPattern,
      })),
    })),
    scienceOk: validation.ok,
    scienceIssues: validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message),
    aiOk: ai.ok,
    aiIssues: ai.issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.code}: ${issue.message}`),
  };
  console.log(`BIQ-0256 ${label}: ${JSON.stringify(report)}`);
  const adaptiveFailure = ai.issues.filter(
    (issue) =>
      issue.severity === 'error' &&
      ['DURATION', 'REST_TOO_SHORT', 'VOLUME_OFF', 'REQUIRED_PATTERN', 'IDENTICAL_DAYS', 'INSUFFICIENT_STIMULUS'].includes(issue.code)
  );
  assert(validation.ok, `${label} science validation failed: ${report.scienceIssues.join('; ')}`);
  assert(adaptiveFailure.length === 0, `${label} AI adaptive rules failed: ${adaptiveFailure.map((issue) => issue.message).join('; ')}`);
  days.forEach((day) => {
    assert(
      classifySessionDuration(day.estimatedMinutes, profile.preferredSessionMinutes).over !== 'error',
      `${label} ${day.dayLabel} estimated ${day.estimatedMinutes} exceeds the shared duration tolerance`
    );
  });
  assert(libraryById(context).size > 0, `${label} library missing`);
  return { program, days, report };
}

export async function runStage2bChecks() {
  const athleticPrompt =
    'Athletic performance. Intermediate. 2 days, Monday and Friday. 45 minutes. Both days should use the same workout. Emphasize upper-body push and lower-body pull. Priority chest, hamstrings, and glutes. De-emphasize upper back, lats, and quads.';
  const athletic = profileFrom({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      potentiation_preference: 'automatic',
      preferred_session_minutes: 45,
    },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      focusMuscles: ['Chest', 'Hamstrings', 'Glutes'],
      sessionMinutes: 45,
      weeks: 4,
      intakeNotes: athleticPrompt,
      supersetPreference: 'rarely',
      varietyPreference: 'low',
    },
  });
  const athleticRun = await inspect('A athletic 2x45', athletic, athleticPrompt);
  const chest = targetOf(athleticRun.program, 'chest');
  assert(chest && chest.preferredSets >= 3 && chest.preferredSets <= 8, `A chest preferred should adapt near 5, got ${chest?.preferredSets}`);
  assert((chest?.minimumSets || 0) >= 3 && (chest?.minimumSets || 0) < (chest?.preferredSets || 0), 'A chest keeps a useful minimum below the preferred target');
  ['upper_back', 'lats', 'quads'].forEach((muscle) => {
    const target = targetOf(athleticRun.program, muscle as MuscleId);
    assert(target?.preferredSets === 0, `A waived ${muscle} preferred should be 0, got ${target?.preferredSets}`);
  });
  const signatures = athleticRun.days.map((day) => day.exercises.map((exercise) => exercise.name).join('|'));
  assert(signatures.length === 2 && signatures[0] === signatures[1], `A identical days diverged: ${signatures.join(' vs ')}`);
  const patterns = new Set(athleticRun.days[0].exercises.map((exercise) => exercise.movementPattern));
  assert(patterns.has('horizontal_push') && patterns.has('hinge'), `A lost push or hinge: ${Array.from(patterns).join(', ')}`);
  athleticRun.days[0].exercises
    .filter((exercise) => exercise.role === 'primary')
    .forEach((exercise) => {
      assert(exercise.restSeconds >= 120 && exercise.restSeconds <= 210, `A primary rest ${exercise.name} is ${exercise.restSeconds}`);
      assert(exercise.restSeconds < 180, `A athletic primary ${exercise.name} still uses the old 180s floor`);
    });
  assert(athleticRun.days[0].rampSets.length >= 2 && athleticRun.days[0].rampSets.length <= 3, `A opener ramps should be 2-3, got ${athleticRun.days[0].rampSets.length}`);
  const dedicated = (muscle: MuscleId) =>
    athleticRun.days[0].exercises.filter((exercise) => exercise.primaryMuscles.includes(muscle)).length;
  assert(dedicated('chest') <= 2, 'A should not stack extra chest exercises into a 45-minute session');
  const fallback = await runGenerationPipeline({
    profile: athletic,
    catalog: FALLBACK_CATALOG,
    userPrompt: athleticPrompt,
    programName: 'Athletic',
    apiKey: null,
  });
  assert(fallback.outcome === 'science_fallback', `A fallback outcome changed: ${fallback.outcome}`);
  assert(validateProgram(fallback.program, athletic).ok, 'A science fallback program failed the shared validator');

  const hypertrophyPrompt = 'Build muscle. Intermediate. 3 days. 60 minutes. Full body. Supersets sometimes.';
  const hypertrophy = profileFrom({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle', birth_year: 1990 },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 60, superset_preference: 'sometimes' },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      sessionMinutes: 60,
      weeks: 6,
      intakeNotes: hypertrophyPrompt,
      supersetPreference: 'sometimes',
    },
  });
  const hypertrophyRun = await inspect('B hypertrophy 3x60', hypertrophy, hypertrophyPrompt);
  const hypertrophyChest = targetOf(hypertrophyRun.program, 'chest');
  assert(
    hypertrophyChest && hypertrophyChest.preferredSets >= 8 && hypertrophyChest.preferredSets <= 12,
    `B chest preferred should stay near the hypertrophy dose, got ${hypertrophyChest?.preferredSets}`
  );
  assert((hypertrophyChest?.minimumSets || 0) >= 4, 'B hypertrophy keeps a higher useful minimum');

  const beginnerPrompt = 'General fitness. Beginner. 3 days. 45 minutes. Full body.';
  const beginner = profileFrom({
    profile: { experience_level: 'beginner', primary_goal: 'general_fitness', birth_year: 2000 },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 45 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      sessionMinutes: 45,
      weeks: 4,
      intakeNotes: beginnerPrompt,
    },
  });
  const beginnerRun = await inspect('C beginner fitness 3x45', beginner, beginnerPrompt);
  const beginnerChest = targetOf(beginnerRun.program, 'chest');
  assert(
    beginnerChest && beginnerChest.preferredSets >= 3 && beginnerChest.preferredSets <= 6,
    `C beginner chest preferred should be modest, got ${beginnerChest?.preferredSets}`
  );
  assert(beginnerRun.days[0].rampSets.length <= 2, `C beginner opener ramps should be 1-2, got ${beginnerRun.days[0].rampSets.length}`);

  const strengthPrompt = 'Strength. Advanced. 4 days. 75 minutes. Upper lower.';
  const strength = profileFrom({
    profile: { experience_level: 'advanced', primary_goal: 'strength', birth_year: 1988 },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 75 },
    config: {
      days: ['Mon', 'Tue', 'Thu', 'Fri'],
      dayTypes: { Mon: 'Upper Body', Tue: 'Lower Body', Thu: 'Upper Body', Fri: 'Lower Body' },
      sessionMinutes: 75,
      weeks: 6,
      intakeNotes: strengthPrompt,
    },
  });
  const strengthRun = await inspect('D advanced strength 4x75', strength, strengthPrompt);
  const heavyPrimary = strengthRun.days.flatMap((day) => day.exercises).find((exercise) => exercise.role === 'primary' && exercise.repMax <= 6);
  assert(heavyPrimary && heavyPrimary.restSeconds >= 180, `D heavy primary rest should stay at least 180, got ${heavyPrimary?.restSeconds}`);
  const opener = strengthRun.days.find((day) => day.rampSets.length > 0);
  assert(opener && opener.rampSets.length >= 3, `D advanced opener should keep several ramps, got ${opener?.rampSets.length}`);

  const conflictPrompt =
    'Athletic performance. 20 minutes. Extended warm-up. Both days should use the same workout. Emphasize upper-body push and lower-body pull.';
  const conflictProfile = profileFrom({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: { warmup_style: 'athletic', warmup_duration: 'extended', preferred_session_minutes: 20 },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      sessionMinutes: 20,
      weeks: 4,
      intakeNotes: conflictPrompt,
    },
  });
  const conflict = assessProgrammingFeasibility(conflictProfile);
  assert(conflict?.code === 'INFEASIBLE_REQUIREMENTS', 'E should return a structured conflict');
  assert(
    (conflict?.hardRequirements || []).some((item) => /upper-body push/i.test(item)) &&
      (conflict?.hardRequirements || []).some((item) => /lower-body pull/i.test(item)),
    'E must keep both explicit movement requirements'
  );
  assert((conflict?.minimumMinutes || 0) > (conflict?.requestedMinutes || 0) + (conflict?.toleranceMinutes || 0), 'E minimum must exceed the shared tolerance');
  const feasible = assessProgrammingFeasibility(athletic);
  assert(feasible == null, `A 45-minute athletic request should stay feasible, got ${feasible?.message}`);
  let calls = 0;
  let thrown: unknown = null;
  try {
    await runGenerationPipeline({
      profile: conflictProfile,
      catalog: FALLBACK_CATALOG,
      userPrompt: conflictPrompt,
      programName: 'Conflict',
      apiKey: 'test-key',
      requestFn: async () => {
        calls += 1;
        throw new Error('model should not be called');
      },
    });
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof ProgrammingConflictError, 'E pipeline should throw ProgrammingConflictError');
  assert(calls === 0, 'E must not call the model or save a stripped workout');
  console.log(`BIQ-0256 E conflict: ${JSON.stringify(conflict)}`);
  console.log('BIQ-0256 Stage 2B adaptive programming checks passed');
}
