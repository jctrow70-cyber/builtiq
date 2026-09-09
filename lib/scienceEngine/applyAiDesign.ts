import { findByName } from './exerciseSelection';
import { generatePotentiation } from './potentiation';
import { prescribeExercise } from './prescription';
import { generateRampSets, isPrimaryLift } from './rampUp';
import { trimForDuration } from './duration';
import { generateWarmup } from './warmup';
import type { MovementPatternId, MuscleId } from './taxonomy';
import type { CatalogExercise, ExercisePrescription, ScienceProgram, ScienceWorkout, TrainingProfile, WarmupItem } from './types';

type AiStrengthItem =
  | {
      name?: string;
      sets?: number;
      reps?: string;
      target_rir?: number;
      role?: string;
      rest_seconds?: number;
      superset?: never;
    }
  | { superset: any[]; name?: never };

export function applyAiWeekDesign(
  science: ScienceProgram,
  ai: any,
  catalog: CatalogExercise[],
  profile: TrainingProfile
): { program: ScienceProgram; applied: boolean; replacedDays: number } {
  const aiWorkouts = extractAiWorkouts(ai);
  if (!aiWorkouts.length) return { program: science, applied: false, replacedDays: 0 };

  const week1 = science.workouts.filter((w) => w.week === 1);
  const replaced: ScienceWorkout[] = [];
  let replacedDays = 0;

  week1.forEach((seed, index) => {
    const row = matchAiWorkout(seed, aiWorkouts, index);
    const built = row ? workoutFromAi(seed, row, catalog, profile) : null;
    if (built && built.exercises.length >= 2) {
      replaced.push(built);
      replacedDays += 1;
    } else {
      replaced.push(seed);
    }
  });

  if (replacedDays < 1) {
    return { program: science, applied: false, replacedDays: 0 };
  }

  const workouts: ScienceWorkout[] = [];
  for (let week = 1; week <= science.weeks; week += 1) {
    replaced.forEach((w) =>
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
    program: {
      ...science,
      summary: String(ai.summary || science.summary),
      explanations: [String(ai.coaching_notes || ai.quality_review?.notes || ''), ...science.explanations].filter(Boolean),
      workouts,
    },
    applied: true,
    replacedDays,
  };
}

function extractAiWorkouts(ai: any): any[] {
  if (Array.isArray(ai?.workouts)) return ai.workouts;
  if (Array.isArray(ai?.days)) return ai.days;
  if (Array.isArray(ai?.week)) return ai.week;
  if (Array.isArray(ai?.program?.workouts)) return ai.program.workouts;
  if (Array.isArray(ai?.program?.days)) return ai.program.days;
  return [];
}

function matchAiWorkout(seed: ScienceWorkout, aiWorkouts: any[], index: number): any | null {
  const byLabel = aiWorkouts.find((w: any) => {
    const label = String(w.day_label || w.dayLabel || w.day || '').trim();
    if (!label) return false;
    if (label.slice(0, 3) === seed.dayLabel) return true;
    if (label.toLowerCase() === String(seed.name || '').toLowerCase()) return true;
    return false;
  });
  if (byLabel) return byLabel;
  const unlabeled = aiWorkouts[index];
  if (!unlabeled) return null;
  const unlabeledHasDay = String(unlabeled.day_label || unlabeled.dayLabel || unlabeled.day || '').trim();
  if (unlabeledHasDay) return null;
  return unlabeled;
}

function strengthFromRow(row: any): AiStrengthItem[] {
  const candidates = [row?.strength, row?.exercises, row?.blocks, row?.main, row?.lifts];
  for (const value of candidates) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function workoutFromAi(seed: ScienceWorkout, row: any, catalog: CatalogExercise[], profile: TrainingProfile): ScienceWorkout | null {
  const exercises: ExercisePrescription[] = [];
  const items = strengthFromRow(row);
  let groupNum = 0;

  flattenStrengthItems(items).forEach((block) => {
    if (block.kind === 'group') {
      const pair = block.exercises.slice(0, 3);
      if (pair.length < 2) {
        const one = resolveExercise(pair[0], catalog, profile, exercises.length === 0 ? 'primary' : 'secondary');
        if (one) exercises.push(one);
        return;
      }
      const firstName = String(pair[0].name || '');
      if (isPrimaryLift(firstName) && exercises.length === 0) {
        const standalone = resolveExercise(pair[0], catalog, profile, 'primary');
        if (standalone) exercises.push(standalone);
        pair.slice(1).forEach((ex: any) => {
          const next = resolveExercise(ex, catalog, profile, 'secondary');
          if (next) exercises.push(next);
        });
        return;
      }
      groupNum += 1;
      const label = `Superset ${String.fromCharCode(64 + groupNum)}`;
      const groupId = `ai-${seed.dayLabel}-${groupNum}`;
      pair.forEach((ex: any, i: number) => {
        const prescribed = resolveExercise(ex, catalog, profile, i === 0 ? 'secondary' : 'isolation');
        if (!prescribed) return;
        prescribed.supersetGroupId = groupId;
        prescribed.supersetLabel = label;
        prescribed.supersetOrder = i + 1;
        exercises.push(prescribed);
      });
      return;
    }
    const raw = block.exercises[0];
    const role = exercises.length === 0 ? 'primary' : String(raw?.role || 'secondary');
    const prescribed = resolveExercise(raw, catalog, profile, role);
    if (prescribed) exercises.push(prescribed);
  });

  if (exercises.length < 2) return null;

  const primary = exercises.find((ex) => ex.role === 'primary') || exercises[0];
  const primaryCatalog = findByName(catalog, primary.name) || catalogStub(primary.name);
  const warmup = resolveWarmup(row.warmup, seed, exercises, catalog, profile);
  const primer = resolvePrimer(row.potentiation, primaryCatalog, catalog, profile);
  const rampSets = isPrimaryLift(primary.name)
    ? generateRampSets({ workingWeight: profile.workingLoads?.[primary.name], workingRepMax: primary.repMax, profile })
    : [];

  const built: ScienceWorkout = {
    week: 1,
    dayLabel: seed.dayLabel,
    workoutType: seed.workoutType,
    name: String(row.name || seed.name),
    emphasis: String(row.emphasis || seed.emphasis || ''),
    warmup,
    potentiation: primer,
    rampFor: primary.name,
    rampSets,
    exercises,
    cooldown: resolveCooldown(row.cooldown, seed),
    estimatedMinutes: 0,
  };
  return trimForDuration(built, profile);
}

function resolveExercise(raw: any, catalog: CatalogExercise[], profile: TrainingProfile, role: string): ExercisePrescription | null {
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  if (profile.excludedExercises.some((n) => n.toLowerCase() === name.toLowerCase())) return null;
  const matched = findByName(catalog, name);
  const hit = matched || catalogStub(name);
  const [repMin, repMax] = parseReps(raw?.reps);
  const sets = Math.max(2, Math.min(5, Number(raw?.sets) || 3));
  const prescribed = prescribeExercise({
    exercise: hit,
    role: (['primary', 'secondary', 'isolation', 'accessory', 'power'].includes(role) ? role : 'secondary') as any,
    profile,
    sets,
    why: 'Selected as part of the weekly program design.',
  });
  if (!matched) prescribed.name = name;
  if (repMin && repMax) {
    prescribed.repMin = repMin;
    prescribed.repMax = Math.max(repMin, repMax);
  }
  if (raw?.target_rir != null && Number(raw.target_rir) >= 0 && Number(raw.target_rir) <= 4) {
    prescribed.targetRir = Number(raw.target_rir);
  }
  if (raw?.rest_seconds) prescribed.restSeconds = Number(raw.rest_seconds);
  if (Array.isArray(raw?.set_details) && raw.set_details.length) {
    prescribed.setDetails = raw.set_details.slice(0, 8).map((row: any, i: number) => ({
      setNumber: i + 1,
      setType: String(row.set_type || 'working') === 'warmup' ? 'warmup' : 'working',
      weight: row.weight ? String(row.weight) : undefined,
      reps: String(row.reps || prescribed.repMax),
      rir: row.rir != null ? Number(row.rir) : prescribed.targetRir,
    }));
  }
  return prescribed;
}

function catalogStub(name: string): CatalogExercise {
  const n = name.toLowerCase();
  const isolation = /curl|raise|fly|extension|pushdown|kickback|shrug|plank|crunch|pallof/.test(n);
  return {
    name,
    movementPattern: inferPattern(n),
    exerciseType: isolation ? 'isolation' : 'compound',
    programRoles: isolation ? ['isolation', 'accessory'] : ['secondary', 'accessory'],
    equipment: [],
    primaryMuscles: inferMuscles(n),
    secondaryMuscles: [],
    stabilityRequirement: 'medium',
    fatigueCost: isolation ? 'low' : 'medium',
    skillRequirement: 'medium',
    suitableForBeginner: true,
    unilateral: /lunge|split squat|single/.test(n),
    defaultRepMin: isolation ? 8 : 5,
    defaultRepMax: isolation ? 15 : 10,
    warmupSuitable: false,
    warmupCategory: null,
    planes: /lateral|rotation/.test(n) ? ['frontal'] : ['sagittal'],
    warmupFatigue: 'low',
    impactLevel: /jump|bound|plyo/.test(n) ? 'moderate' : 'low',
  };
}

function inferPattern(n: string): MovementPatternId {
  if (/lunge|split squat/.test(n)) return 'lunge';
  if (/squat|leg press/.test(n)) return 'squat';
  if (/deadlift|rdl|hip thrust|hinge|good morning/.test(n)) return 'hinge';
  if (/row/.test(n)) return 'horizontal_pull';
  if (/pulldown|pull-?up|chin-?up/.test(n)) return 'vertical_pull';
  if (/overhead|shoulder press/.test(n)) return 'vertical_push';
  if (/bench|push-?up|chest press|floor press/.test(n)) return 'horizontal_push';
  if (/curl/.test(n)) return 'elbow_flexion';
  if (/extension|pushdown|skull/.test(n)) return 'elbow_extension';
  if (/lateral raise/.test(n)) return 'shoulder_abduction';
  if (/calf/.test(n)) return 'calf_raise';
  if (/carry|farmer/.test(n)) return 'carry';
  if (/jump/.test(n)) return 'jump';
  return 'other';
}

function inferMuscles(n: string): MuscleId[] {
  if (/lunge|squat|leg press/.test(n)) return ['quads'];
  if (/deadlift|rdl|hamstring|leg curl/.test(n)) return ['hamstrings'];
  if (/hip thrust|glute/.test(n)) return ['glutes'];
  if (/row/.test(n)) return ['upper_back'];
  if (/pulldown|pull-?up|chin-?up|lat/.test(n)) return ['lats'];
  if (/overhead|shoulder press|lateral raise|delt/.test(n)) return ['side_delts'];
  if (/bench|push-?up|chest|fly|floor press/.test(n)) return ['chest'];
  if (/curl/.test(n) && !/leg curl/.test(n)) return ['biceps'];
  if (/extension|pushdown|skull|tricep/.test(n)) return ['triceps'];
  if (/calf/.test(n)) return ['calves'];
  if (/plank|pallof|crunch|ab/.test(n)) return ['abs'];
  return ['chest'];
}

function flattenStrengthItems(items: AiStrengthItem[]): Array<{ kind: 'single' | 'group'; exercises: any[] }> {
  const out: Array<{ kind: 'single' | 'group'; exercises: any[] }> = [];
  (items || []).forEach((item: any) => {
    if (Array.isArray(item?.exercises) && item.type) {
      const type = String(item.type).toLowerCase();
      const exs = item.exercises.filter((ex: any) => ex?.name);
      if (type === 'superset' || type === 'tri_set' || type === 'circuit') {
        out.push({ kind: 'group', exercises: exs });
      } else {
        exs.forEach((ex: any) => out.push({ kind: 'single', exercises: [ex] }));
      }
      return;
    }
    if (Array.isArray(item?.superset)) {
      out.push({ kind: 'group', exercises: item.superset.filter((ex: any) => ex?.name) });
      return;
    }
    if (item?.name) out.push({ kind: 'single', exercises: [item] });
  });
  return out;
}

function resolveWarmup(
  raw: any,
  seed: ScienceWorkout,
  exercises: ExercisePrescription[],
  catalog: CatalogExercise[],
  profile: TrainingProfile
): WarmupItem[] {
  const listed = Array.isArray(raw) ? raw : [];
  const fromAi = listed
    .map((item: any) => {
      const name = String(item?.name || '').trim();
      if (!name) return null;
      const hit = findByName(catalog, name);
      return {
        name: hit?.name || name,
        category: 'activation' as const,
        reps: String(item.reps || '8'),
        sets: Math.max(1, Number(item.sets) || 1),
        exerciseId: hit?.id,
        muscleGroup: hit?.primaryMuscles?.[0],
        why: 'Prepares the patterns used in this session.',
      };
    })
    .filter(Boolean) as WarmupItem[];
  if (fromAi.length >= 3) return fromAi.slice(0, 6);
  return generateWarmup({
    workoutType: seed.workoutType,
    muscles: exercises.flatMap((ex) => ex.primaryMuscles),
    profile,
    catalog,
    sessionPatterns: exercises.map((ex) => ex.movementPattern),
  }).items;
}

function resolvePrimer(raw: any, primary: CatalogExercise | null, catalog: CatalogExercise[], profile: TrainingProfile) {
  if (raw === null) return [];
  if (raw?.name) {
    const hit = findByName(catalog, String(raw.name)) || catalogStub(String(raw.name));
    return [
      prescribeExercise({
        exercise: hit,
        role: 'power',
        profile,
        sets: Math.max(1, Math.min(3, Number(raw.sets) || 2)),
        why: 'Short potentiation for this session.',
      }),
    ];
  }
  return generatePotentiation({ profile, primary, catalog }).items;
}

function resolveCooldown(raw: any, seed: ScienceWorkout): WarmupItem[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.slice(0, 4).map((item: any) => ({
      name: String(item.name || 'Stretch'),
      category: 'mobility' as const,
      reps: String(item.reps || '30 sec'),
      sets: 1,
    }));
  }
  return seed.cooldown;
}

function parseReps(reps: unknown): [number, number] {
  const text = String(reps || '');
  const parts = text.split(/[-–]/).map((n) => Number(n.replace(/[^\d.]/g, ''))).filter((n) => n > 0);
  if (parts.length >= 2) return [parts[0], parts[1]];
  if (parts.length === 1) return [parts[0], parts[0]];
  return [0, 0];
}
