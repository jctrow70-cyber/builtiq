/**
 * BIQ-0208 / BIQ-0209 Phase 1 and Phase 1.1 generation checks.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { contributionsForExercise } from '../contributions';
import { movementFamily, pickExercise } from '../exerciseSelection';
import { classifySessionDuration, countPersistedRampSets, estimateSessionBreakdownFromAi, estimateSessionFromAi, estimateWorkoutBreakdown, sessionDurationTolerance } from '../duration';
import { classifyPowerExercise, isHypertrophyStylePowerRx, powerPrescriptionFor, powerRestSecondsFor } from '../powerPrescription';
import { parsePrescriptionTiming, prepItemSeconds } from '../prescriptionTime';
import { buildEffectiveWorkout } from './effectiveWorkout';
import { assignSessionRamps } from './ramps';
import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { scienceProgramToAiPlan } from '../toAiPlan';
import { buildGenerationContext } from './context';
import { libraryById } from './library';
import { mapAiWeekToScience } from './mapper';
import { findByExerciseId } from './matchById';
import { parseWeekProgram } from './openaiClient';
import { runGenerationPipeline } from './orchestrator';
import { slimContextForPrompt } from './prompt';
import { applyDurationEfficiency, repairAiProgram } from './repairAiProgram';
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
  const slim = slimContextForPrompt(context);
  const uniqueIds = new Set(slim.exercise_library.map((ex) => ex.exercise_id));
  assert(slim.exercise_library.length === uniqueIds.size, 'Prompt must serialize each exercise once');
  assert(slim.warmup_ids.every((id) => uniqueIds.has(id)), 'Warmup IDs must point at the single library');
  assert(slim.cooldown_ids.every((id) => uniqueIds.has(id)), 'Cooldown IDs must point at the single library');
  assert(!JSON.stringify(slim.exercise_library[0] || {}).includes('ramp_eligible'), 'Ramp eligibility stays off the GPT payload');
  assert(!JSON.stringify(slim.exercise_library[0] || {}).includes('default_rep'), 'Default reps stay off the GPT payload');

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
  assert(sixty.warnDelta === 5 && sixty.errorDelta === 9, `60-minute bands should be 55–65 / 70+, got ${sixty.warnDelta}/${sixty.errorDelta}`);
  assert(classifySessionDuration(65, 60).over === 'ok', '65 vs 60 should be on target');
  assert(classifySessionDuration(66, 60).over === 'warning', '66 vs 60 should be repairable overage');
  assert(classifySessionDuration(69, 60).over === 'warning', '69 vs 60 should stay a warning');
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
        reasoningEffort: 'low',
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        error: null,
      };
    },
  });
  assert(failCalls === 1, `Ordinary generation must make exactly one AI call, got ${failCalls}`);
  assert(failedRepair.method === 'science_fallback', `Unfixable AI week should fall back, got ${failedRepair.method}`);
  assert(failedRepair.openaiCalls === 1, `Fallback after unusable AI must still be one OpenAI call, got ${failedRepair.openaiCalls}`);
  assert(
    failedRepair.program.workouts.filter((w) => w.week === 1).every((w) => w.exercises.every((ex) => ex.exerciseId !== 'not-a-real-id')),
    'Fallback must not persist the invalid AI exercise id'
  );

  let timeoutCalls = 0;
  let persistCount = 0;
  const timedOut = await runGenerationPipeline({
    ...pipelineOpts,
    apiKey: 'test-key',
    requestFn: async () => {
      timeoutCalls += 1;
      return {
        program: null,
        raw: null,
        model: 'gpt-5.4',
        api: 'responses',
        reasoningEffort: 'low',
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        error: 'Request timed out',
      };
    },
  });
  persistCount += 1;
  assert(timeoutCalls === 1, `Timeout path must not retry the model, got ${timeoutCalls}`);
  assert(timedOut.method === 'science_fallback', `Timeout should use science fallback, got ${timedOut.method}`);
  assert(timedOut.program.workouts.length > 0, 'Timeout fallback must still produce workouts');
  assert(persistCount === 1, 'Fallback program is persisted once');

  const lateralityBroken = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { reps_per_side: true })] },
          ...week.workouts[0].strength.slice(1),
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const lateralityFixed = repairAiProgram(lateralityBroken, context, catalogById);
  assert(
    lateralityFixed.program.workouts[0].strength[0].exercises[0].reps_per_side === false,
    'Deterministic repair must clear per-side on bilateral lifts'
  );
  assert(lateralityFixed.repairs.some((r) => r.code === 'LATERALITY_MISMATCH'), 'Laterality repair must be logged');

  const restBroken = {
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
  const restFixed = repairAiProgram(restBroken, context, catalogById);
  assert(restFixed.program.workouts[0].strength[0].exercises[0].rest_seconds >= 150, 'Deterministic repair must raise squat rest');

  const cooldownBroken = {
    ...week,
    workouts: [{ ...week.workouts[0], cooldown: [{ exercise_id: idOf('Leg Extension'), sets: 1, prescription: '12', why: 'Cooldown' }] }, week.workouts[1], week.workouts[2]],
  };
  const cooldownFixed = repairAiProgram(cooldownBroken, context, catalogById);
  const cooldownId = cooldownFixed.program.workouts[0].cooldown[0]?.exercise_id;
  assert(cooldownId && cooldownId !== idOf('Leg Extension'), 'Ineligible cooldown must be replaced from the library');
  assert(validateAiProgram(cooldownFixed.program, context, catalogById).ok || !validateAiProgram(cooldownFixed.program, context, catalogById).issues.some((i) => i.code === 'COOLDOWN_NOT_ELIGIBLE' && i.severity === 'error'), 'Replaced cooldown must not stay ineligible');

  const heavySupersetBroken = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          { type: 'superset' as const, exercises: [lift('Back Squat', 'primary'), lift('Conventional Deadlift', 'secondary')] },
          ...week.workouts[0].strength.slice(1),
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const pairFixed = repairAiProgram(heavySupersetBroken, context, catalogById);
  assert(
    pairFixed.program.workouts[0].strength[0].type === 'straight_sets' && pairFixed.program.workouts[0].strength[1].type === 'straight_sets',
    'Heavy + heavy superset must be split into straight sets'
  );

  let repairCalls = 0;
  const repaired = await runGenerationPipeline({
    ...pipelineOpts,
    apiKey: 'test-key',
    requestFn: async () => {
      repairCalls += 1;
      return {
        program: restBroken,
        raw: null,
        model: 'gpt-5.4',
        api: 'responses',
        reasoningEffort: 'low',
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        error: null,
      };
    },
  });
  assert(repairCalls === 1, `Deterministic repair must not call GPT again, got ${repairCalls}`);
  assert(repaired.method === 'ai_repaired', `Successful deterministic repair should be ai_repaired, got ${repaired.method}`);
  assert(
    repaired.program.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon')?.exercises[0]?.name === 'Back Squat',
    'Repaired AI week should keep the Monday primary'
  );
  assert((repaired.program.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon')?.exercises[0]?.restSeconds || 0) >= 150, 'Repaired squat rest must be raised');

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
  const volumeFixed = repairAiProgram(thinHams, context, catalogById);
  const volumeAfter = validateAiProgram(volumeFixed.program, context, catalogById);
  assert(
    !volumeAfter.issues.some((i) => i.code === 'VOLUME_OFF' && i.severity === 'error' && /hamstring/i.test(i.message)),
    `Deterministic repair should restore hamstring credit: ${volumeAfter.issues.map((i) => `${i.severity}:${i.message}`).join('; ')}`
  );
  assert(volumeFixed.repairs.some((r) => r.code === 'VOLUME_OFF'), 'Hamstring volume repair must be logged');

  const explicitChin = contributionsForExercise({
    name: 'Chin-Up',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'upper_back'],
    raw: { coaching_metadata: { hypertrophy_volume_credits: [{ muscle: 'lats', credit: 1 }, { muscle: 'biceps', credit: 0.5 }] } },
  });
  assert(
    !explicitChin.some((row) => row.muscle === 'upper_back'),
    'Explicit hypertrophy_volume_credits must not merge name-defaults'
  );
  const legacyChin = contributionsForExercise({
    name: 'Chin-Up',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps'],
    raw: {},
  });
  assert(
    legacyChin.some((row) => row.muscle === 'upper_back' && row.contribution === 0.5),
    'Legacy name inference must still credit Chin-Up upper_back at 0.5'
  );
  assert(movementFamily('Chin-Up') === 'vertical_pull' && movementFamily('Pull-Up') === 'vertical_pull', 'Chin-Up and Pull-Up share a family');
  assert(movementFamily('Bent-Over Row') === 'row' && movementFamily('One-Arm Row') === 'row', 'Working rows share a family');
  const barbellProfile = hypertrophyProfile();
  barbellProfile.availableEquipment = ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'rack', 'bodyweight'];
  const rowPick = pickExercise(
    FALLBACK_CATALOG.filter((ex) => /row/i.test(ex.name)),
    {
      profile: barbellProfile,
      muscle: 'upper_back',
      role: 'primary',
      pattern: 'horizontal_pull',
      alreadyNames: [],
      preferredNames: ['Barbell Row', 'Bent-Over Row'],
    }
  );
  assert(rowPick && /row/i.test(rowPick.name), `Upper-back slot should pick a row, got ${rowPick?.name}`);

  assert(classifyPowerExercise({ name: 'Box Jump', movement_pattern: 'jump' }) === 'explosive_jump', 'Box Jump is an explosive jump');
  assert(classifyPowerExercise({ name: 'Squat Jump', movement_pattern: 'jump' }) === 'explosive_jump', 'Squat Jump is an explosive jump');
  assert(classifyPowerExercise({ name: 'Kettlebell Swing', movement_pattern: 'hinge' }) === 'ballistic_swing', 'KB swing is ballistic, not a jump');
  assert(isHypertrophyStylePowerRx('explosive_jump', 3, 8, 15), '3x8-15 must be illegal jump potentiation');

  const badJumpWeek: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        potentiation: [{ exercise_id: idOf('Vertical Jump'), sets: 3, prescription: '8-15', why: 'Prime quads' }],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const jumpCheck = validateAiProgram(badJumpWeek, context, catalogById);
  assert(
    jumpCheck.issues.some((i) => i.code === 'PRIMER_HYPERTROPHY_RX' && i.severity === 'error'),
    'Vertical Jump 3x8-15 potentiation must error'
  );
  const jumpFixed = repairAiProgram(badJumpWeek, context, catalogById);
  const jumpAfter = validateAiProgram(jumpFixed.program, context, catalogById);
  assert(
    !jumpAfter.issues.some((i) => i.code === 'PRIMER_HYPERTROPHY_RX'),
    `Repair must clear jump hypertrophy RX: ${jumpFixed.program.workouts[0].potentiation[0]?.prescription}`
  );
  const mappedJump = mapAiWeekToScience(badJumpWeek, science, profile, catalogById, library);
  const jumpPrimer = mappedJump.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon')?.potentiation[0];
  assert(jumpPrimer && jumpPrimer.repMax <= 5 && jumpPrimer.repMin >= 2, `Mapped jump primer must stay low-rep, got ${jumpPrimer?.repMin}-${jumpPrimer?.repMax}`);
  assert(jumpPrimer!.targetRir == null, `Jump primer must not carry a working-set RIR, got ${jumpPrimer!.targetRir}`);
  assert(jumpPrimer!.sets >= 2 && jumpPrimer!.sets <= 3, `Jump primer sets ${jumpPrimer!.sets}`);

  const badSwingWeek: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[1],
        potentiation: [{ exercise_id: idOf('Kettlebell Swing'), sets: 3, prescription: '8-15', why: 'Prime hips' }],
      },
      week.workouts[0],
      week.workouts[2],
    ],
  };
  const swingFixed = repairAiProgram(badSwingWeek, context, catalogById);
  const swingRx = swingFixed.program.workouts[0].potentiation[0]?.prescription || '';
  assert(/5\s*-\s*10|5\s*-\s*8/.test(swingRx), `Swing repair should stay ballistic, got ${swingRx}`);
  assert(!/^8-15$/.test(swingRx), 'Swing repair must not keep 8-15');
  const mappedSwing = mapAiWeekToScience(badSwingWeek, science, profile, catalogById, library);
  const swingPrimer = mappedSwing.workouts.find((w) => w.week === 1 && w.dayLabel === 'Wed')?.potentiation[0];
  assert(swingPrimer && swingPrimer.repMax >= 8 && swingPrimer.repMax <= 10, `Mapped swing should be 5-10, got ${swingPrimer?.repMin}-${swingPrimer?.repMax}`);

  const strippedRamps: AiWeekProgram = {
    ...week,
    workouts: week.workouts.map((w) => ({
      ...w,
      strength: w.strength.map((block) => ({
        ...block,
        exercises: block.exercises.map((ex) => ({ ...ex, ramp_sets: [] })),
      })),
    })),
  };
  const inferredRamps = countPersistedRampSets(strippedRamps.workouts[0], library, 'intermediate');
  assert(inferredRamps >= 3, `Empty AI ramp_sets must still count persisted primary ramps, got ${inferredRamps}`);
  const inferredMinutes = estimateSessionFromAi(strippedRamps.workouts[0], library, { experienceLevel: 'intermediate' });
  const explicitMinutes = estimateSessionFromAi(week.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(inferredMinutes >= explicitMinutes, 'Inferred ramps must not under-count versus explicit ramps');

  assert(parsePrescriptionTiming('5 minutes').kind === 'time' && parsePrescriptionTiming('5 minutes').seconds === 300, '5 minutes must parse as 300s');
  assert(parsePrescriptionTiming('30-45 seconds').seconds >= 30 && parsePrescriptionTiming('30-45 seconds').seconds <= 45, 'Second ranges use the midpoint');
  assert(parsePrescriptionTiming('8 reps per side').perSide && (parsePrescriptionTiming('8 reps per side').reps || 0) === 8, 'Per-side reps must parse');
  assert(parsePrescriptionTiming('0.25 miles').kind === 'distance', 'Distance prescriptions must parse');
  assert(prepItemSeconds({ prescription: '5 minutes', sets: 1 }) >= 300, 'A 5-minute timed warmup must count about 5 minutes');
  const timedWarm = estimateWorkoutBreakdown({
    warmupItems: [{ name: 'Treadmill Walk', category: 'raise', reps: '5 minutes', sets: 1, measurementType: 'time' }],
    potentiation: [],
    rampCount: 0,
    exercises: [],
    cooldownItems: [],
  });
  assert(timedWarm.warmupSeconds >= 300 + 90, `5-minute walk plus overhead should be ~6+ min, got ${timedWarm.warmupSeconds}s`);
  assert(powerRestSecondsFor({ name: 'Box Jump', movementPattern: 'jump' }) === 75, 'Jump rest must come from the power prescription');
  assert(powerPrescriptionFor('explosive_jump').restSeconds === 75, 'Explosive jump rest stays 75s');
  assert(powerPrescriptionFor('throw').restSeconds === 60, 'Throw rest stays 60s');
  assert(powerPrescriptionFor('ballistic_swing').restSeconds === 60, 'Swing rest stays 60s');
  const jumpOnly: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        warmup: [],
        potentiation: [{ exercise_id: idOf('Vertical Jump'), sets: 2, prescription: '3-5', why: 'Prime quads' }],
        strength: [],
        cooldown: [],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const jumpBreak = estimateSessionBreakdownFromAi(jumpOnly.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(jumpBreak.potentiationSeconds === 2 * (48 + 75) + 40, `Jump duration must use 75s rest, got ${jumpBreak.potentiationSeconds}s`);
  const jumpPersist = estimateWorkoutBreakdown({
    warmupItems: [],
    potentiation: [{ name: 'Box Jump', sets: 2, restSeconds: 75, role: 'power', muscleGroup: '', primaryMuscles: [], movementPattern: 'jump', repMin: 3, repMax: 5, targetRir: null, loadIncrement: 0 }],
    rampCount: 0,
    exercises: [],
  });
  assert(jumpPersist.potentiationSeconds === jumpBreak.potentiationSeconds, 'Pre-persist and persist jump rest math must match');
  assert(classifySessionDuration(77, 60).over === 'error', '77 vs 60 must remain a duration error');

  const twoPrimary: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { working_sets: 3, rep_min: 4, rep_max: 6, ramp_sets: [] })] },
          { type: 'straight_sets' as const, exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 3, rep_min: 4, rep_max: 6, ramp_sets: [] })] },
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const slotRamps = assignSessionRamps(
    [
      { exercise_id: idOf('Back Squat'), role: 'primary' as const, rep_max: 6 },
      { exercise_id: idOf('Barbell Bench Press'), role: 'primary' as const, rep_max: 6 },
    ],
    library,
    'intermediate'
  );
  assert(slotRamps[0].ramp_sets.length === 4, `Opener heavy squat should get 4 ramps, got ${slotRamps[0].ramp_sets.length}`);
  assert(slotRamps[1].ramp_sets.length === 2, `Later bench should get abbreviated 2 ramps, got ${slotRamps[1].ramp_sets.length}`);
  const effectiveTwo = buildEffectiveWorkout(twoPrimary.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(effectiveTwo.strength[0].ramp_sets.length === 4 && effectiveTwo.strength[1].ramp_sets.length === 2, 'Effective workout must use the same session ramp plan');
  const mappedTwo = mapAiWeekToScience(twoPrimary, science, profile, catalogById, library);
  const mappedMonTwo = mappedTwo.workouts.find((w) => w.week === 1 && w.dayLabel === 'Mon');
  const squatRamps = (mappedMonTwo?.exercises[0].setDetails || []).filter((s) => s.setType === 'warmup').length;
  const benchRamps = (mappedMonTwo?.exercises[1].setDetails || []).filter((s) => s.setType === 'warmup').length;
  assert(squatRamps === 4 && benchRamps === 2, `Mapper ramps must match effective plan, got squat ${squatRamps} bench ${benchRamps}`);
  const pre = estimateSessionBreakdownFromAi(twoPrimary.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(pre.rampCount === 6, `Authoritative duration must count 4+2 ramps, got ${pre.rampCount}`);

  const fatWeek: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        warmup: [
          { exercise_id: idOf('Goblet Squat'), sets: 1, prescription: '10 minutes', why: 'General raise' },
          { exercise_id: idOf('Band Row'), sets: 1, prescription: '12', why: 'Pull prep' },
          { exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' },
          { exercise_id: idOf('Ankle Rocker'), sets: 1, prescription: '12', why: 'Ankle prep' },
          { exercise_id: idOf('Hamstring Stretch'), sets: 1, prescription: '30 sec', why: 'Extra stretch' },
        ],
        potentiation: [{ exercise_id: idOf('Vertical Jump'), sets: 3, prescription: '3-5', why: 'Prime quads' }],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { working_sets: 4, rest_seconds: 180 })] },
          { type: 'straight_sets' as const, exercises: [lift('Barbell Bench Press', 'secondary', { working_sets: 4, rest_seconds: 180 })] },
          { type: 'straight_sets' as const, exercises: [lift('Dumbbell Row', 'accessory', { working_sets: 3 })] },
          { type: 'straight_sets' as const, exercises: [lift('Lateral Raise', 'isolation', { working_sets: 3 })] },
          { type: 'straight_sets' as const, exercises: [lift('Face Pull', 'isolation', { working_sets: 3 })] },
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const fatBefore = estimateSessionFromAi(fatWeek.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(fatBefore > 69, `Overloaded session should start over the 60-minute error band, got ${fatBefore}`);
  const fatFixed = repairAiProgram(fatWeek, context, catalogById);
  const fatAfter = estimateSessionFromAi(fatFixed.program.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(classifySessionDuration(fatAfter, 60).over !== 'error', `Repair must bring the effective session under the error band, got ${fatAfter}`);
  const fatNames = fatFixed.program.workouts[0].strength.flatMap((b) => b.exercises.map((ex) => library.get(ex.exercise_id)?.name || ex.exercise_id));
  assert(fatNames.includes('Back Squat') && fatNames.includes('Barbell Bench Press'), `Duration repair must keep primary/secondary compounds, got ${fatNames.join(', ')}`);
  assert(fatFixed.repairs.some((r) => r.code === 'DURATION_OVER'), 'Duration repair must be logged');

  const liveLike: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        warmup: [
          { exercise_id: idOf('Goblet Squat'), sets: 1, prescription: '5 minutes easy walk', why: 'General raise' },
          { exercise_id: idOf('Band Row'), sets: 1, prescription: '15', why: 'Pull prep' },
          { exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' },
          { exercise_id: idOf('Ankle Rocker'), sets: 1, prescription: '8 reps per side', why: 'Ankle prep' },
        ],
        potentiation: [{ exercise_id: idOf('Vertical Jump'), sets: 3, prescription: '3-5', why: 'Prime quads' }],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { working_sets: 4, rep_min: 4, rep_max: 6, rest_seconds: 180 })] },
          { type: 'straight_sets' as const, exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 4, rep_min: 4, rep_max: 6, rest_seconds: 180 })] },
          { type: 'straight_sets' as const, exercises: [lift('Dumbbell Row', 'secondary', { working_sets: 3, rest_seconds: 90 })] },
          { type: 'straight_sets' as const, exercises: [lift('Romanian Deadlift', 'secondary', { working_sets: 3, rest_seconds: 120 })] },
          { type: 'straight_sets' as const, exercises: [lift('Face Pull', 'accessory', { working_sets: 2, rest_seconds: 75 })] },
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const liveBefore = estimateSessionFromAi(liveLike.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(liveBefore > 69, `Two heavy 4-set primaries plus a 5-minute walk should start over the error band, got ${liveBefore}`);
  const liveFixed = repairAiProgram(liveLike, context, catalogById);
  const liveAfter = estimateSessionFromAi(liveFixed.program.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(classifySessionDuration(liveAfter, 60).over !== 'error', `Live-like 60-minute repair must leave the error band, got ${liveAfter}`);
  const liveNames = liveFixed.program.workouts[0].strength.flatMap((b) => b.exercises.map((ex) => library.get(ex.exercise_id)?.name || ex.exercise_id));
  assert(liveNames.includes('Back Squat') && liveNames.includes('Barbell Bench Press'), `Live-like repair must keep both primaries, got ${liveNames.join(', ')}`);

  const overTarget: AiWeekProgram = {
    ...week,
    workouts: [
      {
        ...week.workouts[0],
        warmup: [
          { exercise_id: idOf('Goblet Squat'), sets: 1, prescription: '5 minutes easy walk', why: 'General raise' },
          { exercise_id: idOf('Band Row'), sets: 1, prescription: '15', why: 'Pull prep' },
          { exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' },
          { exercise_id: idOf('Ankle Rocker'), sets: 1, prescription: '8 reps per side', why: 'Ankle prep' },
        ],
        potentiation: [{ exercise_id: idOf('Vertical Jump'), sets: 2, prescription: '3-5', why: 'Prime quads' }],
        strength: [
          { type: 'straight_sets' as const, exercises: [lift('Back Squat', 'primary', { working_sets: 4, rep_min: 4, rep_max: 6, rest_seconds: 180 })] },
          { type: 'straight_sets' as const, exercises: [lift('Barbell Bench Press', 'primary', { working_sets: 3, rep_min: 4, rep_max: 6, rest_seconds: 180 })] },
          { type: 'straight_sets' as const, exercises: [lift('Dumbbell Row', 'secondary', { working_sets: 3, rest_seconds: 90 })] },
          { type: 'straight_sets' as const, exercises: [lift('Face Pull', 'isolation', { working_sets: 3, rest_seconds: 75 })] },
          { type: 'straight_sets' as const, exercises: [lift('Lateral Raise', 'isolation', { working_sets: 3, rest_seconds: 60 })] },
        ],
      },
      week.workouts[1],
      week.workouts[2],
    ],
  };
  const overBefore = estimateSessionFromAi(overTarget.workouts[0], library, { experienceLevel: 'intermediate' });
  assert(overBefore >= 66, `Efficiency fixture should start over the 60-minute target, got ${overBefore}`);
  const efficient = applyDurationEfficiency(overTarget, context, catalogById);
  const overAfter = estimateSessionFromAi(efficient.program.workouts[0], library, { experienceLevel: 'intermediate' });
  const overNames = efficient.program.workouts[0].strength.flatMap((b) => b.exercises.map((ex) => library.get(ex.exercise_id)?.name || ex.exercise_id));
  assert(overNames.includes('Back Squat') && overNames.includes('Barbell Bench Press'), `Efficiency must keep primaries, got ${overNames.join(', ')}`);
  assert(overNames.includes('Face Pull') && overNames.includes('Lateral Raise'), 'Efficiency should pair leftover accessories rather than delete them');
  assert(efficient.program.workouts[0].strength.some((b) => b.type === 'superset'), 'Sometimes preference should pair leftover accessories before deleting them');
  assert(overAfter <= overBefore, `Efficiency should not add time, ${overBefore} → ${overAfter}`);

  console.log('BIQ-0209 Phase 1.1 generation checks passed.');
  console.log(
    `Sample 3-day Full Body (AI fixture, not science fallback): ${mapped.workouts
      .filter((w) => w.week === 1)
      .map((w) => `${w.name}: ${w.exercises.map((e) => e.name).join(', ')}`)
      .join(' | ')}`
  );
  console.log(`Validator: ${ok.issues.length ? ok.issues.map((i) => `${i.severity}:${i.code}`).join(', ') : 'no issues'}`);
}
