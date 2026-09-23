/**
 * BIQ-0208 / BIQ-0209 Phase 1 and Phase 1.1 generation checks.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { classifySessionDuration, sessionDurationTolerance } from '../duration';
import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { scienceProgramToAiPlan } from '../toAiPlan';
import { buildGenerationContext } from './context';
import { libraryById } from './library';
import { mapAiWeekToScience } from './mapper';
import { findByExerciseId } from './matchById';
import { parseWeekProgram } from './openaiClient';
import { runGenerationPipeline } from './orchestrator';
import { validateAiProgram, workingSetCreditsForTests } from './validateAiProgram';
import type { AiStrengthExercise, AiWeekProgram, AiWorkoutPlan } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function idOf(name: string): string {
  const hit = FALLBACK_CATALOG.find((ex) => ex.name === name);
  if (!hit?.id) throw new Error(`Fallback catalog missing ${name}`);
  return String(hit.id);
}

function hypertrophyProfile() {
  return trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      variety_preference: 'balanced',
      superset_preference: 'sometimes',
      preferred_session_minutes: 60,
    },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 6,
      sessionMinutes: 60,
      primaryGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      varietyPreference: 'balanced',
      supersetPreference: 'sometimes',
      trainingSplit: 'full_body',
    },
  });
}

function lift(name: string, role: AiStrengthExercise['role'], extra?: Partial<AiStrengthExercise>): AiStrengthExercise {
  return {
    exercise_id: idOf(name),
    role,
    working_sets: 3,
    rep_min: role === 'primary' ? 5 : 8,
    rep_max: role === 'primary' ? 8 : 12,
    target_rir: 2,
    rest_seconds: role === 'primary' ? 180 : 90,
    reps_per_side: false,
    measurement_type: 'reps',
    ramp_sets: role === 'primary' ? [{ percent_of_working: 0.5, reps: 5 }] : [],
    why: `${role} work`,
    ...extra,
  };
}

function day(label: string, name: string, emphasis: string, strength: AiWorkoutPlan['strength']): AiWorkoutPlan {
  return {
    day_label: label,
    name,
    emphasis,
    estimated_minutes: 58,
    warmup: [
      { exercise_id: idOf('Goblet Squat'), sets: 1, prescription: '8', why: 'Squat pattern prep' },
      { exercise_id: idOf('Band Row'), sets: 1, prescription: '12', why: 'Pull prep' },
      { exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' },
    ],
    potentiation: [],
    strength,
    cooldown: [{ exercise_id: idOf('Hamstring Stretch'), sets: 1, prescription: '30 sec', why: 'Ease hamstrings after lower work' }],
  };
}

function validWeek(): AiWeekProgram {
  return {
    schema_version: '2.0',
    summary: 'Three complementary full-body sessions for hypertrophy.',
    coaching_notes: 'Keep primaries stable and change accessories only if recovery slips.',
    program_rationale: {
      weekly_idea: 'A squat/press day, a hinge/vertical day, and a unilateral/hypertrophy day.',
      fatigue_plan: 'Heaviest axial load on Monday and Wednesday, lighter on Friday.',
      consistency_plan: 'Keep the three primaries for the cycle.',
    },
    weekly_targets: [{ muscle: 'chest', planned_working_sets: 12 }],
    workouts: [
      day('Mon', 'Full Body A', 'Squat and horizontal push', [
        { type: 'straight_sets', exercises: [lift('Back Squat', 'primary')] },
        { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'secondary', { working_sets: 4, rep_min: 6, rep_max: 8 })] },
        { type: 'superset', exercises: [lift('Dumbbell Row', 'secondary'), lift('Lateral Raise', 'isolation')] },
        { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'secondary', { working_sets: 2 })] },
        { type: 'straight_sets', exercises: [lift('Plank', 'accessory', { measurement_type: 'time', rep_min: 20, rep_max: 40 })] },
      ]),
      day('Wed', 'Full Body B', 'Hinge and vertical push', [
        { type: 'straight_sets', exercises: [lift('Conventional Deadlift', 'primary', { working_sets: 3, rep_min: 3, rep_max: 5 })] },
        { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Lat Pulldown', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Walking Lunge', 'secondary', { reps_per_side: true })] },
        { type: 'straight_sets', exercises: [lift('Face Pull', 'isolation')] },
      ]),
      day('Fri', 'Full Body C', 'Unilateral and accessory hypertrophy', [
        { type: 'straight_sets', exercises: [lift('Bulgarian Split Squat', 'primary', { reps_per_side: true })] },
        { type: 'straight_sets', exercises: [lift('Incline Dumbbell Press', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Seated Cable Row', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Dumbbell Curl', 'isolation')] },
      ]),
    ],
    progression: {
      strategy: 'double_progression',
      primary_exercise_ids: [idOf('Back Squat'), idOf('Conventional Deadlift'), idOf('Bulgarian Split Squat')],
      accessory_rotation_allowed: true,
      weekly_rules: [{ week: 1, load_change: 'hold', set_change: 0, rir_change: 0, is_deload: false, notes: 'Establish' }],
    },
    quality_review: {
      passed: true,
      notes: 'A/B/C coverage',
      self_check: {
        days_complementary: true,
        primaries_not_cloned: true,
        warmup_matches_session: true,
        fits_session_minutes: true,
      },
    },
  };
}

export async function runPhase1GenerationChecks() {
  const profile = hypertrophyProfile();
  const science = generateProgram(profile, FALLBACK_CATALOG);
  assert(
    science.workouts.filter((w) => w.week === 1).every((w) => w.exercises.length > 0),
    `Science template for this profile must have working lifts: ${science.workouts
      .filter((w) => w.week === 1)
      .map((w) => `${w.dayLabel}:${w.exercises.length}`)
      .join(', ')}`
  );
  const { context, catalogById } = buildGenerationContext({
    profile,
    program: science,
    catalog: FALLBACK_CATALOG,
    userPrompt: 'Goal: Build muscle. Train 3 days/week (Mon, Wed, Fri). 60-minute sessions. Split: Full body. Experience: Intermediate. Supersets: Sometimes. Variety: Balanced.',
    programName: '3-Day Hypertrophy',
    mode: 'full_program',
  });
  const library = libraryById(context);

  assert(!JSON.stringify(context).includes('science_seed'), 'Context must not include a science seed workout');
  assert(context.candidate_library.length >= 20, `Library too small: ${context.candidate_library.length}`);
  assert(context.weekly_volume_targets.length > 0, 'Weekly working-set targets must be sent');
  assert(context.schedule.days.map((d) => d.day_label).join(',') === 'Mon,Wed,Fri', 'All week days must be sent together');

  const week = validWeek();
  const ok = validateAiProgram(week, context, catalogById);
  assert(ok.ok, `Valid A/B/C week failed: ${ok.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`);

  const mapped = mapAiWeekToScience(week, science, profile, catalogById, library);
  const mon = mapped.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon');
  const wed = mapped.workouts.find((w) => w.week === 1 && w.dayLabel === 'Wed');
  const fri = mapped.workouts.find((w) => w.week === 1 && w.dayLabel === 'Fri');
  assert(mon && wed && fri, 'Mapped week missing a day');
  assert(mon!.exercises[0].name === 'Back Squat', `Mon primary ${mon!.exercises[0]?.name}`);
  assert(wed!.exercises[0].name === 'Conventional Deadlift', `Wed primary ${wed!.exercises[0]?.name}`);
  assert(fri!.exercises[0].name === 'Bulgarian Split Squat', `Fri primary ${fri!.exercises[0]?.name}`);
  assert(mon!.exercises.length === 6, `AI Monday should keep 6 lifts, got ${mon!.exercises.map((e) => e.name).join(', ')}`);
  assert(mon!.warmup.every((w) => w.name !== 'Push-Up'), `Warm-up remapped to Push-Up: ${mon!.warmup.map((w) => w.name).join(', ')}`);
  assert(mon!.potentiation.length === 0, 'Mapper must not auto-add potentiation');
  assert((mon!.exercises[0].setDetails || []).some((s) => s.setType === 'warmup'), 'Primary should keep ramp sets');
  assert((mon!.exercises[0].setDetails || []).filter((s) => s.setType === 'working').length === 3, 'Ramps must not become extra working sets');
  assert((fri!.exercises[0].setDetails || []).some((s) => s.setType === 'warmup'), 'Ramp eligibility must come from metadata/role, not a name list');
  assert(mapped.explanations.some((line) => /week-1 template/i.test(line)), 'Later weeks must be described as unprogressed week-1 copies');
  assert(mon!.estimatedMinutes > 45 && mon!.estimatedMinutes < 75, `Deterministic Monday duration should be realistic, got ${mon!.estimatedMinutes}`);
  const sixty = sessionDurationTolerance(60);
  assert(sixty.warnDelta === 6 && sixty.errorDelta === 9, `60-minute bands should be ±6 / ±9, got ${sixty.warnDelta}/${sixty.errorDelta}`);
  assert(classifySessionDuration(66, 60).over === 'ok', '66 vs 60 should be acceptable');
  assert(classifySessionDuration(67, 60).over === 'warning', '67 vs 60 should warn');
  assert(classifySessionDuration(70, 60).over === 'error', '70 vs 60 should error');
  assert(classifySessionDuration(38, 30).over !== 'error', 'Short sessions must not use a 3-minute error band');

  const credits = workingSetCreditsForTests(week, catalogById);
  const squatWorking = week.workouts[0].strength[0].exercises[0].working_sets;
  assert(credits.quads >= squatWorking, 'Working-set credits should count working sets only');

  const pushUpSide: AiWeekProgram = {
    ...week,
    workouts: week.workouts.map((w, i) =>
      i === 0
        ? {
            ...w,
            warmup: [{ exercise_id: idOf('Push-Up'), sets: 1, prescription: '6/side', why: 'bad' }],
          }
        : w
    ),
  };
  const pushUpCheck = validateAiProgram(pushUpSide, context, catalogById);
  assert(
    pushUpCheck.issues.some((i) => i.code === 'LATERALITY_MISMATCH' && i.severity === 'error'),
    'Bilateral Push-Up /side must be an ERROR'
  );

  const unknown = validateAiProgram(
    {
      ...week,
      workouts: week.workouts.map((w, i) =>
        i === 0
          ? { ...w, strength: [{ type: 'straight_sets', exercises: [lift('Back Squat', 'primary', { exercise_id: 'not-a-real-id' })] }] }
          : w
      ),
    },
    context,
    catalogById
  );
  assert(unknown.issues.some((i) => i.code === 'UNKNOWN_EXERCISE_ID' && i.severity === 'error'), 'Unknown IDs must error for repair');

  const cloned = {
    ...week,
    workouts: week.workouts.map((w) => ({
      ...w,
      strength: [{ type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary')] }, ...w.strength.slice(1)],
    })),
  };
  const cloneCheck = validateAiProgram(cloned, context, catalogById);
  assert(cloneCheck.issues.some((i) => i.code === 'PRIMARY_CLONE' && i.severity === 'error'), 'Same primary on all 3 days must ERROR');

  const twiceDifferent = {
    ...week,
    workouts: [
      week.workouts[0],
      {
        ...week.workouts[1],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { working_sets: 2, rep_min: 8, rep_max: 10, target_rir: 3 })] },
          ...week.workouts[1].strength.slice(1),
        ],
      },
      week.workouts[2],
    ],
  };
  const twiceCheck = validateAiProgram(twiceDifferent, context, catalogById);
  assert(
    !twiceCheck.issues.some((i) => i.code === 'PRIMARY_CLONE' && i.severity === 'error'),
    `2x/week primary with different prescription was rejected: ${twiceCheck.issues.map((i) => i.message).join('; ')}`
  );

  const twiceSame = {
    ...week,
    workouts: [
      week.workouts[0],
      {
        ...week.workouts[1],
        emphasis: week.workouts[0].emphasis,
        strength: [{ type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary')] }, ...week.workouts[1].strength.slice(1)],
      },
      week.workouts[2],
    ],
  };
  const sameCheck = validateAiProgram(twiceSame, context, catalogById);
  assert(
    sameCheck.issues.some((i) => i.code === 'PRIMARY_DUPLICATE' && i.severity === 'warning'),
    'Identical 2x/week primary prescription should warn, not silently pass'
  );
  assert(
    !sameCheck.issues.some((i) => i.code === 'PRIMARY_CLONE' && i.severity === 'error'),
    'Identical 2x/week primary should not be a hard clone error unless weekly dose is excessive'
  );

  const fourLiftDay = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary')] },
          { type: 'straight_sets' as const, exercises: [lift('Barbell Bench Press', 'secondary')] },
          { type: 'straight_sets' as const, exercises: [lift('Dumbbell Row', 'secondary')] },
          { type: 'straight_sets' as const, exercises: [lift('Romanian Deadlift', 'secondary')] },
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const fourCheck = validateAiProgram(fourLiftDay, context, catalogById);
  assert(
    !fourCheck.issues.some((i) => i.code === 'INSUFFICIENT_STIMULUS'),
    `Four well-selected lifts were treated as thin: ${fourCheck.issues.map((i) => i.message).join('; ')}`
  );

  const heavyPair = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          {
            type: 'superset' as const,
            exercises: [lift('Back Squat', 'primary'), lift('Romanian Deadlift', 'secondary')],
          },
          ...week.workouts[0].strength.slice(2),
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const pairCheck = validateAiProgram(heavyPair, context, catalogById);
  assert(pairCheck.issues.some((i) => i.code === 'SUPERSET_HEAVY_PAIR'), 'Heavy squat + RDL superset must error');

  const lightPair = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          {
            type: 'superset' as const,
            exercises: [lift('Barbell Bench Press', 'primary'), lift('Face Pull', 'isolation')],
          },
          ...week.workouts[0].strength.slice(1),
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const lightCheck = validateAiProgram(lightPair, context, catalogById);
  assert(
    !lightCheck.issues.some((i) => i.code === 'SUPERSET_HEAVY_PAIR' || i.code === 'SUPERSET_PRIMARY'),
    `Low-fatigue pairing was rejected: ${lightCheck.issues.map((i) => i.message).join('; ')}`
  );

  const goblet = FALLBACK_CATALOG.find((ex) => ex.name === 'Goblet Squat');
  assert(findByExerciseId(catalogById, 'Push-Up') === null, 'ID lookup must not accept a name');
  assert(findByExerciseId(catalogById, goblet?.id || '')?.name === 'Goblet Squat', 'Exact ID lookup should work');

  const parsed = parseWeekProgram(JSON.stringify(week));
  assert(parsed?.workouts.length === 3, 'Structured parse should keep the whole week');

  const plan = scienceProgramToAiPlan(mapped);
  const monPlan = plan.workouts.find((w) => w.week === 1 && w.day_label === 'Mon');
  assert((monPlan?.warmup || []).every((item: any) => item.notes !== 'POWER PRIMER'), 'Warm-up persist payload must not include primer');
  assert((monPlan?.primer || []).length === 0, 'Empty potentiation stays empty');

  const fallback = generateProgram(profile, FALLBACK_CATALOG);
  assert(fallback.workouts.length > 0, 'Science fallback must still produce a program');

  const pipelineOpts = {
    profile,
    catalog: FALLBACK_CATALOG,
    userPrompt: context.request.user_request,
    programName: '3-Day Hypertrophy',
  };
  const noKey = await runGenerationPipeline({ ...pipelineOpts, apiKey: null });
  assert(noKey.method === 'science_fallback', `No-key path should fall back, got ${noKey.method}`);
  assert(noKey.program.workouts.length > 0, 'Science fallback must still produce a program');

  let failCalls = 0;
  const failedRepair = await runGenerationPipeline({
    ...pipelineOpts,
    apiKey: 'test-key',
    requestFn: async () => {
      failCalls += 1;
      return {
        program: {
          ...week,
          workouts: week.workouts.map((w, i) =>
            i === 0
              ? { ...w, strength: [{ type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { exercise_id: 'not-a-real-id' })] }] }
              : w
          ),
        },
        raw: null,
        model: 'gpt-5.4',
        api: 'responses',
        reasoningEffort: 'medium',
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        error: null,
      };
    },
  });
  assert(failCalls === 3, `Repair loop should be initial + 2 repairs, got ${failCalls}`);
  assert(failedRepair.method === 'science_fallback', `Failed repair should fall back, got ${failedRepair.method}`);
  assert(
    failedRepair.program.workouts.filter((w) => w.week === 1).every((w) => w.exercises.every((ex) => ex.exerciseId !== 'not-a-real-id')),
    'Fallback must not persist the invalid AI exercise id'
  );

  let repairCalls = 0;
  const repaired = await runGenerationPipeline({
    ...pipelineOpts,
    apiKey: 'test-key',
    requestFn: async () => {
      repairCalls += 1;
      return {
        program: repairCalls === 1
          ? {
              ...week,
              workouts: week.workouts.map((w, i) =>
                i === 0
                  ? { ...w, strength: [{ type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { exercise_id: 'not-a-real-id' })] }] }
                  : w
              ),
            }
          : week,
        raw: null,
        model: 'gpt-5.4',
        api: 'responses',
        reasoningEffort: 'medium',
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        error: null,
      };
    },
  });
  assert(repaired.method === 'ai_repaired', `Successful repair should be ai_repaired, got ${repaired.method}`);
  assert(
    repaired.program.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon')?.exercises[0]?.name === 'Back Squat',
    'Repaired AI week should keep the corrected Monday primary'
  );

  const accepted = await runGenerationPipeline({
    ...pipelineOpts,
    apiKey: 'test-key',
    requestFn: async () => ({
      program: week,
      raw: null,
      model: 'gpt-5.4',
      api: 'responses',
      reasoningEffort: 'medium',
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      error: null,
    }),
  });
  assert(accepted.method === 'ai', `Valid AI week should stay AI, got ${accepted.method}`);
  const acceptedMon = accepted.program.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon');
  const acceptedNames = (acceptedMon?.exercises || []).map((e) => e.name);
  assert(acceptedNames.join(',') === 'Back Squat,Barbell Bench Press,Dumbbell Row,Lateral Raise,Romanian Deadlift,Plank', `AI Monday was rewritten: ${acceptedNames.join(', ')}`);
  assert((acceptedMon?.potentiation || []).length === 0, 'Accepted AI week must not receive science-template potentiation');
  const scienceMon = science.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon');
  const scienceOnly = (scienceMon?.exercises || []).map((e) => e.name).filter((name) => !acceptedNames.includes(name));
  assert(
    scienceOnly.every((name) => !acceptedNames.includes(name)),
    'Science-template lifts must not be mixed into a valid AI day'
  );

  const allPrimary = {
    ...week,
    workouts: week.workouts.map((w) => ({
      ...w,
      strength: w.strength.map((block) => ({
        ...block,
        exercises: block.exercises.map((ex) => ({ ...ex, role: 'primary' as const })),
      })),
    })),
  };
  const roleCheck = validateAiProgram(allPrimary, context, catalogById);
  assert(roleCheck.issues.some((i) => i.code === 'ROLE_ALL_PRIMARY' && i.severity === 'error'), 'All-primary week must ERROR');

  const shortRest = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { rest_seconds: 90 })] },
          ...week.workouts[0].strength.slice(1),
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const restCheck = validateAiProgram(shortRest, context, catalogById);
  assert(restCheck.issues.some((i) => i.code === 'REST_TOO_SHORT'), '90s rest on a high-fatigue primary squat must be flagged');

  const noSuperset = {
    ...week,
    workouts: week.workouts.map((w) => ({
      ...w,
      strength: w.strength.map((block) => ({ ...block, type: 'straight_sets' as const })),
    })),
  };
  const supersetPref = validateAiProgram(noSuperset, context, catalogById);
  assert(supersetPref.issues.some((i) => i.code === 'SUPERSET_PREF' && i.severity === 'warning'), '"sometimes" with zero supersets must warn');

  const badCooldown = {
    ...week,
    workouts: [{ ...week.workouts[0], cooldown: [{ exercise_id: idOf('Leg Extension'), sets: 1, prescription: '12', why: 'Cooldown' }] }, week.workouts[1], week.workouts[2]],
  };
  const cooldownCheck = validateAiProgram(badCooldown, context, catalogById);
  assert(cooldownCheck.issues.some((i) => i.code === 'COOLDOWN_NOT_ELIGIBLE' && i.severity === 'error'), 'Working isolations must not count as cooldown');

  const whyDrift = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        warmup: [{ exercise_id: idOf('Band Row'), sets: 1, prescription: '12', why: 'Warms up chest and triceps' }],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const whyCheck = validateAiProgram(whyDrift, context, catalogById);
  assert(whyCheck.issues.some((i) => i.code === 'WHY_MISMATCH'), 'Why-field muscle drift must be flagged');
  const whyOk = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        warmup: [{ exercise_id: idOf('Ankle Rocker'), sets: 1, prescription: '12', why: 'Improves ankle motion for more stable squat positions' }],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const whyOkCheck = validateAiProgram(whyOk, context, catalogById);
  assert(
    !whyOkCheck.issues.some((i) => i.code === 'WHY_MISMATCH' && i.exercise_id === idOf('Ankle Rocker')),
    'Why matching must not treat "ab" inside "stable" as abs'
  );

  const thinHams = {
    ...week,
    workouts: week.workouts.map((w) => ({
      ...w,
      strength: w.strength.map((block) => ({
        ...block,
        exercises: block.exercises.filter((ex) => {
          const name = FALLBACK_CATALOG.find((row) => String(row.id) === ex.exercise_id)?.name || '';
          return !/deadlift|rdl|leg curl|hip thrust/i.test(name);
        }),
      })),
    })),
  };
  const noOverhead = {
    ...week,
    workouts: [
      week.workouts[0],
      {
        ...week.workouts[1],
        strength: week.workouts[1].strength.map((block) => ({
          ...block,
          exercises: block.exercises.map((ex) =>
            ex.exercise_id === idOf('Overhead Press') ? lift('Incline Dumbbell Press', 'secondary') : ex
          ),
        })),
      },
      week.workouts[2],
    ],
  };
  const noOhpCheck = validateAiProgram(noOverhead, context, catalogById);
  assert(
    !noOhpCheck.issues.some((i) => /vertical push|overhead press/i.test(i.message)),
    `Missing overhead press should not be a pattern checklist miss: ${noOhpCheck.issues.map((i) => i.message).join('; ')}`
  );
  assert(
    !noOhpCheck.issues.some((i) => i.code === 'PATTERN_GAP' && i.severity === 'error' && /push/i.test(i.message)),
    'Horizontal/incline pressing should satisfy push coverage'
  );

  const longRest = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: week.workouts[0].strength.map((block) => ({
          ...block,
          exercises: block.exercises.map((ex) => ({ ...ex, working_sets: 5, rest_seconds: 300 })),
        })),
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const longCheck = validateAiProgram(longRest, context, catalogById);
  assert(
    longCheck.issues.some((i) => i.code === 'DURATION_OVER' && i.severity === 'error'),
    `A packed 60-minute day must ERROR when engine duration is well over 69 minutes: ${longCheck.issues.map((i) => `${i.severity}:${i.code}`).join(', ')}`
  );

  const volumeCheck = validateAiProgram(thinHams, context, catalogById);
  assert(
    volumeCheck.issues.some((i) => i.code === 'VOLUME_OFF' && i.severity === 'error' && /hamstring/i.test(i.message)),
    `Zero/severe hamstring stimulus should ERROR for hypertrophy: ${volumeCheck.issues.map((i) => `${i.severity}:${i.message}`).join('; ')}`
  );

  console.log('BIQ-0209 Phase 1.1 generation checks passed.');
  console.log(
    `Sample 3-day Full Body (AI fixture, not science fallback): ${mapped.workouts
      .filter((w) => w.week === 1)
      .map((w) => `${w.name}: ${w.exercises.map((e) => e.name).join(', ')}`)
      .join(' | ')}`
  );
  console.log(`Validator: ${ok.issues.length ? ok.issues.map((i) => `${i.severity}:${i.code}`).join(', ') : 'no issues'}`);
}
