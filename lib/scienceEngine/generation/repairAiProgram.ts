import { creditSets, contributionsForExercise } from '../contributions';
import { classifySessionDuration, estimateSessionFromAi, minStrengthMoves } from '../duration';
import { parsePrescriptionTiming } from '../prescriptionTime';
import {
  classifyPowerExercise,
  clampPowerSets,
  formatPowerPrescription,
  isHypertrophyStylePowerRx,
  parsePrepPrescription,
  powerPrescriptionFor,
} from '../powerPrescription';
import { goalUsesHypertrophyBias } from '../rules';
import type { CatalogExercise, PrimaryGoal } from '../types';
import type { MuscleId } from '../taxonomy';
import { findDesignerById } from './matchById';
import { isWorkingIsolationAsCooldown, muscleTier, restBand, whyAgreesWithExercise } from './qualityRules';
import type {
  AiPrepItem,
  AiStrengthExercise,
  AiWeekProgram,
  AiWorkoutPlan,
  DesignerExercise,
  DeterministicRepair,
  GenerationContext,
  StrengthRole,
} from './types';

const HEAVY_PATTERNS = new Set(['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull']);

export function repairAiProgram(
  program: AiWeekProgram,
  context: GenerationContext,
  catalogById: Map<string, CatalogExercise>
): { program: AiWeekProgram; repairs: DeterministicRepair[] } {
  const next = JSON.parse(JSON.stringify(program)) as AiWeekProgram;
  const repairs: DeterministicRepair[] = [];
  const library = libraryFromContext(context);

  (next.workouts || []).forEach((workout) => {
    repairWorkout(workout, context, library, catalogById, repairs);
  });
  repairWeeklyVolume(next, context, library, catalogById, repairs);
  (next.workouts || []).forEach((workout) => efficiencyPass(workout, context, library, repairs));
  return { program: next, repairs };
}

export function applyDurationEfficiency(
  program: AiWeekProgram,
  context: GenerationContext,
  catalogById: Map<string, CatalogExercise>
): { program: AiWeekProgram; repairs: DeterministicRepair[] } {
  const next = JSON.parse(JSON.stringify(program)) as AiWeekProgram;
  const repairs: DeterministicRepair[] = [];
  const library = libraryFromContext(context);
  (next.workouts || []).forEach((workout) => efficiencyPass(workout, context, library, repairs));
  return { program: next, repairs };
}

function libraryFromContext(context: GenerationContext) {
  const library = new Map<string, DesignerExercise>();
  [...context.candidate_library, ...context.warmup_library, ...(context.cooldown_library || [])].forEach((ex) =>
    library.set(ex.exercise_id, ex)
  );
  return library;
}

function flattenStrength(workout: AiWorkoutPlan): AiStrengthExercise[] {
  return (workout.strength || []).flatMap((block) => block.exercises || []);
}

function repairWorkout(
  workout: AiWorkoutPlan,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>,
  repairs: DeterministicRepair[]
) {
  workout.warmup = (workout.warmup || []).map((item) =>
    repairPrep(item, 'warmup', workout, context, library, repairs)
  ).filter(Boolean) as AiPrepItem[];
  workout.potentiation = (workout.potentiation || []).map((item) =>
    repairPrep(item, 'potentiation', workout, context, library, repairs)
  ).filter(Boolean) as AiPrepItem[];
  workout.cooldown = (workout.cooldown || []).map((item) =>
    repairPrep(item, 'cooldown', workout, context, library, repairs)
  ).filter(Boolean) as AiPrepItem[];

  (workout.strength || []).forEach((block) => {
    (block.exercises || []).forEach((ex) => repairStrengthItem(ex, block.type !== 'straight_sets', workout, context, library, repairs));
  });

  splitHeavySupersets(workout, library, repairs);
  normalizeLoneBlocks(workout);
  normalizeRoles(workout, library, context, repairs);
  trimDuration(workout, context, library, repairs);
}

function repairPrep(
  item: AiPrepItem,
  kind: 'warmup' | 'potentiation' | 'cooldown',
  workout: AiWorkoutPlan,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  repairs: DeterministicRepair[]
): AiPrepItem | null {
  const hit = findDesignerById(library, item.exercise_id);
  const eligible =
    kind === 'warmup'
      ? context.warmup_library
      : kind === 'cooldown'
        ? context.cooldown_library || []
        : Array.from(library.values()).filter((ex) => ex.power_eligible);
  const used = new Set(
    [
      ...(workout.warmup || []).map((row) => row.exercise_id),
      ...(workout.potentiation || []).map((row) => row.exercise_id),
      ...(workout.cooldown || []).map((row) => row.exercise_id),
      ...flattenStrength(workout).map((row) => row.exercise_id),
    ].filter((id) => id !== item.exercise_id)
  );

  const ineligible =
    !hit ||
    (kind === 'warmup' && !hit.warmup_eligible) ||
    (kind === 'potentiation' && !hit.power_eligible) ||
    (kind === 'cooldown' && (isWorkingIsolationAsCooldown(hit) || !hit.cooldown_eligible));

  if (ineligible) {
    const replacement = pickReplacement(
      eligible.filter((ex) => (kind === 'cooldown' ? ex.cooldown_eligible && !isWorkingIsolationAsCooldown(ex) : kind === 'warmup' ? ex.warmup_eligible : ex.power_eligible)),
      used,
      workout,
      library
    );
    if (!replacement) {
      repairs.push({
        code: kind === 'cooldown' ? 'COOLDOWN_NOT_ELIGIBLE' : kind === 'warmup' ? 'WARMUP_NOT_ELIGIBLE' : 'PRIMER_NOT_ELIGIBLE',
        action: `Removed ineligible ${kind} ${hit?.name || item.exercise_id}`,
        day_label: workout.day_label,
        exercise_id: item.exercise_id,
      });
      return null;
    }
    repairs.push({
      code: kind === 'cooldown' ? 'COOLDOWN_NOT_ELIGIBLE' : kind === 'warmup' ? 'WARMUP_NOT_ELIGIBLE' : 'PRIMER_NOT_ELIGIBLE',
      action: `Replaced ${hit?.name || item.exercise_id} with ${replacement.name}`,
      day_label: workout.day_label,
      exercise_id: replacement.exercise_id,
    });
    item = {
      ...item,
      exercise_id: replacement.exercise_id,
      why: kind === 'cooldown' ? `Ease ${replacement.primary_muscles.join(', ') || replacement.name}` : `Prep ${replacement.primary_muscles.join(', ') || replacement.name}`,
    };
  }

  const meta = findDesignerById(library, item.exercise_id);
  if (meta && item.prescription && /\/side/i.test(item.prescription) && meta.laterality === 'bilateral') {
    item.prescription = item.prescription.replace(/\s*\/side/gi, '');
    repairs.push({
      code: 'LATERALITY_MISMATCH',
      action: `Removed /side from ${meta.name} ${kind}`,
      day_label: workout.day_label,
      exercise_id: meta.exercise_id,
    });
  }
  if (meta && item.why && !whyAgreesWithExercise(item.why, meta)) {
    item.why = kind === 'cooldown' ? `Ease ${meta.primary_muscles.join(', ') || meta.name}` : `Prep ${meta.primary_muscles.join(', ') || meta.name}`;
    repairs.push({
      code: 'WHY_MISMATCH',
      action: `Rewrote why for ${meta.name}`,
      day_label: workout.day_label,
      exercise_id: meta.exercise_id,
    });
  }
  if (kind === 'potentiation' && meta) {
    const family = classifyPowerExercise(meta);
    const rx = powerPrescriptionFor(family, {
      experienceLevel: context.athlete.experience_level,
      conservative: goalUsesHypertrophyBias(context.athlete.primary_goal as PrimaryGoal),
    });
    const parsed = parsePrepPrescription(item.prescription);
    const sets = item.sets || parsed.sets;
    const needsRewrite =
      isHypertrophyStylePowerRx(family, sets, parsed.min, parsed.max) ||
      parsed.min == null ||
      (parsed.min != null && (parsed.min < rx.repMin || (parsed.max ?? parsed.min) > rx.repMax));
    if (needsRewrite) {
      item.sets = clampPowerSets(sets, rx);
      item.prescription = formatPowerPrescription(rx);
      repairs.push({
        code: 'PRIMER_HYPERTROPHY_RX',
        action: `Rewrote ${meta.name} potentiation to ${item.sets} x ${item.prescription}`,
        day_label: workout.day_label,
        exercise_id: meta.exercise_id,
      });
    }
  }
  return item;
}

function pickReplacement(
  pool: DesignerExercise[],
  used: Set<string>,
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>
): DesignerExercise | null {
  const needed = new Set(
    flattenStrength(workout).flatMap((ex) => library.get(ex.exercise_id)?.primary_muscles || [])
  );
  return (
    pool.find((ex) => !used.has(ex.exercise_id) && ex.primary_muscles.some((m) => needed.has(m))) ||
    pool.find((ex) => !used.has(ex.exercise_id)) ||
    pool[0] ||
    null
  );
}

function repairStrengthItem(
  ex: AiStrengthExercise,
  inSuperset: boolean,
  workout: AiWorkoutPlan,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  repairs: DeterministicRepair[]
) {
  const meta = findDesignerById(library, ex.exercise_id);
  if (!meta) return;

  if (ex.reps_per_side && meta.laterality === 'bilateral') {
    ex.reps_per_side = false;
    repairs.push({
      code: 'LATERALITY_MISMATCH',
      action: `Cleared per-side flag on bilateral ${meta.name}`,
      day_label: workout.day_label,
      exercise_id: ex.exercise_id,
    });
  } else if (!ex.reps_per_side && meta.laterality === 'unilateral') {
    ex.reps_per_side = true;
    repairs.push({
      code: 'LATERALITY_MISMATCH',
      action: `Marked unilateral ${meta.name} per side`,
      day_label: workout.day_label,
      exercise_id: ex.exercise_id,
    });
  }

  if (ex.measurement_type !== meta.measurement_type && meta.measurement_type !== 'reps') {
    ex.measurement_type = meta.measurement_type;
    repairs.push({
      code: 'MEASUREMENT_MISMATCH',
      action: `Set ${meta.name} measurement to ${meta.measurement_type}`,
      day_label: workout.day_label,
      exercise_id: ex.exercise_id,
    });
  }

  const band = restBand({
    role: ex.role,
    kind: meta.exercise_kind,
    fatigue: meta.fatigue_cost,
    repMax: ex.rep_max,
    goal: context.athlete.primary_goal,
    inSuperset,
  });
  if (ex.rest_seconds < band.min) {
    const from = ex.rest_seconds;
    ex.rest_seconds = band.min;
    repairs.push({
      code: 'REST_TOO_SHORT',
      action: `Raised ${meta.name} rest ${from}s → ${band.min}s`,
      day_label: workout.day_label,
      exercise_id: ex.exercise_id,
    });
  }

  if (ex.ramp_sets?.length) {
    ex.ramp_sets = [];
    repairs.push({
      code: 'RAMP_ON_ACCESSORY',
      action: `Cleared model ramps on ${meta.name}; engine adds eligible ramps`,
      day_label: workout.day_label,
      exercise_id: ex.exercise_id,
    });
  }

  if (ex.why && !whyAgreesWithExercise(ex.why, meta)) {
    ex.why = `${ex.role} ${meta.movement_pattern} for ${meta.primary_muscles.join(', ') || meta.name}`;
    repairs.push({
      code: 'WHY_MISMATCH',
      action: `Rewrote why for ${meta.name}`,
      day_label: workout.day_label,
      exercise_id: ex.exercise_id,
    });
  }
}

function isHeavyCompound(ex: DesignerExercise): boolean {
  return ex.exercise_kind === 'compound' && ex.fatigue_cost !== 'low' && HEAVY_PATTERNS.has(ex.movement_pattern);
}

function splitHeavySupersets(workout: AiWorkoutPlan, library: Map<string, DesignerExercise>, repairs: DeterministicRepair[]) {
  const next: AiWorkoutPlan['strength'] = [];
  (workout.strength || []).forEach((block) => {
    if (block.type === 'straight_sets' || (block.exercises || []).length < 2) {
      next.push(block);
      return;
    }
    const heavy = (block.exercises || [])
      .map((ex) => library.get(ex.exercise_id))
      .filter((meta): meta is DesignerExercise => !!meta && isHeavyCompound(meta));
    if (heavy.length >= 2) {
      block.exercises.forEach((ex) => next.push({ type: 'straight_sets', exercises: [ex] }));
      repairs.push({
        code: 'SUPERSET_HEAVY_PAIR',
        action: `Split heavy pair ${heavy.map((h) => h.name).join(' + ')} into straight sets`,
        day_label: workout.day_label,
      });
      return;
    }
    next.push(block);
  });
  workout.strength = next;
}

function normalizeRoles(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  context: GenerationContext,
  repairs: DeterministicRepair[]
) {
  const strength = flattenStrength(workout);
  if (!strength.length) return;
  const minutes = context.constraints.session_minutes;
  const primaryCap = minutes <= 45 ? 1 : 2;

  strength.forEach((ex) => {
    const meta = library.get(ex.exercise_id);
    if (!meta) return;
    if (ex.role === 'primary' && meta.exercise_kind === 'isolation') {
      ex.role = 'isolation';
      repairs.push({
        code: 'ROLE_ISOLATION_PRIMARY',
        action: `Relabeled isolation ${meta.name} from primary to isolation`,
        day_label: workout.day_label,
        exercise_id: ex.exercise_id,
      });
    }
    if (ex.role === 'isolation' && meta.exercise_kind === 'compound' && meta.fatigue_cost === 'high') {
      ex.role = 'secondary';
      repairs.push({
        code: 'ROLE_COMPOUND_ISOLATION',
        action: `Relabeled high-fatigue compound ${meta.name} to secondary`,
        day_label: workout.day_label,
        exercise_id: ex.exercise_id,
      });
    }
  });

  const primaries = strength.filter((ex) => ex.role === 'primary');
  const allPrimary = strength.length >= 4 && primaries.length === strength.length;
  if (allPrimary || primaries.length > primaryCap + 1) {
    let kept = 0;
    strength.forEach((ex) => {
      const meta = library.get(ex.exercise_id);
      if (ex.role !== 'primary') return;
      if (kept < primaryCap && meta?.exercise_kind === 'compound') {
        kept += 1;
        return;
      }
      ex.role = meta?.exercise_kind === 'isolation' ? 'isolation' : 'secondary';
      repairs.push({
        code: 'ROLE_ALL_PRIMARY',
        action: `Normalized ${meta?.name || ex.exercise_id} from primary to ${ex.role}`,
        day_label: workout.day_label,
        exercise_id: ex.exercise_id,
      });
    });
  }
}

function sessionOver(workout: AiWorkoutPlan, context: GenerationContext, library: Map<string, DesignerExercise>) {
  const estimated = estimateSessionFromAi(workout, library, { experienceLevel: context.athlete.experience_level });
  return {
    estimated,
    over: classifySessionDuration(estimated, context.constraints.session_minutes).over,
  };
}

function isGeneralWarmup(item: AiPrepItem, library: Map<string, DesignerExercise>) {
  const name = (library.get(item.exercise_id)?.name || '').toLowerCase();
  const timing = parsePrescriptionTiming(item.prescription, library.get(item.exercise_id)?.measurement_type);
  return timing.kind === 'time' || timing.kind === 'distance' || /walk|bike|row|jog|treadmill|elliptical|cardio/.test(name);
}

function normalizeLoneBlocks(workout: AiWorkoutPlan) {
  workout.strength = (workout.strength || []).map((block) => {
    if (block.type !== 'straight_sets' && (block.exercises || []).length < 2) {
      return { type: 'straight_sets', exercises: block.exercises };
    }
    return block;
  });
}

function isHighFatigue(ex: AiStrengthExercise, library: Map<string, DesignerExercise>) {
  return library.get(ex.exercise_id)?.fatigue_cost === 'high';
}

function wouldCauseAllHighFatigue(
  workout: AiWorkoutPlan,
  dropId: string,
  library: Map<string, DesignerExercise>
) {
  const remaining = flattenStrength(workout).filter((ex) => ex.exercise_id !== dropId);
  if (remaining.length < 4) return false;
  return remaining.every((ex) => isHighFatigue(ex, library));
}

function dropWarmupExtra(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  repairs: DeterministicRepair[]
): boolean {
  const drop = [...(workout.warmup || [])].reverse().find((item) => !isGeneralWarmup(item, library));
  if (!drop) return false;
  workout.warmup = workout.warmup.filter((item) => item !== drop);
  repairs.push({
    code: 'DURATION_OVER',
    action: `Removed extra warmup ${library.get(drop.exercise_id)?.name || drop.exercise_id} to fit the session`,
    day_label: workout.day_label,
    exercise_id: drop.exercise_id,
  });
  return true;
}

function trimDuration(
  workout: AiWorkoutPlan,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  repairs: DeterministicRepair[],
  protectIds: Set<string> = new Set()
) {
  const minutes = context.constraints.session_minutes;
  const minMoves = Math.min(4, minStrengthMoves(minutes));
  const pref = String(context.athlete.superset_preference || '').toLowerCase();
  const allowSuperset = /sometimes|often|always|frequently|yes/.test(pref);
  let guard = 0;
  while (guard < 24) {
    normalizeLoneBlocks(workout);
    if (sessionOver(workout, context, library).over !== 'error') break;

    // A. Unnecessary/redundant warmup volume
    const extras = (workout.warmup || []).filter((item) => !isGeneralWarmup(item, library));
    if (extras.length > 2 && dropWarmupExtra(workout, library, repairs)) {
      guard += 1;
      continue;
    }
    const general = (workout.warmup || []).find((item) => isGeneralWarmup(item, library));
    if (general) {
      const timing = parsePrescriptionTiming(general.prescription, library.get(general.exercise_id)?.measurement_type);
      if (timing.kind === 'time' && timing.seconds > 300) {
        general.prescription = '5 minutes';
        repairs.push({
          code: 'DURATION_OVER',
          action: `Capped ${library.get(general.exercise_id)?.name || general.exercise_id} general warmup at 5 minutes`,
          day_label: workout.day_label,
          exercise_id: general.exercise_id,
        });
        guard += 1;
        continue;
      }
    }

    // B. Excessive potentiation
    const primer = [...(workout.potentiation || [])].reverse().find((item) => (item.sets || 1) > 2);
    if (primer) {
      primer.sets = 2;
      repairs.push({
        code: 'DURATION_OVER',
        action: `Reduced ${library.get(primer.exercise_id)?.name || primer.exercise_id} primer to 2 sets`,
        day_label: workout.day_label,
        exercise_id: primer.exercise_id,
      });
      guard += 1;
      continue;
    }
    if ((workout.potentiation || []).length > 1) {
      const extraPrimer = workout.potentiation[workout.potentiation.length - 1];
      workout.potentiation = workout.potentiation.slice(0, -1);
      repairs.push({
        code: 'DURATION_OVER',
        action: `Removed extra primer ${library.get(extraPrimer.exercise_id)?.name || extraPrimer.exercise_id}`,
        day_label: workout.day_label,
        exercise_id: extraPrimer.exercise_id,
      });
      guard += 1;
      continue;
    }

    if (extras.length > 1 && dropWarmupExtra(workout, library, repairs)) {
      guard += 1;
      continue;
    }

    const strength = flattenStrength(workout);
    const primaries = strength.filter((ex) => ex.role === 'primary');
    const secondaries = strength.filter((ex) => ex.role === 'secondary' && !protectIds.has(ex.exercise_id));
    const lowPriority = [...strength].reverse().filter(
      (ex) => (ex.role === 'isolation' || ex.role === 'accessory') && !protectIds.has(ex.exercise_id)
    );

    // C. Lower-priority accessory/isolation volume
    const extraSets = lowPriority.find((ex) => ex.working_sets > 2);
    if (extraSets) {
      extraSets.working_sets -= 1;
      repairs.push({
        code: 'DURATION_OVER',
        action: `Reduced ${library.get(extraSets.exercise_id)?.name || extraSets.exercise_id} to ${extraSets.working_sets} sets for duration`,
        day_label: workout.day_label,
        exercise_id: extraSets.exercise_id,
      });
      guard += 1;
      continue;
    }

    // D. Accessory supersets when preference allows (before deleting the last accessory)
    if (allowSuperset && pairAccessorySuperset(workout, library, repairs)) {
      guard += 1;
      continue;
    }

    const dropAccessory = lowPriority.find((ex) => !wouldCauseAllHighFatigue(workout, ex.exercise_id, library));
    if (dropAccessory && (strength.length > minMoves || primaries.length >= 1)) {
      removeStrengthExercise(workout, dropAccessory.exercise_id);
      repairs.push({
        code: 'DURATION_OVER',
        action: `Removed ${library.get(dropAccessory.exercise_id)?.name || dropAccessory.exercise_id} to fit the session`,
        day_label: workout.day_label,
        exercise_id: dropAccessory.exercise_id,
      });
      guard += 1;
      continue;
    }

    // E. Reduce secondary work
    const secondary = [...strength].reverse().find((ex) => ex.role === 'secondary' && ex.working_sets > 2 && !protectIds.has(ex.exercise_id));
    if (secondary) {
      secondary.working_sets -= 1;
      repairs.push({
        code: 'DURATION_OVER',
        action: `Reduced ${library.get(secondary.exercise_id)?.name || secondary.exercise_id} to ${secondary.working_sets} sets for duration`,
        day_label: workout.day_label,
        exercise_id: secondary.exercise_id,
      });
      guard += 1;
      continue;
    }
    if (secondaries.length > 1 && strength.length > minMoves) {
      const drop = [...secondaries].reverse().find((ex) => !wouldCauseAllHighFatigue(workout, ex.exercise_id, library));
      if (drop) {
        removeStrengthExercise(workout, drop.exercise_id);
        repairs.push({
          code: 'DURATION_OVER',
          action: `Removed ${library.get(drop.exercise_id)?.name || drop.exercise_id} to fit the session`,
          day_label: workout.day_label,
          exercise_id: drop.exercise_id,
        });
        guard += 1;
        continue;
      }
    }

    const heavyPrimary = [...strength].reverse().find((ex) => ex.role === 'primary' && ex.working_sets > 3 && !protectIds.has(ex.exercise_id));
    if (heavyPrimary) {
      heavyPrimary.working_sets -= 1;
      repairs.push({
        code: 'DURATION_OVER',
        action: `Reduced ${library.get(heavyPrimary.exercise_id)?.name || heavyPrimary.exercise_id} to ${heavyPrimary.working_sets} sets for duration`,
        day_label: workout.day_label,
        exercise_id: heavyPrimary.exercise_id,
      });
      guard += 1;
      continue;
    }
    break;
  }
  efficiencyPass(workout, context, library, repairs, protectIds);
}

function efficiencyPass(
  workout: AiWorkoutPlan,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  repairs: DeterministicRepair[],
  protectIds: Set<string> = new Set()
) {
  const pref = String(context.athlete.superset_preference || '').toLowerCase();
  const allowSuperset = /sometimes|often|always|frequently|yes/.test(pref);
  let guard = 0;
  while (guard < 8) {
    normalizeLoneBlocks(workout);
    if (sessionOver(workout, context, library).over === 'ok') break;

    if (allowSuperset && pairAccessorySuperset(workout, library, repairs)) {
      guard += 1;
      continue;
    }

    const extras = (workout.warmup || []).filter((item) => !isGeneralWarmup(item, library));
    if (extras.length > 2 && dropWarmupExtra(workout, library, repairs)) {
      guard += 1;
      continue;
    }

    const strength = flattenStrength(workout);
    const accessory = [...strength].reverse().find(
      (ex) => (ex.role === 'isolation' || ex.role === 'accessory') && ex.working_sets > 2 && !protectIds.has(ex.exercise_id)
    );
    if (accessory) {
      accessory.working_sets -= 1;
      repairs.push({
        code: 'DURATION_OVER',
        action: `Reduced ${library.get(accessory.exercise_id)?.name || accessory.exercise_id} to ${accessory.working_sets} sets for duration`,
        day_label: workout.day_label,
        exercise_id: accessory.exercise_id,
      });
      guard += 1;
      continue;
    }

    const secondary = [...strength].reverse().find(
      (ex) => ex.role === 'secondary' && ex.working_sets > 2 && !protectIds.has(ex.exercise_id)
    );
    if (secondary) {
      secondary.working_sets -= 1;
      repairs.push({
        code: 'DURATION_OVER',
        action: `Reduced ${library.get(secondary.exercise_id)?.name || secondary.exercise_id} to ${secondary.working_sets} sets for duration`,
        day_label: workout.day_label,
        exercise_id: secondary.exercise_id,
      });
      guard += 1;
      continue;
    }
    break;
  }
}

function pairAccessorySuperset(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  repairs: DeterministicRepair[]
): boolean {
  const unpaired: Array<{ ex: AiStrengthExercise; meta: DesignerExercise; blockIndex: number }> = [];
  (workout.strength || []).forEach((block, blockIndex) => {
    if (block.type !== 'straight_sets' || (block.exercises || []).length !== 1) return;
    const ex = block.exercises[0];
    const meta = library.get(ex.exercise_id);
    if (!ex || !meta || ex.role === 'primary') return;
    const accessory = ex.role === 'isolation' || ex.role === 'accessory';
    const pairableSecondary = ex.role === 'secondary' && !isHeavyCompound(meta);
    if (!accessory && !pairableSecondary) return;
    if (isHeavyCompound(meta)) return;
    unpaired.push({ ex, meta, blockIndex });
  });
  for (let i = 0; i < unpaired.length; i += 1) {
    for (let j = i + 1; j < unpaired.length; j += 1) {
      const a = unpaired[i];
      const b = unpaired[j];
      const accessoryRole = (ex: AiStrengthExercise) => ex.role === 'isolation' || ex.role === 'accessory';
      if (!accessoryRole(a.ex) && !accessoryRole(b.ex)) continue;
      if (a.meta.movement_pattern === b.meta.movement_pattern) continue;
      if (a.meta.fatigue_cost === 'high' && b.meta.fatigue_cost === 'high') continue;
      const keep = Math.min(a.blockIndex, b.blockIndex);
      const drop = Math.max(a.blockIndex, b.blockIndex);
      const first = keep === a.blockIndex ? a.ex : b.ex;
      const second = keep === a.blockIndex ? b.ex : a.ex;
      const firstMeta = keep === a.blockIndex ? a.meta : b.meta;
      const secondMeta = keep === a.blockIndex ? b.meta : a.meta;
      workout.strength[keep] = { type: 'superset', exercises: [first, second] };
      workout.strength.splice(drop, 1);
      repairs.push({
        code: 'DURATION_OVER',
        action: `Superset ${firstMeta.name} with ${secondMeta.name} to save rest time`,
        day_label: workout.day_label,
        exercise_id: first.exercise_id,
      });
      return true;
    }
  }
  return false;
}

function removeStrengthExercise(workout: AiWorkoutPlan, exerciseId: string) {
  workout.strength = (workout.strength || [])
    .map((block) => ({ ...block, exercises: block.exercises.filter((ex) => ex.exercise_id !== exerciseId) }))
    .filter((block) => block.exercises.length);
}

function weeklyCredits(
  workouts: AiWorkoutPlan[],
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>
): Record<string, number> {
  const credits: Record<string, number> = {};
  workouts.forEach((workout) => {
    flattenStrength(workout).forEach((ex) => {
      const catalog = catalogById.get(ex.exercise_id);
      const designer = library.get(ex.exercise_id);
      if (!catalog && !designer) return;
      const row = catalog || {
        name: designer!.name,
        primaryMuscles: designer!.primary_muscles as MuscleId[],
        secondaryMuscles: designer!.secondary_muscles as MuscleId[],
      };
      const gained = creditSets(contributionsForExercise(row as CatalogExercise), ex.working_sets);
      Object.entries(gained).forEach(([muscle, value]) => {
        credits[muscle] = (credits[muscle] || 0) + value;
      });
    });
  });
  return credits;
}

function creditsForExercise(
  ex: DesignerExercise,
  catalogById: Map<string, CatalogExercise>,
  sets: number
): Record<string, number> {
  const catalog = catalogById.get(ex.exercise_id);
  const row = catalog || {
    name: ex.name,
    primaryMuscles: ex.primary_muscles as MuscleId[],
    secondaryMuscles: ex.secondary_muscles as MuscleId[],
  };
  return creditSets(contributionsForExercise(row as CatalogExercise), sets);
}

function repairWeeklyVolume(
  program: AiWeekProgram,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>,
  repairs: DeterministicRepair[]
) {
  if (!goalUsesHypertrophyBias(context.athlete.primary_goal as any)) return;
  const workouts = program.workouts || [];
  if (!workouts.length) return;

  context.weekly_volume_targets.forEach((target) => {
    const tier = muscleTier(target.muscle, target.priority);
    if (tier !== 'major') return;
    for (let step = 0; step < 4; step += 1) {
      const credits = weeklyCredits(workouts, library, catalogById);
      const got = credits[target.muscle] || 0;
      const ratio = target.target_working_sets > 0 ? got / target.target_working_sets : 1;
      if (got >= 1 && ratio >= 0.5) return;

      const existing = findExistingCreditExercise(workouts, library, catalogById, target.muscle);
      const existingMeta = existing ? library.get(existing.ex.exercise_id) : null;
      const perSet = existingMeta ? creditsForExercise(existingMeta, catalogById, 1)[target.muscle] || 0 : 0;
      if (existing && existing.ex.working_sets < 6 && perSet >= 1) {
        existing.ex.working_sets += 1;
        repairs.push({
          code: 'VOLUME_OFF',
          action: `Added 1 set of ${existingMeta?.name || existing.ex.exercise_id} for ${target.muscle}`,
          day_label: existing.day,
          exercise_id: existing.ex.exercise_id,
        });
        continue;
      }

      const added = addLibraryIsolation(workouts, context, library, catalogById, target.muscle);
      if (!added) return;
      repairs.push({
        code: 'VOLUME_OFF',
        action: `Added ${added.name} for ${target.muscle}`,
        day_label: added.day,
        exercise_id: added.exercise_id,
      });
      const day = workouts.find((w) => w.day_label === added.day);
      if (day) trimDuration(day, context, library, repairs, new Set([added.exercise_id]));
    }
  });
  workouts.forEach((workout) => trimDuration(workout, context, library, repairs));
}

function findExistingCreditExercise(
  workouts: AiWorkoutPlan[],
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>,
  muscle: string
): { day: string; ex: AiStrengthExercise } | null {
  for (const workout of workouts) {
    for (const ex of flattenStrength(workout)) {
      const meta = library.get(ex.exercise_id);
      if (!meta) continue;
      const credits = creditsForExercise(meta, catalogById, 1);
      if ((credits[muscle] || 0) > 0 && ex.working_sets < 6) {
        return { day: workout.day_label, ex };
      }
    }
  }
  return null;
}

function addLibraryIsolation(
  workouts: AiWorkoutPlan[],
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>,
  muscle: string
): { name: string; day: string; exercise_id: string } | null {
  const used = new Set(workouts.flatMap((w) => flattenStrength(w).map((ex) => ex.exercise_id)));
  const unused = Array.from(library.values()).filter((ex) => {
    if (used.has(ex.exercise_id)) return false;
    if (ex.warmup_eligible && !ex.program_roles.some((r) => r !== 'warmup' && r !== 'power')) return false;
    return (creditsForExercise(ex, catalogById, 1)[muscle] || 0) > 0;
  });
  const candidate =
    unused.find((ex) => (creditsForExercise(ex, catalogById, 1)[muscle] || 0) >= 1) ||
    unused[0];
  if (!candidate) return null;
  const targetDay = workouts.slice().sort((a, b) => flattenStrength(a).length - flattenStrength(b).length)[0];
  if (!targetDay) return null;
  const role: StrengthRole = candidate.exercise_kind === 'isolation' ? 'isolation' : 'accessory';
  targetDay.strength.push({
    type: 'straight_sets',
    exercises: [
      {
        exercise_id: candidate.exercise_id,
        role,
        working_sets: 3,
        rep_min: candidate.default_rep_min || 8,
        rep_max: candidate.default_rep_max || 12,
        target_rir: 2,
        rest_seconds: role === 'isolation' ? 60 : 90,
        reps_per_side: candidate.laterality === 'unilateral',
        measurement_type: candidate.measurement_type,
        ramp_sets: [],
        why: `${role} ${candidate.movement_pattern} for ${muscle}`,
      },
    ],
  });
  return { name: candidate.name, day: targetDay.day_label, exercise_id: candidate.exercise_id };
}
